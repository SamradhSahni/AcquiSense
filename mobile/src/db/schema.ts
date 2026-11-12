import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const deals = sqliteTable('deals', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  targetCompany: text('target_company').notNull(),
  acquirer: text('acquirer').notNull(),
  modelProfile: text('model_profile').notNull(),
  status: text('status').notNull(),
  goNoGo: text('go_no_go'),
  overallRiskScore: real('overall_risk_score').default(0),
  totalFindings: integer('total_findings').default(0),
  executiveSummaryMd: text('executive_summary_md'),
  latestJobId: text('latest_job_id'),
  syncCursor: text('sync_cursor'),
  updatedAt: text('updated_at').notNull(),
});

export const findings = sqliteTable('findings', {
  id: text('id').primaryKey(),
  dealId: text('deal_id').notNull(),
  domain: text('domain').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  evidence: text('evidence').notNull(),
  citationsJson: text('citations_json').notNull(),
  tagsJson: text('tags_json').notNull(),
  workflowState: text('workflow_state').notNull(),
  reviewStatus: text('review_status').notNull(),
  assignedTo: text('assigned_to'),
  dueDate: text('due_date'),
  conditionsJson: text('conditions_json').notNull(),
  auditLogJson: text('audit_log_json').notNull(),
  serverVersion: integer('server_version').notNull().default(0),
  isDirty: integer('is_dirty').default(0),
  updatedAt: text('updated_at').notNull(),
});

export const syncOutbox = sqliteTable('sync_outbox', {
  idempotencyKey: text('idempotency_key').primaryKey(),
  dealId: text('deal_id').notNull(),
  findingId: text('finding_id').notNull().unique(),
  baseVersion: integer('base_version').notNull(),
  patchJson: text('patch_json').notNull(),
  auditEntriesJson: text('audit_entries_json').notNull(),
  retryCount: integer('retry_count').default(0),
  status: text('status').default('PENDING'),
  conflictServerJson: text('conflict_server_json'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

