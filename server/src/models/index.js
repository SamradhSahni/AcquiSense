const mongoose = require('mongoose');

// ── Deal ──────────────────────────────────────────────────────────────────────
const DealSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  targetCompany: { type: String, default: '' },
  acquirer: { type: String, default: '' },
  modelProfile: { type: String, enum: ['economy', 'standard', 'premium'], default: 'standard' },
  status: {
    type: String,
    enum: ['draft', 'queued', 'analyzing', 'done', 'failed'],
    default: 'draft',
  },
  goNoGo: { type: String, enum: ['GO', 'CAUTION', 'NO-GO', null], default: null },
  overallRiskScore: { type: Number, default: 0 },
  totalFindings: { type: Number, default: 0 },
  files: [{ originalName: String, savedName: String, size: Number, type: String }],
  latestJobId: { type: String, default: null },
}, { timestamps: true });

// ── Job ───────────────────────────────────────────────────────────────────────
const AgentProgressSchema = new mongoose.Schema({
  domain: String,
  status: { type: String, default: 'idle' },
  pct: { type: Number, default: 0 },
  findingsCount: { type: Number, default: 0 },
  error: { type: String, default: null },
}, { _id: false });

const JobSchema = new mongoose.Schema({
  dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true },
  pythonJobId: { type: String, default: null },
  status: {
    type: String,
    enum: ['queued', 'ingesting', 'analyzing', 'synthesizing', 'quality_check', 'generating_report', 'done', 'failed'],
    default: 'queued',
  },
  agentProgress: { type: Map, of: AgentProgressSchema, default: {} },
  goNoGo: { type: String, default: null },
  totalFindings: { type: Number, default: 0 },
  error: { type: String, default: null },
}, { timestamps: true });

// ── Report ────────────────────────────────────────────────────────────────────
const ReportSchema = new mongoose.Schema({
  dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true },
  jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
  pythonJobId: String,
  goNoGo: String,
  executiveSummary: String,
  totalFindings: Number,
  severityDistribution: { P0: Number, P1: Number, P2: Number, P3: Number },
  domainScores: { type: Map, of: Number, default: {} },
  // Full report JSON stored as a sub-document
  fullReport: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const Deal = mongoose.model('Deal', DealSchema);
const Job = mongoose.model('Job', JobSchema);
const Report = mongoose.model('Report', ReportSchema);

module.exports = { Deal, Job, Report };
