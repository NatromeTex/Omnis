/**
 * Type definitions for Omnis
 */

// User types
export interface User {
  id: number;
  username: string;
}

export interface Session {
  id: number;
  device_id: string;
  user_agent: string | null;
  last_accessed: string;
  created_at: string;
  expires_at: string | null;
  current: boolean;
}

// Auth types
export interface SignupRequest {
  username: string;
  password: string;
  identity_pub: string;
  encrypted_identity_priv: string;
  kdf_salt: string;
  aead_nonce: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
}

export interface KeyBlob {
  identity_pub: string;
  encrypted_identity_priv: string;
  kdf_salt: string;
  aead_nonce: string;
}

// Chat types
export interface Chat {
  chat_id: number;
  with_user: string;
}

// Media / Attachment types
export interface MediaChunkInfo {
  media_id: number;
  chunk_index: number;
  file_size: number;
}

export interface MessageAttachment {
  upload_id: string;
  mime_type: string;
  nonce: string;
  total_chunks: number;
  total_size: number;
  chunks: MediaChunkInfo[];
}

export type MediaType = "image" | "video" | "audio" | "pdf" | "file";

export function getMediaType(mimeType: string): MediaType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "pdf";
  return "file";
}

export type MediaTransferStatus =
  | "queued"
  | "encrypting"
  | "uploading"
  | "uploaded"
  | "downloading"
  | "decrypting"
  | "completed"
  | "failed";

export interface MediaTransferProgress {
  uploadId: string;
  status: MediaTransferStatus;
  progress: number; // 0..1
  chunksCompleted: number;
  totalChunks: number;
  error?: string;
}

export interface PendingAttachment {
  localUri: string;
  mimeType: string;
  fileName: string;
  fileSize: number;
  uploadId: string;
  mediaIds: number[];
  status: MediaTransferStatus;
  progress: number;
  /** Per-file nonce for encryption (generated at prepare time) */
  _nonceBase64?: string;
}

export interface MediaUploadResponse {
  media_id: number;
  upload_id: string;
  chunk_index: number;
  chunks_uploaded: number;
  total_chunks: number;
  complete: boolean;
}

export interface MediaMetaResponse {
  upload_id: string;
  mime_type: string;
  total_chunks: number;
  nonce: string;
  chunks: MediaChunkInfo[];
}

/** Encrypted metadata embedded in message ciphertext for media messages */
export interface MessageMediaMeta {
  text?: string;
  attachments?: {
    upload_id: string;
    file_name: string;
    mime_type: string;
    file_size: number;
    file_key: string; // per-file AES-256-GCM key (base64)
    nonce: string;    // per-file encryption nonce (base64)
  }[];
}

export interface Message {
  id: number;
  sender_id: number;
  epoch_id: number;
  reply_id: number | null;
  ciphertext: string;
  nonce: string;
  created_at: string;
  attachments?: MessageAttachment[];
}

export interface Epoch {
  epoch_id: number;
  epoch_index: number;
  wrapped_key: string;
}

export interface ChatFetchResponse {
  messages: Message[];
  next_cursor: number | null;
}

export interface EpochFetchResponse {
  epoch_id: number;
  epoch_index: number;
  wrapped_key: string;
}

export interface SendMessageRequest {
  epoch_id: number;
  ciphertext: string;
  nonce: string;
  reply_id?: number | null;
  media_ids?: number[];
}

export interface CreateEpochRequest {
  wrapped_key_a: string;
  wrapped_key_b: string;
}

export interface CreateEpochResponse {
  epoch_id: number;
  epoch_index: number;
}

// Local storage types
export interface LocalMessage {
  id: number;
  chat_id: number;
  sender_id: number;
  epoch_id: number;
  reply_id: number | null;
  ciphertext: string;
  nonce: string;
  plaintext?: string; // Decrypted content
  created_at: string;
  synced: boolean;
  attachments?: MessageAttachment[];
  /** Parsed media metadata from decrypted ciphertext */
  mediaMeta?: MessageMediaMeta;
}

export interface LocalChat {
  chat_id: number;
  with_user: string;
  with_user_id?: number;
  last_message?: string;
  last_message_time?: string;
  unread_count: number;
}

// Navigation types
export type RootStackParamList = {
  Onboarding: undefined;
  Home: undefined;
  Chat: { chatId: number; withUser: string };
  Profile: undefined;
  Settings: undefined;
};

// App state types
export interface AuthState {
  isAuthenticated: boolean;
  token: string | null;
  deviceId: string | null;
  userId: number | null;
  username: string | null;
}

export interface AppSettings {
  apiBaseUrl: string;
  themeColor: string;
  persistentStorage: boolean;
}

// WebSocket types
export interface WsHistoryFrame {
  type: "history";
  messages: Message[];
  next_cursor: number | null;
}

export interface WsNewMessageFrame {
  type: "new_message";
  message: Message & { attachments?: MessageAttachment[] };
}

export interface WsPongFrame {
  type: "pong";
}

export type WsServerFrame = WsHistoryFrame | WsNewMessageFrame | WsPongFrame;
