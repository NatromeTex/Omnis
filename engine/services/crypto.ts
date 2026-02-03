/*
 * Cryptographic utilities for Omnis
 * Uses @noble libraries for cross-platform compatibility (React Native + Web)
 * Matches the encryption used in web.js frontend
 */

import { p384 } from "@noble/curves/nist.js";
import { gcm } from "@noble/ciphers/aes.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { randomBytes } from "@noble/hashes/utils.js";
import { fromByteArray, toByteArray } from "base64-js";
import { v4 as uuidv4 } from "uuid";
import {
  AES_KEY_LENGTH,
  AES_NONCE_LENGTH,
  HKDF_INFO,
  PBKDF2_ITERATIONS,
  PBKDF2_SALT_LENGTH,
} from "../constants";

// ==================== ENCODING UTILITIES ====================

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
 * Generate random bytes
 */
function generateRandomBytes(length: number): Uint8Array {
  return randomBytes(length);
}

/**
 * Generate a random UUID v4
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * Generate a 12-byte random nonce for AES-GCM
 */
function generateNonce(): Uint8Array {
  return generateRandomBytes(AES_NONCE_LENGTH);
}

/**
 * Generate a 32-byte random salt for PBKDF2
 */
function generateSalt(): Uint8Array {
  return generateRandomBytes(PBKDF2_SALT_LENGTH);
}

/**
 * Generate a 256-bit (32-byte) random key for AES-GCM
 */
export async function generateAESKey(): Promise<string> {
  return bytesToBase64(generateRandomBytes(AES_KEY_LENGTH));
}

// ==================== KEY DERIVATION ====================

/**
 * Derive key from password using PBKDF2-SHA256
 * Returns raw key bytes
 */
async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  
  return pbkdf2(sha256, passwordBytes, salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: AES_KEY_LENGTH,
  });
}

// ==================== ECDH KEY PAIR ====================

export interface KeyPair {
  publicKey: string; // base64 SPKI
  privateKey: string; // base64 PKCS8
}

// SPKI header for P-384 public key (DER encoding prefix)
const SPKI_HEADER = new Uint8Array([
  0x30, 0x76, // SEQUENCE, length 118
  0x30, 0x10, // SEQUENCE, length 16
  0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
  0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22, // OID secp384r1 (P-384)
  0x03, 0x62, 0x00, // BIT STRING, length 98, no unused bits
]);

// PKCS8 header for P-384 private key (DER encoding prefix)
const PKCS8_HEADER = new Uint8Array([
  0x30, 0x81, 0xb6, // SEQUENCE, length 182
  0x02, 0x01, 0x00, // INTEGER, version 0
  0x30, 0x10, // SEQUENCE, length 16
  0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
  0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22, // OID secp384r1 (P-384)
  0x04, 0x81, 0x9e, // OCTET STRING, length 158
]);

/**
 * Convert raw P-384 public key (97 bytes uncompressed) to SPKI format
 */
function publicKeyToSPKI(rawPublicKey: Uint8Array): Uint8Array {
  const spki = new Uint8Array(SPKI_HEADER.length + rawPublicKey.length);
  spki.set(SPKI_HEADER, 0);
  spki.set(rawPublicKey, SPKI_HEADER.length);
  return spki;
}

/**
 * Convert raw P-384 private key (48 bytes) to PKCS8 format
 * Also includes the public key in the structure
 */
function privateKeyToPKCS8(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  // ECPrivateKey structure inside PKCS8
  const ecPrivateKey = new Uint8Array([
    0x30, 0x81, 0x9b, // SEQUENCE, length 155
    0x02, 0x01, 0x01, // INTEGER, version 1
    0x04, 0x30, // OCTET STRING, length 48 (private key)
    ...privateKey,
    0xa1, 0x64, // [1] IMPLICIT, length 100
    0x03, 0x62, 0x00, // BIT STRING, length 98, no unused bits
    ...publicKey,
  ]);
  
  const pkcs8 = new Uint8Array(PKCS8_HEADER.length + ecPrivateKey.length - 3);
  pkcs8.set(PKCS8_HEADER, 0);
  pkcs8.set(ecPrivateKey, PKCS8_HEADER.length - 3);
  return pkcs8;
}

