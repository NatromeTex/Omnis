/**
 * API Service
 * Handles all communication with the Omnis backend
 */

import { ENDPOINTS } from "../constants";
import type {
    Chat,
    ChatFetchResponse,
    CreateEpochRequest,
    CreateEpochResponse,
    EpochFetchResponse,
    KeyBlob,
    LoginRequest,
    LoginResponse,
    SendMessageRequest,
    Session,
    SignupRequest,
    User,
} from "../types";
import { clearAllData } from "./database";
import { getApiBaseUrl, getAuthToken, getDeviceId, clearAuthToken, clearCurrentUser } from "./storage";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function normalizeUtcTimestamp(value?: string | null): string | null {
  if (!value) return value ?? null;
  if (value.endsWith("Z") || value.includes("+")) return value;
  return `${value}Z`;
}

/**
 * Make an API request
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  requiresAuth: boolean = true,
): Promise<T> {
  const baseUrl = await getApiBaseUrl();
  const url = `${baseUrl}${endpoint}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (requiresAuth) {
    const token = await getAuthToken();
    const deviceId = await getDeviceId();

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    headers["X-Device-ID"] = deviceId;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage: string;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.detail || errorJson.message || errorText;
    } catch {
      errorMessage =
        errorText || `Request failed with status ${response.status}`;
    }

    // If auth is broken (401 Unauthorized), clear local database to prevent data leaks
    if (response.status === 401 && requiresAuth) {
      console.warn("[API] Auth broken, clearing local database for security");
      try {
        await clearAllData();
        await clearAuthToken();
        await clearCurrentUser();
      } catch (clearError) {
        console.error("[API] Failed to clear data on auth error:", clearError);
      }
    }

    throw new ApiError(errorMessage, response.status);
  }

  return response.json();
}

// ============ Auth API ============

/**
 * Sign up a new user
 */
export async function signup(data: SignupRequest): Promise<User> {
  return request<User>(
    ENDPOINTS.SIGNUP,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    false,
  );
}

/**
 * Login user
 */
export async function login(data: LoginRequest): Promise<LoginResponse> {
  const deviceId = await getDeviceId();

  return request<LoginResponse>(
    ENDPOINTS.LOGIN,
    {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "X-Device-ID": deviceId,
      },
    },
    false,
  );
}

/**
 * Logout user
 */
export async function logout(): Promise<{ status: string }> {
  return request<{ status: string }>(ENDPOINTS.LOGOUT, {
    method: "POST",
  });
}

/**
 * Get current user info
 */
export async function getMe(): Promise<User> {
  return request<User>(ENDPOINTS.ME);
}

/**
 * Get user's key blob
 */
export async function getKeyBlob(): Promise<KeyBlob> {
  return request<KeyBlob>(ENDPOINTS.KEYBLOB);
}

// ============ Session API ============

/**
 * Get all sessions
 */
export async function getSessions(): Promise<Session[]> {
  const sessions = await request<Session[]>(ENDPOINTS.SESSIONS);
  return sessions.map((session) => ({
    ...session,
    last_accessed: normalizeUtcTimestamp(session.last_accessed) ||
      session.last_accessed,
    created_at: normalizeUtcTimestamp(session.created_at) || session.created_at,
    expires_at: normalizeUtcTimestamp(session.expires_at) ?? session.expires_at,
  }));
}

/**
 * Revoke a specific session
 */
export async function revokeSession(
  sessionId: number,
): Promise<{ status: string }> {
  return request<{ status: string }>(
    `${ENDPOINTS.REVOKE_SESSION}/${sessionId}`,
    {
      method: "DELETE",
    },
  );
}

/**
 * Revoke all other sessions
 */
export async function revokeOtherSessions(): Promise<{ status: string }> {
  return request<{ status: string }>(ENDPOINTS.REVOKE_OTHER_SESSIONS, {
    method: "DELETE",
  });
}

// ============ Public Key API ============

/**
 * Publish identity key material
 */
export async function publishPublicKey(data: {
  identity_pub: string;
  encrypted_identity_priv: string;
  kdf_salt: string;
  aead_nonce: string;
}): Promise<{ status: string }> {
  return request<{ status: string }>(ENDPOINTS.PUBLISH_PKEY, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Get user's public key by username
 */
export async function getPublicKey(username: string): Promise<{
  username: string;
  identity_pub: string;
}> {
  return request<{ username: string; identity_pub: string }>(
    `${ENDPOINTS.GET_PKEY}?username=${encodeURIComponent(username)}`,
    {},
    false,
  );
}

// ============ Chat API ============

/**
 * List all chats
 */
export async function listChats(): Promise<Chat[]> {
  return request<Chat[]>(ENDPOINTS.CHAT_LIST);
}

/**
 * Create a new chat
 */
export async function createChat(
  username: string,
): Promise<{ chat_id: number }> {
  return request<{ chat_id: number }>(ENDPOINTS.CHAT_CREATE, {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

/**
 * Fetch chat messages
 */
export async function fetchChat(
  chatId: number,
  beforeId?: number,
  limit: number = 50,
): Promise<ChatFetchResponse> {
  let url = `${ENDPOINTS.CHAT_FETCH}/${chatId}?limit=${limit}`;
  if (beforeId) {
    url += `&before_id=${beforeId}`;
  }
  const response = await request<ChatFetchResponse>(url);
  return {
    ...response,
    messages: response.messages.map((message) => ({
      ...message,
      created_at: normalizeUtcTimestamp(message.created_at) || message.created_at,
    })),
  };
}

/**
 * Create a new epoch
 */
export async function createEpoch(
  chatId: number,
  data: CreateEpochRequest,
): Promise<CreateEpochResponse> {
  const endpoint = ENDPOINTS.CHAT_EPOCH.replace("{chat_id}", chatId.toString());
  return request<CreateEpochResponse>(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Fetch epoch key for a specific epoch
 * Used for on-demand epoch key fetching when keys are not included in chat fetch response
 */
export async function fetchEpochKey(
  chatId: number,
  epochId: number,
): Promise<EpochFetchResponse> {
  const endpoint = ENDPOINTS.CHAT_FETCH_EPOCH
    .replace("{chat_id}", chatId.toString())
    .replace("{epoch_id}", epochId.toString());
  return request<EpochFetchResponse>(endpoint);
}

/**
 * Send a message
 */
export async function sendMessage(
  chatId: number,
  data: SendMessageRequest,
): Promise<{ id: number; epoch_id: number; created_at: string }> {
  const endpoint = ENDPOINTS.CHAT_MESSAGE.replace(
    "{chat_id}",
    chatId.toString(),
  );
  const response = await request<{
    id: number;
    epoch_id: number;
    created_at: string;
  }>(
    endpoint,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
  return {
    ...response,
    created_at: normalizeUtcTimestamp(response.created_at) || response.created_at,
  };
}

/**
 * Health check
 */
export async function healthCheck(): Promise<{ PING: string }> {
  const baseUrl = await getApiBaseUrl();
  const response = await fetch(`${baseUrl}/`);
  return response.json();
}

export { ApiError };
