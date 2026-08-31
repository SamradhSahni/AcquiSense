'use strict';
/**
 * Report routes — access cached analysis reports.
 */
const express = require('express');
const router = express.Router();
const { Report, Deal } = require('../models');

// GET /api/reports — list all reports
router.get('/', async (req, res) => {
  const reports = await Report.find()
    .populate('dealId', 'name targetCompany acquirer')
    .sort({ createdAt: -1 })
    .select('-fullReport') // exclude huge payload in list view
    .lean();
  res.json(reports);
});

// GET /api/reports/:id — full report
router.get('/:id', async (req, res) => {
  const report = await Report.findById(req.params.id).lean();
  if (!report) return res.status(404).json({ error: 'Report not found' });
  res.json(report.fullReport);
});

// GET /api/reports/deal/:dealId — latest report for a deal
router.get('/deal/:dealId', async (req, res) => {
  const report = await Report.findOne({ dealId: req.params.dealId })
    .sort({ createdAt: -1 })
    .lean();
  if (!report) return res.status(404).json({ error: 'No report found for this deal' });
  res.json(report.fullReport);
});

module.exports = router;
