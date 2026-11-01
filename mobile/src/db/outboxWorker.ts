import * as Crypto from 'expo-crypto';
import { getEncryptedDb } from './client';
import { apiClient } from '../services/api';

export interface OfflineMutationPatch {
  reviewStatus?: 'confirmed' | 'rejected' | 'modified';
  workflowState?: 'open' | 'assigned' | 'remediating' | 'verified' | 'closed';
  assignedTo?: string;
  dueDate?: string;
  addedConditions?: Array<{ text: string }>;
}

/**
 * [FEAT-05]: Atomically applies an offline edit to the local SQLite finding AND
 * coalesces the mutation into sync_outbox so sequential offline edits to the same
 * finding never trigger self-inflicted OCC version conflicts.
 */
export function enqueueOrCoalesceMutation(params: {
  dealId: string;
  findingId: string;
  actionName: string;
  patch: OfflineMutationPatch;
  notes?: string;
}): void {
  const { sqlite } = getEncryptedDb();
  const now = new Date().toISOString();

  sqlite.withTransactionSync(() => {
    const finding = sqlite.getFirstSync<{
      server_version: number;
      conditions_json: string;
      audit_log_json: string;
    }>(`SELECT server_version, conditions_json, audit_log_json FROM findings WHERE id = ?`, [
      params.findingId,
    ]);

    if (!finding) throw new Error(`Finding ${params.findingId} not found locally`);

    // 1. Update local finding row immediately for <2ms optimistic UI
    const conditions = JSON.parse(finding.conditions_json || '[]');
    if (params.patch.addedConditions?.length) {
      for (const c of params.patch.addedConditions) {
        conditions.push({ _id: `local_${Date.now()}`, text: c.text, addedBy: 'Me (Mobile)' });
      }
    }

    const auditLog = JSON.parse(finding.audit_log_json || '[]');
    const newAuditEntry = {
      action: `MOBILE_${params.actionName.toUpperCase()}`,
      at: now,
      notes: params.notes || 'Edited offline on AcquiSense Android',
      newValue: params.patch,
    };
    auditLog.push(newAuditEntry);

    sqlite.runSync(
      `UPDATE findings
       SET review_status = COALESCE(?, review_status),
           workflow_state = COALESCE(?, workflow_state),
           assigned_to = COALESCE(?, assigned_to),
           due_date = COALESCE(?, due_date),
           conditions_json = ?,
           audit_log_json = ?,
           is_dirty = 1,
           updated_at = ?
       WHERE id = ?`,
      [
        params.patch.reviewStatus ?? null,
        params.patch.workflowState ?? null,
        params.patch.assignedTo ?? null,
        params.patch.dueDate ?? null,
        JSON.stringify(conditions),
        JSON.stringify(auditLog),
        now,
        params.findingId,
      ]
    );

    // 2. Check if a PENDING outbox item already exists for this findingId [FEAT-05]
    const existingOutbox = sqlite.getFirstSync<{
      idempotency_key: string;
      base_version: number;
      patch_json: string;
      audit_entries_json: string;
    }>(`SELECT * FROM sync_outbox WHERE finding_id = ? AND status = 'PENDING'`, [
      params.findingId,
    ]);

    if (existingOutbox) {
      // Coalesce new patch into existing pending mutation, keeping original base_version
      const prevPatch: OfflineMutationPatch = JSON.parse(existingOutbox.patch_json);
      const mergedPatch: OfflineMutationPatch = {
        ...prevPatch,
        ...params.patch,
        addedConditions: [
          ...(prevPatch.addedConditions || []),
          ...(params.patch.addedConditions || []),
        ],
      };
      const prevAudits = JSON.parse(existingOutbox.audit_entries_json);
      prevAudits.push(newAuditEntry);

      sqlite.runSync(
        `UPDATE sync_outbox
         SET patch_json = ?, audit_entries_json = ?, updated_at = ?
         WHERE idempotency_key = ?`,
        [
          JSON.stringify(mergedPatch),
          JSON.stringify(prevAudits),
          now,
          existingOutbox.idempotency_key,
        ]
      );
    } else {
      const idempotencyKey = Crypto.randomUUID();
      sqlite.runSync(
        `INSERT INTO sync_outbox (
          idempotency_key, deal_id, finding_id, base_version,
          patch_json, audit_entries_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
        [
          idempotencyKey,
          params.dealId,
          params.findingId,
          finding.server_version,
          JSON.stringify(params.patch),
          JSON.stringify([newAuditEntry]),
          now,
          now,
        ]
      );
    }
  });
}

/**
 * Flushes all PENDING coalesced mutations to POST /api/mobile/sync/batch
 */
export async function flushOutboxQueue(): Promise<{ applied: number; conflicts: number }> {
  const { sqlite } = getEncryptedDb();
  const pendingRows = sqlite.getAllSync<{
    idempotency_key: string;
    deal_id: string;
    finding_id: string;
    base_version: number;
    patch_json: string;
    audit_entries_json: string;
  }>(`SELECT * FROM sync_outbox WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 50`);

  if (!pendingRows.length) return { applied: 0, conflicts: 0 };

  const mutations = pendingRows.map((row) => ({
    idempotencyKey: row.idempotency_key,
    dealId: row.deal_id,
    findingId: row.finding_id,
    baseVersion: row.base_version,
    patch: JSON.parse(row.patch_json),
    auditEntries: JSON.parse(row.audit_entries_json),
  }));

  const { data } = await apiClient.post('/api/mobile/sync/batch', { mutations });

  let applied = 0;
  let conflicts = 0;

  sqlite.withTransactionSync(() => {
    for (const res of data.results) {
      if (res.status === 'APPLIED') {
        applied++;
        sqlite.runSync(`DELETE FROM sync_outbox WHERE idempotency_key = ?`, [res.idempotencyKey]);
        sqlite.runSync(
          `UPDATE findings SET server_version = ?, is_dirty = 0 WHERE id = ?`,
          [res.serverVersion, res.finding._id || res.finding.id]
        );
      } else if (res.status === 'CONFLICT') {
        conflicts++;
        sqlite.runSync(
          `UPDATE sync_outbox SET status = 'CONFLICT', conflict_server_json = ? WHERE idempotency_key = ?`,
          [JSON.stringify(res.serverRecord), res.idempotencyKey]
        );
      }
    }
  });

  return { applied, conflicts };
}

export async function syncDealDeltaFromServer(dealId: string): Promise<number> {
  const { sqlite } = getEncryptedDb();
  const deal = sqlite.getFirstSync<{ sync_cursor: string | null }>(
    `SELECT sync_cursor FROM deals WHERE id = ?`,
    [dealId]
  );

  const sinceParam = deal?.sync_cursor ? `?since=${encodeURIComponent(deal.sync_cursor)}` : '';
  const { data } = await apiClient.get(`/api/mobile/deals/${dealId}/delta${sinceParam}`);

  let syncedCount = 0;
  sqlite.withTransactionSync(() => {
    for (const f of data.findings) {
      syncedCount++;
      // Do not overwrite findings that currently have unsynced local edits
      sqlite.runSync(
        `INSERT INTO findings (
          id, deal_id, domain, severity, title, description, evidence,
          citations_json, tags_json, workflow_state, review_status,
          assigned_to, due_date, conditions_json, audit_log_json,
          server_version, is_dirty, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        ON CONFLICT(id) DO UPDATE SET
          workflow_state = CASE WHEN findings.is_dirty = 0 THEN excluded.workflow_state ELSE findings.workflow_state END,
          review_status = CASE WHEN findings.is_dirty = 0 THEN excluded.review_status ELSE findings.review_status END,
          assigned_to = CASE WHEN findings.is_dirty = 0 THEN excluded.assigned_to ELSE findings.assigned_to END,
          conditions_json = CASE WHEN findings.is_dirty = 0 THEN excluded.conditions_json ELSE findings.conditions_json END,
          audit_log_json = CASE WHEN findings.is_dirty = 0 THEN excluded.audit_log_json ELSE findings.audit_log_json END,
          server_version = CASE WHEN findings.is_dirty = 0 THEN excluded.server_version ELSE findings.server_version END,
          updated_at = excluded.updated_at`,
        [
          f._id || f.id,
          f.dealId,
          f.domain,
          f.severity,
          f.title,
          f.description || '',
          f.evidence || '',
          JSON.stringify(f.citations || []),
          JSON.stringify(f.tags || []),
          f.workflowState || 'open',
          f.reviewStatus || 'ai_generated',
          f.assignedTo || null,
          f.dueDate || null,
          JSON.stringify(f.conditions || []),
          JSON.stringify(f.auditLog || []),
          f.__v || 0,
          f.updatedAt || new Date().toISOString(),
        ]
      );
    }

    sqlite.runSync(`UPDATE deals SET sync_cursor = ? WHERE id = ?`, [data.syncCursor, dealId]);
  });

  return syncedCount;
}
