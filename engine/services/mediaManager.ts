/**
 * Media Manager Service
 * Centralized media handling: encryption, chunking, upload, download, decryption, caching.
 * UI components never deal with crypto or storage directly — they use this service.
 */

import { Directory } from "expo-file-system";
import {
  MEDIA_AUTO_DOWNLOAD_THRESHOLD,
  MEDIA_UPLOAD_RETRY_BASE_MS,
  MEDIA_UPLOAD_RETRY_MAX,
} from "../constants";
import type {
  MediaTransferProgress,
  MediaTransferStatus,
  MediaUploadResponse,
  MessageAttachment,
  MessageMediaMeta,
  PendingAttachment,
} from "../types";
import { downloadMediaChunkToFile, uploadMediaChunk } from "./mediaApi";
import {
  cancelTransferNotification,
  notifyTransferComplete,
  notifyTransferFailed,
  showTransferProgress,
} from "./mediaNotifications";
import NativeMediaModule from "./NativeMediaModule";
import { generateUUID } from "./crypto";

// ========================= Types =========================

type ProgressListener = (progress: MediaTransferProgress) => void;

interface UploadTask {
  attachment: PendingAttachment;
  chatId: number;
  epochKeyBase64: string;
  nonceBase64: string;
  chunkPaths: string[];
  totalChunks: number;
  chunksUploaded: number;
  mediaIds: number[];
  cancelled: boolean;
}

interface DownloadTask {
  uploadId: string;
  attachment: MessageAttachment;
  epochKeyBase64: string;
  nonceBase64: string;
  status: MediaTransferStatus;
  progress: number;
  cancelled: boolean;
}

// ========================= Singleton =========================

class MediaManager {
  private uploadTasks = new Map<string, UploadTask>();
  private downloadTasks = new Map<string, DownloadTask>();
  private progressListeners = new Set<ProgressListener>();
  /** uploadId → fileName, used to pass readable names to notifications */
  private fileNames = new Map<string, string>();
  /** uploadId → direction, so notifyProgress knows the notification channel */
  private directions = new Map<string, "upload" | "download">();

  // ========================= Progress =========================

