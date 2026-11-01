import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { UserProfile } from '../types';

interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  user: UserProfile | null;
  deviceId: string | null;
  setAccessToken: (token: string | null) => void;
  setUser: (user: UserProfile | null) => void;
  setDeviceId: (id: string) => void;
  login: (accessToken: string, refreshToken: string, deviceId: string, user: UserProfile) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  accessToken: null,
  user: null,
  deviceId: null,

  setAccessToken: (accessToken) => set({ accessToken, isAuthenticated: !!accessToken }),
  setUser: (user) => set({ user }),
  setDeviceId: (deviceId) => set({ deviceId }),

  login: async (accessToken, refreshToken, deviceId, user) => {
    await SecureStore.setItemAsync('acquisense_refresh_token', refreshToken);
    await SecureStore.setItemAsync('acquisense_device_id', deviceId);
    set({
      isAuthenticated: true,
      accessToken,
      deviceId,
      user,
    });
  },

  logout: async () => {
    try {
      await SecureStore.deleteItemAsync('acquisense_refresh_token');
    } catch (e) {
      // ignore
    }
    set({
      isAuthenticated: false,
      accessToken: null,
      user: null,
    });
  },
}));
