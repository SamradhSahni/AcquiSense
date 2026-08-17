/**
 * Due Diligence Agents — Express API Gateway (Phase 1 Skeleton)
 *
 * Phase 1: boots cleanly, connects to MongoDB + Redis, exposes /health.
 * Phase 3: adds full routes (deals, upload, jobs, reports, websocket).
 */

'use strict';

require('express-async-errors');
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const http = require('http');
const { Server: SocketServer } = require('socket.io');
const Redis = require('ioredis');

// ── App setup ─────────────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 4000;

// Security + logging middleware
app.use(helmet());
app.use(morgan('dev'));
app.use(
  cors({
    origin: [
      process.env.CLIENT_ORIGIN || 'http://localhost:3000',
      'http://localhost:3000',
    ],
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── MongoDB connection ─────────────────────────────────────────────────────────

const connectMongo = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn('⚠️  MONGO_URI not set — skipping MongoDB connection (Phase 1 OK)');
    return;
  }
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    // Don't crash — allows Phase 1 smoke test without credentials
  }
};

// ── Redis connection ───────────────────────────────────────────────────────────

let redis = null;

const connectRedis = () => {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn('⚠️  REDIS_URL not set — skipping Redis connection (Phase 1 OK)');
    return;
  }
  try {
    redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
    redis.on('connect', () => console.log('✅ Redis connected'));
    redis.on('error', (err) => console.error('⚠️  Redis error:', err.message));
    redis.connect().catch(() => {}); // Non-fatal in Phase 1
  } catch (err) {
    console.error('❌ Redis setup failed:', err.message);
  }
};

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check (required for Docker healthcheck)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'dd-server',
    version: '1.0.0',
    timestamp: Date.now(),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redis: redis?.status === 'ready' ? 'connected' : 'disconnected',
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    name: 'Due Diligence Agents API Gateway',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      deals: 'GET|POST /api/deals  [Phase 3]',
      upload: 'POST /api/upload     [Phase 3]',
      jobs: 'GET|POST /api/jobs   [Phase 3]',
      reports: 'GET /api/reports    [Phase 3]',
    },
  });
});

// Stub routes — will be replaced with full routers in Phase 3
app.use('/api/deals', (req, res) => res.json({ stub: true, phase: 3, route: 'deals' }));
app.use('/api/upload', (req, res) => res.json({ stub: true, phase: 3, route: 'upload' }));
app.use('/api/jobs', (req, res) => res.json({ stub: true, phase: 3, route: 'jobs' }));
app.use('/api/reports', (req, res) => res.json({ stub: true, phase: 3, route: 'reports' }));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── HTTP + WebSocket server ────────────────────────────────────────────────────

const httpServer = http.createServer(app);

const io = new SocketServer(httpServer, {
  cors: {
    origin: [process.env.CLIENT_ORIGIN || 'http://localhost:3000', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
  },
});

// WebSocket events (Phase 3 will relay agent progress here)
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('subscribe_job', (jobId) => {
    socket.join(`job:${jobId}`);
    console.log(`  → subscribed to job:${jobId}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// Export for use in Phase 3 services
app.set('io', io);
app.set('redis', () => redis);

// ── Start server ──────────────────────────────────────────────────────────────

const start = async () => {
  await connectMongo();
  connectRedis();

  httpServer.listen(PORT, () => {
    console.log(`\n🚀 DD Server running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket ready on ws://localhost:${PORT}`);
    console.log(`📋 API info: http://localhost:${PORT}/api\n`);
  });
};

start().catch(console.error);
