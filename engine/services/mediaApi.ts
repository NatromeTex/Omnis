/**
 * Media API Service
 * Handles media upload, download, and metadata REST endpoints.
 * All media is encrypted client-side before upload.
 */

import * as FileSystem from "expo-file-system";
import { APP_VERSION, ENDPOINTS } from "../constants";
import type { MediaMetaResponse, MediaUploadResponse } from "../types";
import { getApiBaseUrl, getAuthToken, getDeviceId } from "./storage";
import { Platform } from "react-native";

class MediaApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "MediaApiError";
    this.status = status;
  }
}

/**
 * Upload a single encrypted chunk via multipart/form-data.
 *
 * @param chunkFilePath Absolute path to the encrypted chunk file on disk
 * @param chatId        Chat this media belongs to
 * @param mimeType      Original MIME type (e.g. image/png)
 * @param nonce         Base64 encryption nonce
 * @param chunkIndex    0-based chunk index
 * @param totalChunks   Total number of chunks
 * @param uploadId      UUID grouping all chunks of one file
 */
export async function uploadMediaChunk(
  chunkFilePath: string,
  chatId: number,
  mimeType: string,
  nonce: string,
  chunkIndex: number,
  totalChunks: number,
  uploadId: string,
): Promise<MediaUploadResponse> {
  const baseUrl = await getApiBaseUrl();
  const token = await getAuthToken();
  const deviceId = await getDeviceId();

  const url = `${baseUrl}${ENDPOINTS.MEDIA_UPLOAD}`;

  // RN FormData accepts {uri, name, type} objects for file uploads —
  // avoids Hermes Blob limitation with ArrayBuffer/ArrayBufferView.
  const fileUri = chunkFilePath.startsWith("file://")
    ? chunkFilePath
    : `file://${chunkFilePath}`;

  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    name: `chunk_${chunkIndex}`,
    type: "application/octet-stream",
  } as any);
  formData.append("chat_id", chatId.toString());
  formData.append("mime_type", mimeType);
  formData.append("nonce", nonce);
  formData.append("chunk_index", chunkIndex.toString());
  formData.append("total_chunks", totalChunks.toString());
  formData.append("upload_id", uploadId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Device-ID": deviceId,
      "User-Agent": `Omnis/${APP_VERSION} (Android ${Platform.Version})`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let message: string;
    try {
      const errorJson = JSON.parse(errorText);
      message = errorJson.detail || errorJson.message || errorText;
    } catch {
      message = errorText || `Upload failed with status ${response.status}`;
    }
    throw new MediaApiError(message, response.status);
  }

  return response.json();
}

/**
 * Fetch media metadata (upload info + all chunk info).
 */
export async function fetchMediaMeta(
  mediaId: number,
): Promise<MediaMetaResponse> {
  const baseUrl = await getApiBaseUrl();
  const token = await getAuthToken();
  const deviceId = await getDeviceId();

  const url = `${baseUrl}${ENDPOINTS.MEDIA_META.replace("{media_id}", mediaId.toString())}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Device-ID": deviceId,
      "User-Agent": `Omnis/${APP_VERSION} (Android ${Platform.Version})`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new MediaApiError(
      errorText || `Fetch meta failed with status ${response.status}`,
      response.status,
    );
  }

  return response.json();
}

/**
 * Download an encrypted media chunk directly to a file on disk.
 * Uses expo-file-system to stream at the native level, avoiding JS memory.
 */
export async function downloadMediaChunkToFile(
  mediaId: number,
  destPath: string,
): Promise<void> {
  const baseUrl = await getApiBaseUrl();
  const token = await getAuthToken();
  const deviceId = await getDeviceId();

  const url = `${baseUrl}${ENDPOINTS.MEDIA_DOWNLOAD.replace("{media_id}", mediaId.toString())}`;
  const fileUri = destPath.startsWith("file://") ? destPath : `file://${destPath}`;

  console.log(`[MediaAPI] Downloading chunk mediaId=${mediaId} url=${url} dest=${fileUri}`);

  let result: FileSystem.FileSystemDownloadResult;
  try {
    result = await FileSystem.downloadAsync(url, fileUri, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Device-ID": deviceId,
        "User-Agent": `Omnis/${APP_VERSION} (Android ${Platform.Version})`,
      },
    });
  } catch (err: any) {
    console.error(`[MediaAPI] downloadAsync threw for mediaId=${mediaId} url=${url}:`, err?.message ?? err);
    throw err;
  }

  console.log(`[MediaAPI] Chunk mediaId=${mediaId} response status=${result.status} headers=${JSON.stringify(result.headers ?? {})}`);

  if (result.status !== 200) {
    console.error(
      `[MediaAPI] Download failed: mediaId=${mediaId} status=${result.status} url=${url} headers=${JSON.stringify(result.headers ?? {})}`,
    );
    throw new MediaApiError(
      `Download failed with status ${result.status}`,
      result.status,
    );
  }
}

export { MediaApiError };
