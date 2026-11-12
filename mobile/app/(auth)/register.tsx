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
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Building2, User, Mail, Lock, ArrowRight, ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { apiClient } from '../../src/services/api';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { getEncryptedDb } from '../../src/db/client';

export default function RegisterScreen() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!companyName.trim() || !adminName.trim() || !adminEmail.trim() || adminPassword.length < 8) {
      Alert.alert(
        'Validation Error',
        'Firm Name, Admin Full Name, Corporate Email, and Password (min 8 chars) are required.'
      );
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post('/api/auth/mobile/register', {
        companyName: companyName.trim(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword,
        platform: 'android',
        appVersion: '3.0.0',
      });

      const { accessToken, refreshToken, deviceId, user } = response.data;
      await login(accessToken, refreshToken, deviceId, user);
      getEncryptedDb();
      Alert.alert('Vault Provisioned', `Welcome ${user.name}. Your firm vault is active.`);
      router.replace('/(tabs)/deals');
    } catch (err: any) {
      Alert.alert(
        'Registration Failed',
        err?.response?.data?.error || err?.message || 'Unable to provision organization vault.'
      );
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
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color="#94A3B8" />
          <Text style={styles.backText}>Back to Sign In</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <ShieldCheck size={32} color="#06B6D4" />
          </View>
          <Text style={styles.title}>Initialize Firm Vault</Text>
          <Text style={styles.subtitle}>Create your firm organization & primary admin key</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>FIRM / FUND NAME</Text>
          <View style={styles.inputWrap}>
            <Building2 size={17} color="#64748B" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="e.g. Apex Horizon Capital"
              placeholderTextColor="#475569"
              value={companyName}
              onChangeText={setCompanyName}
            />
          </View>

          <Text style={styles.label}>ADMINISTRATOR FULL NAME</Text>
          <View style={styles.inputWrap}>
            <User size={17} color="#64748B" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Alexander Wright, Partner"
              placeholderTextColor="#475569"
              value={adminName}
              onChangeText={setAdminName}
            />
          </View>

          <Text style={styles.label}>CORPORATE EMAIL</Text>
          <View style={styles.inputWrap}>
            <Mail size={17} color="#64748B" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="partner@apexhorizon.com"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              keyboardType="email-address"
              value={adminEmail}
              onChangeText={setAdminEmail}
            />
          </View>

          <Text style={styles.label}>VAULT PASSWORD (MIN 8 CHARS)</Text>
          <View style={styles.inputWrap}>
            <Lock size={17} color="#64748B" style={styles.icon} />
            <TextInput
              style={styles.input}
              placeholder="Minimum 8 characters"
              placeholderTextColor="#475569"
              secureTextEntry
              value={adminPassword}
              onChangeText={setAdminPassword}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.6 }]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.submitText}>Provision Organization Access</Text>
                <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
              </>
            )}
          </TouchableOpacity>
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
    paddingVertical: 36,
    justifyContent: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backText: {
    color: '#94A3B8',
    fontSize: 13,
    marginLeft: 6,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  form: {
    marginBottom: 20,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 12,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0E131F',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    paddingVertical: 13,
    fontSize: 14,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0891B2',
    borderRadius: 10,
    paddingVertical: 15,
    marginTop: 24,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
