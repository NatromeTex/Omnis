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

export interface Message {
  id: number;
  sender_id: number;
  epoch_id: number;
  reply_id: number | null;
  ciphertext: string;
  nonce: string;
  created_at: string;
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
  message: Message;
}

export interface WsPongFrame {
  type: "pong";
}

export type WsServerFrame = WsHistoryFrame | WsNewMessageFrame | WsPongFrame;
