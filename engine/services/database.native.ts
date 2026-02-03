/**
 * Local Database Service - Native implementation
 * SQLite database for offline chat storage
 */

import * as SQLite from "expo-sqlite";
import type { LocalChat, LocalMessage } from "../types";

let db: SQLite.SQLiteDatabase | null = null;

/**
 * Initialize the database
 */
export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync("omnis.db");

  // Create tables
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    
    CREATE TABLE IF NOT EXISTS chats (
      chat_id INTEGER PRIMARY KEY,
      with_user TEXT NOT NULL,
      with_user_id INTEGER,
      last_message TEXT,
      last_message_time TEXT,
      unread_count INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      chat_id INTEGER NOT NULL,
      sender_id INTEGER NOT NULL,
      epoch_id INTEGER NOT NULL,
      ciphertext TEXT NOT NULL,
      nonce TEXT NOT NULL,
      plaintext TEXT,
      created_at TEXT NOT NULL,
      synced INTEGER DEFAULT 1,
      FOREIGN KEY (chat_id) REFERENCES chats(chat_id)
    );
    
    CREATE TABLE IF NOT EXISTS epochs (
      epoch_id INTEGER PRIMARY KEY,
      chat_id INTEGER NOT NULL,
      epoch_index INTEGER NOT NULL,
      wrapped_key TEXT NOT NULL,
      unwrapped_key TEXT,
      FOREIGN KEY (chat_id) REFERENCES chats(chat_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_epochs_chat_id ON epochs(chat_id);
  `);
}

/**
 * Get database instance
 */
function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

// ============ Chat Operations ============

/**
 * Upsert a chat
 */
export async function upsertChat(chat: LocalChat): Promise<void> {
  const database = getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO chats (chat_id, with_user, with_user_id, last_message, last_message_time, unread_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      chat.chat_id,
      chat.with_user,
      chat.with_user_id ?? null,
      chat.last_message ?? null,
      chat.last_message_time ?? null,
      chat.unread_count,
    ],
  );
}

/**
 * Get all chats
 */
export async function getChats(): Promise<LocalChat[]> {
  const database = getDb();
  const rows = await database.getAllAsync<LocalChat>(
    `SELECT * FROM chats ORDER BY last_message_time DESC`,
  );
  return rows;
}

/**
 * Get a single chat
 */
export async function getChat(chatId: number): Promise<LocalChat | null> {
  const database = getDb();
  const row = await database.getFirstAsync<LocalChat>(
    `SELECT * FROM chats WHERE chat_id = ?`,
    [chatId],
  );
  return row;
}

/**
 * Update chat's last message
 */
export async function updateChatLastMessage(
  chatId: number,
  lastMessage: string,
  lastMessageTime: string,
): Promise<void> {
  const database = getDb();
  await database.runAsync(
    `UPDATE chats SET last_message = ?, last_message_time = ? WHERE chat_id = ?`,
    [lastMessage, lastMessageTime, chatId],
  );
}

/**
 * Update unread count
 */
export async function updateUnreadCount(
  chatId: number,
  count: number,
): Promise<void> {
  const database = getDb();
  await database.runAsync(
    `UPDATE chats SET unread_count = ? WHERE chat_id = ?`,
    [count, chatId],
  );
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
  const database = getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO messages (id, chat_id, sender_id, epoch_id, ciphertext, nonce, plaintext, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      message.id,
      message.chat_id,
      message.sender_id,
      message.epoch_id,
      message.ciphertext,
      message.nonce,
      message.plaintext ?? null,
      message.created_at,
      message.synced ? 1 : 0,
    ],
  );
}

/**
 * Get messages for a chat
 */
export async function getMessages(
  chatId: number,
  limit: number = 50,
  beforeId?: number,
): Promise<LocalMessage[]> {
  const database = getDb();
  let query = `SELECT * FROM messages WHERE chat_id = ?`;
  const params: (number | string)[] = [chatId];

  if (beforeId) {
    query += ` AND id < ?`;
    params.push(beforeId);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = await database.getAllAsync<LocalMessage>(query, params);
  return rows.reverse(); // Return in chronological order
}

/**
 * Get latest message ID for a chat
 */
export async function getLatestMessageId(
  chatId: number,
): Promise<number | null> {
  const database = getDb();
  const row = await database.getFirstAsync<{ max_id: number | null }>(
    `SELECT MAX(id) as max_id FROM messages WHERE chat_id = ?`,
    [chatId],
  );
  return row?.max_id ?? null;
}

/**
 * Update message plaintext (after decryption)
 */
export async function updateMessagePlaintext(
  messageId: number,
  plaintext: string,
): Promise<void> {
  const database = getDb();
  await database.runAsync(`UPDATE messages SET plaintext = ? WHERE id = ?`, [
    plaintext,
    messageId,
  ]);
}

/**
 * Get unsynced messages
 */
export async function getUnsyncedMessages(): Promise<LocalMessage[]> {
  const database = getDb();
  const rows = await database.getAllAsync<LocalMessage>(
    `SELECT * FROM messages WHERE synced = 0 ORDER BY created_at ASC`,
  );
  return rows;
}

/**
 * Mark message as synced
 */
export async function markMessageSynced(messageId: number): Promise<void> {
  const database = getDb();
  await database.runAsync(`UPDATE messages SET synced = 1 WHERE id = ?`, [
    messageId,
  ]);
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
  const database = getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO epochs (epoch_id, chat_id, epoch_index, wrapped_key, unwrapped_key)
     VALUES (?, ?, ?, ?, ?)`,
    [epochId, chatId, epochIndex, wrappedKey, unwrappedKey ?? null],
  );
}

