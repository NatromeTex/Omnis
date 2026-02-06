/**
 * Chat Context
 * State management for chat functionality
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useReducer,
} from "react";
import {
    createChat as apiCreateChat,
    createEpoch as apiCreateEpoch,
    fetchChat as apiFetchChat,
    fetchEpochKey as apiFetchEpochKey,
    sendMessage as apiSendMessage,
    getPublicKey,
    listChats,
} from "../services/api";
import {
    aesGcmDecrypt,
    aesGcmEncrypt,
    generateAESKey,
    unwrapEpochKey,
    wrapEpochKey,
} from "../services/crypto";
import {
    clearUnreadCount,
    searchChats as dbSearchChats,
    getChat,
    getChats,
    getEpoch,
    getLatestEpoch,
    getLatestMessageId,
    getMessages,
    insertMessage,
    storeUnwrappedEpochKey,
    updateChatLastMessage,
    updateMessagePlaintext,
    upsertChat,
    upsertEpoch,
} from "../services/database";
import type { LocalChat, LocalMessage } from "../types";
import { useApp } from "./AppContext";

// State types
interface ChatState {
  chats: LocalChat[];
  currentChatId: number | null;
  messages: LocalMessage[];
  isLoadingChats: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;
}

type ChatAction =
  | { type: "SET_CHATS"; payload: LocalChat[] }
  | { type: "SET_CURRENT_CHAT"; payload: number | null }
  | { type: "SET_MESSAGES"; payload: LocalMessage[] }
  | { type: "ADD_MESSAGE"; payload: LocalMessage }
  | { type: "SET_LOADING_CHATS"; payload: boolean }
  | { type: "SET_LOADING_MESSAGES"; payload: boolean }
  | { type: "SET_SENDING"; payload: boolean }
  | { type: "UPDATE_CHAT"; payload: Partial<LocalChat> & { chat_id: number } };

// Initial state
const initialState: ChatState = {
  chats: [],
  currentChatId: null,
  messages: [],
  isLoadingChats: false,
  isLoadingMessages: false,
  isSending: false,
};

// Reducer
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "SET_CHATS":
      return { ...state, chats: action.payload };
    case "SET_CURRENT_CHAT":
      return { ...state, currentChatId: action.payload, messages: [] };
    case "SET_MESSAGES":
      return { ...state, messages: action.payload };
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.payload] };
    case "SET_LOADING_CHATS":
      return { ...state, isLoadingChats: action.payload };
    case "SET_LOADING_MESSAGES":
      return { ...state, isLoadingMessages: action.payload };
    case "SET_SENDING":
      return { ...state, isSending: action.payload };
    case "UPDATE_CHAT":
      return {
        ...state,
        chats: state.chats.map((chat) =>
          chat.chat_id === action.payload.chat_id
            ? { ...chat, ...action.payload }
            : chat,
        ),
      };
    default:
      return state;
  }
}

// Context
interface ChatContextValue extends ChatState {
  loadChats: () => Promise<void>;
  searchChats: (query: string) => Promise<void>;
  createChat: (username: string) => Promise<number>;
  openChat: (chatId: number) => Promise<void>;
  closeChat: () => void;
  loadMessages: (chatId: number, beforeId?: number) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  syncChats: () => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// Provider
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { auth, identityPrivateKey, identityPublicKey } = useApp();

  // Load chats from local database
  const loadChats = useCallback(async () => {
    dispatch({ type: "SET_LOADING_CHATS", payload: true });
    try {
      const chats = await getChats();
      dispatch({ type: "SET_CHATS", payload: chats });
    } catch (error) {
      console.error("Failed to load chats:", error);
    } finally {
      dispatch({ type: "SET_LOADING_CHATS", payload: false });
    }
  }, []);

  // Search chats
  const searchChats = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        await loadChats();
        return;
      }

      try {
        const chats = await dbSearchChats(query);
        dispatch({ type: "SET_CHATS", payload: chats });
      } catch (error) {
        console.error("Failed to search chats:", error);
      }
    },
    [loadChats],
  );

  // Sync chats with server
  const syncChats = useCallback(async () => {
    if (!auth.isAuthenticated) return;

    dispatch({ type: "SET_LOADING_CHATS", payload: true });
    try {
      const serverChats = await listChats();

      for (const chat of serverChats) {
        await upsertChat({
          chat_id: chat.chat_id,
          with_user: chat.with_user,
          unread_count: 0,
        });
      }

      const chats = await getChats();
      dispatch({ type: "SET_CHATS", payload: chats });
    } catch (error) {
      console.error("Failed to sync chats:", error);
    } finally {
      dispatch({ type: "SET_LOADING_CHATS", payload: false });
    }
  }, [auth.isAuthenticated]);

  // Create a new chat
  const createChat = useCallback(
    async (username: string): Promise<number> => {
      const response = await apiCreateChat(username);

      await upsertChat({
        chat_id: response.chat_id,
        with_user: username,
        unread_count: 0,
      });

      await loadChats();
      return response.chat_id;
    },
    [loadChats],
  );

  // Open a chat and load messages
  const openChat = useCallback(async (chatId: number) => {
    dispatch({ type: "SET_CURRENT_CHAT", payload: chatId });
    await clearUnreadCount(chatId);
    await loadMessages(chatId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close current chat
  const closeChat = useCallback(() => {
    dispatch({ type: "SET_CURRENT_CHAT", payload: null });
    dispatch({ type: "SET_MESSAGES", payload: [] });
  }, []);

  // Helper: unwrap an epoch key using identity key + peer public key
  const unwrapAndCacheEpochKey = useCallback(
    async (
      epochId: number,
      chatId: number,
      wrappedKey: string,
    ): Promise<string | null> => {
      if (!identityPrivateKey) return null;

      try {
        const chatData = await getChat(chatId);
        if (!chatData) return null;

        const peerKey = await getPublicKey(chatData.with_user);
        const epochKeyBase64 = await unwrapEpochKey(
          wrappedKey,
          identityPrivateKey,
          peerKey.identity_pub,
        );
        await storeUnwrappedEpochKey(epochId, epochKeyBase64);
        return epochKeyBase64;
      } catch (e) {
        console.error(`Failed to unwrap epoch ${epochId}:`, e);
        return null;
      }
    },
    [identityPrivateKey],
  );

  // Helper: get a usable epoch key (from cache or by unwrapping)
  const getEpochKey = useCallback(
    async (
      epochId: number,
      chatId: number,
    ): Promise<string | null> => {
      const epochData = await getEpoch(epochId);
      if (!epochData) return null;

      if (epochData.unwrapped_key) return epochData.unwrapped_key;

      return unwrapAndCacheEpochKey(epochId, chatId, epochData.wrapped_key);
    },
    [unwrapAndCacheEpochKey],
  );

  // Load messages for a chat — supports incremental fetching
  const loadMessages = useCallback(
    async (chatId: number, beforeId?: number) => {
      dispatch({ type: "SET_LOADING_MESSAGES", payload: true });

      try {
        // Fetch new messages from server (incremental for polling)
        if (auth.isAuthenticated) {
          try {
            // For incremental polling, only fetch messages after our latest local ID
            let fetchBeforeId = beforeId;
            const afterId = !beforeId ? await getLatestMessageId(chatId) : undefined;

            const response = await apiFetchChat(chatId, fetchBeforeId);

            // Filter to only truly new messages when polling
            const newMessages = afterId
              ? response.messages.filter((m) => m.id > afterId)
              : response.messages;

            if (newMessages.length > 0) {
              // Collect unique epoch IDs that need key fetching
              const epochIdsToFetch = new Set<number>();
              for (const msg of newMessages) {
                const existingEpoch = await getEpoch(msg.epoch_id);
                if (!existingEpoch) {
                  epochIdsToFetch.add(msg.epoch_id);
                }
              }

              // Fetch missing epoch keys in parallel
              if (epochIdsToFetch.size > 0) {
                await Promise.all(
                  Array.from(epochIdsToFetch).map(async (epochId) => {
                    try {
                      const epochData = await apiFetchEpochKey(chatId, epochId);
                      await upsertEpoch(
                        epochData.epoch_id,
                        chatId,
                        epochData.epoch_index,
                        epochData.wrapped_key,
                      );
                    } catch (error) {
                      console.error(`Failed to fetch epoch ${epochId}:`, error);
                    }
                  }),
                );
              }

              // Decrypt and store new messages
              for (const msg of newMessages) {
                let plaintext: string | undefined;

                try {
                  const epochKey = await getEpochKey(msg.epoch_id, chatId);
                  if (epochKey) {
                    plaintext = await aesGcmDecrypt(
                      msg.ciphertext,
                      msg.nonce,
                      epochKey,
                    );
                  }
                } catch (e) {
                  console.error("Failed to decrypt message:", e);
                }

                await insertMessage({
                  id: msg.id,
                  chat_id: chatId,
                  sender_id: msg.sender_id,
                  epoch_id: msg.epoch_id,
                  ciphertext: msg.ciphertext,
                  nonce: msg.nonce,
                  plaintext,
                  created_at: msg.created_at,
                  synced: true,
                });
              }
            }
          } catch (error) {
            console.error("Failed to fetch from server:", error);
          }
        }

        // Also try to decrypt any locally stored messages that are still encrypted
        if (identityPrivateKey) {
          try {
            const localMsgs = await getMessages(chatId, 50, beforeId);
            for (const msg of localMsgs) {
              if (!msg.plaintext && msg.ciphertext) {
                try {
                  const epochKey = await getEpochKey(msg.epoch_id, chatId);
                  if (epochKey) {
                    const plaintext = await aesGcmDecrypt(
                      msg.ciphertext,
                      msg.nonce,
                      epochKey,
                    );
                    await updateMessagePlaintext(msg.id, plaintext);
                  }
                } catch {
                  // Decryption may fail if key is unavailable
                }
              }
            }
          } catch (error) {
            console.error("Failed to re-decrypt local messages:", error);
          }
        }

        // Load from local database
        const messages = await getMessages(chatId, 50, beforeId);
        const orderedMessages = messages
          .slice()
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
          );
        dispatch({ type: "SET_MESSAGES", payload: orderedMessages });
      } catch (error) {
        console.error("Failed to load messages:", error);
      } finally {
        dispatch({ type: "SET_LOADING_MESSAGES", payload: false });
      }
    },
    [auth.isAuthenticated, identityPrivateKey, getEpochKey],
  );

  // Send a message
  const sendMessage = useCallback(
    async (text: string) => {
      if (!state.currentChatId) {
        throw new Error("No chat selected");
      }
      if (!identityPrivateKey || !identityPublicKey) {
        throw new Error("Encryption keys not available. Please log in again.");
      }

      dispatch({ type: "SET_SENDING", payload: true });

      try {
        const chatId = state.currentChatId;

        // Get or create epoch
        let epochData = await getLatestEpoch(chatId);

        // If no local epoch, or the local epoch has no unwrapped key, try to
        // fetch the latest from the server first
        if (!epochData || (!epochData.unwrapped_key && !identityPrivateKey)) {
          // Fall through to epoch creation below
        }

        if (!epochData) {
          // Need to create a new epoch
          const chat = state.chats.find((c) => c.chat_id === chatId);
          if (!chat) throw new Error("Chat not found");

          // Get peer's public key
          const peerKey = await getPublicKey(chat.with_user);

          // Generate new epoch key
          const epochKeyBase64 = await generateAESKey();

          // Wrap for both parties — ECDH is symmetric:
          // ECDH(A_priv, B_pub) == ECDH(B_priv, A_pub)
          // So the same wrapped blob works for both parties
          const wrappedKey = await wrapEpochKey(
            epochKeyBase64,
            identityPrivateKey,
            peerKey.identity_pub,
          );

          // Create epoch on server (retry on throttle)
          let epochResponse;
          try {
            epochResponse = await apiCreateEpoch(chatId, {
              wrapped_key_a: wrappedKey,
              wrapped_key_b: wrappedKey,
            });
          } catch (err: any) {
            if (err?.status === 429 || err?.message?.includes("throttled")) {
              // Wait for throttle to expire and retry once
              await new Promise((r) => setTimeout(r, 5500));
              epochResponse = await apiCreateEpoch(chatId, {
                wrapped_key_a: wrappedKey,
                wrapped_key_b: wrappedKey,
              });
            } else {
              throw err;
            }
          }

          // Store epoch locally with unwrapped key
          await upsertEpoch(
            epochResponse.epoch_id,
            chatId,
            epochResponse.epoch_index,
            wrappedKey,
            epochKeyBase64,
          );

          epochData = await getLatestEpoch(chatId);
        }

        if (!epochData) throw new Error("Failed to get epoch");

        // Get epoch key
        let epochKeyBase64 = await getEpochKey(epochData.epoch_id, chatId);

        if (!epochKeyBase64) {
          throw new Error("Cannot decrypt epoch key");
        }

        // Encrypt message
        const encrypted = await aesGcmEncrypt(text, epochKeyBase64);

        // Send to server
        const response = await apiSendMessage(chatId, {
          epoch_id: epochData.epoch_id,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
        });

        // Store locally
        const localMessage: LocalMessage = {
          id: response.id,
          chat_id: chatId,
          sender_id: auth.userId!,
          epoch_id: response.epoch_id,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          plaintext: text,
          created_at: response.created_at,
          synced: true,
        };

        await insertMessage(localMessage);
        dispatch({ type: "ADD_MESSAGE", payload: localMessage });

        // Update chat last message
        await updateChatLastMessage(chatId, text, response.created_at);
        dispatch({
          type: "UPDATE_CHAT",
          payload: {
            chat_id: chatId,
            last_message: text,
            last_message_time: response.created_at,
          },
        });
      } catch (error) {
        console.error("Failed to send message:", error);
        throw error;
      } finally {
        dispatch({ type: "SET_SENDING", payload: false });
      }
    },
    [
      state.currentChatId,
      state.chats,
      identityPrivateKey,
      identityPublicKey,
      auth.userId,
      getEpochKey,
    ],
  );

  // Auto-load chats when authenticated
  useEffect(() => {
    if (auth.isAuthenticated) {
      loadChats();
      syncChats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isAuthenticated]);

  useEffect(() => {
    if (!state.currentChatId) return;
    const chatId = state.currentChatId;
    const intervalId = setInterval(() => {
      loadMessages(chatId).catch((error) => {
        console.error("Polling failed:", error);
      });
    }, 3000);

    return () => clearInterval(intervalId);
  }, [state.currentChatId, loadMessages]);

  const value: ChatContextValue = {
    ...state,
    loadChats,
    searchChats,
    createChat,
    openChat,
    closeChat,
    loadMessages,
    sendMessage,
    syncChats,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// Hook
export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
