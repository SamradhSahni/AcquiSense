'use strict';
/**
 * Redis subscriber — listens to Python pipeline progress events
 * and relays them to the React frontend via Socket.IO.
 *
 * FIX:
 * 1. Dedicated connection per job.
 * 2. ONLY unsubscribe when event.type === 'job_status' && (done | failed).
 *    Never unsubscribe when an individual agent_progress finishes!
 * 3. Auto-cache report and update Deal in MongoDB when job completes.
 */
const Redis = require('ioredis');
const { Job, Deal, Report } = require('../models');
const { getResults } = require('./pythonBridge');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/0';

/**
 * Subscribe to a Python job's progress channel.
 * Uses a dedicated Redis connection per job.
 */
const subscribeToJob = async (pythonJobId, mongoJobId, io) => {
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

      let updatedJob = null;
      if (Object.keys(update).length > 0) {
        updatedJob = await Job.findByIdAndUpdate(mongoJobId, { $set: update }, { new: true });
      }

      // If job is finished, update Deal and auto-fetch report
      if (event.type === 'job_status' && event.status === 'done') {
        try {
          const report = await getResults(pythonJobId);
          if (report && report.verdict) {
            const dealId = updatedJob?.dealId;
            await Report.findOneAndUpdate(
              { pythonJobId },
              {
                dealId,
                jobId: mongoJobId,
                pythonJobId,
                goNoGo: report.verdict?.go_no_go,
                executiveSummary: report.verdict?.executive_summary,
                totalFindings: report.verdict?.total_findings,
                severityDistribution: report.verdict?.severity_distribution,
                domainScores: report.domain_scores,
                fullReport: report,
              },
              { upsert: true }
            );
            const agentProgress = {};
            if (report.domains) {
              Object.entries(report.domains).forEach(([dom, dData]) => {
                const count = Array.isArray(dData)
                  ? dData.length
                  : (dData?.findings?.length ?? dData?.findings_count ?? 0);
                agentProgress[dom] = {
                  domain: dom,
                  status: 'done',
                  pct: 100,
                  findingsCount: count,
                  error: null,
                };
              });
            }

            await Job.findByIdAndUpdate(mongoJobId, {
              status: 'done',
              goNoGo: report.verdict?.go_no_go,
              totalFindings: report.verdict?.total_findings,
              ...(Object.keys(agentProgress).length > 0 ? { agentProgress } : {}),
            });

            if (dealId) {
              await Deal.findByIdAndUpdate(dealId, {
                status: 'done',
                goNoGo: report.verdict?.go_no_go,
                overallRiskScore: Math.max(...Object.values(report.domain_scores || {}), 0),
                totalFindings: report.verdict?.total_findings,
              });
            }
          }
        } catch (fetchErr) {
          console.warn(`Auto-fetch report warning [${pythonJobId}]:`, fetchErr.message);
        }
      } else if (event.type === 'job_status' && event.status === 'failed') {
        if (updatedJob?.dealId) {
          await Deal.findByIdAndUpdate(updatedJob.dealId, { status: 'failed' });
        }
      }

      // CRITICAL FIX: Only unsubscribe when the ENTIRE job finishes or fails,
      // NOT when an individual agent sends agent_progress with status: 'done'!
      if (event.type === 'job_status' && (event.status === 'done' || event.status === 'failed')) {
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
