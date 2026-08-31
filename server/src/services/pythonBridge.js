'use strict';
/**
 * Python bridge — HTTP client that talks to FastAPI backend.
 * Handles file uploads (forwarding to Python's /api/upload) and job triggering.
 */
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const PYTHON_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

const pythonClient = axios.create({
  baseURL: PYTHON_URL,
  timeout: 30000,
});

/**
 * Forward a local file to Python's /api/upload.
 * Since both containers share the uploads volume, Python can read
 * the file directly — this just registers it.
 */
const uploadFileToPython = async (savedName) => {
  const filePath = path.join(UPLOAD_DIR, savedName);
  const form = new FormData();
  form.append('files', fs.createReadStream(filePath), savedName);

  const res = await pythonClient.post('/api/upload', form, {
    headers: form.getHeaders(),
    timeout: 60000,
  });
  return res.data; // { saved: [...], errors: [...] }
};

/**
 * Start an analysis job in Python.
 */
const startAnalysis = async ({ dealId, filePaths, targetCompany, acquirer, modelProfile }) => {
  const res = await pythonClient.post('/api/analyze', {
    deal_id: dealId,
    file_paths: filePaths,
    target_company: targetCompany || '',
    acquirer: acquirer || '',
    model_profile: modelProfile || 'standard',
  });
  return res.data; // { job_id, deal_id, status, message }
};

/**
 * Get job status from Python.
 */
const getJobStatus = async (pythonJobId) => {
  const res = await pythonClient.get(`/api/status/${pythonJobId}`);
  return res.data;
};

/**
 * Fetch full results from Python.
 */
const getResults = async (pythonJobId) => {
  const res = await pythonClient.get(`/api/results/${pythonJobId}`);
  return res.data;
};

/**
 * Health check against Python backend.
 */
const checkHealth = async () => {
  try {
    const res = await pythonClient.get('/health', { timeout: 5000 });
    return res.data;
  } catch {
    return null;
  }
};

module.exports = { uploadFileToPython, startAnalysis, getJobStatus, getResults, checkHealth };
