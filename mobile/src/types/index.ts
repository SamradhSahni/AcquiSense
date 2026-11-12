export type Severity = 'P0' | 'P1' | 'P2' | 'P3';

export type ReviewStatus = 'ai_generated' | 'confirmed' | 'modified' | 'rejected';

export type WorkflowState = 'open' | 'assigned' | 'remediating' | 'verified' | 'closed';

export type GoNoGoDecision = 'GO' | 'CAUTION' | 'NO-GO';

export type ModelProfile = 'economy' | 'standard' | 'premium';

export type DiligenceDomain =
  | 'legal'
  | 'finance'
  | 'commercial'
  | 'tech'
  | 'cyber'
  | 'hr'
  | 'tax'
  | 'regulatory'
  | 'esg';

export interface Citation {
  file: string;
  page?: number;
  section?: string;
  quote: string;
}

export interface Condition {
  _id: string;
  text: string;
  addedBy?: string;
  addedAt?: string;
}

export interface AuditLogEntry {
  action: string;
  by?: string;
  at: string;
  notes?: string;
  previousValue?: any;
  newValue?: any;
}

export interface Finding {
  id: string;
  _id?: string;
  dealId: string;
  domain: DiligenceDomain;
  severity: Severity;
  title: string;
  description: string;
  evidence: string;
  citations: Citation[];
  tags: string[];
  workflowState: WorkflowState;
  reviewStatus: ReviewStatus;
  assignedTo: string | null;
  dueDate: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  analystNotes?: string;
  conditions: Condition[];
  auditLog: AuditLogEntry[];
  serverVersion: number;
  isDirty?: boolean;
  updatedAt: string;
}

export interface DealFile {
  _id?: string;
  originalName: string;
  savedName: string;
  size: number;
  type: string;
}

export interface Deal {
  id: string;
  _id?: string;
  name: string;
  targetCompany: string;
  acquirer: string;
  modelProfile: ModelProfile;
  status: 'draft' | 'queued' | 'analyzing' | 'done' | 'failed';
  goNoGo: GoNoGoDecision | null;
  overallRiskScore: number;
  totalFindings: number;
  files?: DealFile[];
  executiveSummaryMd?: string;
  latestJobId?: string | null;
  latestPythonJobId?: string | null;
  syncCursor?: string | null;
  createdAt?: string;
  updatedAt: string;
  job?: JobRecord | null;
}

export interface AgentProgress {
  domain: DiligenceDomain;
  status: 'idle' | 'running' | 'done' | 'failed' | string;
  pct: number;
  findingsCount?: number;
  findings_count?: number;
  error?: string | null;
}

export interface JobRecord {
  _id?: string;
  id?: string;
  dealId: string;
  pythonJobId?: string | null;
  status:
    | 'queued'
    | 'ingesting'
    | 'analyzing'
    | 'synthesizing'
    | 'quality_check'
    | 'generating_report'
    | 'done'
    | 'failed';
  agentProgress?: Record<string, AgentProgress>;
  goNoGo?: GoNoGoDecision | null;
  totalFindings?: number;
  reportHash?: string | null;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserGroup {
  id: string;
  _id?: string;
  name: string;
  description?: string;
  permissions: string[];
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  company?: {
    id: string;
    name: string;
  } | null;
  groups?: UserGroup[];
}

export interface TeamUser {
  _id: string;
  id?: string;
  name: string;
  email: string;
  isActive: boolean;
  groups: UserGroup[];
  createdAt?: string;
}

export interface FindingsSummary {
  total: number;
  workflow: Record<WorkflowState, number>;
  review: Record<ReviewStatus, number>;
}

export interface AnalystQuestion {
  question: string;
  domain: DiligenceDomain | string;
  severity: Severity;
  rationale?: string;
  what_to_look_for?: string;
  linked_finding_ids?: string[];
}

export interface AnalystQuestionsResponse {
  total: number;
  questions: AnalystQuestion[];
  by_domain?: Record<string, AnalystQuestion[]>;
}

export interface ComparisonChange {
  type: 'changed' | 'new' | 'removed';
  severity: 'high' | 'medium' | 'low';
  category: string;
  item: string;
  detail_a?: string;
  detail_b?: string;
  business_impact?: string;
}

export interface ComparisonResult {
  summary?: string;
  risk_direction: 'deteriorating' | 'improving' | 'stable';
  changes: ComparisonChange[];
}

export interface ReportRecord {
  _id: string;
  dealId: string | { _id: string; name?: string; targetCompany?: string };
  jobId?: string;
  pythonJobId?: string;
  dealName?: string;
  targetCompany?: string;
  goNoGo?: GoNoGoDecision;
  executiveSummary?: string;
  totalFindings?: number;
  severityDistribution?: Record<Severity, number>;
  domainScores?: Record<string, number>;
  fullReport?: any;
  createdAt?: string;
}

export interface GatewayHealth {
  status: string;
  service?: string;
  version?: string;
  mongo?: string;
  python?: string;
  queue?: any;
  timestamp?: string;
}
