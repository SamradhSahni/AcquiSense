import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, Lock, Mail, ArrowRight, Server, UserPlus } from 'lucide-react-native';
import {
  apiClient,
  getApiBaseUrl,
  loadSavedApiBaseUrl,
  setCustomApiBaseUrl,
} from '../../src/services/api';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { getEncryptedDb } from '../../src/db/client';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@acquisense.io');
  const [password, setPassword] = useState('AcquiSense2026!');
  const [serverUrl, setServerUrl] = useState(getApiBaseUrl());
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();

  useEffect(() => {
    loadSavedApiBaseUrl().then((url) => setServerUrl(url));
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Validation Error', 'Please enter your institutional email and password.');
      return;
    }

    setLoading(true);
    try {
      if (serverUrl.trim()) {
        await setCustomApiBaseUrl(serverUrl.trim());
      }

      const response = await apiClient.post('/api/auth/mobile/login', {
        email: email.trim(),
        password: password.trim(),
        platform: 'android',
        appVersion: '3.0.0',
      });

      const { accessToken, refreshToken, deviceId, user } = response.data;
      await login(accessToken, refreshToken, deviceId, user);
      getEncryptedDb();
      router.replace('/(tabs)/deals');
    } catch (err: any) {
      console.warn('Login error:', err);
      const errMsg = err?.response?.data?.error || err?.message || 'Connection failed';
      if (errMsg.includes('Network Error') || err?.code === 'ECONNABORTED') {
        Alert.alert(
          'Gateway Unreachable',
          `Could not reach ${getApiBaseUrl()}.\n\nEnsure Podman is running and "adb reverse tcp:4100 tcp:4100" is active, or continue in Offline Sandbox Mode.`,
          [
            { text: 'Retry', style: 'cancel' },
            {
              text: 'Offline Mode',
              onPress: async () => {
                await login(
                  'offline_jwt_token',
                  'offline_refresh_token_xyz',
                  'dev_android_device_01',
                  {
                    id: 'usr_mock_01',
                    name: 'Lead M&A Analyst',
                    email: email.trim(),
                  }
                );
                getEncryptedDb();
                router.replace('/(tabs)/deals');
              },
            },
          ]
        );
      } else {
        Alert.alert('Authentication Failed', errMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Shield size={36} color="#06B6D4" />
          </View>
          <Text style={styles.title}>AcquiSense Mobile</Text>
          <Text style={styles.subtitle}>Enter credentials to provision device vault</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.inputLabel}>INSTITUTIONAL EMAIL</Text>
          <View style={styles.inputWrapper}>
            <Mail size={18} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="analyst@firm.com"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={styles.inputLabel}>PASSWORD</Text>
          <View style={styles.inputWrapper}>
            <Lock size={18} color="#64748B" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder="••••••••"
              placeholderTextColor="#475569"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity
            style={styles.serverToggle}
            onPress={() => setShowServerConfig((v) => !v)}
          >
            <Server size={13} color="#06B6D4" style={{ marginRight: 6 }} />
            <Text style={styles.serverToggleText}>
              {showServerConfig ? 'Hide Gateway URL' : `Gateway: ${serverUrl}`}
            </Text>
          </TouchableOpacity>

          {showServerConfig && (
            <View style={styles.inputWrapper}>
              <Server size={16} color="#64748B" style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                placeholder="http://localhost:4100"
                placeholderTextColor="#475569"
                autoCapitalize="none"
                value={serverUrl}
                onChangeText={setServerUrl}
              />
            </View>
          )}

          <TouchableOpacity
            style={styles.loginBtn}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.loginBtnText}>Provision & Sign In</Text>
                <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => router.push('/(auth)/register')}
          >
            <UserPlus size={15} color="#06B6D4" style={{ marginRight: 6 }} />
            <Text style={styles.registerLinkText}>New Firm? Initialize Organization Vault</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.securityBox}>
          <Shield size={16} color="#10B981" style={{ marginRight: 8 }} />
          <Text style={styles.securityText}>
            Enforces 15-minute access token rotation, biometric gate, and AES-256 database encryption.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090E',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 40,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  subtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  form: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 14,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E131F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    color: '#FFFFFF',
    paddingVertical: 14,
    fontSize: 14,
  },
  serverToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  serverToggleText: {
    fontSize: 11,
    color: '#06B6D4',
    fontWeight: '600',
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 15,
    marginTop: 22,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  registerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  registerLinkText: {
    color: '#67E8F9',
    fontSize: 13,
    fontWeight: '600',
  },
  securityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  securityText: {
    fontSize: 11,
    color: '#34D399',
    flex: 1,
    lineHeight: 16,
  },
});
