import { MMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const MMKV_KEY_ALIAS = 'acquisense_mmkv_16byte_key_v3';
const SQLCIPHER_KEY_ALIAS = 'acquisense_sqlcipher_256bit_key_v3';
const DEVICE_META_KEY_ALIAS = 'acquisense_bg_device_meta_v3';

const ASCII_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@';

/**
 * [BUG-04 FIX]: Generates an exact 16-byte ASCII string (16 bytes UTF-8) required by MMKV AES-128.
 */
function getOrCreateMmkv16ByteKey(): string {
  let key = SecureStore.getItem(MMKV_KEY_ALIAS, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  if (!key || key.length !== 16) {
    const bytes = Crypto.getRandomBytes(16);
    key = Array.from(bytes, (b) => ASCII_CHARSET[b % ASCII_CHARSET.length]).join('');
    SecureStore.setItem(MMKV_KEY_ALIAS, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  return key;
}

/**
 * [SEC-03 FIX]: Generates a 32-byte (64-character hex = 256-bit) key for SQLCipher AES-256.
 */
export function getOrCreateSqlCipher256BitHexKey(): string {
  let hexKey = SecureStore.getItem(SQLCIPHER_KEY_ALIAS, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  if (!hexKey || hexKey.length !== 64) {
    const bytes = Crypto.getRandomBytes(32);
    hexKey = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    SecureStore.setItem(SQLCIPHER_KEY_ALIAS, hexKey, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  return hexKey;
}

/**
 * [BUG-09 FIX]: Lazy Singleton MMKV accessor.
 * Never called at module import scope, preventing crashes when Android launches
 * the headless JS bundle in the background while the device is locked.
 */
let _secureMmkvInstance: MMKV | null = null;

export function getSecureMmkv(): MMKV {
  if (!_secureMmkvInstance) {
    _secureMmkvInstance = new MMKV({
      id: 'acquisense-encrypted-vault-v3',
      encryptionKey: getOrCreateMmkv16ByteKey(),
    });
  }
  return _secureMmkvInstance;
}

/**
 * Background-safe store (accessible AFTER_FIRST_UNLOCK) strictly for non-MNPI flags
 * such as pending remote-wipe markers during headless FCM execution.
 */
export async function setBackgroundWipeFlag(flagged: boolean): Promise<void> {
  await SecureStore.setItemAsync(DEVICE_META_KEY_ALIAS, flagged ? 'WIPE_PENDING' : 'OK', {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function getBackgroundWipeFlag(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(DEVICE_META_KEY_ALIAS, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return val === 'WIPE_PENDING';
}

export async function purgeAllHardwareKeys(): Promise<void> {
  if (_secureMmkvInstance) {
    _secureMmkvInstance.clearAll();
    _secureMmkvInstance = null;
  }
  await SecureStore.deleteItemAsync(MMKV_KEY_ALIAS);
  await SecureStore.deleteItemAsync(SQLCIPHER_KEY_ALIAS);
  await SecureStore.deleteItemAsync('acquisense_refresh_token');
  await SecureStore.deleteItemAsync('acquisense_device_id');
}

