'use strict';
/**
 * Finding Routes — Risk Action Center (3.3) + Human-in-the-Loop Review (3.4)
 *
 * These routes convert AI-generated findings from Redis/Python into persistent
 * MongoDB documents with workflow state machines and immutable audit trails.
 *
 * Risk Action Center endpoints:
 *   POST   /api/findings/sync/:jobId      — sync all findings from a completed analysis into Mongo
 *   GET    /api/findings/deal/:dealId     — list all findings for a deal (with filters)
 *   PATCH  /api/findings/:findingId/action — update workflow state / assign / add condition
 *
 * HITL Review endpoints:
 *   PATCH  /api/findings/:findingId/review  — confirm / modify / reject an AI finding
 *   GET    /api/findings/:findingId/audit   — full immutable audit log
 */
const express = require('express');
const router = express.Router();
const { Deal, Job, Report, Finding } = require('../models');

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_WORKFLOW_STATES = ['open', 'assigned', 'remediating', 'verified', 'closed'];
const VALID_REVIEW_STATUSES  = ['confirmed', 'modified', 'rejected'];

function appendAudit(finding, action, by = 'analyst', notes = '', prev = null, next = null) {
  finding.auditLog = finding.auditLog || [];
  finding.auditLog.push({
    action,
    by,
    at: new Date(),
    notes: String(notes).slice(0, 500),
    previousValue: prev,
    newValue: next,
  });
}

// Helper to check if user has a specific permission from their groups
function hasPermission(user, permission) {
  if (!user) return false;
  // If user has no groups attached or empty, grant access to authenticated user
  if (!user.groups || !Array.isArray(user.groups) || user.groups.length === 0) {
    return true;
  }
  // If user belongs to admin group or has wildcard permission, allow
  const isAdmin = user.groups.some(g => 
    g.name === 'admin' || 
    (g.permissions && (g.permissions.includes('*') || g.permissions.includes('all')))
  );
  if (isAdmin) return true;

  return user.groups.some(group => {
    if (!group.permissions) return false;
    if (group.permissions.includes(permission)) return true;
    if (permission === 'job:sync' && (
      group.permissions.includes('job:create') || 
      group.permissions.includes('job:update') || 
      group.permissions.includes('finding:update') ||
      group.permissions.includes('finding:read')
    )) {
      return true;
    }
    return false;
  });
}

// Helper to ensure user belongs to the same company as the deal
async function checkDealAccess(req, dealId) {
  try {
    const deal = await Deal.findById(dealId).select('companyId');
    if (!deal) {
      return { error: 'Deal not found', status: 404 };
    }
    const userCompanyId = req.user?.company?.id ? req.user.company.id.toString() : null;
    const dealCompanyId = deal.companyId ? deal.companyId.toString() : null;

    // If deal doesn't have a companyId yet, assign the requesting user's company
    if (!dealCompanyId) {
      if (userCompanyId) {
        deal.companyId = userCompanyId;
        await deal.save();
      }
      return null; // OK
    }

    if (userCompanyId && dealCompanyId !== userCompanyId) {
      return { error: 'Access denied: deal belongs to another company', status: 403 };
    }
    return null; // OK
  } catch (err) {
    console.error('checkDealAccess error:', err);
    return { error: 'Invalid deal ID', status: 400 };
  }
}

// Helper to ensure user belongs to the same company as the job (via its deal)
async function checkJobAccess(req, jobId) {
  try {
    const job = await Job.findById(jobId).select('dealId').lean();
    if (!job) {
      return { error: 'Job not found', status: 404 };
    }
    const deal = await Deal.findById(job.dealId).select('companyId');
    if (!deal) {
      return { error: 'Associated deal not found', status: 404 };
    }
    const userCompanyId = req.user?.company?.id ? req.user.company.id.toString() : null;
    const dealCompanyId = deal.companyId ? deal.companyId.toString() : null;

    if (!dealCompanyId) {
      if (userCompanyId) {
        deal.companyId = userCompanyId;
        await deal.save();
      }
      return null;
    }

    if (userCompanyId && dealCompanyId !== userCompanyId) {
      return { error: 'Access denied: job belongs to another company', status: 403 };
    }
    return null; // OK
  } catch (err) {
    console.error('checkJobAccess error:', err);
    return { error: 'Invalid job ID', status: 400 };
  }
}