/**
 * Extract raw public key (97 bytes) from SPKI format
 */
function spkiToPublicKey(spki: Uint8Array): Uint8Array {
  // Skip the SPKI header to get the raw public key
  return spki.slice(SPKI_HEADER.length);
}

/**
 * Extract raw private key (48 bytes) from PKCS8 format
 */
function pkcs8ToPrivateKey(pkcs8: Uint8Array): Uint8Array {
  // The private key starts at offset 36 (after headers) and is 48 bytes
  // PKCS8_HEADER (23) + SEQUENCE tag (3) + version (3) + OCTET STRING tag (2) + private key (48)
  return pkcs8.slice(PKCS8_HEADER.length + 3 + 2, PKCS8_HEADER.length + 3 + 2 + 48);
}

/**
 * Generate EC identity keypair (P-384) for ECDH
 */
export async function generateIdentityKeyPair(): Promise<KeyPair> {
  const privateKeyBytes = p384.utils.randomSecretKey();
  const publicKeyBytes = p384.getPublicKey(privateKeyBytes, false); // uncompressed format
  
  const spki = publicKeyToSPKI(publicKeyBytes);
  const pkcs8 = privateKeyToPKCS8(privateKeyBytes, publicKeyBytes);
  
  return {
    publicKey: bytesToBase64(spki),
    privateKey: bytesToBase64(pkcs8),
  };
}

// ==================== AES-GCM ENCRYPTION ====================

export interface EncryptedData {
  ciphertext: string; // base64
  nonce: string; // base64
}

/**
 * Encrypt data with AES-GCM
 */
function encryptAESGCM(
  key: Uint8Array,
  plaintext: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  const aes = gcm(key, nonce);
  return aes.encrypt(plaintext);
}

/**
 * Decrypt data with AES-GCM
 */
function decryptAESGCM(
  key: Uint8Array,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  const aes = gcm(key, nonce);
  return aes.decrypt(ciphertext);
}

/**
 * Encrypt a message with epoch key (raw bytes)
 */
export async function aesGcmEncrypt(
  plaintext: string,
  epochKeyBase64: string,
): Promise<EncryptedData> {
  const epochKey = base64ToBytes(epochKeyBase64);
  const nonce = generateNonce();
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  const ciphertext = encryptAESGCM(epochKey, plaintextBytes, nonce);

  return {
    ciphertext: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
  };
}

/**
 * Decrypt a message with epoch key (raw bytes)
 */
export async function aesGcmDecrypt(
  ciphertextBase64: string,
  nonceBase64: string,
  epochKeyBase64: string,
): Promise<string> {
  const ciphertext = base64ToBytes(ciphertextBase64);
  const nonce = base64ToBytes(nonceBase64);
  const epochKey = base64ToBytes(epochKeyBase64);

  const plaintextBytes = decryptAESGCM(epochKey, ciphertext, nonce);
  const decoder = new TextDecoder();
  return decoder.decode(plaintextBytes);
}

// ==================== IDENTITY KEY ENCRYPTION ====================

/**
 * Encrypt identity private key with password
 * Matches web.js encryptIdentityPrivateKey
 */
export async function encryptIdentityPrivateKey(
  privateKeyBase64: string,
  password: string,
): Promise<{ encrypted: string; salt: string; nonce: string }> {
  const salt = generateSalt();
  const nonce = generateNonce();
  const derivedKey = await deriveKeyFromPassword(password, salt);

  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(privateKeyBase64);
  const ciphertext = encryptAESGCM(derivedKey, plaintextBytes, nonce);

  return {
    encrypted: bytesToBase64(ciphertext),
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
  };
}

/**
 * Decrypt identity private key with password
 * Matches web.js decryptIdentityPrivateKey
 */
