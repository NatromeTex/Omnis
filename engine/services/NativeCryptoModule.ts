/**
 * Native Crypto Module TypeScript bridge
 * Provides typed access to the Kotlin CryptoModule TurboModule
 */

import { NativeModules } from "react-native";

export interface NativeCryptoInterface {
  generateAESKey(): Promise<string>;
  generateIdentityKeyPair(): Promise<{
    publicKey: string;
    privateKey: string;
  }>;
  aesGcmEncrypt(
    plaintext: string,
    epochKeyBase64: string,
  ): Promise<{ ciphertext: string; nonce: string }>;
  aesGcmDecrypt(
    ciphertextBase64: string,
    nonceBase64: string,
    epochKeyBase64: string,
  ): Promise<string>;
  encryptIdentityPrivateKey(
    privateKeyBase64: string,
    password: string,
  ): Promise<{ encrypted: string; salt: string; nonce: string }>;
  decryptIdentityPrivateKey(
    encryptedPrivateKey: string,
    saltBase64: string,
    nonceBase64: string,
    password: string,
  ): Promise<string>;
  wrapEpochKey(
    epochKeyBase64: string,
    myPrivateKeyBase64: string,
    peerPublicKeyBase64: string,
  ): Promise<string>;
  unwrapEpochKey(
    wrappedKeyBase64: string,
    myPrivateKeyBase64: string,
    senderPublicKeyBase64: string,
  ): Promise<string>;
}

const { CryptoModule } = NativeModules;

if (!CryptoModule) {
  throw new Error(
    "CryptoModule native module is not available. Ensure it is properly linked.",
  );
}

export default CryptoModule as NativeCryptoInterface;
