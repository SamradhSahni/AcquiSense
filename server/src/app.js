'use strict';
/**
 * Due Diligence Agents — Node.js API Gateway
 * Phase 3: Full implementation with MongoDB, Socket.IO, Redis, and Python bridge.
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
const promClient = require('prom-client');

// ── Config ────────────────────────────────────────────────────────────────────
require('dotenv').config();
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

// ── App & HTTP server ─────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ── Socket.IO ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: [CLIENT_ORIGIN, 'http://localhost:3000'], credentials: true },
  transports: ['websocket', 'polling'],
});

app.set('io', io);  // Make io accessible in route handlers

// ── Prometheus metrics ────────────────────────────────────────────────────────
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

const activeConnections = new promClient.Gauge({
  name: 'ws_active_connections',
  help: 'Active WebSocket connections',
  registers: [register],
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: [CLIENT_ORIGIN, 'http://localhost:3000'], credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Prometheus request timer
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer({ method: req.method, route: req.path });
  res.on('finish', () => end({ status: res.statusCode }));
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/deals', require('./routes/dealRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/jobs', require('./routes/jobRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));

// ── Health & Metrics endpoints ────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const mongoose = require('mongoose');
  const { checkHealth } = require('./services/pythonBridge');
  const pyHealth = await checkHealth();
  res.json({
    status: 'ok',
    service: 'dd-server',
    version: '3.0.0',
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    python: pyHealth ? 'ok' : 'unreachable',
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', (req, res) => {
  const mongoose = require('mongoose');
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  activeConnections.inc();
  console.log(`🔌 WebSocket client connected: ${socket.id}`);

  // Client joins a room for a specific job
  socket.on('subscribe_job', (pythonJobId) => {
    const room = `job:${pythonJobId}`;
    socket.join(room);
    console.log(`📡 ${socket.id} → room ${room}`);
    socket.emit('subscribed', { room, pythonJobId });
  });

  socket.on('unsubscribe_job', (pythonJobId) => {
    socket.leave(`job:${pythonJobId}`);
  });

  socket.on('disconnect', () => {
    activeConnections.dec();
    console.log(`❌ WebSocket client disconnected: ${socket.id}`);
  });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── DB + Start ────────────────────────────────────────────────────────────────
const { connectDB } = require('./config/db');

(async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`🚀 DD Server running on port ${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
    console.log(`   Health:    http://localhost:${PORT}/health`);
    console.log(`   Metrics:   http://localhost:${PORT}/metrics`);
  });
})();

module.exports = { app, io };