export async function decryptIdentityPrivateKey(
  encryptedPrivateKey: string,
  saltBase64: string,
  nonceBase64: string,
  password: string,
): Promise<string> {
  const salt = base64ToBytes(saltBase64);
  const nonce = base64ToBytes(nonceBase64);
  const ciphertext = base64ToBytes(encryptedPrivateKey);

  const derivedKey = await deriveKeyFromPassword(password, salt);
  const plaintextBytes = decryptAESGCM(derivedKey, ciphertext, nonce);

  const decoder = new TextDecoder();
  return decoder.decode(plaintextBytes);
}

// ==================== EPOCH KEY WRAPPING ====================

/**
 * Derive ECDH shared secret and wrapping key
 */
function deriveWrappingKey(
  myPrivateKeyBytes: Uint8Array,
  peerPublicKeyBytes: Uint8Array,
): Uint8Array {
  // Derive shared secret using ECDH (P-384)
  const sharedSecret = p384.getSharedSecret(myPrivateKeyBytes, peerPublicKeyBytes);
  
  // The shared secret from noble is the full point (x, y coordinates)
  // We need just the x-coordinate (first 48 bytes after the 0x04 prefix for uncompressed)
  // For P-384, shared secret is 97 bytes uncompressed, we take bytes 1-49 (x-coordinate)
  const sharedX = sharedSecret.slice(1, 49); // 48 bytes = 384 bits

  // Use HKDF to derive a wrapping key from shared secret
  const wrapKey = hkdf(
    sha256,
    sharedX,
    new Uint8Array(32), // All zeros salt as per spec
    stringToBytes(HKDF_INFO),
    32 // 256 bits
  );

  return wrapKey;
}

/**
 * Wrap an epoch key for a recipient
 * Matches web.js wrapEpochKeyForRecipient
 */
export async function wrapEpochKey(
  epochKeyBase64: string,
  myPrivateKeyBase64: string,
  peerPublicKeyBase64: string,
): Promise<string> {
  const myPrivateKeyPKCS8 = base64ToBytes(myPrivateKeyBase64);
  const peerPublicKeySPKI = base64ToBytes(peerPublicKeyBase64);
  
  const myPrivateKeyBytes = pkcs8ToPrivateKey(myPrivateKeyPKCS8);
  const peerPublicKeyBytes = spkiToPublicKey(peerPublicKeySPKI);

  const wrapKey = deriveWrappingKey(myPrivateKeyBytes, peerPublicKeyBytes);

  // Wrap the epoch key
  const epochKey = base64ToBytes(epochKeyBase64);
  const nonce = generateNonce();
  const wrapped = encryptAESGCM(wrapKey, epochKey, nonce);

  // Return nonce + wrapped key concatenated
  const result = new Uint8Array(nonce.length + wrapped.length);
  result.set(nonce, 0);
  result.set(wrapped, nonce.length);

  return bytesToBase64(result);
}

/**
 * Unwrap an epoch key received from sender
 * Matches web.js unwrapEpochKey
 */
export async function unwrapEpochKey(
  wrappedKeyBase64: string,
  myPrivateKeyBase64: string,
  senderPublicKeyBase64: string,
): Promise<string> {
  const wrappedData = base64ToBytes(wrappedKeyBase64);
  const nonce = wrappedData.slice(0, AES_NONCE_LENGTH);
  const wrapped = wrappedData.slice(AES_NONCE_LENGTH);

  const myPrivateKeyPKCS8 = base64ToBytes(myPrivateKeyBase64);
  const senderPublicKeySPKI = base64ToBytes(senderPublicKeyBase64);
  
  const myPrivateKeyBytes = pkcs8ToPrivateKey(myPrivateKeyPKCS8);
  const senderPublicKeyBytes = spkiToPublicKey(senderPublicKeySPKI);

  const wrapKey = deriveWrappingKey(myPrivateKeyBytes, senderPublicKeyBytes);

  // Unwrap the epoch key
  const rawEpochKey = decryptAESGCM(wrapKey, wrapped, nonce);

  return bytesToBase64(rawEpochKey);
}

// ==================== HASHING ====================

/**
 * SHA-256 hash
 */
export async function sha256Hash(dataBase64: string): Promise<string> {
  const data = base64ToBytes(dataBase64);
  return bytesToBase64(sha256(data));
}
