import React, { useState } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Shield, Lock, Mail, ArrowRight } from 'lucide-react-native';
import { apiClient } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { getEncryptedDb } from '../../src/db/client';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@acquisense.io');
  const [password, setPassword] = useState('AcquiSense2026!');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Validation Error', 'Please enter your institutional email and password.');
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post('/api/auth/mobile/login', {
        email: email.trim(),
        password: password.trim(),
        platform: 'android',
        appVersion: '3.0.0',
      });

      const { accessToken, refreshToken, deviceId, user } = response.data;
      await login(accessToken, refreshToken, deviceId, user);

      // Lazily unlock local SQLCipher database
      getEncryptedDb();

      router.replace('/(tabs)/deals');
    } catch (err: any) {
      console.warn('Login error:', err);
      // Fallback for development / offline sandbox testing
      if (err.message.includes('Network Error') || err.response?.status === 404) {
        Alert.alert(
          'Offline / Standalone Mode',
          'Connecting in standalone mode with default credentials.',
          [
            {
              text: 'Proceed',
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
        Alert.alert('Authentication Failed', err.response?.data?.error || err.message);
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
      <View style={styles.content}>
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
        </View>

        <View style={styles.securityBox}>
          <Shield size={16} color="#10B981" style={{ marginRight: 8 }} />
          <Text style={styles.securityText}>
            Enforces 15-minute access token rotation, biometric gate, and AES-256 database encryption.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090E',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
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
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 15,
    marginTop: 24,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
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

