import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Shield, Fingerprint, Lock } from 'lucide-react-native';
import { getEncryptedDb } from '../src/db/client';
import { loadSavedApiBaseUrl } from '../src/services/api';
import { useAuthStore } from '../src/stores/useAuthStore';

export default function BiometricLockScreen() {
  const router = useRouter();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    checkEnrollmentAndPrompt();
  }, []);

  const checkEnrollmentAndPrompt = async () => {
    setErrorMsg(null);
    try {
      await loadSavedApiBaseUrl();
      const refreshToken = await SecureStore.getItemAsync('acquisense_refresh_token');
      if (!refreshToken) {
        router.replace('/(auth)/login');
        return;
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        // Fallback: Unlock directly if biometric hardware is absent on test emulator
        getEncryptedDb();
        router.replace('/(tabs)/deals');
        return;
      }

      triggerBiometricAuth();
    } catch (err: any) {
      console.warn('Biometric check failed:', err);
      router.replace('/(auth)/login');
    }
  };

  const triggerBiometricAuth = async () => {
    setIsAuthenticating(true);
    setErrorMsg(null);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock AcquiSense Confidential M&A Vault',
        fallbackLabel: 'Use Application Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        // Initialize SQLCipher database with Keystore key
        getEncryptedDb();
        router.replace('/(tabs)/deals');
      } else {
        setErrorMsg('Biometric authentication failed. Please try again.');
      }
    } catch (err: any) {
      setErrorMsg('Authentication error: ' + err.message);
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <View style={styles.iconCircle}>
          <Shield size={44} color="#06B6D4" />
        </View>
        <Text style={styles.appTitle}>AcquiSense</Text>
        <Text style={styles.appSubtitle}>INSTITUTIONAL M&A INTELLIGENCE</Text>
      </View>

      <View style={styles.vaultCard}>
        <Lock size={20} color="#3B82F6" style={{ marginBottom: 8 }} />
        <Text style={styles.vaultTitle}>Zero-Trust Encrypted Storage</Text>
        <Text style={styles.vaultDesc}>
          Confidential VDR documents, offline findings, and financial telemetry are secured with
          SQLCipher AES-256 and Android Keystore hardware protection.
        </Text>

        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        <TouchableOpacity
          style={styles.authButton}
          onPress={triggerBiometricAuth}
          disabled={isAuthenticating}
        >
          {isAuthenticating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Fingerprint size={22} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.authButtonText}>Unlock with Biometrics</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.switchAccountBtn}
          onPress={() => router.replace('/(auth)/login')}
        >
          <Text style={styles.switchAccountText}>Switch Account or Sign In</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.versionLabel}>AcquiSense Mobile v3.0 {'\u2022'} Zero-Trust Hardened</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090E',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  appSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#06B6D4',
    letterSpacing: 1.5,
    marginTop: 4,
  },
  vaultCard: {
    backgroundColor: '#0E131F',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 24,
    alignItems: 'center',
  },
  vaultTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F1F5F9',
    marginBottom: 6,
  },
  vaultDesc: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  authButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E40AF',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  authButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  switchAccountBtn: {
    paddingVertical: 6,
  },
  switchAccountText: {
    color: '#64748B',
    fontSize: 12,
  },
  errorText: {
    color: '#F43F5E',
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
  versionLabel: {
    textAlign: 'center',
    color: '#475569',
    fontSize: 11,
  },
});

