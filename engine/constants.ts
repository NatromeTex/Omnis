/**
 * Application Constants
 */

export const APP_NAME = "Omnis";
export const APP_VERSION = "0.9.0-alpha";

// API Configuration
export const DEFAULT_API_BASE_URL = "http://localhost:8000";

// Crypto Constants
export const PBKDF2_ITERATIONS = 100000;
export const PBKDF2_SALT_LENGTH = 32;
export const AES_KEY_LENGTH = 32; // 256 bits
export const AES_NONCE_LENGTH = 12;
export const HKDF_INFO = "epoch-key-wrap";

// Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: "authToken",
  DEVICE_ID: "deviceId",
  CURRENT_USER_ID: "currentUserId",
  CURRENT_USERNAME: "currentUsername",
  API_BASE_URL: "apiBaseUrl",
  THEME_COLOR: "themeColor",
  ONBOARDING_COMPLETE: "onboardingComplete",
  URL_HISTORY: "urlHistory",
  PERSISTENT_STORAGE: "persistentStorage",
} as const;

// API Endpoints
export const ENDPOINTS = {
  // Auth
  SIGNUP: "/auth/signup",
  LOGIN: "/auth/login",
  LOGOUT: "/auth/logout",
  ME: "/auth/me",
  KEYBLOB: "/auth/keyblob",

  // Sessions
  SESSIONS: "/users/sessions",
  REVOKE_SESSION: "/users/sessions/revoke",
  REVOKE_OTHER_SESSIONS: "/users/sessions/revoke_other",

  // User Public Key
  GET_PKEY: "/user/pkey/get",

  // Users
  USERS_SEARCH: "/users/search",

  // Chat
  CHAT_LIST: "/chat/list",
  CHAT_CREATE: "/chat/create",
  CHAT_FETCH: "/chat/fetch",
  CHAT_WS: "/chat/ws/{chat_id}",
  CHAT_EPOCH: "/chat/{chat_id}/epoch",
  CHAT_FETCH_EPOCH: "/chat/{chat_id}/{epoch_id}/fetch",
  CHAT_MESSAGE: "/chat/{chat_id}/message",

  // Media
  MEDIA_UPLOAD: "/media/upload",
  MEDIA_META: "/media/{media_id}/meta",
  MEDIA_DOWNLOAD: "/media/download/{media_id}",

  // Server version
  VERSION: "/version",
} as const;

// Server version compatibility ranges
// "Reachable" when version is within [min, max] (inclusive)
// "Outdated" when /version endpoint is missing (old server)
// "Incompatible" when version is outside the compatible range
export const COMPATIBLE_VERSION_MIN = 50;
export const COMPATIBLE_VERSION_MAX = 60;

// Message limits
export const MESSAGE_FETCH_LIMIT = 50;
export const MAX_MESSAGE_LENGTH = 4096;

// Media limits
export const MEDIA_CHUNK_MAX_BYTES = 256 * 1024 * 1024; // 256 MiB chunk + metadata envelope
export const MEDIA_AUTO_DOWNLOAD_THRESHOLD = 256 * 1024 * 1024; // 256 MiB
export const MEDIA_UPLOAD_RETRY_MAX = 5;
export const MEDIA_UPLOAD_RETRY_BASE_MS = 1000;
