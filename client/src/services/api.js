import axios from 'axios';
import { getToken, setToken, removeToken } from './auth';

const API_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

// Request interceptor to add JWT token
api.interceptors.request.use(
  (config) => {
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token expiration
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token expired or invalid
      removeToken();
      // Optionally redirect to login page
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Deals ─────────────────────────────────────────────────────────────────────
export const getDeals = () => api.get('/api/deals').then((r) => r.data);
export const getDeal = (id) => api.get(`/api/deals/${id}`).then((r) => r.data);
export const createDeal = (data) => api.post('/api/deals', data).then((r) => r.data);
export const updateDeal = (id, data) => api.patch(`/api/deals/${id}`, data).then((r) => r.data);
export const deleteDeal = (id) => api.delete(`/api/deals/${id}`).then((r) => r.data);

// ── Upload ────────────────────────────────────────────────────────────────────
export const uploadFiles = (files, dealId, onProgress) => {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  return api.post(`/api/upload?dealId=${dealId}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    },
    timeout: 120000,
  }).then((r) => r.data);
};

// ── Jobs ──────────────────────────────────────────────────────────────────────
export const startJob = (dealId, fileNames, modelProfile) =>
  api.post('/api/jobs', { dealId, fileNames, modelProfile }).then((r) => r.data);

export const getJob = (jobId) => api.get(`/api/jobs/${jobId}`).then((r) => r.data);
export const getJobResults = (jobId) => api.get(`/api/jobs/${jobId}/results`).then((r) => r.data);
export const getDealJobs = (dealId) => api.get(`/api/jobs/deal/${dealId}`).then((r) => r.data);

// ── Reports ───────────────────────────────────────────────────────────────────
export const getReports = () => api.get('/api/reports').then((r) => r.data);
export const getReport = (id) => api.get(`/api/reports/${id}`).then((r) => r.data);
export const getDealReport = (dealId) => api.get(`/api/reports/deal/${dealId}`).then((r) => r.data);

// ── Health ────────────────────────────────────────────────────────────────────
export const getHealth = () => api.get('/health').then((r) => r.data);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (data) => api.post('/api/auth/login', data).then((r) => r.data);
export const register = (data) => api.post('/api/auth/register', data).then((r) => r.data);

export default api;