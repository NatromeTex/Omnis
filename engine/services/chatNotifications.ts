import AsyncStorage from "@react-native-async-storage/async-storage";
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidStyle,
  AndroidVisibility,
} from "@notifee/react-native";
import { Platform } from "react-native";
import { STORAGE_KEYS } from "../constants";
import type { Message } from "../types";
import { fetchChat, listChats } from "./api";
import { appLog } from "./logging";
import { getCurrentUser } from "./storage";

const CHANNEL_CHAT_MESSAGES = "omnis_chat_messages";
const CHAT_GROUP_ID = "omnis_chat_group";
const SUMMARY_NOTIFICATION_ID = "chat_summary";
const SMALL_ICON = "ic_stat_notify";

type ChatNotificationClass = "single-chat" | "multi-chat";

type NotificationCursor = Record<string, number>;

interface ChatDigest {
  chatId: number;
  withUser: string;
  newMessages: Message[];
}

function chatNotificationId(chatId: number): string {
  return `chat_${chatId}`;
}

async function loadCursor(): Promise<NotificationCursor> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.CHAT_NOTIFICATION_CURSOR);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as NotificationCursor) : {};
  } catch {
    return {};
  }
}

async function saveCursor(cursor: NotificationCursor): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.CHAT_NOTIFICATION_CURSOR,
    JSON.stringify(cursor),
  );
}

function getNewestMessageId(messages: Message[]): number {
  if (messages.length === 0) return 0;
  return messages[messages.length - 1].id;
}

async function fetchNewMessagesForChat(
  chatId: number,
  afterMessageId: number,
): Promise<Message[]> {
  let beforeId: number | undefined;
  let pageGuard = 0;
  const acc: Message[] = [];

  while (pageGuard < 20) {
    pageGuard += 1;
    const response = await fetchChat(chatId, beforeId, 100);
    if (response.messages.length === 0) break;

    const newer = response.messages.filter((m) => m.id > afterMessageId);
    acc.push(...newer);

    const oldestInPage = response.messages[0].id;
    if (oldestInPage <= afterMessageId) break;
    if (!response.next_cursor) break;

    beforeId = response.next_cursor;
  }

  acc.sort((a, b) => a.id - b.id);
  return acc;
}

function summarizeBody(messageCount: number): string {
  if (messageCount === 1) return "New message";
  return `${messageCount} new messages`;
}

function getNotificationClass(chatCount: number): ChatNotificationClass {
  return chatCount > 1 ? "multi-chat" : "single-chat";
}

async function displaySingleChatDigest(
  digest: ChatDigest,
  klass: ChatNotificationClass,
): Promise<void> {
  const id = chatNotificationId(digest.chatId);
  appLog("info", "[Push] Publishing single-chat notification", {
    id,
    chatId: digest.chatId,
    withUser: digest.withUser,
    count: digest.newMessages.length,
    klass,
  });

  try {
    await notifee.displayNotification({
      id,
      title: digest.withUser,
      body: summarizeBody(digest.newMessages.length),
      data: {
        chat_id: String(digest.chatId),
        notification_class: klass,
      },
      android: {
        channelId: CHANNEL_CHAT_MESSAGES,
        groupId: CHAT_GROUP_ID,
        smallIcon: SMALL_ICON,
        category: AndroidCategory.MESSAGE,
        visibility: AndroidVisibility.PUBLIC,
        pressAction: {
          id: "open_chat",
        },
        onlyAlertOnce: true,
        style: {
          type: AndroidStyle.BIGTEXT,
          text: `${digest.withUser}: ${summarizeBody(digest.newMessages.length)}`,
        },
      },
    });
    appLog("info", "[Push] Published single-chat notification", { id });
  } catch (error) {
    appLog("error", "[Push] Failed publishing single-chat notification", {
      id,
      error,
    });
    throw error;
  }
}

