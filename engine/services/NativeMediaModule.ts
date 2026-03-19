/**
 * Native Media Module TypeScript bridge
 * Provides typed access to the Kotlin MediaModule TurboModule
 */

import { NativeModules } from "react-native";

export interface NativeMediaInterface {
  /** Generate a 12-byte random base nonce for file encryption (base64) */
  generateFileNonce(): Promise<string>;

  /** Generate a 32-byte random file encryption key (base64) */
  generateFileKey(): Promise<string>;

  /**
   * Encrypt a file and split into chunks.
   * Returns chunk paths, total chunks, total encrypted size, and upload_id.
   */
  encryptAndChunkFile(
    filePath: string,
    keyBase64: string,
    nonceBase64: string,
    chunkSize: number,
  ): Promise<{
    totalChunks: number;
    chunkPaths: string[];
    totalSize: number;
    uploadId: string;
  }>;

  /**
   * Decrypt and reassemble encrypted chunks into a file.
   * @param chunkPaths Ordered array of encrypted chunk file paths
   * @param keyBase64 AES-256 key (base64)
   * @param nonceBase64 Base nonce (base64, 12 bytes)
   * @param outputPath Where to write the decrypted file
   */
  decryptAndReassembleChunks(
    chunkPaths: string[],
    keyBase64: string,
    nonceBase64: string,
    outputPath: string,
  ): Promise<string>;

  /**
   * Save a decrypted file to the appropriate public MediaStore directory.
   * Returns the content URI of the saved file.
   */
  saveToMediaStore(
    sourcePath: string,
    fileName: string,
    mimeType: string,
  ): Promise<string>;

  /** Get the encrypted media cache directory path */
  getEncryptedCachePath(): Promise<string>;

  /** Get the decrypted temp directory path */
  getDecryptedTempPath(): Promise<string>;

  /** Delete encrypted chunk files for a given upload_id */
  cleanupChunks(uploadId: string): Promise<boolean>;

  /** Get file info (exists, size, name, path) */
  getFileInfo(filePath: string): Promise<{
    exists: boolean;
    size: number;
    name: string;
    path: string;
  }>;

  /** Copy a content URI to a local file path */
  copyUriToFile(uriString: string, destPath: string): Promise<string>;

  /** Read an encrypted chunk file as base64 */
  readChunkAsBase64(chunkPath: string): Promise<string>;

  /** Write base64 data to a file */
  writeBase64ToFile(base64Data: string, filePath: string): Promise<string>;

  /** Write raw bytes (as base64) to a file */
  writeBytesToFile(data: string, filePath: string): Promise<string>;

  /** Generate a video thumbnail. Returns path or null. */
  generateVideoThumbnail(videoPath: string): Promise<string | null>;
}

const { MediaModule } = NativeModules;

if (!MediaModule) {
  throw new Error(
    "MediaModule native module is not available. Ensure it is properly linked.",
  );
}

export default MediaModule as NativeMediaInterface;
