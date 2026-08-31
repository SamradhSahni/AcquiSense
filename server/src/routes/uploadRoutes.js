'use strict';
/**
 * Upload routes — file ingestion into the shared uploads volume.
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { Deal } = require('../models');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '50');
const ALLOWED_EXTS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.txt', '.csv', '.md'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fs = require('fs');
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTS.includes(ext)) cb(null, true);
  else cb(new Error(`Unsupported file type: ${ext}`), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

// POST /api/upload?dealId=xxx  — upload documents
router.post('/', upload.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const savedFiles = req.files.map((f) => ({
    originalName: f.originalname,
    savedName: f.filename,
    size: f.size,
    type: path.extname(f.originalname).slice(1).toLowerCase(),
  }));

  // If a dealId is provided, attach files to the deal
  const { dealId } = req.query;
  if (dealId) {
    await Deal.findByIdAndUpdate(dealId, {
      $push: { files: { $each: savedFiles } },
    }).catch(() => {});
  }

  res.json({
    count: savedFiles.length,
    files: savedFiles,
    savedNames: savedFiles.map((f) => f.savedName),
  });
});

// Error handler for multer
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `File too large (max ${MAX_FILE_SIZE_MB}MB)` });
  }
  res.status(400).json({ error: err.message });
});

module.exports = router;