async function displaySummary(digests: ChatDigest[]): Promise<void> {
  if (digests.length <= 1) {
    appLog("debug", "[Push] Cancelling summary notification (single chat only)");
    await notifee.cancelNotification(SUMMARY_NOTIFICATION_ID);
    return;
  }

  const totalMessages = digests.reduce((sum, d) => sum + d.newMessages.length, 0);
  const lines = digests.map((d) => `${d.withUser}: ${summarizeBody(d.newMessages.length)}`);

  appLog("info", "[Push] Publishing multi-chat summary notification", {
    chats: digests.length,
    totalMessages,
  });

  try {
    await notifee.displayNotification({
      id: SUMMARY_NOTIFICATION_ID,
      title: `${digests.length} chats`,
      body: `${totalMessages} new messages`,
      data: {
        notification_class: "multi-chat",
      },
      android: {
        channelId: CHANNEL_CHAT_MESSAGES,
        groupId: CHAT_GROUP_ID,
        groupSummary: true,
        smallIcon: SMALL_ICON,
        category: AndroidCategory.MESSAGE,
        visibility: AndroidVisibility.PUBLIC,
        pressAction: {
          id: "open_inbox",
        },
        style: {
          type: AndroidStyle.INBOX,
          lines,
        },
      },
    });
    appLog("info", "[Push] Published multi-chat summary notification");
  } catch (error) {
    appLog("error", "[Push] Failed publishing summary notification", {
      error,
    });
    throw error;
  }
}

export async function initChatNotifications(): Promise<void> {
  if (Platform.OS !== "android") {
    appLog("debug", "[Push] Skipping chat notification channel init on non-Android");
    return;
  }

  const settings = await notifee.getNotificationSettings();
  appLog("info", "[Push] Chat notification settings", settings);

  await notifee.createChannel({
    id: CHANNEL_CHAT_MESSAGES,
    name: "Chat Messages",
    description: "Notifications for new encrypted messages",
    importance: AndroidImportance.HIGH,
    vibration: true,
  });

  appLog("info", "[Push] Chat notification channel ready", {
    channelId: CHANNEL_CHAT_MESSAGES,
  });
}

export async function syncChatNotificationsFromServer(
  wakeChatId?: number,
): Promise<void> {
  if (Platform.OS !== "android") {
    appLog("debug", "[Push] Skipping server sync on non-Android");
    return;
  }

  appLog("info", "[Push] Starting server sync for notifications", { wakeChatId });

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    appLog("warn", "[Push] No current user in storage; cannot build notifications");
    return;
  }

  const cursor = await loadCursor();
  const chats = await listChats();
  appLog("info", "[Push] Loaded chats for notification sync", { chats: chats.length });

  const targets = typeof wakeChatId === "number"
    ? chats.filter((c) => c.chat_id === wakeChatId)
    : chats;

  appLog("debug", "[Push] Notification sync targets", {
    targets: targets.map((c) => c.chat_id),
  });

  const digests: ChatDigest[] = [];

  for (const chat of targets) {
    const cursorKey = String(chat.chat_id);
    const afterId = cursor[cursorKey] ?? 0;
    const newMessages = await fetchNewMessagesForChat(chat.chat_id, afterId);
    appLog("debug", "[Push] Fetched messages for chat", {
      chatId: chat.chat_id,
      fetched: newMessages.length,
      afterId,
    });

    if (newMessages.length === 0) continue;

    const inbound = newMessages.filter((m) => m.sender_id !== currentUser.userId);
    if (inbound.length === 0) {
      appLog("debug", "[Push] No inbound messages for chat", {
        chatId: chat.chat_id,
      });
      cursor[cursorKey] = Math.max(afterId, getNewestMessageId(newMessages));
      continue;
    }

    digests.push({
      chatId: chat.chat_id,
      withUser: chat.with_user,
      newMessages: inbound,
    });

    cursor[cursorKey] = Math.max(afterId, getNewestMessageId(newMessages));
  }

  if (digests.length > 0) {
    const klass = getNotificationClass(digests.length);
    await Promise.all(digests.map((digest) => displaySingleChatDigest(digest, klass)));
    await displaySummary(digests);
    appLog("info", "[Push] Notification publish batch complete", {
      digests: digests.length,
      klass,
    });
  } else {
    appLog("debug", "[Push] No new inbound messages; no notifications published");
  }

  await saveCursor(cursor);
  appLog("debug", "[Push] Notification cursor saved", {
    keys: Object.keys(cursor).length,
  });
}
