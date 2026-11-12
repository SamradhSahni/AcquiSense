import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../stores/useAuthStore';
import { executeEmergencyMnpiWipe } from '../db/client';

const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_GATEWAY_URL || 'http://10.0.2.2:4100';
const API_URL_STORAGE_KEY = 'acquisense_custom_api_url';

export let API_BASE_URL = DEFAULT_API_URL;

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function loadSavedApiBaseUrl(): Promise<string> {
  try {
    const saved = await SecureStore.getItemAsync(API_URL_STORAGE_KEY);
    if (saved && saved.startsWith('http')) {
      API_BASE_URL = saved;
      apiClient.defaults.baseURL = saved;
    }
  } catch {
    // ignore background keystore read errors
  }
  return API_BASE_URL;
}

export async function setCustomApiBaseUrl(url: string): Promise<string> {
  const normalized = url.trim().replace(/\/+$/, '');
  API_BASE_URL = normalized || DEFAULT_API_URL;
  apiClient.defaults.baseURL = API_BASE_URL;
  try {
    if (normalized) {
      await SecureStore.setItemAsync(API_URL_STORAGE_KEY, normalized);
    } else {
      await SecureStore.deleteItemAsync(API_URL_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  return API_BASE_URL;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let refreshWaitQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

const flushRefreshQueue = (error: unknown, token: string | null = null) => {
  refreshWaitQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)));
  refreshWaitQueue = [];
};

/**
 * [BUG-06 FIX]: Shared Single-Flight Token Refresh Mutex used by both Axios and expo/fetch SSE.
 */
export async function forceRefreshTokenWithMutex(): Promise<string> {
  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      refreshWaitQueue.push({ resolve, reject });
    });
  }

  isRefreshing = true;
  try {
    const refreshToken = await SecureStore.getItemAsync('acquisense_refresh_token');
    const deviceId = await SecureStore.getItemAsync('acquisense_device_id');
    if (!refreshToken) throw new Error('Missing refresh token');

    const { data } = await axios.post(`${API_BASE_URL}/api/auth/mobile/refresh`, {
      refreshToken,
      deviceId,
    });

    await SecureStore.setItemAsync('acquisense_refresh_token', data.refreshToken);
    useAuthStore.getState().setAccessToken(data.accessToken);
    flushRefreshQueue(null, data.accessToken);
    return data.accessToken;
  } catch (err: any) {
    flushRefreshQueue(err, null);
    if (err?.response?.data?.code === 'REMOTE_WIPE_REQUIRED') {
      await executeEmergencyMnpiWipe();
    }
    useAuthStore.getState().logout();
    throw err;
  } finally {
    isRefreshing = false;
  }
}

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  config.baseURL = API_BASE_URL;
  const accessToken = useAuthStore.getState().accessToken;
  const deviceId = await SecureStore.getItemAsync('acquisense_device_id');
  if (config.headers) {
    if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
    if (deviceId) config.headers['x-device-id'] = deviceId;
  }
  return config;
});

const AUTH_SKIP_REFRESH_PATHS = [
  '/api/auth/mobile/login',
  '/api/auth/mobile/register',
  '/api/auth/mobile/refresh',
  '/api/auth/login',
  '/api/auth/register',
];

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ code?: string }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const reqUrl = originalRequest?.url || '';
    const isAuthEndpoint = AUTH_SKIP_REFRESH_PATHS.some((path) => reqUrl.includes(path));

    // [FEAT-01]: Immediate Cryptographic Wipe if Admin Revoked Device
    if (error.response?.status === 403 && error.response.data?.code === 'REMOTE_WIPE_REQUIRED') {
      await executeEmergencyMnpiWipe();
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      originalRequest._retry = true;
      const newToken = await forceRefreshTokenWithMutex();
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(originalRequest);
    }

    return Promise.reject(error);
  }
);
