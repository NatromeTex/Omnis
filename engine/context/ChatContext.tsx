/**
 * Chat Context
 * State management for chat functionality with WebSocket real-time delivery
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useReducer,
    useRef,
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
    getMessage,
    getMessages,
    insertMessage,
    storeUnwrappedEpochKey,
    updateChatLastMessage,
    updateMessagePlaintext,
    upsertChat,
    upsertEpoch,
} from "../services/database";
import { chatSocket } from "../services/websocket";
import type { LocalChat, LocalMessage, Message, WsServerFrame } from "../types";
import { useApp } from "./AppContext";

// State types
interface ChatState {
  chats: LocalChat[];
  currentChatId: number | null;
  messages: LocalMessage[];
  isLoadingChats: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;
  wsConnected: boolean;
}

type ChatAction =
  | { type: "SET_CHATS"; payload: LocalChat[] }
  | { type: "SET_CURRENT_CHAT"; payload: number | null }
  | { type: "SET_MESSAGES"; payload: LocalMessage[] }
  | { type: "ADD_MESSAGE"; payload: LocalMessage }
  | { type: "SET_LOADING_CHATS"; payload: boolean }
  | { type: "SET_LOADING_MESSAGES"; payload: boolean }
  | { type: "SET_SENDING"; payload: boolean }
  | { type: "UPDATE_CHAT"; payload: Partial<LocalChat> & { chat_id: number } }
  | { type: "SET_WS_CONNECTED"; payload: boolean };

// Initial state
const initialState: ChatState = {
  chats: [],
  currentChatId: null,
  messages: [],
  isLoadingChats: false,
  isLoadingMessages: false,
  isSending: false,
  wsConnected: false,
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
      // Deduplicate — the message may already exist from REST fetch
      if (state.messages.some((m) => m.id === action.payload.id)) {
        return {
          ...state,
          messages: state.messages.map((m) =>
            m.id === action.payload.id ? action.payload : m,
          ),
        };
      }
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
    case "SET_WS_CONNECTED":
      return { ...state, wsConnected: action.payload };
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
  sendMessage: (text: string, replyId?: number | null) => Promise<void>;
  syncChats: () => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// Provider
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const { auth, identityPrivateKey, identityPublicKey } = useApp();

  // Refs to avoid stale closures in WS callbacks
  const identityPrivateKeyRef = useRef(identityPrivateKey);
  identityPrivateKeyRef.current = identityPrivateKey;
  const stateRef = useRef(state);
  stateRef.current = state;

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

  // Helper: unwrap an epoch key using identity key + peer public key
  const unwrapAndCacheEpochKey = useCallback(
    async (
      epochId: number,
      chatId: number,
      wrappedKey: string,
    ): Promise<string | null> => {
      const privKey = identityPrivateKeyRef.current;
      if (!privKey) return null;

      try {
        const chatData = await getChat(chatId);
        if (!chatData) return null;

        const peerKey = await getPublicKey(chatData.with_user);
        const epochKeyBase64 = await unwrapEpochKey(
          wrappedKey,
          privKey,
          peerKey.identity_pub,
        );
        await storeUnwrappedEpochKey(epochId, epochKeyBase64);
        return epochKeyBase64;
      } catch (e) {
        console.error(`Failed to unwrap epoch ${epochId}:`, e);
        return null;
      }
    },
    [],
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

  // Decrypt a single server message and store locally
  const decryptAndStoreMessage = useCallback(
    async (msg: Message, chatId: number): Promise<LocalMessage> => {
      let plaintext: string | undefined;

      try {
        // Ensure epoch key is available
        const existingEpoch = await getEpoch(msg.epoch_id);
        if (!existingEpoch) {
          try {
            const epochData = await apiFetchEpochKey(chatId, msg.epoch_id);
            await upsertEpoch(
              epochData.epoch_id,
              chatId,
              epochData.epoch_index,
              epochData.wrapped_key,
            );
          } catch (error) {
            console.error(`Failed to fetch epoch ${msg.epoch_id}:`, error);
          }
        }

        const epochKey = await getEpochKey(msg.epoch_id, chatId);
        if (epochKey) {
          plaintext = await aesGcmDecrypt(msg.ciphertext, msg.nonce, epochKey);
        }
      } catch (e) {
        console.error("Failed to decrypt message:", e);
      }

      const localMsg: LocalMessage = {
        id: msg.id,
        chat_id: chatId,
        sender_id: msg.sender_id,
        epoch_id: msg.epoch_id,
        reply_id: msg.reply_id ?? null,
        ciphertext: msg.ciphertext,
        nonce: msg.nonce,
        plaintext,
        created_at: msg.created_at,
        synced: true,
      };

      await insertMessage(localMsg);
      return localMsg;
    },
    [getEpochKey],
  );

  // =============== WebSocket handler ===============

  const handleWsFrame = useCallback(
    async (frame: WsServerFrame) => {
      const chatId = stateRef.current.currentChatId;
      if (!chatId) return;

      if (frame.type === "history") {
        // Initial history from WS — bulk-store and display
        const epochIdsToFetch = new Set<number>();
        for (const msg of frame.messages) {
          const existing = await getEpoch(msg.epoch_id);
          if (!existing) epochIdsToFetch.add(msg.epoch_id);
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

        for (const msg of frame.messages) {
          await decryptAndStoreMessage(msg, chatId);
        }

        // Also re-decrypt any locally stored messages still encrypted
        if (identityPrivateKeyRef.current) {
          try {
            const localMsgs = await getMessages(chatId, 50);
            for (const msg of localMsgs) {
              if (!msg.plaintext && msg.ciphertext) {
                try {
                  const epochKey = await getEpochKey(msg.epoch_id, chatId);
                  if (epochKey) {
                    const pt = await aesGcmDecrypt(msg.ciphertext, msg.nonce, epochKey);
                    await updateMessagePlaintext(msg.id, pt);
                  }
                } catch { /* key may not be available */ }
              }
            }
          } catch (error) {
            console.error("Failed to re-decrypt local messages:", error);
          }
        }

        // Reload from DB
        const messages = await getMessages(chatId, 50);
        const ordered = messages
          .slice()
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
          );
        dispatch({ type: "SET_MESSAGES", payload: ordered });
      } else if (frame.type === "new_message") {
        const localMsg = await decryptAndStoreMessage(frame.message, chatId);
        dispatch({ type: "ADD_MESSAGE", payload: localMsg });

        // Update chat list
        await updateChatLastMessage(
          chatId,
          localMsg.plaintext || "[Encrypted]",
          localMsg.created_at,
        );
        dispatch({
          type: "UPDATE_CHAT",
          payload: {
            chat_id: chatId,
            last_message: localMsg.plaintext || "[Encrypted]",
            last_message_time: localMsg.created_at,
          },
        });
      }
      // pong frames are ignored
    },
    [decryptAndStoreMessage, getEpochKey],
  );

  // Open a chat — connect WS and load messages
  const openChat = useCallback(
    async (chatId: number) => {
      dispatch({ type: "SET_CURRENT_CHAT", payload: chatId });
      await clearUnreadCount(chatId);

      // Connect WebSocket for real-time delivery
      if (auth.isAuthenticated) {
        chatSocket.connect(
          chatId,
          (frame) => {
            handleWsFrame(frame).catch((e) =>
              console.error("[WS] frame handler error:", e),
            );
          },
          (status) => {
            dispatch({
              type: "SET_WS_CONNECTED",
              payload: status === "connected",
            });
          },
        );
      }

      // Also load messages from DB immediately for instant display
      await loadMessages(chatId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auth.isAuthenticated, handleWsFrame],
  );

  // Close current chat — disconnect WS
  const closeChat = useCallback(() => {
    chatSocket.disconnect();
    dispatch({ type: "SET_CURRENT_CHAT", payload: null });
    dispatch({ type: "SET_MESSAGES", payload: [] });
    dispatch({ type: "SET_WS_CONNECTED", payload: false });
  }, []);

  // Load messages — REST scroll-back / pagination only
  const loadMessages = useCallback(
    async (chatId: number, beforeId?: number) => {
      dispatch({ type: "SET_LOADING_MESSAGES", payload: true });

      try {
        // For initial load or pagination, fetch via REST
        if (auth.isAuthenticated) {
          try {
            const fetchBeforeId = beforeId;
            const afterId = !beforeId
              ? await getLatestMessageId(chatId)
              : undefined;

            const response = await apiFetchChat(chatId, fetchBeforeId);

            const newMessages = afterId
              ? response.messages.filter((m) => m.id > afterId)
              : response.messages;

            if (newMessages.length > 0) {
              const epochIdsToFetch = new Set<number>();
              for (const msg of newMessages) {
                const existingEpoch = await getEpoch(msg.epoch_id);
                if (!existingEpoch) {
                  epochIdsToFetch.add(msg.epoch_id);
                }
              }

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
                      console.error(
                        `Failed to fetch epoch ${epochId}:`,
                        error,
                      );
                    }
                  }),
                );
              }

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
                  reply_id: msg.reply_id ?? null,
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

        // Re-decrypt any locally stored messages that are still encrypted
        if (identityPrivateKeyRef.current) {
          try {
            const localMsgs = await getMessages(chatId, 50, beforeId);
            for (const msg of localMsgs) {
              if (!msg.plaintext && msg.ciphertext) {
                try {
                  const epochKey = await getEpochKey(msg.epoch_id, chatId);
                  if (epochKey) {
                    const pt = await aesGcmDecrypt(
                      msg.ciphertext,
                      msg.nonce,
                      epochKey,
                    );
                    await updateMessagePlaintext(msg.id, pt);
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
    [auth.isAuthenticated, getEpochKey],
  );

  // Send a message (with optional reply)
  const sendMessage = useCallback(
    async (text: string, replyId?: number | null) => {
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

        if (!epochData || (!epochData.unwrapped_key && !identityPrivateKey)) {
          // Fall through to epoch creation below
        }

        if (!epochData) {
          const chat = state.chats.find((c) => c.chat_id === chatId);
          if (!chat) throw new Error("Chat not found");

          const peerKey = await getPublicKey(chat.with_user);
          const epochKeyBase64 = await generateAESKey();

          const wrappedKey = await wrapEpochKey(
            epochKeyBase64,
            identityPrivateKey,
            peerKey.identity_pub,
          );

          let epochResponse;
          try {
            epochResponse = await apiCreateEpoch(chatId, {
              wrapped_key_a: wrappedKey,
              wrapped_key_b: wrappedKey,
            });
          } catch (err: any) {
            if (err?.status === 429 || err?.message?.includes("throttled")) {
              await new Promise((r) => setTimeout(r, 5500));
              epochResponse = await apiCreateEpoch(chatId, {
                wrapped_key_a: wrappedKey,
                wrapped_key_b: wrappedKey,
              });
            } else {
              throw err;
            }
          }

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

        const epochKeyBase64 = await getEpochKey(epochData.epoch_id, chatId);

        if (!epochKeyBase64) {
          throw new Error("Cannot decrypt epoch key");
        }

        // Encrypt message
        const encrypted = await aesGcmEncrypt(text, epochKeyBase64);

        // Send to server (the server will broadcast via WS)
        const response = await apiSendMessage(chatId, {
          epoch_id: epochData.epoch_id,
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          reply_id: replyId ?? undefined,
        });

        // Store locally immediately (WS broadcast will deduplicate)
        const localMessage: LocalMessage = {
          id: response.id,
          chat_id: chatId,
          sender_id: auth.userId!,
          epoch_id: response.epoch_id,
          reply_id: replyId ?? null,
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

  // Disconnect WS when auth changes
  useEffect(() => {
    if (!auth.isAuthenticated) {
      chatSocket.disconnect();
    }
  }, [auth.isAuthenticated]);

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
