'use strict';
/**
 * Redis subscriber — listens to Python pipeline progress events
 * and relays them to the React frontend via Socket.IO.
 *
 * FIX: Each job gets its OWN Redis subscriber connection so that
 * unsubscribing one job doesn't kill other jobs' subscriptions.
 */
const Redis = require('ioredis');
const { Job } = require('../models');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/0';

/**
 * Subscribe to a Python job's progress channel.
 * Uses a dedicated Redis connection per job to avoid shared-connection bugs.
 */
const subscribeToJob = async (pythonJobId, mongoJobId, io) => {
  // Each job gets its own subscriber connection
  const sub = new Redis(REDIS_URL);
  sub.on('error', (err) => console.error(`⚠️  Redis subscriber [${pythonJobId}]:`, err.message));

  const channel = `dd:progress:${pythonJobId}`;

  await sub.subscribe(channel);
  console.log(`📡 Subscribed to Redis channel: ${channel}`);

  sub.on('message', async (ch, message) => {
    if (ch !== channel) return;

    let event;
    try { event = JSON.parse(message); } catch { return; }

    // Relay to Socket.IO room for this job
    io.to(`job:${pythonJobId}`).emit('progress', event);

    // Persist updates to MongoDB
    try {
      const update = {};

      if (event.type === 'agent_progress' && event.domain) {
        update[`agentProgress.${event.domain}`] = {
          domain: event.domain,
          status: event.status,
          pct: event.pct || 0,
          findingsCount: event.findings_count || 0,
          error: event.error || null,
        };
      }

      if (event.type === 'job_status') {
        update.status = event.status;
        if (event.go_no_go) update.goNoGo = event.go_no_go;
        if (event.total_findings != null) update.totalFindings = event.total_findings;
        if (event.error) update.error = event.error;
      }

      if (Object.keys(update).length > 0) {
        await Job.findByIdAndUpdate(mongoJobId, { $set: update });
      }

      // When done or failed, clean up this dedicated connection
      if (event.status === 'done' || event.status === 'failed') {
        sub.unsubscribe(channel).then(() => {
          sub.quit();
          console.log(`✅ Unsubscribed from ${channel} (job ${event.status})`);
        });
      }
    } catch (dbErr) {
      console.error('Redis→MongoDB update error:', dbErr.message);
    }
  });
};

module.exports = { subscribeToJob };
