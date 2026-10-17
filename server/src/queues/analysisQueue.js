'use strict';
/**
 * BullMQ Analysis Queue — resilient task queue for DD analysis jobs.
 *
 * Replaces FastAPI BackgroundTasks (in-process, lost on restart) with a
 * BullMQ queue backed by Redis. This means:
 *   - Jobs survive server restarts
 *   - Automatic retries with exponential backoff on failure
 *   - Concurrency control (max N simultaneous analyses)
 *   - Dead Letter Queue for persistently failed jobs
 *   - Bull Board UI for monitoring
 *
 * Architecture:
 *   1. Node.js server enqueues a job (this file)
 *   2. The BullMQ worker (this file, worker export) calls Python bridge
 *   3. Python bridge calls the FastAPI /api/analyze endpoint
 *   4. Progress events flow back via Redis pub/sub → Socket.IO → React
 *
 * Usage in jobRoutes.js:
 *   const { enqueueAnalysis } = require('../queues/analysisQueue');
 *   await enqueueAnalysis({ dealId, pythonJobId, filePaths, ... });
 */

const { Queue, Worker, QueueEvents } = require('bullmq');
const { Deal, Job }                  = require('../models');
const { startAnalysis, getResults }  = require('../services/pythonBridge');
const { subscribeToJob }             = require('../services/redisSubscriber');

// ── Config ────────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Parse Redis URL for BullMQ (it needs host/port separately)
function parseRedisUrl(url) {
  try {
    const u = new URL(url);
    return {
      host:     u.hostname || 'localhost',
      port:     parseInt(u.port || '6379', 10),
      password: u.password || undefined,
      db:       parseInt(u.pathname?.replace('/', '') || '0', 10),
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

const redisConnection = parseRedisUrl(REDIS_URL);

const QUEUE_NAME   = 'dd-analysis';
const MAX_RETRIES  = 3;
const BACKOFF_DELAY_MS = 30_000;   // 30 s initial backoff
const CONCURRENCY  = parseInt(process.env.QUEUE_CONCURRENCY || '3', 10);

// ── Queue ─────────────────────────────────────────────────────────────────────

const analysisQueue = new Queue(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: MAX_RETRIES,
    backoff: {
      type: 'exponential',
      delay: BACKOFF_DELAY_MS,
    },
    removeOnComplete: { count: 100 },   // keep last 100 completed
    removeOnFail:     { count: 50 },    // keep last 50 failed for inspection
  },
});

// ── Enqueue ───────────────────────────────────────────────────────────────────

/**
 * Add an analysis job to the queue.
 * Called from jobRoutes.js after creating the Job document.
 */
async function enqueueAnalysis(payload) {
  const {
    mongoJobId,
    dealId,
    filePaths,
    targetCompany,
    acquirer,
    modelProfile = 'standard',
  } = payload;

  const job = await analysisQueue.add(
    'analyze',
    { mongoJobId, dealId, filePaths, targetCompany, acquirer, modelProfile },
    {
      jobId: mongoJobId,   // Use MongoDB job ID so we can correlate
      priority: modelProfile === 'premium' ? 1 : 2,
    }
  );

  console.log(`📥 [Queue] Enqueued analysis job: mongoJobId=${mongoJobId}, bullId=${job.id}`);
  return job;
}

// ── Worker ────────────────────────────────────────────────────────────────────

/**
 * Process one analysis job.
 * Runs in the same Node.js process but could be split to a separate worker.js.
 */
function startWorker(io) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { mongoJobId, dealId, filePaths, targetCompany, acquirer, modelProfile } = job.data;
      console.log(`⚙️  [Worker] Processing job ${mongoJobId} (attempt ${job.attemptsMade + 1})`);

      // Update MongoDB status
      await Job.findByIdAndUpdate(mongoJobId, { status: 'analyzing' });
      await Deal.findByIdAndUpdate(dealId, { status: 'analyzing' });

      // Call Python API
      let pythonResp;
      try {
        pythonResp = await startAnalysis({
          dealId: dealId.toString(),
          filePaths,
          targetCompany,
          acquirer,
          modelProfile,
        });
      } catch (err) {
        // Mark as failed if final attempt
        if (job.attemptsMade >= MAX_RETRIES - 1) {
          await Job.findByIdAndUpdate(mongoJobId, { status: 'failed', error: err.message });
          await Deal.findByIdAndUpdate(dealId, { status: 'failed' });
        }
        throw err;   // BullMQ will handle retry
      }

      const pythonJobId = pythonResp.job_id;
      await Job.findByIdAndUpdate(mongoJobId, { pythonJobId, status: 'queued' });

      // Subscribe to Redis progress and relay to Socket.IO
      if (io) {
        subscribeToJob(pythonJobId, mongoJobId.toString(), io).catch(console.error);
      }

      return { pythonJobId, mongoJobId };
    },
    {
      connection: redisConnection,
      concurrency: CONCURRENCY,
    }
  );

  // ── Worker event handlers ──────────────────────────────────────────────────

  worker.on('completed', (job, result) => {
    console.log(`✅ [Worker] Job ${job.data.mongoJobId} queued in Python → pythonJobId=${result.pythonJobId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ [Worker] Job ${job?.data?.mongoJobId} failed (attempt ${job?.attemptsMade}): ${err.message}`);
    if (io && job?.data?.mongoJobId) {
      io.to(`job:${job.data.mongoJobId}`).emit('job_status', {
        type: 'job_status',
        status: 'failed',
        error: err.message,
        attemptsMade: job.attemptsMade,
      });
    }
  });

  worker.on('error', err => {
    console.error('[Worker] Worker error:', err);
  });

  console.log(`🔄 [Queue] Worker started — concurrency=${CONCURRENCY}`);
  return worker;
}

// ── Queue Events (for monitoring) ─────────────────────────────────────────────

function createQueueEvents() {
  const queueEvents = new QueueEvents(QUEUE_NAME, { connection: redisConnection });
  queueEvents.on('waiting', ({ jobId }) => console.log(`⏳ [Queue] Waiting: ${jobId}`));
  queueEvents.on('active',  ({ jobId }) => console.log(`▶️  [Queue] Active:  ${jobId}`));
  return queueEvents;
}

// ── Health check ──────────────────────────────────────────────────────────────

async function getQueueHealth() {
  try {
    const [waiting, active, completed, failed] = await Promise.all([
      analysisQueue.getWaitingCount(),
      analysisQueue.getActiveCount(),
      analysisQueue.getCompletedCount(),
      analysisQueue.getFailedCount(),
    ]);
    return { status: 'ok', waiting, active, completed, failed };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

module.exports = { analysisQueue, enqueueAnalysis, startWorker, createQueueEvents, getQueueHealth };
