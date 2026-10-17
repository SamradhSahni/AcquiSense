'use strict';
/**
 * Job routes — trigger analysis, poll status, fetch results.
 * Phase 4: Jobs now go through BullMQ queue for resilience + auto-retry.
 */
const express = require('express');
const router  = express.Router();

const { Deal, Job, Report }   = require('../models');
const { getResults }          = require('../services/pythonBridge');
const { subscribeToJob }      = require('../services/redisSubscriber');
const { enqueueAnalysis, getQueueHealth } = require('../queues/analysisQueue');

// POST /api/jobs — kick off a new analysis (via BullMQ queue)
// Body: { dealId, fileNames: [...], modelProfile? }
router.post('/', async (req, res) => {
  const io = req.app.get('io');
  const { dealId, fileNames, modelProfile } = req.body;

  if (!dealId || !fileNames?.length) {
    return res.status(400).json({ error: 'dealId and fileNames are required' });
  }

  const deal = await Deal.findById(dealId);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  // Create the job record in Mongo
  const job = await Job.create({ dealId, status: 'queued' });

  // Update deal immediately
  await Deal.findByIdAndUpdate(dealId, { latestJobId: job._id, status: 'queued' });

  // Enqueue via BullMQ (resilient, auto-retry, survives restarts)
  try {
    await enqueueAnalysis({
      mongoJobId:    job._id.toString(),
      dealId:        dealId.toString(),
      filePaths:     fileNames,
      targetCompany: deal.targetCompany,
      acquirer:      deal.acquirer,
      modelProfile:  modelProfile || deal.modelProfile || 'standard',
    });
  } catch (err) {
    await Job.findByIdAndUpdate(job._id, { status: 'failed', error: err.message });
    return res.status(502).json({ error: `Queue error: ${err.message}` });
  }

  res.status(201).json({
    jobId:     job._id,
    dealId,
    status:    'queued',
    message:   'Analysis queued via BullMQ. Connect to Socket.IO for live updates.',
  });
});

// GET /api/jobs/:id — job status (from MongoDB)
router.get('/:id', async (req, res) => {
  const job = await Job.findById(req.params.id).lean();
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// GET /api/jobs/:id/results — fetch full report (from Python → store in Mongo)
router.get('/:id/results', async (req, res) => {
  const job = await Job.findById(req.params.id).lean();
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // Return cached report if it exists
  const cached = await Report.findOne({ pythonJobId: job.pythonJobId }).lean();
  if (cached) return res.json(cached.fullReport);

  if (job.status === 'failed') {
    return res.status(400).json({ error: 'Job failed', message: job.error });
  }

  // Try to fetch from Python directly (handles case where Redis missed the done event)
  try {
    const report = await getResults(job.pythonJobId);

    // If Python says it's not done yet, return 202
    if (!report || report.status === 'running' || !report.verdict) {
      return res.status(202).json({ message: 'Still running', status: job.status });
    }

    // Build agentProgress updates from report.domains
    const agentProgress = {};
    if (report.domains) {
      Object.entries(report.domains).forEach(([dom, dData]) => {
        const count = Array.isArray(dData)
          ? dData.length
          : (dData?.findings?.length ?? dData?.findings_count ?? 0);
        agentProgress[dom] = {
          domain: dom,
          status: 'done',
          pct: 100,
          findingsCount: count,
          error: null,
        };
      });
    }

    // Mark job done in MongoDB with full agentProgress
    await Job.findByIdAndUpdate(job._id, {
      status: 'done',
      goNoGo: report.verdict?.go_no_go,
      totalFindings: report.verdict?.total_findings,
      ...(Object.keys(agentProgress).length > 0 ? { agentProgress } : {}),
    });

    // Cache in MongoDB idempotently
    await Report.findOneAndUpdate(
      { pythonJobId: job.pythonJobId },
      {
        dealId: job.dealId,
        jobId: job._id,
        pythonJobId: job.pythonJobId,
        goNoGo: report.verdict?.go_no_go,
        executiveSummary: report.verdict?.executive_summary,
        totalFindings: report.verdict?.total_findings,
        severityDistribution: report.verdict?.severity_distribution,
        domainScores: report.domain_scores,
        fullReport: report,
      },
      { upsert: true, new: true }
    );

    // Update deal summary
    await Deal.findByIdAndUpdate(job.dealId, {
      status: 'done',
      goNoGo: report.verdict?.go_no_go,
      overallRiskScore: Math.max(...Object.values(report.domain_scores || {}), 0),
      totalFindings: report.verdict?.total_findings,
    });

    res.json(report);
  } catch (err) {
    res.status(202).json({ message: 'Job may still be running', error: err.message });
  }
});

// GET /api/jobs/deal/:dealId — all jobs for a deal
router.get('/deal/:dealId', async (req, res) => {
  const jobs = await Job.find({ dealId: req.params.dealId }).sort({ createdAt: -1 }).lean();
  res.json(jobs);
});

// GET /api/jobs/queue/health — BullMQ queue health
router.get('/queue/health', async (req, res) => {
  const health = await getQueueHealth();
  res.json(health);
});

module.exports = router;
