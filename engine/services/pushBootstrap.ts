import messaging from "@react-native-firebase/messaging";
import { Platform } from "react-native";
import { registerFcmToken } from "./api";
import {
  initChatNotifications,
  syncChatNotificationsFromServer,
} from "./chatNotifications";
import { appLog } from "./logging";

let backgroundHandlerRegistered = false;
const messagingInstance = messaging();

function parseWakeChatId(data?: Record<string, unknown>): number | undefined {
  const rawChatId = data?.chat_id;
  if (typeof rawChatId !== "string") return undefined;
  const parsed = Number(rawChatId);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function registerBackgroundFcmHandler(): void {
  if (Platform.OS !== "android") {
    appLog("debug", "[Push] Background handler skipped on non-Android");
    return;
  }
  if (backgroundHandlerRegistered) {
    appLog("debug", "[Push] Background FCM handler already registered");
    return;
  }

  appLog("info", "[Push] Registering background FCM handler");

  messagingInstance.setBackgroundMessageHandler(async (remoteMessage) => {
    appLog("info", "[Push] Background FCM wake received", {
      messageId: remoteMessage.messageId,
      dataKeys: Object.keys(remoteMessage.data ?? {}),
    });

    try {
      await initChatNotifications();
      const wakeChatId = parseWakeChatId(remoteMessage.data);
      await syncChatNotificationsFromServer(wakeChatId);
      appLog("info", "[Push] Background wake processing complete", {
        wakeChatId,
      });
    } catch (error) {
      appLog("error", "[Push] Background wake handling failed", error);
    }
  });

  backgroundHandlerRegistered = true;
  appLog("info", "[Push] Background FCM handler registered");
}

export async function registerCurrentDeviceFcmToken(): Promise<void> {
  if (Platform.OS !== "android") {
    appLog("debug", "[Push] Token registration skipped on non-Android");
    return;
  }

  await initChatNotifications();

  try {
    await messagingInstance.registerDeviceForRemoteMessages();
  } catch {
    // Device can already be registered on some Android builds.
    appLog("debug", "[Push] Device already registered for remote messages");
  }

  const token = await messagingInstance.getToken();
  if (!token) {
    appLog("warn", "[Push] No FCM token returned by SDK");
    return;
  }

  await registerFcmToken(token, "android");
  appLog("info", "[Push] FCM token registered on backend", {
    tokenPreview: `${token.slice(0, 12)}...`,
  });
}

export function subscribeToFcmTokenRefresh(): () => void {
  if (Platform.OS !== "android") {
    return () => {};
  }

  return messagingInstance.onTokenRefresh(async (token) => {
    try {
      if (!token) return;
      await registerFcmToken(token, "android");
      appLog("info", "[Push] Refreshed FCM token registered", {
        tokenPreview: `${token.slice(0, 12)}...`,
      });
    } catch (error) {
      appLog("error", "[Push] Token refresh sync failed", error);
    }
  });
}
