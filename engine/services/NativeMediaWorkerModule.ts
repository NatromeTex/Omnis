/**
 * NativeMediaWorkerModule
 * TypeScript bridge to the Kotlin MediaWorkerModule for background
 * media upload/download via WorkManager.
 */

import { NativeModules, Platform } from "react-native";

interface EnqueueUploadParams {
  uploadId: string;
  chatId: number;
  mimeType: string;
  nonceBase64: string;
  chunkDir: string;
  totalChunks: number;
  startChunk?: number;
  apiBaseUrl: string;
  authToken: string;
}

interface EnqueueDownloadParams {
  uploadId: string;
  mediaIds: number[];
  apiBaseUrl: string;
  authToken: string;
  outputDir?: string;
}

interface EnqueueResult {
  workId: string;
  uploadId: string;
}

interface NativeMediaWorkerInterface {
  enqueueUpload(params: EnqueueUploadParams): Promise<EnqueueResult>;
  enqueueDownload(params: EnqueueDownloadParams): Promise<EnqueueResult>;
  cancelTransfer(uploadId: string): Promise<boolean>;
}

const NativeMediaWorkerModule: NativeMediaWorkerInterface | null =
  Platform.OS === "android"
    ? (NativeModules.MediaWorkerModule as NativeMediaWorkerInterface)
    : null;

export default NativeMediaWorkerModule;