/**
 * Get epoch by ID
 */
export async function getEpoch(epochId: number): Promise<EpochData | null> {
  const database = getDb();
  return database.getFirstAsync(`SELECT * FROM epochs WHERE epoch_id = ?`, [
    epochId,
  ]);
}

/**
 * Get latest epoch for a chat
 */
export async function getLatestEpoch(
  chatId: number,
): Promise<EpochData | null> {
  const database = getDb();
  return database.getFirstAsync(
    `SELECT * FROM epochs WHERE chat_id = ? ORDER BY epoch_index DESC LIMIT 1`,
    [chatId],
  );
}

/**
 * Store unwrapped epoch key
 */
export async function storeUnwrappedEpochKey(
  epochId: number,
  unwrappedKey: string,
): Promise<void> {
  const database = getDb();
  await database.runAsync(
    `UPDATE epochs SET unwrapped_key = ? WHERE epoch_id = ?`,
    [unwrappedKey, epochId],
  );
}

// ============ Utility Operations ============

/**
 * Clear all data for a specific chat
 */
export async function clearChatData(chatId: number): Promise<void> {
  const database = getDb();
  await database.runAsync(`DELETE FROM messages WHERE chat_id = ?`, [chatId]);
  await database.runAsync(`DELETE FROM epochs WHERE chat_id = ?`, [chatId]);
  await database.runAsync(`DELETE FROM chats WHERE chat_id = ?`, [chatId]);
}

/**
 * Clear all local data
 */
export async function clearAllData(): Promise<void> {
  const database = getDb();
  await database.runAsync(`DELETE FROM messages`);
  await database.runAsync(`DELETE FROM epochs`);
  await database.runAsync(`DELETE FROM chats`);
}

/**
 * Close the database
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}

/**
 * Search chats by username
 */
export async function searchChats(query: string): Promise<LocalChat[]> {
  const database = getDb();
  const rows = await database.getAllAsync<LocalChat>(
    `SELECT * FROM chats WHERE with_user LIKE ? ORDER BY last_message_time DESC`,
    [`%${query}%`],
  );
  return rows;
}
