import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../stores/useAuthStore';
import { executeEmergencyMnpiWipe } from '../db/client';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_GATEWAY_URL || 'http://10.0.2.2:4000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
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
  const accessToken = useAuthStore.getState().accessToken;
  const deviceId = await SecureStore.getItemAsync('acquisense_device_id');
  if (config.headers) {
    if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
    if (deviceId) config.headers['x-device-id'] = deviceId;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ code?: string }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // [FEAT-01]: Immediate Cryptographic Wipe if Admin Revoked Device
    if (error.response?.status === 403 && error.response.data?.code === 'REMOTE_WIPE_REQUIRED') {
      await executeEmergencyMnpiWipe();
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      const newToken = await forceRefreshTokenWithMutex();
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(originalRequest);
    }

    return Promise.reject(error);
  }
);

