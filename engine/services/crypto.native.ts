/*
 * Cryptographic utilities for Omnis — React Native (Android) platform
 *
 * All heavy crypto operations are offloaded to the native Kotlin CryptoModule
 * which runs on a dedicated thread pool (Dispatchers.Default) for parallel
 * execution. Lightweight encoding utilities and UUID generation remain in JS.
 *
 * The existing crypto.ts is kept as-is for the web platform — Metro bundler
 * resolves .native.ts on Android/iOS and falls back to .ts on web.
 */

import { fromByteArray, toByteArray } from "base64-js";
import { v4 as uuidv4 } from "uuid";
import NativeCryptoModule from "./NativeCryptoModule";

// ==================== ENCODING UTILITIES (lightweight — kept in JS) ====================

export function base64ToBytes(base64: string): Uint8Array {
  return toByteArray(base64);
}

export function bytesToBase64(bytes: Uint8Array): string {
  return fromByteArray(bytes);
}

export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// ==================== RANDOM GENERATION ====================

/**
 * Generate a random UUID v4 (synchronous, stays in JS)
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Generate a 256-bit (32-byte) random key for AES-GCM (native)
 */
export async function generateAESKey(): Promise<string> {
  return NativeCryptoModule.generateAESKey();
}

// ==================== ECDH KEY PAIR ====================

export interface KeyPair {
  publicKey: string; // base64 SPKI
  privateKey: string; // base64 PKCS8
}

/**
 * Generate EC identity keypair (P-384) for ECDH (native)
 */
export async function generateIdentityKeyPair(): Promise<KeyPair> {
  return NativeCryptoModule.generateIdentityKeyPair();
}

// ==================== AES-GCM ENCRYPTION ====================

export interface EncryptedData {
  ciphertext: string; // base64
  nonce: string; // base64
}

/**
 * Encrypt a message with epoch key (native AES-256-GCM)
 */
export async function aesGcmEncrypt(
  plaintext: string,
  epochKeyBase64: string,
): Promise<EncryptedData> {
  return NativeCryptoModule.aesGcmEncrypt(plaintext, epochKeyBase64);
}

/**
 * Decrypt a message with epoch key (native AES-256-GCM)
 */
export async function aesGcmDecrypt(
  ciphertextBase64: string,
  nonceBase64: string,
  epochKeyBase64: string,
): Promise<string> {
  return NativeCryptoModule.aesGcmDecrypt(
    ciphertextBase64,
    nonceBase64,
    epochKeyBase64,
  );
}

// ==================== IDENTITY KEY ENCRYPTION ====================

/**
 * Encrypt identity private key with password (native PBKDF2 + AES-GCM)
 */
export async function encryptIdentityPrivateKey(
  privateKeyBase64: string,
  password: string,
): Promise<{ encrypted: string; salt: string; nonce: string }> {
  return NativeCryptoModule.encryptIdentityPrivateKey(
    privateKeyBase64,
    password,
  );
}

/**
 * Decrypt identity private key with password (native PBKDF2 + AES-GCM)
 */
export async function decryptIdentityPrivateKey(
  encryptedPrivateKey: string,
  saltBase64: string,
  nonceBase64: string,
  password: string,
): Promise<string> {
  return NativeCryptoModule.decryptIdentityPrivateKey(
    encryptedPrivateKey,
    saltBase64,
    nonceBase64,
    password,
  );
}

// ==================== EPOCH KEY WRAPPING ====================

/**
 * Wrap an epoch key for a recipient (native ECDH + HKDF + AES-GCM)
 */
export async function wrapEpochKey(
  epochKeyBase64: string,
  myPrivateKeyBase64: string,
  peerPublicKeyBase64: string,
): Promise<string> {
  return NativeCryptoModule.wrapEpochKey(
    epochKeyBase64,
    myPrivateKeyBase64,
    peerPublicKeyBase64,
  );
}

/**
 * Unwrap an epoch key received from sender (native ECDH + HKDF + AES-GCM)
 */
export async function unwrapEpochKey(
  wrappedKeyBase64: string,
  myPrivateKeyBase64: string,
  senderPublicKeyBase64: string,
): Promise<string> {
  return NativeCryptoModule.unwrapEpochKey(
    wrappedKeyBase64,
    myPrivateKeyBase64,
    senderPublicKeyBase64,
  );
}
