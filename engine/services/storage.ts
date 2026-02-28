/**
 * Secure Storage Service
 * Handles secure storage for sensitive data and async storage for preferences
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { DEFAULT_API_BASE_URL, STORAGE_KEYS } from "../constants";
import { generateUUID } from "./crypto";

/**
 * Get or create a unique device ID
 */
export async function getDeviceId(): Promise<string> {
  let deviceId = await SecureStore.getItemAsync(STORAGE_KEYS.DEVICE_ID);

  if (!deviceId) {
    deviceId = generateUUID();
    await SecureStore.setItemAsync(STORAGE_KEYS.DEVICE_ID, deviceId);
  }

  return deviceId;
}

/**
 * Store auth token securely
 */
export async function setAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.AUTH_TOKEN, token);
}

/**
 * Get auth token
 */
export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEYS.AUTH_TOKEN);
}

/**
 * Clear auth token
 */
export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.AUTH_TOKEN);
}

/**
 * Store current user info
 */
export async function setCurrentUser(
  userId: number,
  username: string,
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, userId.toString());
  await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USERNAME, username);
}

/**
 * Get current user info
 */
export async function getCurrentUser(): Promise<{
  userId: number;
  username: string;
} | null> {
  const userId = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
  const username = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USERNAME);

  if (userId && username) {
    return { userId: parseInt(userId, 10), username };
  }

  return null;
}

/**
 * Clear current user info
 */
export async function clearCurrentUser(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
  await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_USERNAME);
}

/**
 * Set API base URL
 */
export async function setApiBaseUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.API_BASE_URL, url);
}

/**
 * Get API base URL
 */
export async function getApiBaseUrl(): Promise<string> {
  const url = await AsyncStorage.getItem(STORAGE_KEYS.API_BASE_URL);
  return url || DEFAULT_API_BASE_URL;
}

/**
 * Get URL history (most-recent first)
 */
export async function getUrlHistory(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.URL_HISTORY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Add a URL to the history (deduplicates, keeps most-recent first, max 10)
 */
export async function addUrlToHistory(url: string): Promise<string[]> {
  const history = await getUrlHistory();
  const filtered = history.filter((u) => u !== url);
  const updated = [url, ...filtered].slice(0, 10);
  await AsyncStorage.setItem(STORAGE_KEYS.URL_HISTORY, JSON.stringify(updated));
  return updated;
}

/**
 * Set persistent storage preference
 */
export async function setPersistentStorage(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.PERSISTENT_STORAGE,
    enabled ? "true" : "false",
  );
}

/**
 * Get persistent storage preference (defaults to true)
 */
export async function getPersistentStorage(): Promise<boolean> {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.PERSISTENT_STORAGE);
  // Default to true when not set
  return value !== "false";
}

/**
 * Set theme color
 */
export async function setThemeColor(color: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.THEME_COLOR, color);
}

/**
 * Get theme color
 */
export async function getThemeColor(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.THEME_COLOR);
}

/**
 * Set onboarding complete
 */
export async function setOnboardingComplete(complete: boolean): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.ONBOARDING_COMPLETE,
    complete ? "true" : "false",
  );
}

/**
 * Check if onboarding is complete
 */
export async function isOnboardingComplete(): Promise<boolean> {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE);
  return value === "true";
}

/**
 * Clear all auth-related data (for logout)
 */
export async function clearAuthData(): Promise<void> {
  await clearAuthToken();
  await clearCurrentUser();
}

/**
 * Clear all app data
 */
export async function clearAllData(): Promise<void> {
  await clearAuthData();
  await clearIdentityKeys();
  await SecureStore.deleteItemAsync(STORAGE_KEYS.DEVICE_ID);
  await AsyncStorage.clear();
}

// ============ Identity Key Persistence ============

const IDENTITY_PRIVATE_KEY = "identityPrivateKey";
const IDENTITY_PUBLIC_KEY = "identityPublicKey";

/**
 * Store decrypted identity keys securely
 * Private key goes to SecureStore (hardware-backed keychain)
 * Public key goes to AsyncStorage (not sensitive)
 */
export async function setIdentityKeys(
  privateKey: string,
  publicKey: string,
): Promise<void> {
  await SecureStore.setItemAsync(IDENTITY_PRIVATE_KEY, privateKey);
  await AsyncStorage.setItem(IDENTITY_PUBLIC_KEY, publicKey);
}

/**
 * Get stored identity keys
 */
export async function getIdentityKeys(): Promise<{
  privateKey: string;
  publicKey: string;
} | null> {
  const privateKey = await SecureStore.getItemAsync(IDENTITY_PRIVATE_KEY);
  const publicKey = await AsyncStorage.getItem(IDENTITY_PUBLIC_KEY);

  if (privateKey && publicKey) {
    return { privateKey, publicKey };
  }

  return null;
}

/**
 * Clear identity keys (on logout or auth failure)
 */
export async function clearIdentityKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(IDENTITY_PRIVATE_KEY);
  await AsyncStorage.removeItem(IDENTITY_PUBLIC_KEY);
}
