import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Actions,
  Bubble,
  Composer,
  GiftedChat,
  InputToolbar,
  type ActionsProps,
  type BubbleProps,
  type ComposerProps,
  type InputToolbarProps,
} from "react-native-gifted-chat";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { AttachmentUploadProgress, AttachmentRenderer, ReplyPreview, Toast } from "../components";
import {
  fromLocalMessage,
  fromOptimisticMessage,
  type OmnisGiftedMessage,
  type OptimisticMessage,
} from "../chat";
import { useApp, useChat } from "../context";
import { getCompletedMediaTransfers, upsertMediaTransfer } from "../services/database";
import { mediaManager } from "../services/mediaManager";
import { Colors } from "../theme";
import type {
  MessageAttachment,
  MediaTransferProgress,
  PendingAttachment,
  RootStackParamList,
} from "../types";
import { getMediaType } from "../types";

function isRetryable(message: OmnisGiftedMessage): boolean {
  return message.omnisSource === "optimistic" && message.omnisOptimisticMessage?.state === "failed";
}

function getReplyPreviewText(text: string | undefined, attachmentCount: number): string {
  const parsed = text ? mediaManager.getDisplayText(text).trim() : "";
  if (parsed) return parsed;
  if (attachmentCount === 1) return "Attachment";
  if (attachmentCount > 1) return `${attachmentCount} Attachments`;
  return "Message";
}

function SwipeReplyableBubble({
  enabled,
  onReply,
  children,
}: {
  enabled: boolean;
  onReply: () => void;
  children: ReactNode;
}) {
  const translateX = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const gesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([8, 10_000])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      const next = Math.max(0, Math.min(event.translationX, 88));
      translateX.value = next;
    })
    .onEnd((event) => {
      if (event.translationX >= 72) {
        onReply();
      }
      translateX.value = withTiming(0, {
        duration: 180,
        easing: Easing.inOut(Easing.ease),
      });
    });

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  );
}

