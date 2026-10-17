'use strict';
/**
 * Python proxy route — transparently forwards /api/python/* to FastAPI backend.
 *
 * Special handling for endpoints that need MongoDB fallback when Redis has expired:
 *   GET  /api/python/results/:jobId/questions
 *        → tries Python GET; if 404, fetches report from MongoDB and POSTs to Python
 *   POST /api/python/copilot/:dealId
 *        → enriches body with report data from MongoDB if job_id is missing/invalid
 *
 * All other paths are forwarded transparently (method + body + headers preserved).
 */
const express  = require('express');
const router   = express.Router();
const axios    = require('axios');
const { Report } = require('../models');

const PYTHON_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

const pythonClient = axios.create({
  baseURL: PYTHON_URL,
  timeout: 120_000,
  maxBodyLength: Infinity,
  maxContentLength: Infinity,
  validateStatus: () => true,   // never throw on 4xx/5xx — pass through
});

// ── Helper: fetch full report from MongoDB by pythonJobId ─────────────────────
async function getReportFromMongo(pythonJobId) {
  try {
    const report = await Report.findOne({ pythonJobId }).lean();
    return report?.fullReport || null;
  } catch {
    return null;
  }
}

// ── Special: GET /results/:jobId/questions — with MongoDB fallback ────────────
router.get('/results/:jobId/questions', async (req, res) => {
  const { jobId } = req.params;

  // 1. Try Python directly (fast path — data still in Redis)
  const pyRes = await pythonClient.get(`/api/results/${jobId}/questions`);

  if (pyRes.status !== 404) {
    return res.status(pyRes.status).json(pyRes.data);
  }

  // 2. Redis cache expired — fetch report from MongoDB and POST to Python
  console.log(`[QuestionsProxy] Redis miss for ${jobId} — falling back to MongoDB`);
  const report = await getReportFromMongo(jobId);

  if (!report) {
    return res.status(404).json({
      error: 'Report not found',
      detail: `No report in Redis or MongoDB for job ${jobId}. Re-run the analysis.`,
    });
  }

  const postRes = await pythonClient.post(`/api/results/${jobId}/questions`, { report });
  return res.status(postRes.status).json(postRes.data);
});

// ── Special: POST /copilot/:dealId — with MongoDB fallback for report data ────
router.post('/copilot/:dealId', async (req, res) => {
  const { dealId } = req.params;
  const body = req.body;

  // Try Python directly first
  const pyRes = await pythonClient.post(`/api/copilot/${dealId}`, body);

  if (pyRes.status !== 404) {
    return res.status(pyRes.status).json(pyRes.data);
  }

  // Redis miss — inject the report from MongoDB so Python can build its context
  console.log(`[CopilotProxy] Redis miss for job ${body.job_id} — injecting MongoDB report`);
  const report = await getReportFromMongo(body.job_id);

  if (!report) {
    return res.status(404).json({
      error: 'Report not found',
      detail: `No report in Redis or MongoDB for job ${body.job_id}. Re-run the analysis.`,
    });
  }

  // Re-try with the full report embedded in the body
  const retryRes = await pythonClient.post(`/api/copilot/${dealId}`, { ...body, report });
  return res.status(retryRes.status).json(retryRes.data);
});

// ── Generic catch-all — transparent proxy for all other paths ─────────────────
router.all('/*', async (req, res) => {
  const targetPath = `/api${req.path}`;
  try {
    const response = await pythonClient.request({
      method:  req.method,
      url:     targetPath,
      params:  req.query,
      data:    ['POST', 'PUT', 'PATCH'].includes(req.method) ? req.body : undefined,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
      },
    });
    res.status(response.status).json(response.data);
  } catch (err) {
    console.error(`[PythonProxy] ${req.method} ${targetPath} failed:`, err.message);
    res.status(502).json({ error: 'Python backend unreachable', detail: err.message });
  }
});

module.exports = router;