// Helper to ensure user belongs to the same company as the finding (via its deal)
async function checkFindingAccess(req, findingId) {
  try {
    const finding = await Finding.findById(findingId).select('dealId').lean();
    if (!finding) {
      return { error: 'Finding not found', status: 404 };
    }
    const deal = await Deal.findById(finding.dealId).select('companyId');
    if (!deal) {
      return { error: 'Associated deal not found', status: 404 };
    }
    const userCompanyId = req.user?.company?.id ? req.user.company.id.toString() : null;
    const dealCompanyId = deal.companyId ? deal.companyId.toString() : null;

    if (!dealCompanyId) {
      if (userCompanyId) {
        deal.companyId = userCompanyId;
        await deal.save();
      }
      return null;
    }

    if (userCompanyId && dealCompanyId !== userCompanyId) {
      return { error: 'Access denied: finding belongs to another company', status: 403 };
    }
    return null; // OK
  } catch (err) {
    console.error('checkFindingAccess error:', err);
    return { error: 'Invalid finding ID', status: 400 };
  }
}

// ── Sync findings from completed analysis ─────────────────────────────────────

/**
 * POST /api/findings/sync/:jobId
 *
 * Reads the stored report (fullReport.domains) for a completed job and
 * upserts all findings into MongoDB with initial workflow state = "open".
 *
 * Idempotent — safe to call multiple times (uses upsert by pythonFindingId + dealId).
 */
router.post('/sync/:jobId', async (req, res) => {
  try {
    // Check job access and company match
    const accessError = await checkJobAccess(req, req.params.jobId);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.error });
    }

    // Check permission for syncing (we'll use a custom permission)
    if (!hasPermission(req.user, 'job:sync')) {
      return res.status(403).json({ error: 'Insufficient permissions to sync findings' });
    }

    const job = await Job.findById(req.params.jobId).lean();
    const report = await Report.findOne({ pythonJobId: job.pythonJobId }).lean();
    if (!report?.fullReport?.domains) {
      return res.status(404).json({ error: 'Report not found or still processing' });
    }

    const domains = report.fullReport.domains;
    let syncedCount = 0;
    let skippedCount = 0;

    for (const [domain, domainData] of Object.entries(domains)) {
      const findings = domainData?.findings || [];
      for (const f of findings) {
        if (!f?.id || !f?.title) { skippedCount++; continue; }

        const updateDoc = {
          dealId:          job.dealId,
          jobId:           job._id,
          pythonJobId:     job.pythonJobId,
          domain,
          severity:        f.severity || 'P2',
          title:           f.title,
          description:     f.description || '',
          evidence:        f.evidence || '',
          citations:       (f.citations || []).map(c => ({
            file: c.file || '', page: c.page || 0, section: c.section || '', quote: c.quote || '',
          })),
          tags:            f.tags || [],
        };

        // upsert — do NOT overwrite workflow state if already set
        const existing = await Finding.findOne({ dealId: job.dealId, pythonFindingId: f.id });
        if (!existing) {
          await Finding.create({
            pythonFindingId: f.id,
            ...updateDoc,
            originalAITitle: f.title,
            originalAIDesc:  f.description || '',
            auditLog: [{ action: 'synced', by: 'system', at: new Date(), notes: 'Synced from AI analysis', previousValue: null, newValue: 'open' }],
          });
          syncedCount++;
        } else {
          // Only update core data, preserve workflow + review state
          await Finding.findByIdAndUpdate(existing._id, {
            $set: { title: f.title, description: f.description, evidence: f.evidence, tags: f.tags || [] },
          });
          skippedCount++;
        }
      }
    }

    res.json({
      synced: syncedCount,
      skipped: skippedCount,
      message: `Synced ${syncedCount} findings, ${skippedCount} already existed.`,
    });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message });
  }
});


// ── List findings for a deal ──────────────────────────────────────────────────

/**
 * GET /api/findings/deal/:dealId
 * Query params: domain, severity, workflowState, reviewStatus, assignedTo, page, limit
 */
