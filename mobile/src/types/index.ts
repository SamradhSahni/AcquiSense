export type Severity = 'P0' | 'P1' | 'P2' | 'P3';

export type ReviewStatus = 'ai_generated' | 'confirmed' | 'modified' | 'rejected';

export type WorkflowState = 'open' | 'assigned' | 'remediating' | 'verified' | 'closed';

export type GoNoGoDecision = 'GO' | 'CAUTION' | 'NO-GO';

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
  newValue?: any;
}

export interface Finding {
  id: string;
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
  conditions: Condition[];
  auditLog: AuditLogEntry[];
  serverVersion: number;
  isDirty?: boolean;
  updatedAt: string;
}

export interface Deal {
  id: string;
  name: string;
  targetCompany: string;
  acquirer: string;
  modelProfile: 'economy' | 'standard' | 'premium';
  status: 'draft' | 'queued' | 'analyzing' | 'done' | 'failed';
  goNoGo: GoNoGoDecision | null;
  overallRiskScore: number;
  totalFindings: number;
  executiveSummaryMd?: string;
  latestJobId?: string | null;
  syncCursor?: string | null;
  updatedAt: string;
}

export interface AgentTelemetry {
  domain: DiligenceDomain;
  agentName: string;
  status: 'idle' | 'running' | 'done' | 'failed';
  pct: number;
  findingsCount: number;
  error?: string | null;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  company?: {
    id: string;
    name: string;
  } | null;
}
