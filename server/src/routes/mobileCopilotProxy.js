'use strict';

const express = require('express');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const router = express.Router();
const PYTHON_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

/**
 * Transparent streaming proxy for /api/v1/mobile/copilot/*
 * Pipes both SSE streams (/stream) and multipart audio uploads (/transcribe)
 * directly to the Python FastAPI engine without buffering chunks.
 */
router.all('/*', (req, res) => {
  const targetUrl = new URL(`/api/v1/mobile/copilot${req.url}`, PYTHON_URL);
  const transport = targetUrl.protocol === 'https:' ? https : http;

  const headers = { ...req.headers, host: targetUrl.host };

  const proxyReq = transport.request(
    {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (err) => {
    console.error('[MobileCopilotProxy Error]:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Copilot backend unavailable', detail: err.message });
    } else {
      res.end();
    }
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      proxyReq.destroy();
    }
  });

  req.pipe(proxyReq);
});

module.exports = router;
