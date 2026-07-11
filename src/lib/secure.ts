/**
 * Stockage des secrets (clés API, clé privée Enable Banking).
 * Android/iOS : Keystore/Keychain via expo-secure-store.
 * Web : localStorage en repli — les appels bancaires sont de toute façon
 * bloqués par CORS dans un navigateur, le web sert surtout au suivi manuel.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const PREFIX = 'patrimoine.secret.';

export async function setSecret(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(PREFIX + key, value);
    return;
  }
  await SecureStore.setItemAsync(PREFIX + key, value);
}

export async function getSecret(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(PREFIX + key) ?? null;
  }
  return SecureStore.getItemAsync(PREFIX + key);
}

export async function deleteSecret(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(PREFIX + key);
    return;
  }
  await SecureStore.deleteItemAsync(PREFIX + key);
}

/** Clé de stockage des identifiants d'une connexion. */
export function connectionSecretKey(connectionId: string): string {
  return `conn.${connectionId}`;
}
