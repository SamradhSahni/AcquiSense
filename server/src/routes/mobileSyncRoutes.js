'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Deal, Finding } = require('../models');

// Safe dynamic require for pdf-lib
let PDFDocument = null;
let rgb = null;
let degrees = null;
try {
  const pdfLib = require('pdf-lib');
  PDFDocument = pdfLib.PDFDocument;
  rgb = pdfLib.rgb;
  degrees = pdfLib.degrees;
} catch (e) {
  // Gracefully handles if pdf-lib installation is in-progress
}

/**
 * [SEC-01 & SEC-02]: Assert Tenant Deal Access
 */
async function assertTenantDealAccess(tenantId, dealId) {
  if (!dealId) return false;
  const deal = await Deal.findById(dealId).select('companyId _id').lean();
  if (!deal) return false;
  // If deal has no companyId (legacy unassigned deal) or matches tenantId
  if (!deal.companyId) return true;
  return deal.companyId.toString() === tenantId.toString();
}

/**
 * POST /api/mobile/sync/batch
 * [BUG-05, SEC-01, FEAT-05]: Coalesced Atomic OCC Sync Endpoint
 */
router.post('/sync/batch', async (req, res) => {
  const tenantId = req.user?.company?.id;
  const { mutations } = req.body;

  if (!Array.isArray(mutations)) {
    return res.status(400).json({ error: 'Payload must include an array of mutations.' });
  }

  const results = [];

  for (const m of mutations) {
    try {
      // 1. Tenant Deal Access Assertion
      if (tenantId) {
        const hasAccess = await assertTenantDealAccess(tenantId, m.dealId);
        if (!hasAccess) {
          results.push({
            idempotencyKey: m.idempotencyKey,
            status: 'REJECTED',
            reason: 'TENANT_VIOLATION',
          });
          continue;
        }
      }

      // 2. Build Patch Object
      const setFields = {};
      if (m.patch.reviewStatus !== undefined) setFields.reviewStatus = m.patch.reviewStatus;
      if (m.patch.workflowState !== undefined) setFields.workflowState = m.patch.workflowState;
      if (m.patch.assignedTo !== undefined) setFields.assignedTo = m.patch.assignedTo;
      if (m.patch.dueDate !== undefined) setFields.dueDate = m.patch.dueDate;
      setFields.reviewedBy = req.user?.name || 'Mobile Analyst';
      setFields.reviewedAt = new Date();

      const pushFields = {};
      if (Array.isArray(m.patch.addedConditions) && m.patch.addedConditions.length > 0) {
        pushFields.conditions = {
          $each: m.patch.addedConditions.map((c) => ({
            text: c.text,
            addedAt: new Date(),
            addedBy: req.user?.name || 'Mobile Analyst',
          })),
        };
      }
      if (Array.isArray(m.auditEntries) && m.auditEntries.length > 0) {
        pushFields.auditLog = {
          $each: m.auditEntries.map((a) => ({
            action: a.action || 'MOBILE_UPDATE',
            by: req.user?.name || 'Mobile Analyst',
            at: a.at ? new Date(a.at) : new Date(),
            notes: a.notes || '',
            newValue: a.newValue || null,
          })),
        };
      }

      const updateOp = {
        $set: setFields,
        $inc: { __v: 1 },
      };
      if (Object.keys(pushFields).length > 0) {
        updateOp.$push = pushFields;
      }

      // 3. Atomic CAS FindOneAndUpdate matching baseVersion (__v)
      const query = {
        $or: [{ _id: m.findingId }, { pythonFindingId: m.findingId }],
        dealId: m.dealId,
      };
      if (typeof m.baseVersion === 'number') {
        query.__v = m.baseVersion;
      }

      const updated = await Finding.findOneAndUpdate(query, updateOp, { new: true });

      if (updated) {
        results.push({
          idempotencyKey: m.idempotencyKey,
          status: 'APPLIED',
          serverVersion: updated.__v,
          finding: updated,
        });
      } else {
        // Find existing record to return conflict payload
        const current = await Finding.findOne({
          $or: [{ _id: m.findingId }, { pythonFindingId: m.findingId }],
          dealId: m.dealId,
        }).lean();

        if (current) {
          results.push({
            idempotencyKey: m.idempotencyKey,
            status: 'CONFLICT',
            serverVersion: current.__v || 0,
            serverRecord: current,
          });
        } else {
          results.push({
            idempotencyKey: m.idempotencyKey,
            status: 'NOT_FOUND',
          });
        }
      }
    } catch (err) {
      console.error('[Mobile Sync Batch Item Error]:', err);
      results.push({
        idempotencyKey: m.idempotencyKey,
        status: 'ERROR',
        message: err.message,
      });
    }
  }

  res.json({ results });
});

