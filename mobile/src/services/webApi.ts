import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiClient, API_BASE_URL } from './api';
import { useAuthStore } from '../stores/useAuthStore';
import {
  Deal,
  Finding,
  FindingsSummary,
  JobRecord,
  ModelProfile,
  ReportRecord,
  AnalystQuestionsResponse,
  ComparisonResult,
  TeamUser,
  UserGroup,
  GatewayHealth,
} from '../types';

export interface PickedDocument {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
}

// ── Deals ─────────────────────────────────────────────────────────────────────
export const getDeals = (): Promise<Deal[]> =>
  apiClient.get('/api/deals').then((r) => r.data);

export const getDeal = (id: string): Promise<Deal> =>
  apiClient.get(`/api/deals/${id}`).then((r) => r.data);

export const createDeal = (data: {
  name: string;
  targetCompany?: string;
  acquirer?: string;
  modelProfile?: ModelProfile;
}): Promise<Deal> => apiClient.post('/api/deals', data).then((r) => r.data);

export const updateDeal = (id: string, data: Partial<Deal>): Promise<Deal> =>
  apiClient.patch(`/api/deals/${id}`, data).then((r) => r.data);

export const deleteDeal = (id: string): Promise<{ message: string }> =>
  apiClient.delete(`/api/deals/${id}`).then((r) => r.data);

// ── Upload VDR Files ──────────────────────────────────────────────────────────
export async function uploadVdrFiles(
  files: PickedDocument[],
  dealId: string,
  onProgress?: (pct: number) => void
): Promise<{ count: number; files: any[]; savedNames: string[]; errors?: any[] }> {
  const form = new FormData();
  files.forEach((f) => {
    form.append('files', {
      uri: f.uri,
      name: f.name,
      type: f.mimeType || 'application/octet-stream',
    } as any);
  });

  const { data } = await apiClient.post(`/api/upload?dealId=${encodeURIComponent(dealId)}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });
  return data;
}

// ── Jobs ──────────────────────────────────────────────────────────────────────
export const startJob = (
  dealId: string,
  fileNames: string[],
  modelProfile: ModelProfile = 'standard'
): Promise<{ jobId: string; pythonJobId: string; status: string }> =>
  apiClient.post('/api/jobs', { dealId, fileNames, modelProfile }).then((r) => r.data);

export const getJob = (jobId: string): Promise<JobRecord> =>
  apiClient.get(`/api/jobs/${jobId}`).then((r) => r.data);

export const getJobResults = (jobId: string): Promise<any> =>
  apiClient.get(`/api/jobs/${jobId}/results`).then((r) => r.data);

export const getDealJobs = (dealId: string): Promise<JobRecord[]> =>
  apiClient.get(`/api/jobs/deal/${dealId}`).then((r) => r.data);

// ── Reports ───────────────────────────────────────────────────────────────────
export const getReports = (): Promise<ReportRecord[]> =>
  apiClient.get('/api/reports').then((r) => r.data);

export const getReport = (id: string): Promise<ReportRecord> =>
  apiClient.get(`/api/reports/${id}`).then((r) => r.data);

export const getDealReport = (dealId: string): Promise<ReportRecord> =>
  apiClient.get(`/api/reports/deal/${dealId}`).then((r) => r.data);

// ── Findings & Action Center ──────────────────────────────────────────────────
export const getDealFindings = (
  dealId: string,
  params?: Record<string, any>
): Promise<{ findings: Finding[]; total: number }> =>
  apiClient.get(`/api/findings/deal/${dealId}`, { params }).then((r) => r.data);

export const getDealFindingsSummary = (dealId: string): Promise<FindingsSummary> =>
  apiClient.get(`/api/findings/deal/${dealId}/summary`).then((r) => r.data);

export const syncJobFindings = (jobId: string): Promise<{ message: string; synced: number }> =>
  apiClient.post(`/api/findings/sync/${jobId}`).then((r) => r.data);

export const actionFinding = (
  findingId: string,
  data: {
    action: 'assign' | 'progress' | 'add_condition' | 'close';
    payload: Record<string, any>;
    by?: string;
    notes?: string;
  }
): Promise<Finding> => apiClient.patch(`/api/findings/${findingId}/action`, data).then((r) => r.data);

export const reviewFinding = (
  findingId: string,
  data: {
    reviewStatus: 'confirmed' | 'modified' | 'rejected';
    by?: string;
    notes?: string;
    title?: string;
    description?: string;
    severity?: string;
  }
): Promise<Finding> => apiClient.patch(`/api/findings/${findingId}/review`, data).then((r) => r.data);

export const getFindingAudit = (findingId: string): Promise<{ auditLog: any[] }> =>
  apiClient.get(`/api/findings/${findingId}/audit`).then((r) => r.data);

// ── Python AI Endpoints ───────────────────────────────────────────────────────
export const getAnalystQuestions = (pythonJobId: string): Promise<AnalystQuestionsResponse> =>
  apiClient
    .get(`/api/python/results/${pythonJobId}/questions`, { timeout: 90000 })
    .then((r) => r.data);

export const compareDocuments = (
  pythonJobId: string,
  data: { file_a: string; file_b: string; name_a?: string; name_b?: string }
): Promise<ComparisonResult> =>
  apiClient
    .post(`/api/python/results/${pythonJobId}/compare`, data, { timeout: 120000 })
    .then((r) => r.data);

export const askCopilotRest = (
  dealId: string,
  data: { question: string; job_id?: string | null; history?: any[] }
): Promise<{ answer: string; citations?: any[] }> =>
  apiClient.post(`/api/python/copilot/${dealId}`, data, { timeout: 90000 }).then((r) => r.data);

// ── Team Users & Groups ───────────────────────────────────────────────────────
export const getCompanyUsers = (search = ''): Promise<{ users: TeamUser[]; total: number }> =>
  apiClient.get('/api/users', { params: { limit: 50, search } }).then((r) => r.data);

export const createCompanyUser = (data: {
  name: string;
  email: string;
  password: string;
  groupIds?: string[];
}): Promise<any> => apiClient.post('/api/users', data).then((r) => r.data);

export const getCompanyGroups = (): Promise<{ groups: UserGroup[] }> =>
  apiClient.get('/api/groups').then((r) => r.data);

// ── Health ────────────────────────────────────────────────────────────────────
export const getGatewayHealth = (): Promise<GatewayHealth> =>
  apiClient.get('/health', { timeout: 5000 }).then((r) => r.data);

// ── Forensic Watermarked PDF Download & Viewer ────────────────────────────────
export async function downloadAndOpenWatermarkedPdf(
  dealId: string,
  fileId: string,
  displayName?: string
): Promise<string> {
  const token = useAuthStore.getState().accessToken;
  const safeName = (displayName || fileId).replace(/[^a-zA-Z0-9._-]/g, '_');
  const targetUri = `${FileSystem.cacheDirectory}wm_${safeName.endsWith('.pdf') ? safeName : `${safeName}.pdf`}`;
  const url = `${API_BASE_URL}/api/mobile/deals/${encodeURIComponent(
    dealId
  )}/files/${encodeURIComponent(fileId)}/watermarked-stream`;

  const res = await FileSystem.downloadAsync(url, targetUri, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (res.status !== 200) {
    throw new Error(`Document download returned HTTP ${res.status}`);
  }

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(res.uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Confidential VDR: ${displayName || fileId}`,
    });
  }
  return res.uri;
}
