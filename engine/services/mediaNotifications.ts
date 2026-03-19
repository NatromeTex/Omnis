/**
 * Media Notification Service — @notifee/react-native
 *
 * Creates Android notification channels and displays rich progress-bar
 * notifications for media uploads and downloads.
 *
 * Lifecycle:
 *   1.  initMediaNotifications() — call once at app start to create channels.
 *   2.  showTransferProgress()   — called by MediaManager on every status tick.
 *   3.  notifyTransferComplete() — final "success" notification.
 *   4.  notifyTransferFailed()   — final "error" notification.
 *   5.  cancelTransferNotification() — dismiss when the user cancels.
 */

import notifee, {
  AndroidImportance,
  AndroidCategory,
  AndroidVisibility,
} from "@notifee/react-native";
import { Platform } from "react-native";
import type { MediaTransferStatus } from "../types";

// ─── Channel IDs ──────────────────────────────────────────────────────
const CHANNEL_UPLOAD = "omnis_media_upload";
const CHANNEL_DOWNLOAD = "omnis_media_download";

export const NOTIFICATION_CHANNELS = {
  UPLOAD: CHANNEL_UPLOAD,
  DOWNLOAD: CHANNEL_DOWNLOAD,
} as const;

// ─── Notification IDs ─────────────────────────────────────────────────
// We use the uploadId itself as the notification tag so each transfer
// gets its own notification that can be updated in place.
function notifId(uploadId: string): string {
  // Notifee expects a string ID. We prefix to avoid collisions.
  return `media_${uploadId}`;
}

// ─── Channel Setup ────────────────────────────────────────────────────

/**
 * Create Android notification channels. Safe to call multiple times;
 * Notifee deduplicates by channel ID.
 */
export async function initMediaNotifications(): Promise<void> {
  if (Platform.OS !== "android") return;

  await notifee.createChannel({
    id: CHANNEL_UPLOAD,
    name: "Media Uploads",
    description: "Progress notifications for file uploads",
    importance: AndroidImportance.LOW,
    vibration: false,
    sound: "",
  });

  await notifee.createChannel({
    id: CHANNEL_DOWNLOAD,
    name: "Media Downloads",
    description: "Progress notifications for file downloads",
    importance: AndroidImportance.LOW,
    vibration: false,
    sound: "",
  });
}

// ─── Progress ─────────────────────────────────────────────────────────

/**
 * Show or update a progress notification for a media transfer.
 * Called from MediaManager.notifyProgress on every status change.
 */
export async function showTransferProgress(
  uploadId: string,
  fileName: string,
  status: MediaTransferStatus,
  progress: number,
  direction: "upload" | "download",
): Promise<void> {
  if (Platform.OS !== "android") return;

  const isIndeterminate = status === "encrypting" || status === "decrypting" || status === "queued";
  const channelId = direction === "upload" ? CHANNEL_UPLOAD : CHANNEL_DOWNLOAD;
  const title = direction === "upload" ? "Uploading" : "Downloading";
  const body = statusBody(fileName, status, progress);

  await notifee.displayNotification({
    id: notifId(uploadId),
    title,
    body,
    android: {
      channelId,
      smallIcon: "ic_notification", // falls back to launcher icon
      category: AndroidCategory.PROGRESS,
      visibility: AndroidVisibility.PUBLIC,
      ongoing: true,
      autoCancel: false,
      onlyAlertOnce: true,
      progress: isIndeterminate
        ? { indeterminate: true }
        : { max: 100, current: Math.round(progress * 100) },
    },
  });
}

// ─── Completion / Failure ─────────────────────────────────────────────

/**
 * Replace the ongoing progress notification with a "complete" notification.
 */
export async function notifyTransferComplete(
  uploadId: string,
  fileName: string,
  direction: "upload" | "download",
): Promise<void> {
  if (Platform.OS !== "android") return;

  const channelId = direction === "upload" ? CHANNEL_UPLOAD : CHANNEL_DOWNLOAD;
  const title = direction === "upload" ? "Upload complete" : "Download complete";

  await notifee.displayNotification({
    id: notifId(uploadId),
    title,
    body: fileName,
    android: {
      channelId,
      smallIcon: "ic_notification",
      ongoing: false,
      autoCancel: true,
      onlyAlertOnce: true,
    },
  });
}

/**
 * Replace the ongoing progress notification with an error notification.
 */
export async function notifyTransferFailed(
  uploadId: string,
  fileName: string,
  error: string,
): Promise<void> {
  if (Platform.OS !== "android") return;

  await notifee.displayNotification({
    id: notifId(uploadId),
    title: "Transfer failed",
    body: `${fileName} — ${error}`,
    android: {
      channelId: CHANNEL_UPLOAD, // use upload channel for all errors
      smallIcon: "ic_notification",
      ongoing: false,
      autoCancel: true,
    },
  });
}

/**
 * Cancel / dismiss a transfer notification.
 */
export async function cancelTransferNotification(
  uploadId: string,
): Promise<void> {
  if (Platform.OS !== "android") return;
  await notifee.cancelNotification(notifId(uploadId));
}

// ─── Helpers ──────────────────────────────────────────────────────────

function statusBody(
  fileName: string,
  status: MediaTransferStatus,
  progress: number,
): string {
  switch (status) {
    case "queued":
      return `${fileName} — Queued`;
    case "encrypting":
      return `${fileName} — Encrypting…`;
    case "uploading":
      return `${fileName} — ${Math.round(progress * 100)}%`;
    case "downloading":
      return `${fileName} — ${Math.round(progress * 100)}%`;
    case "decrypting":
      return `${fileName} — Decrypting…`;
    default:
      return fileName;
  }
}