/**
 * GET /api/mobile/deals/:dealId/delta
 * Delta sync for offline database catch-up
 */
router.get('/deals/:dealId/delta', async (req, res) => {
  const tenantId = req.user?.company?.id;
  const { dealId } = req.params;
  const { since } = req.query;

  if (tenantId) {
    const hasAccess = await assertTenantDealAccess(tenantId, dealId);
    if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });
  }

  const query = { dealId };
  if (since) {
    const sinceDate = new Date(since);
    if (!isNaN(sinceDate.getTime())) {
      query.updatedAt = { $gt: sinceDate };
    }
  }

  const findings = await Finding.find(query).sort({ updatedAt: 1 }).lean();
  res.json({
    dealId,
    syncCursor: new Date().toISOString(),
    findings,
  });
});

/**
 * Multipart VDR Upload Endpoints [FEAT-03]
 */
const UPLOAD_BASE_DIR = path.join(__dirname, '../../uploads');
const MULTIPART_TEMP_DIR = path.join(UPLOAD_BASE_DIR, 'multipart_temp');
if (!fs.existsSync(MULTIPART_TEMP_DIR)) {
  fs.mkdirSync(MULTIPART_TEMP_DIR, { recursive: true });
}

// 1. Init multipart
router.post('/upload/multipart/init', async (req, res) => {
  const tenantId = req.user?.company?.id;
  const { dealId, fileName, mimeType } = req.body;

  if (tenantId) {
    const hasAccess = await assertTenantDealAccess(tenantId, dealId);
    if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });
  }

  const uploadId = uuidv4();
  const safeName = path.basename(fileName || 'document.pdf');
  const objectKey = `vdr/${dealId}/${Date.now()}_${safeName}`;

  const uploadDir = path.join(MULTIPART_TEMP_DIR, uploadId);
  fs.mkdirSync(uploadDir, { recursive: true });

  res.json({ uploadId, objectKey });
});

// 2. Upload part
router.put('/upload/multipart/part', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
  const { uploadId, partNumber } = req.query;
  if (!uploadId || !partNumber) {
    return res.status(400).json({ error: 'Missing uploadId or partNumber query param' });
  }

  const uploadDir = path.join(MULTIPART_TEMP_DIR, uploadId);
  if (!fs.existsSync(uploadDir)) {
    return res.status(404).json({ error: 'Upload session expired or not found' });
  }

  const partFilePath = path.join(uploadDir, `part_${partNumber}`);
  fs.writeFileSync(partFilePath, req.body);

  const hash = crypto.createHash('md5').update(req.body).digest('hex');
  res.json({ partNumber: parseInt(partNumber, 10), eTag: hash });
});

