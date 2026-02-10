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

type WebCryptoLike = {
  subtle: SubtleCrypto;
  getRandomValues: (array: Uint8Array) => Uint8Array;
};

function getWebCrypto(): WebCryptoLike | null {
  const cryptoObj =
    (globalThis as unknown as { crypto?: Crypto }).crypto ??
    (globalThis as unknown as { crypto?: { webcrypto?: Crypto } }).crypto
      ?.webcrypto;
  if (cryptoObj?.subtle && cryptoObj.getRandomValues) {
    return {
      subtle: cryptoObj.subtle,
      getRandomValues: cryptoObj.getRandomValues.bind(cryptoObj),
    };
  }
  return null;
}

function toUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

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
function generateRandomBytes(length: number): Uint8Array {
  const webCrypto = getWebCrypto();
  if (webCrypto) {
    const bytes = new Uint8Array(length);
    webCrypto.getRandomValues(bytes);
    return bytes;
  }
  return randomBytes(length);
}

export function generateUUID(): string {
  return uuidv4();
}

function generateNonce(): Uint8Array {
  return generateRandomBytes(AES_NONCE_LENGTH);
}

function generateSalt(): Uint8Array {
  return generateRandomBytes(PBKDF2_SALT_LENGTH);
}

export async function generateAESKey(): Promise<string> {
  return bytesToBase64(generateRandomBytes(AES_KEY_LENGTH));
}

// ==================== KEY DERIVATION ====================
async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const passwordBytes = new TextEncoder().encode(password);
  const webCrypto = getWebCrypto();
  if (webCrypto) {
    const keyMaterial = await webCrypto.subtle.importKey(
      "raw",
      passwordBytes,
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await webCrypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      keyMaterial,
      AES_KEY_LENGTH * 8,
    );
    return toUint8Array(bits);
  }

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

const SPKI_HEADER = new Uint8Array([
  0x30, 0x76, // SEQUENCE, length 118
  0x30, 0x10, // SEQUENCE, length 16
  0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
  0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22, // OID secp384r1 (P-384)
  0x03, 0x62, 0x00, // BIT STRING, length 98, no unused bits
]);

const PKCS8_HEADER = new Uint8Array([
  0x30, 0x81, 0xb6, // SEQUENCE, length 182
  0x02, 0x01, 0x00, // INTEGER, version 0
  0x30, 0x10, // SEQUENCE, length 16
  0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID ecPublicKey
  0x06, 0x05, 0x2b, 0x81, 0x04, 0x00, 0x22, // OID secp384r1 (P-384)
  0x04, 0x81, 0x9e, // OCTET STRING, length 158
]);

function publicKeyToSPKI(rawPublicKey: Uint8Array): Uint8Array {
  const spki = new Uint8Array(SPKI_HEADER.length + rawPublicKey.length);
  spki.set(SPKI_HEADER, 0);
  spki.set(rawPublicKey, SPKI_HEADER.length);
  return spki;
}

function privateKeyToPKCS8(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  const ecPrivateKey = new Uint8Array([
    0x30, 0x81, 0x9b, // SEQUENCE, length 155
    0x02, 0x01, 0x01, // INTEGER, version 1
    0x04, 0x30, // OCTET STRING, length 48 (private key)
    ...privateKey,
    0xa1, 0x64, // [1] IMPLICIT, length 100
    0x03, 0x62, 0x00, // BIT STRING, length 98, no unused bits
    ...publicKey,
  ]);
  const pkcs8 = new Uint8Array(PKCS8_HEADER.length + ecPrivateKey.length);
  pkcs8.set(PKCS8_HEADER, 0);
  pkcs8.set(ecPrivateKey, PKCS8_HEADER.length);
  return pkcs8;
}

function spkiToPublicKey(spki: Uint8Array): Uint8Array {
  // Skip the SPKI header to get the raw public key
  return spki.slice(SPKI_HEADER.length);
}

function pkcs8ToPrivateKey(pkcs8: Uint8Array): Uint8Array {
  if (pkcs8.length >= 185 && pkcs8[24] === 0x04) {
    return pkcs8.slice(35, 35 + 48);
  }
  return pkcs8.slice(32, 32 + 48);
}

export async function generateIdentityKeyPair(): Promise<KeyPair> {
  const webCrypto = getWebCrypto();
  if (webCrypto) {
    const keyPair = await webCrypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-384" },
      true,
      ["deriveBits"],
    );
    const spki = await webCrypto.subtle.exportKey("spki", keyPair.publicKey);
    const pkcs8 = await webCrypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    return {
      publicKey: bytesToBase64(toUint8Array(spki)),
      privateKey: bytesToBase64(toUint8Array(pkcs8)),
    };
  }

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

async function encryptAESGCM(
  key: Uint8Array,
  plaintext: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array> {
  const webCrypto = getWebCrypto();
  if (webCrypto) {
    const cryptoKey = await webCrypto.subtle.importKey(
      "raw",
      key,
      "AES-GCM",
      false,
      ["encrypt"],
    );
    const encrypted = await webCrypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      cryptoKey,
      plaintext,
    );
    return toUint8Array(encrypted);
  }

  const aes = gcm(key, nonce);
  return aes.encrypt(plaintext);
}

