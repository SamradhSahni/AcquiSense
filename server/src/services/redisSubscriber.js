'use strict';
/**
 * Redis subscriber — listens to Python pipeline progress events
 * and relays them to the React frontend via Socket.IO.
 *
 * Python publishes to: dd:progress:{job_id}
 * We subscribe to that channel and emit Socket.IO events to the
 * room `job:{pythonJobId}` that the React client joins.
 */
const Redis = require('ioredis');
const { Job } = require('../models');

let subscriber = null;

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/0';

/**
 * Subscribe to a Python job's progress channel.
 * @param {string} pythonJobId  — the UUID returned by Python /api/analyze
 * @param {string} mongoJobId   — our internal Job._id for DB updates
 * @param {object} io           — Socket.IO server instance
 */
const subscribeToJob = async (pythonJobId, mongoJobId, io) => {
  if (!subscriber) {
    subscriber = new Redis(REDIS_URL);
    subscriber.on('error', (err) => console.error('⚠️  Redis subscriber:', err.message));
  }

  const channel = `dd:progress:${pythonJobId}`;

  // Use psubscribe to match the channel pattern
  subscriber.subscribe(channel, (err) => {
    if (err) console.error(`Failed to subscribe to ${channel}:`, err.message);
    else console.log(`📡 Subscribed to Redis channel: ${channel}`);
  });

  subscriber.on('message', async (ch, message) => {
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

      // When done or failed, unsubscribe
      if (event.status === 'done' || event.status === 'failed') {
        subscriber.unsubscribe(channel);
        console.log(`✅ Unsubscribed from ${channel} (job ${event.status})`);
      }
    } catch (dbErr) {
      console.error('Redis→MongoDB update error:', dbErr.message);
    }
  });
};

module.exports = { subscribeToJob };
