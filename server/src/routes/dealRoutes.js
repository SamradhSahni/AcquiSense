'use strict';
/**
 * Deal routes — CRUD for M&A deals.
 */
const express = require('express');
const router = express.Router();
const { Deal, Job } = require('../models');

// GET /api/deals — list all deals (newest first)
router.get('/', async (req, res) => {
  const deals = await Deal.find().sort({ createdAt: -1 }).lean();
  const updatedDeals = await Promise.all(
    deals.map(async (deal) => {
      if (deal.latestJobId && (deal.status === 'queued' || deal.status === 'analyzing')) {
        const job = await Job.findById(deal.latestJobId).lean();
        if (job && (job.status === 'done' || job.status === 'failed')) {
          deal.status = job.status;
          deal.goNoGo = job.goNoGo;
          deal.totalFindings = job.totalFindings || 0;
          await Deal.findByIdAndUpdate(deal._id, {
            status: job.status,
            goNoGo: job.goNoGo,
            totalFindings: job.totalFindings || 0,
          });
        }
      }
      return deal;
    })
  );
  res.json(updatedDeals);
});

// GET /api/deals/:id — single deal with latest job info
router.get('/:id', async (req, res) => {
  const deal = await Deal.findById(req.params.id).lean();
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  let job = null;
  if (deal.latestJobId) {
    job = await Job.findById(deal.latestJobId).lean();
    if (job && job.status !== deal.status && (job.status === 'done' || job.status === 'failed')) {
      deal.status = job.status;
      deal.goNoGo = job.goNoGo;
      deal.totalFindings = job.totalFindings || 0;
      await Deal.findByIdAndUpdate(deal._id, {
        status: job.status,
        goNoGo: job.goNoGo,
        totalFindings: job.totalFindings || 0,
      });
    }
  }
  res.json({ ...deal, job });
});

// POST /api/deals — create a new deal
router.post('/', async (req, res) => {
  const { name, targetCompany, acquirer, modelProfile } = req.body;
  if (!name) return res.status(400).json({ error: 'Deal name is required' });

  const deal = await Deal.create({
    name,
    targetCompany,
    acquirer,
    modelProfile,
    companyId: req.user?.company?.id || null,
  });
  res.status(201).json(deal);
});

// PATCH /api/deals/:id — update deal metadata or attach files
router.patch('/:id', async (req, res) => {
  const allowed = ['name', 'targetCompany', 'acquirer', 'modelProfile', 'files', 'status'];
  const update = {};
  allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

  const deal = await Deal.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  res.json(deal);
});

// DELETE /api/deals/:id
router.delete('/:id', async (req, res) => {
  await Deal.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deal deleted' });
});

module.exports = router;
