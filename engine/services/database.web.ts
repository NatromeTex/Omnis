/**
 * Local Database Service - Web implementation
 * In-memory storage for web platform
 */

import type { LocalChat, LocalMessage } from "../types";

// In-memory storage for web platform
const memoryDb = {
  chats: new Map<number, LocalChat>(),
  messages: new Map<number, LocalMessage[]>(),
  epochs: new Map<
    number,
    {
      epoch_id: number;
      chat_id: number;
      epoch_index: number;
      wrapped_key: string;
      unwrapped_key: string | null;
    }
  >(),
};

/**
 * Initialize the database (no-op for web)
 */
export async function initDatabase(): Promise<void> {
  console.log("Using in-memory storage for web platform");
}

// ============ Chat Operations ============

/**
 * Upsert a chat
 */
export async function upsertChat(chat: LocalChat): Promise<void> {
  memoryDb.chats.set(chat.chat_id, { ...chat });
}

/**
 * Get all chats
 */
export async function getChats(): Promise<LocalChat[]> {
  return Array.from(memoryDb.chats.values()).sort((a, b) => {
    const timeA = a.last_message_time
      ? new Date(a.last_message_time).getTime()
      : 0;
    const timeB = b.last_message_time
      ? new Date(b.last_message_time).getTime()
      : 0;
    return timeB - timeA;
  });
}

/**
 * Get a single chat
 */
export async function getChat(chatId: number): Promise<LocalChat | null> {
  return memoryDb.chats.get(chatId) ?? null;
}

/**
 * Update chat's last message
 */
export async function updateChatLastMessage(
  chatId: number,
  lastMessage: string,
  lastMessageTime: string,
): Promise<void> {
  const chat = memoryDb.chats.get(chatId);
  if (chat) {
    chat.last_message = lastMessage;
    chat.last_message_time = lastMessageTime;
  }
}

/**
 * Update unread count
 */
export async function updateUnreadCount(
  chatId: number,
  count: number,
): Promise<void> {
  const chat = memoryDb.chats.get(chatId);
  if (chat) {
    chat.unread_count = count;
  }
}

/**
 * Clear unread count for a chat
 */
export async function clearUnreadCount(chatId: number): Promise<void> {
  await updateUnreadCount(chatId, 0);
}

// ============ Message Operations ============

/**
 * Insert a message
 */
export async function insertMessage(message: LocalMessage): Promise<void> {
  const messages = memoryDb.messages.get(message.chat_id) ?? [];
  const existingIndex = messages.findIndex((m) => m.id === message.id);
  if (existingIndex >= 0) {
    messages[existingIndex] = { ...message };
  } else {
    messages.push({ ...message });
  }
  memoryDb.messages.set(message.chat_id, messages);
}

/**
 * Get messages for a chat
 */
export async function getMessages(
  chatId: number,
  limit: number = 50,
  beforeId?: number,
): Promise<LocalMessage[]> {
  let messages = memoryDb.messages.get(chatId) ?? [];

  if (beforeId) {
    messages = messages.filter((m) => m.id < beforeId);
  }

  // Sort by created_at descending, take limit, then reverse
  return messages
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, limit)
    .reverse();
}

/**
 * Get latest message ID for a chat
 */
export async function getLatestMessageId(
  chatId: number,
): Promise<number | null> {
  const messages = memoryDb.messages.get(chatId) ?? [];
  if (messages.length === 0) return null;
  return Math.max(...messages.map((m) => m.id));
}

/**
 * Update message plaintext (after decryption)
 */
export async function updateMessagePlaintext(
  messageId: number,
  plaintext: string,
): Promise<void> {
  for (const messages of memoryDb.messages.values()) {
    const message = messages.find((m) => m.id === messageId);
    if (message) {
      message.plaintext = plaintext;
      break;
    }
  }
}

/**
 * Get unsynced messages
 */
export async function getUnsyncedMessages(): Promise<LocalMessage[]> {
  const unsynced: LocalMessage[] = [];
  for (const messages of memoryDb.messages.values()) {
    unsynced.push(...messages.filter((m) => !m.synced));
  }
  return unsynced.sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}

/**
 * Mark message as synced
 */
export async function markMessageSynced(messageId: number): Promise<void> {
  for (const messages of memoryDb.messages.values()) {
    const message = messages.find((m) => m.id === messageId);
    if (message) {
      message.synced = true;
      break;
    }
  }
}

// ============ Epoch Operations ============

type EpochData = {
  epoch_id: number;
  chat_id: number;
  epoch_index: number;
  wrapped_key: string;
  unwrapped_key: string | null;
};

/**
 * Insert or update an epoch
 */
export async function upsertEpoch(
  epochId: number,
  chatId: number,
  epochIndex: number,
  wrappedKey: string,
  unwrappedKey?: string,
): Promise<void> {
  memoryDb.epochs.set(epochId, {
    epoch_id: epochId,
    chat_id: chatId,
    epoch_index: epochIndex,
    wrapped_key: wrappedKey,
    unwrapped_key: unwrappedKey ?? null,
  });
}

/**
 * Get epoch by ID
 */
export async function getEpoch(epochId: number): Promise<EpochData | null> {
  return memoryDb.epochs.get(epochId) ?? null;
}

/**
 * Get latest epoch for a chat
 */
export async function getLatestEpoch(
  chatId: number,
): Promise<EpochData | null> {
  let latest: EpochData | null = null;
  for (const epoch of memoryDb.epochs.values()) {
    if (epoch.chat_id === chatId) {
      if (!latest || epoch.epoch_index > latest.epoch_index) {
        latest = epoch;
      }
    }
  }
  return latest;
}

/**
 * Store unwrapped epoch key
 */
export async function storeUnwrappedEpochKey(
  epochId: number,
  unwrappedKey: string,
): Promise<void> {
  const epoch = memoryDb.epochs.get(epochId);
  if (epoch) {
    epoch.unwrapped_key = unwrappedKey;
  }
}

// ============ Utility Operations ============

/**
 * Clear all data for a specific chat
 */
export async function clearChatData(chatId: number): Promise<void> {
  memoryDb.chats.delete(chatId);
  memoryDb.messages.delete(chatId);
  for (const [epochId, epoch] of memoryDb.epochs) {
    if (epoch.chat_id === chatId) {
      memoryDb.epochs.delete(epochId);
    }
  }
}

/**
 * Clear all local data
 */
export async function clearAllData(): Promise<void> {
  memoryDb.chats.clear();
  memoryDb.messages.clear();
  memoryDb.epochs.clear();
}

/**
 * Close the database (no-op for web)
 */
export async function closeDatabase(): Promise<void> {
  // No-op for web
}

/**
 * Search chats by username
 */
export async function searchChats(query: string): Promise<LocalChat[]> {
  const lowercaseQuery = query.toLowerCase();
  return Array.from(memoryDb.chats.values())
    .filter((chat) => chat.with_user.toLowerCase().includes(lowercaseQuery))
    .sort((a, b) => {
      const timeA = a.last_message_time
        ? new Date(a.last_message_time).getTime()
        : 0;
      const timeB = b.last_message_time
        ? new Date(b.last_message_time).getTime()
        : 0;
      return timeB - timeA;
    });
}
