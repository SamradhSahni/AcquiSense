'use strict';
const mongoose = require('mongoose');
require('dotenv').config();

const { Deal, Job, Report } = require('./models');
const { getResults } = require('./services/pythonBridge');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://ddadmin:ddpassword@mongodb:27017/diligence?authSource=admin';

async function sync() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const jobs = await Job.find({ status: { $ne: 'done' } });
  console.log(`Found ${jobs.length} unfinished jobs in MongoDB`);

  for (const job of jobs) {
    if (!job.pythonJobId) continue;
    try {
      const rep = await getResults(job.pythonJobId);
      if (rep && rep.verdict) {
        console.log(`Syncing completed job: ${job._id} (${job.pythonJobId}) -> verdict: ${rep.verdict.go_no_go}, findings: ${rep.verdict.total_findings}`);

        const agentProgress = {};
        if (rep.domains) {
          Object.entries(rep.domains).forEach(([dom, dData]) => {
            const count = Array.isArray(dData) ? dData.length : (dData?.findings?.length ?? dData?.findings_count ?? 0);
            agentProgress[dom] = { domain: dom, status: 'done', pct: 100, findingsCount: count, error: null };
          });
        }

        await Job.findByIdAndUpdate(job._id, {
          status: 'done',
          goNoGo: rep.verdict.go_no_go,
          totalFindings: rep.verdict.total_findings,
          agentProgress,
        });

        await Report.findOneAndUpdate(
          { pythonJobId: job.pythonJobId },
          {
            dealId: job.dealId,
            jobId: job._id,
            pythonJobId: job.pythonJobId,
            goNoGo: rep.verdict.go_no_go,
            executiveSummary: rep.verdict.executive_summary,
            totalFindings: rep.verdict.total_findings,
            severityDistribution: rep.verdict.severity_distribution,
            domainScores: rep.domain_scores,
            fullReport: rep,
          },
          { upsert: true, new: true }
        );

        await Deal.findByIdAndUpdate(job.dealId, {
          status: 'done',
          goNoGo: rep.verdict.go_no_go,
          overallRiskScore: Math.max(...Object.values(rep.domain_scores || {}), 0),
          totalFindings: rep.verdict.total_findings,
        });
      }
    } catch (err) {
      console.log(`Job ${job._id} not ready in python: ${err.message}`);
    }
  }

  console.log('Sync finished successfully');
  process.exit(0);
}

sync().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
