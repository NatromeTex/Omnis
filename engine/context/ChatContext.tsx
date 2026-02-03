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
    getChats,
    getEpoch,
    getLatestEpoch,
    getMessages,
    insertMessage,
    storeUnwrappedEpochKey,
    updateChatLastMessage,
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

  // Load messages for a chat
  const loadMessages = useCallback(
    async (chatId: number, beforeId?: number) => {
      dispatch({ type: "SET_LOADING_MESSAGES", payload: true });

      try {
        // Try to fetch from server first
        if (auth.isAuthenticated) {
          try {
            const response = await apiFetchChat(chatId, beforeId);

            // Process epochs
            for (const epoch of response.epochs) {
              const existingEpoch = await getEpoch(epoch.epoch_id);
              if (!existingEpoch) {
                await upsertEpoch(
                  epoch.epoch_id,
                  chatId,
                  epoch.epoch_index,
                  epoch.wrapped_key,
                );
              }
            }

            // Process and decrypt messages
            for (const msg of response.messages) {
              let plaintext: string | undefined;

              try {
                const epochData = await getEpoch(msg.epoch_id);
                if (epochData) {
                  let epochKeyBase64: string | null =
                    epochData.unwrapped_key ?? null;

                  if (!epochKeyBase64 && identityPrivateKey) {
                    // Get peer's public key for unwrapping
                    const chat = await getChats().then((chats) =>
                      chats.find((c) => c.chat_id === chatId),
                    );
                    if (chat) {
                      const peerKey = await getPublicKey(chat.with_user);
                      epochKeyBase64 = await unwrapEpochKey(
                        epochData.wrapped_key,
                        identityPrivateKey,
                        peerKey.identity_pub,
                      );
                      await storeUnwrappedEpochKey(
                        msg.epoch_id,
                        epochKeyBase64,
                      );
                    } else {
                      throw new Error("Chat not found");
                    }
                  }

                  if (epochKeyBase64) {
                    plaintext = await aesGcmDecrypt(
                      msg.ciphertext,
                      msg.nonce,
                      epochKeyBase64,
                    );
                  }
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
          } catch (error) {
            console.error("Failed to fetch from server:", error);
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
    [auth.isAuthenticated, identityPrivateKey],
  );

  // Send a message
  const sendMessage = useCallback(
    async (text: string) => {
      if (!state.currentChatId) {
        throw new Error("Cannot send message: not ready");
      }

      dispatch({ type: "SET_SENDING", payload: true });

      try {
        const chatId = state.currentChatId;

        // Get or create epoch
        let epochData = await getLatestEpoch(chatId);

        if (!epochData) {
          if (!identityPrivateKey || !identityPublicKey) {
            throw new Error("Cannot create epoch: missing identity keys");
          }
          // Need to create a new epoch
          const chat = state.chats.find((c) => c.chat_id === chatId);
          if (!chat) throw new Error("Chat not found");

          // Get peer's public key
          const peerKey = await getPublicKey(chat.with_user);

          // Generate new epoch key
          const epochKeyBase64 = await generateAESKey();

          // Wrap for both parties
          const wrappedForMe = await wrapEpochKey(
            epochKeyBase64,
            identityPrivateKey,
            peerKey.identity_pub,
          );
          const wrappedForPeer = await wrapEpochKey(
            epochKeyBase64,
            identityPrivateKey,
            peerKey.identity_pub,
          );

          // Create epoch on server
          const epochResponse = await apiCreateEpoch(chatId, {
            wrapped_key_a: wrappedForMe,
            wrapped_key_b: wrappedForPeer,
          });

          // Store epoch locally
          await upsertEpoch(
            epochResponse.epoch_id,
            chatId,
            epochResponse.epoch_index,
            wrappedForMe,
            epochKeyBase64,
          );

          epochData = await getLatestEpoch(chatId);
        }

        if (!epochData) throw new Error("Failed to get epoch");

        // Get epoch key
        let epochKeyBase64: string | null = epochData.unwrapped_key ?? null;
        if (!epochKeyBase64) {
          if (!identityPrivateKey) {
            throw new Error("Epoch key not available");
          }
          const chat = state.chats.find((c) => c.chat_id === chatId);
          if (!chat) throw new Error("Chat not found");
          const peerKey = await getPublicKey(chat.with_user);
          epochKeyBase64 = await unwrapEpochKey(
            epochData.wrapped_key,
            identityPrivateKey,
            peerKey.identity_pub,
          );
          await storeUnwrappedEpochKey(epochData.epoch_id, epochKeyBase64);
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
    }, 1000);

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