export function ChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, "Chat">>();
  const route = useRoute<NativeStackScreenProps<RootStackParamList, "Chat">["route"]>();
  const { chatId, withUser } = route.params;

  const { auth } = useApp();
  const {
    messages,
    isLoadingMessages,
    wsConnected,
    openChat,
    closeChat,
    sendMessage,
    loadMessages,
    getEpochKeyForChat,
  } = useChat();

  const [composerText, setComposerText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const [decryptedPaths, setDecryptedPaths] = useState<Map<string, string>>(new Map());
  const [thumbnailPaths, setThumbnailPaths] = useState<Map<string, string>>(new Map());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<{ id: number; text: string; sender: string } | null>(null);
  const [toolbarLift, setToolbarLift] = useState(0);
  const autoDownloadInFlightRef = useRef(new Set<string>());
  const toolbarHostRef = useRef<View | null>(null);
  const keyboardTopRef = useRef<number | null>(null);

  // On Android, adjustResize handles keyboard avoidance at the OS level.
  // The toolbarLift mechanism is iOS-only to manually push the toolbar above
  // the keyboard before layout updates (keyboardWillShow fires pre-layout).
  const recalcToolbarLift = useCallback((keyboardTop: number | null) => {
    if (Platform.OS === "android") {
      setToolbarLift(0);
      return;
    }

    if (keyboardTop == null || !toolbarHostRef.current) {
      setToolbarLift(0);
      return;
    }

    toolbarHostRef.current.measureInWindow((_x, y, _w, height) => {
      const overlap = y + height - keyboardTop + 6;
      const next = Math.max(0, Math.round(overlap));
      setToolbarLift((prev) => (Math.abs(prev - next) > 1 ? next : prev));
    });
  }, []);

  useEffect(() => {
    const unsub = mediaManager.subscribe((progress: MediaTransferProgress) => {
      setPendingAttachments((prev) =>
        prev.map((pa) =>
          pa.uploadId === progress.uploadId
            ? { ...pa, status: progress.status, progress: progress.progress }
            : pa,
        ),
      );
    });
    return unsub;
  }, []);

  useEffect(() => {
    openChat(chatId).catch((error) => {
      console.error("[ChatScreen] open chat failed", error);
      setToastMessage("Failed to open chat");
    });

    const loadCachedMedia = async () => {
      try {
        const cached = await getCompletedMediaTransfers(chatId);
        const validPaths = new Map<string, string>();
        for (const [uploadId, path] of cached) {
          const info = await mediaManager.getFileInfo(path);
          if (info.exists) {
            validPaths.set(uploadId, path);
          }
        }
        if (validPaths.size > 0) {
          setDecryptedPaths((prev) => {
            const merged = new Map(prev);
            for (const [key, value] of validPaths) {
              merged.set(key, value);
            }
            return merged;
          });
        }
      } catch (error) {
        console.warn("[ChatScreen] failed loading cached media", error);
      }
    };

    loadCachedMedia().catch(() => {});

    return () => {
      closeChat();
      setComposerText("");
      setPendingAttachments([]);
      setOptimisticMessages([]);
      setReplyTarget(null);
    };
  }, [chatId, closeChat, openChat]);

  useEffect(() => {
    // Android resizes the window automatically via adjustResize — no manual
    // keyboard tracking needed. This listener block is iOS-only.
    if (Platform.OS === "android") return;

    const showSub = Keyboard.addListener("keyboardWillShow", (event) => {
      const nextTop = event.endCoordinates?.screenY;
      if (typeof nextTop === "number") {
        keyboardTopRef.current = nextTop;
        requestAnimationFrame(() => {
          recalcToolbarLift(nextTop);
        });
      }
    });

    const hideSub = Keyboard.addListener("keyboardWillHide", () => {
      keyboardTopRef.current = null;
      setToolbarLift(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [recalcToolbarLift]);

  useEffect(() => {
    if (Platform.OS === "android") return;
    if (keyboardTopRef.current == null) return;
    const id = requestAnimationFrame(() => {
      recalcToolbarLift(keyboardTopRef.current);
    });
    return () => cancelAnimationFrame(id);
  }, [composerText, pendingAttachments.length, replyTarget, recalcToolbarLift]);

  const attachmentEpochMap = useMemo(() => {
    const map = new Map<string, { epochId: number; legacyFileKey?: string; legacyNonce?: string }>();
    for (const msg of messages) {
      if (!msg.attachments || msg.attachments.length === 0) continue;
      for (const att of msg.attachments) {
        const entry: { epochId: number; legacyFileKey?: string; legacyNonce?: string } = {
          epochId: msg.epoch_id,
        };
        if (msg.mediaMeta?.attachments) {
          const metaAtt = msg.mediaMeta.attachments.find((a) => a.upload_id === att.upload_id);
          if (metaAtt?.file_key && metaAtt?.nonce) {
            entry.legacyFileKey = metaAtt.file_key;
            entry.legacyNonce = metaAtt.nonce;
          }
        }
        map.set(att.upload_id, entry);
      }
    }
    return map;
  }, [messages]);

  const handleDownloadAttachment = useCallback(
    async (attachment: MessageAttachment, options?: { silent?: boolean }) => {
      try {
        const info = attachmentEpochMap.get(attachment.upload_id);
        if (!info) {
          if (!options?.silent) setToastMessage("Cannot decrypt attachment");
          return;
        }

        let decryptedPath: string;
        if (info.legacyFileKey) {
          decryptedPath = await mediaManager.downloadAndDecrypt(
            attachment,
            info.legacyFileKey,
            info.legacyNonce,
          );
        } else {
          const epochKey = await getEpochKeyForChat(info.epochId, chatId);
          if (!epochKey) {
            if (!options?.silent) setToastMessage("Epoch key unavailable");
            return;
          }
          decryptedPath = await mediaManager.downloadAndDecrypt(
            attachment,
            epochKey,
            attachment.nonce,
          );
        }

        setDecryptedPaths((prev) => new Map(prev).set(attachment.upload_id, decryptedPath));

        await upsertMediaTransfer({
          upload_id: attachment.upload_id,
          chat_id: chatId,
          file_name: attachment.upload_id,
          mime_type: attachment.mime_type,
          file_size: attachment.total_size,
          status: "completed",
          total_chunks: attachment.total_chunks,
          chunks_completed: attachment.total_chunks,
          progress: 1,
          decrypted_path: decryptedPath,
        });

        if (getMediaType(attachment.mime_type) === "video") {
          const thumb = await mediaManager.generateVideoThumbnail(decryptedPath);
          if (thumb) {
            setThumbnailPaths((prev) => new Map(prev).set(attachment.upload_id, thumb));
          }
        }

        if (!options?.silent) setToastMessage("Attachment downloaded");
      } catch (error) {
        console.error("[ChatScreen] attachment download failed", error);
        if (!options?.silent) setToastMessage("Download failed");
      }
    },
    [attachmentEpochMap, chatId, getEpochKeyForChat],
  );

  useEffect(() => {
    let cancelled = false;

    const runAutoDownload = async () => {
      for (const msg of messages) {
        if (!msg.attachments?.length) continue;

        for (const att of msg.attachments) {
          if (cancelled) return;
          if (decryptedPaths.has(att.upload_id)) continue;
          if (autoDownloadInFlightRef.current.has(att.upload_id)) continue;
          if (!mediaManager.shouldAutoDownload(att.total_size)) continue;

          autoDownloadInFlightRef.current.add(att.upload_id);
          try {
            await handleDownloadAttachment(att, { silent: true });
          } finally {
            autoDownloadInFlightRef.current.delete(att.upload_id);
          }
        }
      }
    };

    runAutoDownload().catch((error) => {
      console.warn("[ChatScreen] auto-download failed", error);
    });

    return () => {
      cancelled = true;
    };
  }, [decryptedPaths, handleDownloadAttachment, messages]);

  const replyLookup = useMemo(() => {
    const me = auth.username ?? "Me";
    const map = new Map<number, { text: string; sender: string }>();
    for (const msg of messages) {
      map.set(msg.id, {
        text: getReplyPreviewText(msg.plaintext, msg.attachments?.length ?? 0),
        sender: msg.sender_id === auth.userId ? me : withUser,
      });
    }
    return map;
  }, [auth.userId, auth.username, messages, withUser]);

  const handleSaveAttachment = useCallback(
    async (uploadId: string, fileName: string, mimeType: string) => {
      try {
        const path = decryptedPaths.get(uploadId);
        if (!path) return;
        await mediaManager.saveToPublicStorage(path, fileName, mimeType);
        setToastMessage("Saved to device");
      } catch (error) {
        console.error("[ChatScreen] save attachment failed", error);
        setToastMessage("Save failed");
      }
    },
    [decryptedPaths],
  );

  const pickAttachments = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const prepared: PendingAttachment[] = [];
      for (const asset of result.assets) {
        const out = await mediaManager.prepareUpload(
          asset.uri,
          asset.name,
          asset.mimeType || "application/octet-stream",
          asset.size || 0,
        );
        prepared.push(out.pending);
      }

      setPendingAttachments((prev) => [...prev, ...prepared]);
    } catch (error) {
      console.error("[ChatScreen] attachment pick failed", error);
      setToastMessage("Attachment selection failed");
    }
  }, []);

  const removePendingAttachment = useCallback((uploadId: string) => {
    mediaManager.cancelUpload(uploadId);
    setPendingAttachments((prev) => prev.filter((item) => item.uploadId !== uploadId));
  }, []);

  const sendWithOptimisticState = useCallback(
    async (draft: OptimisticMessage) => {
      setOptimisticMessages((prev) => [draft, ...prev]);

      try {
        await sendMessage(
          draft.text,
          draft.replyId ?? null,
          draft.attachments.length ? draft.attachments : undefined,
        );

        setOptimisticMessages((prev) => prev.filter((item) => item.id !== draft.id));

        if (draft.attachments.length > 0) {
          const sentUploadIds = new Set(draft.attachments.map((item) => item.uploadId));
          setPendingAttachments((prev) => prev.filter((item) => !sentUploadIds.has(item.uploadId)));
        }
      } catch (error: any) {
        const errorMessage = error?.message || "Send failed";
        setOptimisticMessages((prev) =>
          prev.map((item) =>
            item.id === draft.id
              ? { ...item, state: "failed", error: errorMessage }
              : item,
          ),
        );
        setToastMessage(errorMessage);
      }
    },
    [sendMessage],
  );

  const queueSend = useCallback(async () => {
    if (!wsConnected) {
      setToastMessage("Cannot send while disconnected");
      return;
    }

    const text = composerText.trim();
    if (!text && pendingAttachments.length === 0) {
      return;
    }

    const attachmentSnapshot = pendingAttachments.map((item) => ({ ...item, mediaIds: [...item.mediaIds] }));
    const draft: OptimisticMessage = {
      id: `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      createdAt: new Date().toISOString(),
      attachments: attachmentSnapshot,
      replyId: replyTarget?.id ?? null,
      replyText: replyTarget?.text,
      replySender: replyTarget?.sender,
      state: "sending",
    };

    setComposerText("");
    setReplyTarget(null);
    await sendWithOptimisticState(draft);
  }, [composerText, pendingAttachments, replyTarget, sendWithOptimisticState, wsConnected]);

  const retryOptimisticMessage = useCallback(
    async (id: string) => {
      const target = optimisticMessages.find((item) => item.id === id);
      if (!target) return;

      setOptimisticMessages((prev) => prev.filter((item) => item.id !== id));
      const retryDraft: OptimisticMessage = {
        ...target,
        state: "sending",
        error: undefined,
        createdAt: new Date().toISOString(),
      };
      await sendWithOptimisticState(retryDraft);
    },
    [optimisticMessages, sendWithOptimisticState],
  );

  const loadEarlier = useCallback(async () => {
    const sortedAsc = messages.slice().sort((a, b) => a.id - b.id);
    const oldest = sortedAsc[0];
    if (!oldest) return;

    try {
      await loadMessages(chatId, oldest.id);
    } catch (error) {
      console.error("[ChatScreen] pagination failed", error);
    }
  }, [chatId, loadMessages, messages]);

  const giftedMessages = useMemo(() => {
    const userId = auth.userId ?? 0;
    const selfName = auth.username ?? "Me";

    const serverMessages = messages
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((message) => fromLocalMessage(message, userId, withUser, selfName));

    const optimistic = optimisticMessages
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((message) => fromOptimisticMessage(message, userId, selfName));

    const merged = [...optimistic, ...serverMessages];
    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return merged;
  }, [auth.userId, auth.username, messages, optimisticMessages, withUser]);

  const renderBubble = useCallback(
    (props: BubbleProps<OmnisGiftedMessage>) => {
      const currentMessage = props.currentMessage;
      if (!currentMessage) return null;

      const localMessage = currentMessage.omnisLocalMessage;
      const optimistic = currentMessage.omnisOptimisticMessage;

      return (
        <View>
          {localMessage?.reply_id != null && replyLookup.has(localMessage.reply_id) ? (
            <View style={styles.replyBubblePreviewWrap}>
              <ReplyPreview
                replyText={replyLookup.get(localMessage.reply_id)?.text ?? "Message"}
                replySender={replyLookup.get(localMessage.reply_id)?.sender}
                isSent={currentMessage.user._id === (auth.userId ?? 0)}
              />
            </View>
          ) : null}

          <SwipeReplyableBubble
            enabled={currentMessage.omnisSource === "server" && !!currentMessage.omnisLocalMessage}
            onReply={() => {
              const local = currentMessage.omnisLocalMessage;
              if (!local) return;
              const sender = local.sender_id === auth.userId ? (auth.username ?? "Me") : withUser;
              setReplyTarget({
                id: local.id,
                text: getReplyPreviewText(local.plaintext, local.attachments?.length ?? 0),
                sender,
              });
            }}
          >
            <Bubble
              {...props}
              wrapperStyle={{
                left: styles.leftBubble,
                right: styles.rightBubble,
              }}
              textStyle={{
                left: styles.leftBubbleText,
                right: styles.rightBubbleText,
              }}
            />
          </SwipeReplyableBubble>

          {localMessage?.attachments?.length ? (
            <View style={styles.attachmentContainer}>
              <AttachmentRenderer
                attachments={localMessage.attachments}
                mediaMeta={localMessage.mediaMeta}
                decryptedPaths={decryptedPaths}
                thumbnailPaths={thumbnailPaths}
                onDownload={handleDownloadAttachment}
                onSave={handleSaveAttachment}
              />
            </View>
          ) : null}

          {optimistic?.state === "failed" ? (
            <Pressable
              style={styles.retryPill}
              onPress={() => retryOptimisticMessage(optimistic.id)}
            >
              <Ionicons name="refresh" size={14} color={Colors.error} />
              <Text style={styles.retryText}>Retry send</Text>
            </Pressable>
          ) : null}

        </View>
      );
    },
    [auth.userId, auth.username, decryptedPaths, handleDownloadAttachment, handleSaveAttachment, replyLookup, retryOptimisticMessage, thumbnailPaths, withUser],
  );

  const renderInputToolbar = useCallback(
    (props: InputToolbarProps<OmnisGiftedMessage>) => (
      <View
        ref={toolbarHostRef}
        style={toolbarLift > 0 ? { marginBottom: toolbarLift } : undefined}
      >
        <InputToolbar
          {...props}
          containerStyle={styles.toolbarContainer}
          primaryStyle={styles.toolbarPrimary}
        />
      </View>
    ),
    [toolbarLift],
  );

  const renderComposer = useCallback(
    (props: ComposerProps) => (
      <Composer
        {...props}
        textInputProps={{
          ...props.textInputProps,
          placeholder: wsConnected ? "Message" : "Message (offline mode)",
          placeholderTextColor: Colors.textMuted,
          style: styles.composerInput,
          multiline: true,
          editable: wsConnected,
        }}
      />
    ),
    [wsConnected],
  );

  const renderActions = useCallback(
    (props: ActionsProps) => (
      <Actions
        {...props}
        buttonStyle={styles.actionsContainer}
        icon={() => <Ionicons name="attach" size={22} color={Colors.accent} />}
        actions={[
          {
            title: "Attach",
            action: () => {
              if (!wsConnected) {
                setToastMessage("Cannot attach while disconnected");
                return;
              }
              pickAttachments().catch(() => {});
            },
          },
          { title: "Cancel", action: () => {} },
        ]}
      />
    ),
    [pickAttachments, wsConnected],
  );

  const renderSend = useCallback(() => {
    const canSend = wsConnected && (composerText.trim().length > 0 || pendingAttachments.length > 0);
    return (
      <Pressable
        style={styles.sendContainer}
        onPress={() => {
          queueSend().catch((error) => {
            console.error("[ChatScreen] queue send failed", error);
          });
        }}
        disabled={!canSend}
      >
        <View style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}>
          <Ionicons name="send" size={18} color={Colors.accentDark} />
        </View>
      </Pressable>
    );
  }, [composerText, pendingAttachments.length, queueSend, wsConnected]);

  const renderAccessory = useCallback(() => {
    if (!replyTarget) return null;
    return (
      <ReplyPreview
        isInputBar
        replyText={replyTarget.text}
        replySender={replyTarget.sender}
        onDismiss={() => setReplyTarget(null)}
      />
    );
  }, [replyTarget]);

  const handlePressMessage = useCallback((message: OmnisGiftedMessage) => {
    if (isRetryable(message) && message.omnisOptimisticMessage) {
      retryOptimisticMessage(message.omnisOptimisticMessage.id).catch(() => {});
      return;
    }

    if (message.omnisSource === "server" && message.omnisLocalMessage?.attachments?.length) {
      Alert.alert("Attachments", "Use the attachment card controls to download or save media.");
    }
  }, [retryOptimisticMessage]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>{withUser}</Text>
          <Text style={[styles.headerSubtitle, wsConnected ? styles.online : styles.offline]}>
            {wsConnected ? "Connected" : "Reconnecting"}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
      <GiftedChat<OmnisGiftedMessage>
        messages={giftedMessages}
        user={{ _id: auth.userId ?? 0, name: auth.username ?? "Me" }}
        text={composerText}
        textInputProps={{
          onChangeText: setComposerText,
        }}
        onSend={() => {
          queueSend().catch((error) => {
            console.error("[ChatScreen] queue send failed", error);
          });
        }}
        renderBubble={renderBubble}
        renderInputToolbar={renderInputToolbar}
        renderComposer={renderComposer}
        renderActions={renderActions}
        renderSend={renderSend}
        renderAccessory={renderAccessory}
        renderChatFooter={() => (
          <AttachmentUploadProgress
            attachments={pendingAttachments}
            onRemove={removePendingAttachment}
          />
        )}
        onPressMessage={(_context: unknown, message: OmnisGiftedMessage) => handlePressMessage(message)}
        loadEarlierMessagesProps={{
          isAvailable: messages.length >= 50,
          isLoading: isLoadingMessages,
          onPress: loadEarlier,
          isInfiniteScrollEnabled: false,
        }}
        isSendButtonAlwaysVisible
        messagesContainerStyle={styles.messagesContainer}
        listProps={{
          style: styles.messagesList,
          contentContainerStyle: styles.messagesContent,
        }}
        isUsernameVisible={false}
      />

      </KeyboardAvoidingView>

      <Toast
        message={toastMessage}
        onHide={() => setToastMessage(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: {
    marginLeft: 8,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: "700",
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  online: {
    color: Colors.success,
  },
  offline: {
    color: Colors.warning,
  },
  keyboardAvoid: {
    flex: 1,
  },
  messagesContainer: {
    backgroundColor: Colors.background,
  },
  messagesList: {
    backgroundColor: Colors.background,
  },
  messagesContent: {
    paddingBottom: 12,
    backgroundColor: Colors.background,
  },
  leftBubble: {
    backgroundColor: Colors.messageReceived,
    borderBottomLeftRadius: 4,
  },
  rightBubble: {
    backgroundColor: Colors.messageSent,
    borderBottomRightRadius: 4,
  },
  leftBubbleText: {
    color: Colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
  },
  rightBubbleText: {
    color: Colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
  },
  attachmentContainer: {
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  replyBubblePreviewWrap: {
    marginHorizontal: 8,
    marginBottom: 2,
  },
  retryPill: {
    marginTop: 4,
    marginLeft: 12,
    marginBottom: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.error,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  retryText: {
    color: Colors.error,
    fontSize: 12,
    fontWeight: "600",
  },
  toolbarContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  toolbarPrimary: {
    alignItems: "flex-end",
  },
  actionsContainer: {
    marginLeft: 2,
    marginBottom: 4,
    marginRight: 4,
  },
  composerInput: {
    color: Colors.textPrimary,
    backgroundColor: Colors.surface,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    marginRight: 8,
    marginLeft: 4,
    fontSize: 16,
    lineHeight: 20,
  },
  sendContainer: {
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
    marginRight: 2,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.accent,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
});