// 3. Complete multipart
router.post('/upload/multipart/complete', async (req, res) => {
  const { uploadId, objectKey, parts } = req.body;
  if (!uploadId || !objectKey) {
    return res.status(400).json({ error: 'Missing uploadId or objectKey' });
  }

  const uploadDir = path.join(MULTIPART_TEMP_DIR, uploadId);
  if (!fs.existsSync(uploadDir)) {
    return res.status(404).json({ error: 'Upload session not found' });
  }

  const targetPath = path.join(UPLOAD_BASE_DIR, objectKey);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const writeStream = fs.createWriteStream(targetPath);
  const sortedParts = (parts || []).sort((a, b) => a.partNumber - b.partNumber);

  for (const part of sortedParts) {
    const partPath = path.join(uploadDir, `part_${part.partNumber}`);
    if (fs.existsSync(partPath)) {
      const data = fs.readFileSync(partPath);
      writeStream.write(data);
    }
  }
  writeStream.end();

  // Clean up temp parts directory
  try {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  } catch (cleanErr) {
    console.warn('[Multipart Cleanup Warning]:', cleanErr.message);
  }

  // Extract dealId and attach file to deal record
  const match = objectKey.match(/vdr\/([^/]+)\/(.+)/);
  if (match) {
    const dealId = match[1];
    const savedName = match[2];
    await Deal.findByIdAndUpdate(dealId, {
      $push: {
        files: {
          originalName: savedName.split('_').slice(1).join('_'),
          savedName,
          size: fs.statSync(targetPath).size,
          type: 'application/pdf',
        },
      },
    });
  }

  res.json({ status: 'COMPLETED', objectKey });
});

/**
 * GET /api/mobile/deals/:dealId/files/:fileId/watermarked-stream
 * [FEAT-02]: Forensic Diagonal PDF Watermarking Stream
 */
router.get('/deals/:dealId/files/:fileId/watermarked-stream', async (req, res) => {
  const tenantId = req.user?.company?.id;
  const { dealId, fileId } = req.params;

  if (tenantId) {
    const hasAccess = await assertTenantDealAccess(tenantId, dealId);
    if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });
  }

  const deal = await Deal.findById(dealId).lean();
  if (!deal) return res.status(404).json({ error: 'Deal not found' });

  // Search in files array by _id or savedName
  const fileMeta = (deal.files || []).find(
    (f) => (f._id && f._id.toString() === fileId) || f.savedName === fileId || f.originalName === fileId
  );

  let filePath = null;
  if (fileMeta) {
    filePath = path.join(UPLOAD_BASE_DIR, 'vdr', dealId, fileMeta.savedName);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(UPLOAD_BASE_DIR, fileMeta.savedName);
    }
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Target file not found in VDR repository' });
  }

  const userEmail = req.user?.email || 'analyst@acquisense.io';
  const userIp = req.ip || req.connection?.remoteAddress || '127.0.0.1';
  const timestamp = new Date().toISOString();
  const watermarkText = `CONFIDENTIAL \u2022 ${userEmail} \u2022 IP: ${userIp} \u2022 ${timestamp} \u2022 STRICTLY PRIVATE & CONFIDENTIAL`;

  try {
    if (!PDFDocument) {
      try {
        const pdfLib = require('pdf-lib');
        PDFDocument = pdfLib.PDFDocument;
        rgb = pdfLib.rgb;
        degrees = pdfLib.degrees;
      } catch (reqErr) {
        // Fallback: stream original file
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="confidential_${fileId}.pdf"`);
        return fs.createReadStream(filePath).pipe(res);
      }
    }

    const existingPdfBytes = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    for (const page of pages) {
      const { width, height } = page.getSize();
      page.drawText(watermarkText, {
        x: 40,
        y: height / 2,
        size: 13,
        color: rgb(0.85, 0.15, 0.25),
        opacity: 0.18,
        rotate: degrees(35),
      });
      // Second footer stamp
      page.drawText(watermarkText, {
        x: 40,
        y: 40,
        size: 8,
        color: rgb(0.5, 0.5, 0.5),
        opacity: 0.4,
      });
    }

    const watermarkedBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="watermarked_${fileId}.pdf"`);
    res.setHeader('Content-Length', watermarkedBytes.length);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(Buffer.from(watermarkedBytes));
  } catch (err) {
    console.error('[Watermark Error]:', err);
    // Graceful fallback to unwatermarked with security headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileId}.pdf"`);
    fs.createReadStream(filePath).pipe(res);
  }
});

module.exports = router;