  subscribe(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  private notifyProgress(uploadId: string, status: MediaTransferStatus, progress: number, chunksCompleted: number, totalChunks: number, error?: string) {
    const event: MediaTransferProgress = {
      uploadId,
      status,
      progress,
      chunksCompleted,
      totalChunks,
      error,
    };
    // Push to Notifee notification bar
    const fileName = this.fileNames.get(uploadId) ?? "File";
    const direction = this.directions.get(uploadId) ?? "upload";
    if (status === "uploaded" || status === "completed") {
      notifyTransferComplete(uploadId, fileName, direction).catch(() => {});
    } else if (status === "failed") {
      notifyTransferFailed(uploadId, fileName, error ?? "Unknown error").catch(() => {});
    } else {
      showTransferProgress(uploadId, fileName, status, progress, direction).catch(() => {});
    }

    for (const listener of this.progressListeners) {
      try {
        listener(event);
      } catch {
        // ignore listener errors
      }
    }
  }

  // ========================= Upload =========================

  /**
   * Prepare a file for upload: encrypt and chunk it.
   * Returns a PendingAttachment that can be displayed in UI before upload completes.
   */
  async prepareUpload(
    localUri: string,
    fileName: string,
    mimeType: string,
    fileSize: number,
  ): Promise<{
    pending: PendingAttachment;
    nonceBase64: string;
  }> {
    const uploadId = generateUUID();

    // Generate a random nonce for file encryption (key will be the epoch key at upload time)
    const nonceBase64 = await NativeMediaModule.generateFileNonce();

    const pending: PendingAttachment = {
      localUri,
      mimeType,
      fileName,
      fileSize,
      uploadId,
      mediaIds: [],
      status: "queued",
      progress: 0,
      _nonceBase64: nonceBase64,
    };

    // Track name + direction for notifications
    this.fileNames.set(uploadId, fileName);
    this.directions.set(uploadId, "upload");

    return { pending, nonceBase64 };
  }

  /**
   * Upload an attachment: encrypt, chunk, and upload all chunks.
   * Updates pending attachment state as upload progresses.
   * Returns the list of media_ids for message attachment.
   */
  async uploadAttachment(
    pending: PendingAttachment,
    chatId: number,
    epochKeyBase64: string,
    nonceBase64: string,
  ): Promise<number[]> {
    const uploadId = pending.uploadId;

    try {
      // Phase 1: Encrypt and chunk
      this.notifyProgress(uploadId, "encrypting", 0, 0, 0);
      pending.status = "encrypting";

      // Copy URI to local file if needed (content:// URIs)
      let localPath = pending.localUri;
      if (localPath.startsWith("content://") || localPath.startsWith("file://")) {
        const tempDir = await NativeMediaModule.getDecryptedTempPath();
        const destPath = `${tempDir}/${uploadId}_source`;
        localPath = await NativeMediaModule.copyUriToFile(pending.localUri, destPath);
      }

      const chunkResult = await NativeMediaModule.encryptAndChunkFile(
        localPath,
        epochKeyBase64,
        nonceBase64,
        0, // use default chunk size
      );

      const chunkPaths = chunkResult.chunkPaths;
      const totalChunks = chunkResult.totalChunks;

      const task: UploadTask = {
        attachment: pending,
        chatId,
        epochKeyBase64,
        nonceBase64,
        chunkPaths,
        totalChunks,
        chunksUploaded: 0,
        mediaIds: [],
        cancelled: false,
      };
      this.uploadTasks.set(uploadId, task);

      // Phase 2: Upload chunks sequentially
      this.notifyProgress(uploadId, "uploading", 0, 0, totalChunks);
      pending.status = "uploading";

      for (let i = 0; i < totalChunks; i++) {
        if (task.cancelled) {
          throw new Error("Upload cancelled");
        }

        let response: MediaUploadResponse | null = null;
        let attempt = 0;

        // Retry with exponential backoff
        while (attempt < MEDIA_UPLOAD_RETRY_MAX) {
          try {
            response = await uploadMediaChunk(
              chunkPaths[i],
              chatId,
              pending.mimeType,
              nonceBase64,
              i,
              totalChunks,
              uploadId,
            );
            break;
          } catch (error: any) {
            attempt++;
            if (attempt >= MEDIA_UPLOAD_RETRY_MAX) {
              throw error;
            }
            // Exponential backoff
            const delay = MEDIA_UPLOAD_RETRY_BASE_MS * Math.pow(2, attempt - 1);
            await new Promise((r) => setTimeout(r, delay));
          }
        }

        if (!response) {
          throw new Error(`Failed to upload chunk ${i}`);
        }

        task.mediaIds.push(response.media_id);
        task.chunksUploaded = i + 1;
        const progress = (i + 1) / totalChunks;
        pending.progress = progress;
        pending.mediaIds = [...task.mediaIds];

        this.notifyProgress(uploadId, "uploading", progress, i + 1, totalChunks);
      }

      // Phase 3: Cleanup encrypted chunks
      await NativeMediaModule.cleanupChunks(uploadId);

      pending.status = "uploaded";
      pending.progress = 1;
      this.notifyProgress(uploadId, "uploaded", 1, totalChunks, totalChunks);

      return task.mediaIds;
    } catch (error: any) {
      pending.status = "failed";
      this.notifyProgress(uploadId, "failed", pending.progress, 0, 0, error.message);
      throw error;
    } finally {
      this.uploadTasks.delete(uploadId);
    }
  }

  /**
   * Cancel an in-progress upload.
   */
  cancelUpload(uploadId: string) {
    const task = this.uploadTasks.get(uploadId);
    if (task) {
      task.cancelled = true;
    }
    cancelTransferNotification(uploadId).catch(() => {});
    this.fileNames.delete(uploadId);
    this.directions.delete(uploadId);
  }

  // ========================= Download =========================

  /**
   * Check if a file should auto-download based on size.
   */
  shouldAutoDownload(totalSize: number): boolean {
    return totalSize <= MEDIA_AUTO_DOWNLOAD_THRESHOLD;
  }

  /**
   * Download and decrypt an attachment.
   * @param attachment Message attachment object
   * @param epochKeyBase64 Epoch key for decryption (AES-256-GCM, base64)
   * @param nonceBase64 Encryption nonce (base64). Falls back to attachment.nonce if not provided.
   * @returns Path to the decrypted file in app storage
   */
  async downloadAndDecrypt(
    attachment: MessageAttachment,
    epochKeyBase64: string,
    nonceBase64?: string,
  ): Promise<string> {
    const uploadId = attachment.upload_id;
    const nonce = nonceBase64 || attachment.nonce;

    // Track name + direction for notifications
    this.fileNames.set(uploadId, uploadId);
    this.directions.set(uploadId, "download");

    const task: DownloadTask = {
      uploadId,
      attachment,
      epochKeyBase64,
      nonceBase64: nonce,
      status: "downloading",
      progress: 0,
      cancelled: false,
    };
    this.downloadTasks.set(uploadId, task);

    try {
      // Sort chunks by index
      const sortedChunks = [...attachment.chunks].sort(
        (a, b) => a.chunk_index - b.chunk_index,
      );
      const totalChunks = sortedChunks.length;

      const cacheDir = await NativeMediaModule.getEncryptedCachePath();
      const downloadDir = `${cacheDir}/${uploadId}_dl`;
      const chunkPaths: string[] = [];

      // Ensure the download directory exists
      const dirUri = downloadDir.startsWith("file://") ? downloadDir : `file://${downloadDir}`;
      const dir = new Directory(dirUri);
      if (!dir.exists) dir.create();

      // Phase 1: Download chunks directly to disk (avoids loading into JS memory)
      this.notifyProgress(uploadId, "downloading", 0, 0, totalChunks);
      console.log(`[MediaManager] Starting download uploadId=${uploadId} totalChunks=${totalChunks} mimeType=${attachment.mime_type} totalSize=${attachment.total_size}`);

      for (let i = 0; i < totalChunks; i++) {
        if (task.cancelled) throw new Error("Download cancelled");

        const chunk = sortedChunks[i];
        const chunkPath = `${downloadDir}/chunk_${chunk.chunk_index}`;
        console.log(`[MediaManager] Downloading chunk ${i + 1}/${totalChunks} mediaId=${chunk.media_id} chunkIndex=${chunk.chunk_index}`);
        try {
          await downloadMediaChunkToFile(chunk.media_id, chunkPath);
        } catch (chunkErr: any) {
          console.error(
            `[MediaManager] Chunk download failed uploadId=${uploadId} chunk=${i + 1}/${totalChunks} mediaId=${chunk.media_id}:`,
            chunkErr?.message ?? chunkErr,
            chunkErr?.status != null ? `HTTP ${chunkErr.status}` : "",
          );
          throw chunkErr;
        }
        chunkPaths.push(chunkPath);

        const progress = (i + 1) / totalChunks;
        task.progress = progress;
        this.notifyProgress(uploadId, "downloading", progress, i + 1, totalChunks);
      }

      // Phase 2: Decrypt and reassemble
      this.notifyProgress(uploadId, "decrypting", 1, totalChunks, totalChunks);
      task.status = "decrypting";
      console.log(`[MediaManager] Decrypting and reassembling uploadId=${uploadId} chunks=${chunkPaths.length} outputMime=${attachment.mime_type}`);

      const tempDir = await NativeMediaModule.getDecryptedTempPath();
      // Use upload_id as the decrypted file name base
      const ext = getExtensionFromMime(attachment.mime_type);
      const outputPath = `${tempDir}/${uploadId}${ext}`;

      try {
        await NativeMediaModule.decryptAndReassembleChunks(
          chunkPaths,
          epochKeyBase64,
          nonce,
          outputPath,
        );
      } catch (decryptErr: any) {
        console.error(
          `[MediaManager] Decrypt/reassemble failed uploadId=${uploadId} outputPath=${outputPath}:`,
          decryptErr?.message ?? decryptErr,
        );
        throw decryptErr;
      }

      // Cleanup downloaded encrypted chunks
      await NativeMediaModule.cleanupChunks(`${uploadId}_dl`);

      task.status = "completed";
      task.progress = 1;
      this.notifyProgress(uploadId, "completed", 1, totalChunks, totalChunks);
      console.log(`[MediaManager] Download complete uploadId=${uploadId} outputPath=${outputPath}`);

      return outputPath;
    } catch (error: any) {
      console.error(
        `[MediaManager] Download failed uploadId=${uploadId} status=${task.status} progress=${task.progress}:`,
        error?.message ?? error,
      );
      task.status = "failed";
      this.notifyProgress(uploadId, "failed", task.progress, 0, 0, error.message);
      throw error;
    } finally {
      this.downloadTasks.delete(uploadId);
    }
  }

  /**
   * Cancel an in-progress download.
   */
  cancelDownload(uploadId: string) {
    const task = this.downloadTasks.get(uploadId);
    if (task) {
      task.cancelled = true;
    }
    cancelTransferNotification(uploadId).catch(() => {});
    this.fileNames.delete(uploadId);
    this.directions.delete(uploadId);
  }

  /**
   * Save a decrypted file to the user-visible public storage.
   */
  async saveToPublicStorage(
    decryptedPath: string,
    fileName: string,
    mimeType: string,
  ): Promise<string> {
    return NativeMediaModule.saveToMediaStore(decryptedPath, fileName, mimeType);
  }

  /**
   * Generate a video thumbnail from a decrypted video file.
   */
  async generateVideoThumbnail(videoPath: string): Promise<string | null> {
    return NativeMediaModule.generateVideoThumbnail(videoPath);
  }

  /**
   * Get file info from the native module.
   */
  async getFileInfo(filePath: string) {
    return NativeMediaModule.getFileInfo(filePath);
  }

  /**
   * Build the MessageMediaMeta object to embed in the encrypted message ciphertext.
   * This ensures the file encryption key travels with the message, encrypted by
   * the epoch key along with the message text.
   */
  buildMediaMeta(
    text: string,
    attachments: {
      uploadId: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
      fileKeyBase64: string;
      nonceBase64: string;
    }[],
  ): MessageMediaMeta {
    return {
      text: text || undefined,
      attachments: attachments.map((a) => ({
        upload_id: a.uploadId,
        file_name: a.fileName,
        mime_type: a.mimeType,
        file_size: a.fileSize,
        file_key: a.fileKeyBase64,
        nonce: a.nonceBase64,
      })),
    };
  }

  /**
   * Parse a decrypted message ciphertext to extract media metadata.
   * Returns null if the plaintext is a plain text message (not JSON).
   */
  parseMediaMeta(plaintext: string): MessageMediaMeta | null {
    try {
      const parsed = JSON.parse(plaintext);
      if (parsed && (parsed.text !== undefined || parsed.attachments)) {
        return parsed as MessageMediaMeta;
      }
      return null;
    } catch {
      // Not JSON — plain text message
      return null;
    }
  }

  /**
   * Get the display text from a message, handling both plain text and media messages.
   */
  getDisplayText(plaintext: string): string {
    const meta = this.parseMediaMeta(plaintext);
    if (meta) {
      if (meta.text) return meta.text;
      if (meta.attachments && meta.attachments.length > 0) {
        const count = meta.attachments.length;
        return count === 1 ? "📎 Attachment" : `📎 ${count} Attachments`;
      }
    }
    return plaintext;
  }
}

// ========================= Helpers =========================

export function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "application/pdf": ".pdf",
  };
  return map[mimeType] || "";
}

// Singleton export
export const mediaManager = new MediaManager();