async function decryptAESGCM(
  key: Uint8Array,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<Uint8Array> {
  const webCrypto = getWebCrypto();
  if (webCrypto) {
    const cryptoKey = await webCrypto.subtle.importKey(
      "raw",
      key,
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const decrypted = await webCrypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      cryptoKey,
      ciphertext,
    );
    return toUint8Array(decrypted);
  }

  const aes = gcm(key, nonce);
  return aes.decrypt(ciphertext);
}

export async function aesGcmEncrypt(
  plaintext: string,
  epochKeyBase64: string,
): Promise<EncryptedData> {
  const epochKey = base64ToBytes(epochKeyBase64);
  const nonce = generateNonce();
  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);
  const ciphertext = await encryptAESGCM(epochKey, plaintextBytes, nonce);

  return {
    ciphertext: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
  };
}

export async function aesGcmDecrypt(
  ciphertextBase64: string,
  nonceBase64: string,
  epochKeyBase64: string,
): Promise<string> {
  const ciphertext = base64ToBytes(ciphertextBase64);
  const nonce = base64ToBytes(nonceBase64);
  const epochKey = base64ToBytes(epochKeyBase64);

  const plaintextBytes = await decryptAESGCM(epochKey, ciphertext, nonce);
  const decoder = new TextDecoder();
  return decoder.decode(plaintextBytes);
}

// ==================== IDENTITY KEY ENCRYPTION ====================

export async function encryptIdentityPrivateKey(
  privateKeyBase64: string,
  password: string,
): Promise<{ encrypted: string; salt: string; nonce: string }> {
  const salt = generateSalt();
  const nonce = generateNonce();
  const derivedKey = await deriveKeyFromPassword(password, salt);

  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(privateKeyBase64);
  const ciphertext = await encryptAESGCM(derivedKey, plaintextBytes, nonce);

  return {
    encrypted: bytesToBase64(ciphertext),
    salt: bytesToBase64(salt),
    nonce: bytesToBase64(nonce),
  };
}

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
  const plaintextBytes = await decryptAESGCM(derivedKey, ciphertext, nonce);

  const decoder = new TextDecoder();
  return decoder.decode(plaintextBytes);
}

// ==================== EPOCH KEY WRAPPING ====================

async function deriveWrappingKey(
  myPrivateKeyBytes: Uint8Array,
  peerPublicKeyBytes: Uint8Array,
): Promise<Uint8Array> {
  const sharedSecret = p384.getSharedSecret(myPrivateKeyBytes, peerPublicKeyBytes);
  const sharedX = sharedSecret.slice(1, 49); // 48 bytes = 384 bits
  const wrapKey = hkdf(
    sha256,
    sharedX,
    new Uint8Array(32), // All zeros salt as per spec
    stringToBytes(HKDF_INFO),
    32 // 256 bits
  );

  return wrapKey;
}

async function deriveWrappingKeyWebCrypto(
  myPrivateKeyPKCS8: Uint8Array,
  peerPublicKeySPKI: Uint8Array,
): Promise<Uint8Array> {
  const webCrypto = getWebCrypto();
  if (!webCrypto) {
    throw new Error("WebCrypto is not available");
  }
  const privateKey = await webCrypto.subtle.importKey(
    "pkcs8",
    myPrivateKeyPKCS8,
    { name: "ECDH", namedCurve: "P-384" },
    false,
    ["deriveBits"],
  );
  const publicKey = await webCrypto.subtle.importKey(
    "spki",
    peerPublicKeySPKI,
    { name: "ECDH", namedCurve: "P-384" },
    false,
    [],
  );
  const sharedBits = await webCrypto.subtle.deriveBits(
    { name: "ECDH", public: publicKey },
    privateKey,
    384,
  );
  const hkdfKey = await webCrypto.subtle.importKey(
    "raw",
    sharedBits,
    "HKDF",
    false,
    ["deriveBits"],
  );
  const wrapBits = await webCrypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: stringToBytes(HKDF_INFO),
    },
    hkdfKey,
    256,
  );
  return toUint8Array(wrapBits);
}

export async function wrapEpochKey(
  epochKeyBase64: string,
  myPrivateKeyBase64: string,
  peerPublicKeyBase64: string,
): Promise<string> {
  const myPrivateKeyPKCS8 = base64ToBytes(myPrivateKeyBase64);
  const peerPublicKeySPKI = base64ToBytes(peerPublicKeyBase64);
  const webCrypto = getWebCrypto();

  const wrapKey = webCrypto
    ? await deriveWrappingKeyWebCrypto(myPrivateKeyPKCS8, peerPublicKeySPKI)
    : await deriveWrappingKey(
        pkcs8ToPrivateKey(myPrivateKeyPKCS8),
        spkiToPublicKey(peerPublicKeySPKI),
      );

  const epochKey = base64ToBytes(epochKeyBase64);
  const nonce = generateNonce();
  const wrapped = await encryptAESGCM(wrapKey, epochKey, nonce);

  const result = new Uint8Array(nonce.length + wrapped.length);
  result.set(nonce, 0);
  result.set(wrapped, nonce.length);

  return bytesToBase64(result);
}

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
  const webCrypto = getWebCrypto();

  const wrapKey = webCrypto
    ? await deriveWrappingKeyWebCrypto(myPrivateKeyPKCS8, senderPublicKeySPKI)
    : await deriveWrappingKey(
        pkcs8ToPrivateKey(myPrivateKeyPKCS8),
        spkiToPublicKey(senderPublicKeySPKI),
      );

  const rawEpochKey = await decryptAESGCM(wrapKey, wrapped, nonce);

  return bytesToBase64(rawEpochKey);
}