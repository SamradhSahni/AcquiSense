const mongoose = require('mongoose');

// ── Deal ──────────────────────────────────────────────────────────────────────
const DealSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
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
  reportHash: { type: String, default: null },   // SHA-256 fingerprint for tamper detection
  error: { type: String, default: null },
}, { timestamps: true });

// ── Finding (Risk Action Center + HITL Review) ────────────────────────────────

const AuditLogEntrySchema = new mongoose.Schema({
  action: { type: String, required: true },   // e.g. "assigned", "confirmed", "modified"
  by: { type: String, default: 'analyst' },
  at: { type: Date, default: Date.now },
  notes: { type: String, default: '' },
  previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
  newValue: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const ConditionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  addedAt: { type: Date, default: Date.now },
  addedBy: { type: String, default: 'analyst' },
}, { _id: true });

const FindingSchema = new mongoose.Schema({
  // Identity
  pythonFindingId: { type: String, required: true, index: true },
  dealId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true },
  jobId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
  pythonJobId:     { type: String },

  // Core finding data (mirrors Python schema)
  domain:      { type: String, required: true },
  severity:    { type: String, enum: ['P0', 'P1', 'P2', 'P3'], default: 'P2' },
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  evidence:    { type: String, default: '' },
  citations:   [{ file: String, page: Number, section: String, quote: String }],
  tags:        [String],

  // ── Risk Action Center (Feature 11) ─────────────────────────
  workflowState: {
    type: String,
    enum: ['open', 'assigned', 'remediating', 'verified', 'closed'],
    default: 'open',
  },
  assignedTo:   { type: String, default: null },
  dueDate:      { type: Date, default: null },
  conditions:   [ConditionSchema],

  // ── Human-in-the-Loop Review (Feature 12) ────────────────────
  reviewStatus: {
    type: String,
    enum: ['ai_generated', 'confirmed', 'modified', 'rejected'],
    default: 'ai_generated',
  },
  reviewedBy:      { type: String, default: null },
  reviewedAt:      { type: Date, default: null },
  analystNotes:    { type: String, default: '' },
  originalAITitle: { type: String, default: '' },  // snapshot of AI title before any modification
  originalAIDesc:  { type: String, default: '' },  // snapshot of AI description before modification

  // ── Immutable audit trail (both features) ─────────────────
  auditLog: [AuditLogEntrySchema],

}, { timestamps: true });

// Compound index: deal + python finding ID uniqueness
FindingSchema.index({ dealId: 1, pythonFindingId: 1 }, { unique: true });

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
const Finding = mongoose.model('Finding', FindingSchema);
const Report = mongoose.model('Report', ReportSchema);

// ── Company ───────────────────────────────────────────────────────────────────
const CompanySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
});
const Company = mongoose.model('Company', CompanySchema);

// ── User ──────────────────────────────────────────────────────────────────────
const bcrypt = require('bcryptjs');
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Method to compare password
UserSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};
const User = mongoose.model('User', UserSchema);

// ── Group ─────────────────────────────────────────────────────────────────────
const GroupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  permissions: [{ type: String, trim: true }], // e.g., 'user:create', 'report:view', 'task:assign'
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
}, { timestamps: true });

// Ensure group name is unique per company
GroupSchema.index({ name: 1, company: 1 }, { unique: true });
const Group = mongoose.model('Group', GroupSchema);

const MobileDevice = require('./MobileDevice');

module.exports = { Deal, Job, Report, Finding, Company, User, Group, MobileDevice };