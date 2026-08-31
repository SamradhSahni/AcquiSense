'use strict';
/**
 * Job routes — trigger analysis, poll status, fetch results.
 * This is the critical bridge between React and the Python pipeline.
 */
const express = require('express');
const router = express.Router();

const { Deal, Job, Report } = require('../models');
const { startAnalysis, getResults } = require('../services/pythonBridge');
const { subscribeToJob } = require('../services/redisSubscriber');

// POST /api/jobs — kick off a new analysis
// Body: { dealId, fileNames: [...], modelProfile? }
router.post('/', async (req, res) => {
  // io is attached to req by app.js middleware
  const io = req.app.get('io');
  const { dealId, fileNames, modelProfile } = req.body;

  if (!dealId || !fileNames?.length) {
    return res.status(400).json({ error: 'dealId and fileNames are required' });
  }

  const deal = await Deal.findById(dealId);
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  // Create the job record in Mongo
  const job = await Job.create({ dealId, status: 'queued' });

  // Call Python
  let pythonResp;
  try {
    pythonResp = await startAnalysis({
      dealId: dealId.toString(),
      filePaths: fileNames,
      targetCompany: deal.targetCompany,
      acquirer: deal.acquirer,
      modelProfile: modelProfile || deal.modelProfile || 'standard',
    });
  } catch (err) {
    await Job.findByIdAndUpdate(job._id, { status: 'failed', error: err.message });
    return res.status(502).json({ error: `Python backend error: ${err.message}` });
  }

  const pythonJobId = pythonResp.job_id;

  // Update job with Python's job_id
  await Job.findByIdAndUpdate(job._id, { pythonJobId, status: 'queued' });

  // Update deal with latest job
  await Deal.findByIdAndUpdate(dealId, { latestJobId: job._id, status: 'queued' });

  // Subscribe to Redis progress channel and relay to Socket.IO
  if (io) {
    subscribeToJob(pythonJobId, job._id.toString(), io).catch(console.error);
  }

  res.status(201).json({
    jobId: job._id,
    pythonJobId,
    dealId,
    status: 'queued',
    message: 'Analysis queued. Connect to Socket.IO room job:' + pythonJobId + ' for live updates.',
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

  if (job.status !== 'done') {
    return res.status(202).json({
      message: `Job is still ${job.status}. Try again when done.`,
      status: job.status,
    });
  }

  // Return cached report if it exists
  const cached = await Report.findOne({ pythonJobId: job.pythonJobId }).lean();
  if (cached) return res.json(cached.fullReport);

  // Fetch from Python and cache
  try {
    const report = await getResults(job.pythonJobId);

    // Cache in MongoDB
    await Report.create({
      dealId: job.dealId,
      jobId: job._id,
      pythonJobId: job.pythonJobId,
      goNoGo: report.verdict?.go_no_go,
      executiveSummary: report.verdict?.executive_summary,
      totalFindings: report.verdict?.total_findings,
      severityDistribution: report.verdict?.severity_distribution,
      domainScores: report.domain_scores,
      fullReport: report,
    });

    // Update deal summary
    await Deal.findByIdAndUpdate(job.dealId, {
      status: 'done',
      goNoGo: report.verdict?.go_no_go,
      overallRiskScore: Math.max(...Object.values(report.domain_scores || {}), 0),
      totalFindings: report.verdict?.total_findings,
    });

    res.json(report);
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch results: ${err.message}` });
  }
});

// GET /api/jobs/deal/:dealId — all jobs for a deal
router.get('/deal/:dealId', async (req, res) => {
  const jobs = await Job.find({ dealId: req.params.dealId }).sort({ createdAt: -1 }).lean();
  res.json(jobs);
});

module.exports = router;