router.get('/deal/:dealId', async (req, res) => {
  try {
    // Check deal access and company match
    const accessError = await checkDealAccess(req, req.params.dealId);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.error });
    }

    // Check permission for reading findings
    if (!hasPermission(req.user, 'finding:read')) {
      return res.status(403).json({ error: 'Insufficient permissions to view findings' });
    }

    const { domain, severity, workflowState, reviewStatus, assignedTo, page = 0, limit = 50 } = req.query;
    const filter = { dealId: req.params.dealId };

    if (domain)        filter.domain = domain;
    if (severity)      filter.severity = severity;
    if (workflowState) filter.workflowState = workflowState;
    if (reviewStatus)  filter.reviewStatus = reviewStatus;
    if (assignedTo)    filter.assignedTo = assignedTo;

    const [findings, total] = await Promise.all([
      Finding.find(filter)
        .sort({ severity: 1, createdAt: -1 })
        .skip(Number(page) * Number(limit))
        .limit(Number(limit))
        .select('-auditLog -__v')
        .lean(),
      Finding.countDocuments(filter),
    ]);

    // Severity sort order
    const SEV_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };
    findings.sort((a, b) => (SEV_ORDER[a.severity] || 4) - (SEV_ORDER[b.severity] || 4));

    res.json({ findings, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── Risk Action Center — workflow actions ─────────────────────────────────────

/**
 * PATCH /api/findings/:findingId/action
 * Body: { action: 'assign'|'progress'|'add_condition'|'close', payload: {...} }
 *
 * Actions:
 *   assign        — { assignedTo, dueDate? }
 *   progress      — { workflowState: 'remediating'|'verified' }
 *   add_condition — { text }           (e.g. "Pending legal sign-off")
 *   remove_condition — { conditionId }
 *   close         — close the finding (moves to 'closed')
 */
router.patch('/:findingId/action', async (req, res) => {
  try {
    // Check finding access and company match
    const accessError = await checkFindingAccess(req, req.params.findingId);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.error });
    }

    const finding = await Finding.findById(req.params.findingId);
    if (!finding) return res.status(404).json({ error: 'Finding not found' });

    // Map actions to permissions
    const actionPermissions = {
      assign: 'finding:assign',
      progress: 'finding:update',
      add_condition: 'finding:update',
      remove_condition: 'finding:update',
      close: 'finding:update'
    };
    const { action, payload = {}, by = 'analyst', notes = '' } = req.body;

    // Check permission for the specific action
    const requiredPermission = actionPermissions[action];
    if (requiredPermission && !hasPermission(req.user, requiredPermission)) {
      return res.status(403).json({ error: `Insufficient permissions to perform action '${action}'` });
    }

    const prev = { workflowState: finding.workflowState, assignedTo: finding.assignedTo };

    switch (action) {
      case 'assign': {
        if (!payload.assignedTo) return res.status(400).json({ error: 'assignedTo is required' });
        finding.assignedTo = payload.assignedTo;
        finding.workflowState = 'assigned';
        if (payload.dueDate) finding.dueDate = new Date(payload.dueDate);
        appendAudit(finding, 'assigned', by, notes, prev.assignedTo, payload.assignedTo);
        break;
      }
      case 'progress': {
        const newState = payload.workflowState;
        if (!VALID_WORKFLOW_STATES.includes(newState)) {
          return res.status(400).json({ error: `Invalid workflowState '${newState}'` });
        }
        finding.workflowState = newState;
        appendAudit(finding, `progressed_to_${newState}`, by, notes, prev.workflowState, newState);
        break;
      }
      case 'add_condition': {
        if (!payload.text) return res.status(400).json({ error: 'condition text is required' });
        finding.conditions.push({ text: payload.text, addedAt: new Date(), addedBy: by });
        appendAudit(finding, 'condition_added', by, payload.text, null, payload.text);
        break;
      }
      case 'remove_condition': {
        if (!payload.conditionId) return res.status(400).json({ error: 'conditionId is required' });
        const before = finding.conditions.length;
        finding.conditions = finding.conditions.filter(c => c._id.toString() !== payload.conditionId);
        appendAudit(finding, 'condition_removed', by, notes, before, finding.conditions.length);
        break;
      }
      case 'close': {
        finding.workflowState = 'closed';
        appendAudit(finding, 'closed', by, notes, prev.workflowState, 'closed');
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown action '${action}'` });
    }

    await finding.save();
    res.json({ finding: finding.toObject(), message: `Action '${action}' applied.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── HITL Review ───────────────────────────────────────────────────────────────

/**
 * PATCH /api/findings/:findingId/review
 * Body: { reviewStatus, by?, notes?, title?, description?, severity? }
 *
 * reviewStatus:
 *   confirmed — analyst agrees with AI output, no changes
 *   modified  — analyst edited title / description / severity
 *   rejected  — analyst disagrees; finding should be excluded from report
 */
router.patch('/:findingId/review', async (req, res) => {
  try {
    // Check finding access and company match
    const accessError = await checkFindingAccess(req, req.params.findingId);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.error });
    }

    const { reviewStatus, by = 'analyst', notes = '', title, description, severity } = req.body;

    if (!VALID_REVIEW_STATUSES.includes(reviewStatus)) {
      return res.status(400).json({ error: `Invalid reviewStatus '${reviewStatus}'` });
    }

    // Check permission for review actions
    if (!hasPermission(req.user, 'finding:review')) {
      return res.status(403).json({ error: 'Insufficient permissions to review findings' });
    }

    const finding = await Finding.findById(req.params.findingId);
    if (!finding) return res.status(404).json({ error: 'Finding not found' });

    const prevReview = finding.reviewStatus;
    finding.reviewStatus = reviewStatus;
    finding.reviewedBy   = by;
    finding.reviewedAt   = new Date();
    if (notes) finding.analystNotes = notes;

    if (reviewStatus === 'modified') {
      // Save original AI output on first modification
      if (!finding.originalAITitle) finding.originalAITitle = finding.title;
      if (!finding.originalAIDesc)  finding.originalAIDesc  = finding.description;

      const prevData = { title: finding.title, description: finding.description, severity: finding.severity };
      if (title)       finding.title       = title.slice(0, 200);
      if (description) finding.description = description.slice(0, 2000);
      if (severity && ['P0','P1','P2','P3'].includes(severity)) finding.severity = severity;

      appendAudit(finding, 'modified_by_analyst', by, notes, prevData, { title: finding.title, description: finding.description, severity: finding.severity });
    } else {
      appendAudit(finding, `review_${reviewStatus}`, by, notes, prevReview, reviewStatus);
    }

    await finding.save();
    res.json({ finding: finding.toObject(), message: `Finding ${reviewStatus}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── Audit log ─────────────────────────────────────────────────────────────────

/**
 * GET /api/findings/:findingId/audit
 * Returns the full immutable audit trail for a finding.
 */
router.get('/:findingId/audit', async (req, res) => {
  try {
    // Check finding access and company match
    const accessError = await checkFindingAccess(req, req.params.findingId);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.error });
    }

    // Check permission for viewing audit log
    if (!hasPermission(req.user, 'finding:read')) {
      return res.status(403).json({ error: 'Insufficient permissions to view audit log' });
    }

    const finding = await Finding.findById(req.params.findingId).select('auditLog title domain severity').lean();
    if (!finding) return res.status(404).json({ error: 'Finding not found' });
    res.json({ finding: { title: finding.title, domain: finding.domain, severity: finding.severity }, audit: finding.auditLog || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── Workflow summary for a deal ───────────────────────────────────────────────

/**
 * GET /api/findings/deal/:dealId/summary
 * Returns counts grouped by workflowState + reviewStatus.
 */
router.get('/deal/:dealId/summary', async (req, res) => {
  try {
    // Check deal access and company match
    const accessError = await checkDealAccess(req, req.params.dealId);
    if (accessError) {
      return res.status(accessError.status).json({ error: accessError.error });
    }

    // Check permission for viewing summary
    if (!hasPermission(req.user, 'finding:read')) {
      return res.status(403).json({ error: 'Insufficient permissions to view findings summary' });
    }

    const [workflowCounts, reviewCounts] = await Promise.all([
      Finding.aggregate([
        { $match: { dealId: new (require('mongoose').Types.ObjectId)(req.params.dealId) } },
        { $group: { _id: '$workflowState', count: { $sum: 1 } } },
      ]),
      Finding.aggregate([
        { $match: { dealId: new (require('mongoose').Types.ObjectId)(req.params.dealId) } },
        { $group: { _id: '$reviewStatus', count: { $sum: 1 } } },
      ]),
    ]);

    const workflow = {};
    workflowCounts.forEach(w => { workflow[w._id] = w.count; });
    const review = {};
    reviewCounts.forEach(r => { review[r._id] = r.count; });

    res.json({ workflow, review, total: Object.values(workflow).reduce((s, c) => s + c, 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;