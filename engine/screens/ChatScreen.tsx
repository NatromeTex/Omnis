import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    FadeIn,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Avatar, MessageBubble, MessageInput, ReplyPreview, Toast, AttachmentUploadProgress } from "../components";
import { useApp, useChat } from "../context";
import { getCompletedMediaTransfers, upsertMediaTransfer } from "../services/database";
import { mediaManager } from "../services/mediaManager";
import { Colors } from "../theme";
import type { LocalMessage, MessageAttachment, MediaTransferProgress, PendingAttachment, RootStackParamList } from "../types";
import { getMediaType } from "../types";

/** Extract display text from a message, handling both plain text and media messages */
function getDisplayText(msg: LocalMessage): string {
  if (!msg.plaintext) return "[Encrypted]";
  return mediaManager.getDisplayText(msg.plaintext);
}

function SwipeableMessageRow({
  item,
  index,
  isSent,
  replyText,
  replySender,
  onReplyPress,
  onSwipeReply,
  decryptedPaths,
  thumbnailPaths,
  onDownloadAttachment,
  onSaveAttachment,
}: {
  item: LocalMessage;
  index: number;
  isSent: boolean;
  replyText?: string | null;
  replySender?: string | null;
  onReplyPress?: () => void;
  onSwipeReply: (message: LocalMessage) => void;
  decryptedPaths?: Map<string, string>;
  thumbnailPaths?: Map<string, string>;
  onDownloadAttachment?: (attachment: MessageAttachment) => void;
  onSaveAttachment?: (uploadId: string, fileName: string, mimeType: string) => void;
}) {
  const translateX = useSharedValue(0);
  const iconOpacity = useSharedValue(0);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX(20)
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      const tx = Math.max(0, Math.min(event.translationX, 80));
      translateX.value = tx;
      iconOpacity.value = tx > 30 ? 1 : tx / 30;
    })
    .onEnd((event) => {
      if (event.translationX > 50) {
        runOnJS(onSwipeReply)(item);
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
      }
      translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      iconOpacity.value = withTiming(0, { duration: 200 });
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
  }));

  return (
    <View style={styles.swipeableRow}>
      <Animated.View style={[styles.replyIconContainer, iconStyle]}>
        <Ionicons name="arrow-undo" size={20} color={Colors.accent} />
      </Animated.View>
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[styles.swipeableContent, rowStyle]}>
          <MessageBubble
            message={getDisplayText(item)}
            timestamp={item.created_at}
            isSent={isSent}
            index={index}
            replyText={replyText}
            replySender={replySender}
            onReplyPress={onReplyPress}
            attachments={item.attachments}
            mediaMeta={item.mediaMeta}
            decryptedPaths={decryptedPaths}
            thumbnailPaths={thumbnailPaths}
            onDownloadAttachment={onDownloadAttachment}
            onSaveAttachment={onSaveAttachment}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export function ChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, "Chat">>();
  const route = useRoute<NativeStackScreenProps<RootStackParamList, "Chat">["route"]>();
  const { chatId, withUser } = route.params;

  const flatListRef = useRef<FlatList>(null);
  const hasInitialScrollDoneRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const { auth } = useApp();
  const { messages, isSending, openChat, closeChat, sendMessage, getEpochKeyForChat } = useChat();

  // Reply state
  const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Media attachment state
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [decryptedPaths, setDecryptedPaths] = useState<Map<string, string>>(new Map());
  const [thumbnailPaths, setThumbnailPaths] = useState<Map<string, string>>(new Map());

  // Composer (reply preview + input) height for bottom padding + overlap
  const [composerHeight, setComposerHeight] = useState(72);
  const handleComposerLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.height);
    setComposerHeight((prev) => (Math.abs(prev - next) > 1 ? next : prev));
  }, []);

  // Subscribe to media upload/download progress
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

  // Attachment picker handler
  const handleAttachPress = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const newPending: PendingAttachment[] = [];

      for (const asset of result.assets) {
        const { pending } = await mediaManager.prepareUpload(
          asset.uri,
          asset.name,
          asset.mimeType || "application/octet-stream",
          asset.size || 0,
        );
        newPending.push(pending);
      }

      setPendingAttachments((prev) => [...prev, ...newPending]);
    } catch (error: any) {
      console.error("[ChatScreen] attachment picker error:", error);
      setToastMessage("Failed to pick file");
    }
  }, []);

  // Remove a pending attachment
  const handleRemoveAttachment = useCallback((uploadId: string) => {
    mediaManager.cancelUpload(uploadId);
    setPendingAttachments((prev) => prev.filter((pa) => pa.uploadId !== uploadId));
  }, []);

  // Build a lookup from upload_id → { epochId, legacyFileKey?, legacyNonce? }
  // For old messages with mediaMeta: use file_key from mediaMeta (backward compat)
  // For new/website messages: use epoch key + attachment.nonce
  const attachmentEpochMap = useMemo(() => {
    const map = new Map<string, { epochId: number; legacyFileKey?: string; legacyNonce?: string }>();
    for (const msg of messages) {
      if (!msg.attachments || msg.attachments.length === 0) continue;
      for (const att of msg.attachments) {
        const entry: { epochId: number; legacyFileKey?: string; legacyNonce?: string } = {
          epochId: msg.epoch_id,
        };
        // Check if this message has old-style mediaMeta with per-file keys
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

  // Download an attachment using the epoch key (website-compatible pipeline)
  const handleDownloadAttachment = useCallback(async (attachment: MessageAttachment) => {
    try {
      const info = attachmentEpochMap.get(attachment.upload_id);
      if (!info) {
        setToastMessage("Cannot decrypt — key unavailable");
        return;
      }

      let decryptedPath: string;

      // Backward compat: if old mediaMeta has per-file key, use it
      if (info.legacyFileKey) {
        setToastMessage("Downloading\u2026");
        decryptedPath = await mediaManager.downloadAndDecrypt(
          attachment,
          info.legacyFileKey,
          info.legacyNonce,
        );
      } else {
        // Standard pipeline: use epoch key + attachment.nonce (from server)
        const epochKey = await getEpochKeyForChat(info.epochId, chatId);
        if (!epochKey) {
          setToastMessage("Cannot decrypt — epoch key unavailable");
          return;
        }
        setToastMessage("Downloading\u2026");
        decryptedPath = await mediaManager.downloadAndDecrypt(
          attachment,
          epochKey,
          attachment.nonce,
        );
      }

      setDecryptedPaths((prev) => new Map(prev).set(attachment.upload_id, decryptedPath));
      // Persist decrypted path to DB for cache persistence
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

      // Generate video thumbnail
      if (getMediaType(attachment.mime_type) === "video") {
        try {
          const thumb = await mediaManager.generateVideoThumbnail(decryptedPath);
          if (thumb) {
            setThumbnailPaths((prev) => new Map(prev).set(attachment.upload_id, thumb));
          }
        } catch { /* non-critical */ }
      }

      setToastMessage("Downloaded");
    } catch (error: any) {
      console.error("[ChatScreen] download error:", error);
      setToastMessage("Download failed");
    }
  }, [attachmentEpochMap, getEpochKeyForChat, chatId]);

  // Save a decrypted attachment to public storage
  const handleSaveAttachment = useCallback(async (uploadId: string, fileName: string, mimeType: string) => {
    try {
      const path = decryptedPaths.get(uploadId);
      if (!path) return;
      await mediaManager.saveToPublicStorage(path, fileName, mimeType);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToastMessage("Saved to gallery");
    } catch (error: any) {
      console.error("[ChatScreen] save error:", error);
      setToastMessage("Failed to save");
    }
  }, [decryptedPaths]);

  // Build a lookup map: message id → LocalMessage (for reply previews)
  const messageMap = useMemo(() => {
    const map = new Map<number, LocalMessage>();
    for (const m of messages) {
      map.set(m.id, m);
    }
    return map;
  }, [messages]);

  const parseUtcTimestamp = useCallback((value: string) => {
    if (!value) return 0;
    if (value.endsWith("Z") || value.includes("+")) {
      return new Date(value).getTime();
    }
    return new Date(`${value}Z`).getTime();
  }, []);

  const orderedMessages = useMemo(() => {
    return messages
      .slice()
      .sort(
        (a, b) =>
          parseUtcTimestamp(a.created_at) - parseUtcTimestamp(b.created_at),
      );
  }, [messages, parseUtcTimestamp]);

  useEffect(() => {
    console.log("[ChatScreen] mount", { chatId, withUser });
    hasInitialScrollDoneRef.current = false;
    isNearBottomRef.current = true;
    previousMessageCountRef.current = 0;

    // Load cached decrypted media paths from DB before messages arrive
    const loadCachedMedia = async () => {
      try {
        const cached = await getCompletedMediaTransfers(chatId);
        const validPaths = new Map<string, string>();
        for (const [uploadId, path] of cached) {
          try {
            const info = await mediaManager.getFileInfo(path);
            if (info.exists) {
              validPaths.set(uploadId, path);
              // Mark as already handled so auto-download skips these
              autoDownloadedRef.current.add(uploadId);
            }
          } catch {
            // File no longer exists — will be re-downloaded
          }
        }
        if (validPaths.size > 0) {
          setDecryptedPaths((prev) => {
            const merged = new Map(prev);
            for (const [k, v] of validPaths) merged.set(k, v);
            return merged;
          });
        }
      } catch (error) {
        console.error("[ChatScreen] failed to load cached media:", error);
      }
    };

    loadCachedMedia().then(() => openChat(chatId));
    return () => closeChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const handleContentSizeChange = useCallback(() => {
    if (orderedMessages.length === 0 || hasInitialScrollDoneRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: false });
    });
    isNearBottomRef.current = true;
    hasInitialScrollDoneRef.current = true;
  }, [orderedMessages.length]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      isNearBottomRef.current = distanceFromBottom <= 100;
    },
    [],
  );

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    const currentCount = orderedMessages.length;

    if (
      hasInitialScrollDoneRef.current &&
      currentCount > previousCount &&
      isNearBottomRef.current
    ) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      });
    }

    previousMessageCountRef.current = currentCount;
  }, [orderedMessages.length]);

  // Auto-download attachments for incoming messages that are below the threshold
  const autoDownloadedRef = useRef(new Set<string>());
  useEffect(() => {
    for (const msg of orderedMessages) {
      if (!msg.attachments || msg.attachments.length === 0) continue;

      for (const att of msg.attachments) {
        // Skip if already downloaded or already attempted
        if (decryptedPaths.has(att.upload_id)) continue;
        if (autoDownloadedRef.current.has(att.upload_id)) continue;

        // Check auto-download threshold
        if (!mediaManager.shouldAutoDownload(att.total_size)) continue;

        autoDownloadedRef.current.add(att.upload_id);

        // Check backward compat: old mediaMeta with per-file key
        if (msg.mediaMeta?.attachments) {
          const metaAtt = msg.mediaMeta.attachments.find(
            (ma) => ma.upload_id === att.upload_id,
          );
          if (metaAtt?.file_key && metaAtt?.nonce) {
            mediaManager.downloadAndDecrypt(att, metaAtt.file_key, metaAtt.nonce)
              .then(async (path) => {
                setDecryptedPaths((prev) => new Map(prev).set(att.upload_id, path));
                await upsertMediaTransfer({
                  upload_id: att.upload_id,
                  chat_id: chatId,
                  file_name: att.upload_id,
                  mime_type: att.mime_type,
                  file_size: att.total_size,
                  status: "completed",
                  total_chunks: att.total_chunks,
                  chunks_completed: att.total_chunks,
                  progress: 1,
                  decrypted_path: path,
                });
                if (getMediaType(att.mime_type) === "video") {
                  const thumb = await mediaManager.generateVideoThumbnail(path).catch(() => null);
                  if (thumb) setThumbnailPaths((prev) => new Map(prev).set(att.upload_id, thumb));
                }
              })
              .catch((err) => console.warn("[AutoDownload]", att.upload_id, err));
            continue;
          }
        }

        // Standard pipeline: use epoch key + attachment.nonce
        getEpochKeyForChat(msg.epoch_id, chatId)
          .then((epochKey) => {
            if (!epochKey) return;
            return mediaManager.downloadAndDecrypt(att, epochKey, att.nonce);
          })
          .then(async (path) => {
            if (path) {
              setDecryptedPaths((prev) => new Map(prev).set(att.upload_id, path));
              await upsertMediaTransfer({
                upload_id: att.upload_id,
                chat_id: chatId,
                file_name: att.upload_id,
                mime_type: att.mime_type,
                file_size: att.total_size,
                status: "completed",
                total_chunks: att.total_chunks,
                chunks_completed: att.total_chunks,
                progress: 1,
                decrypted_path: path,
              });
              if (getMediaType(att.mime_type) === "video") {
                const thumb = await mediaManager.generateVideoThumbnail(path).catch(() => null);
                if (thumb) setThumbnailPaths((prev) => new Map(prev).set(att.upload_id, thumb));
              }
            }
          })
          .catch((err) => console.warn("[AutoDownload]", att.upload_id, err));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedMessages]);



  // Swipe right to go back (screen-level gesture)
  const backSwipeGesture = Gesture.Pan()
    .activeOffsetX(80)
    .onEnd((event) => {
      if (event.translationX > 120) {
        runOnJS(handleBack)();
      }
    });

  const handleBack = () => {
    console.log("[ChatScreen] back pressed", { chatId, withUser });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.goBack();
  };

  // Reply handlers
  const handleSwipeReply = useCallback((message: LocalMessage) => {
    setReplyTo(message);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  const handleScrollToMessage = useCallback(
    (messageId: number) => {
      const idx = orderedMessages.findIndex((m) => m.id === messageId);
      if (idx !== -1 && flatListRef.current) {
        flatListRef.current.scrollToIndex({
          index: idx,
          animated: true,
          viewPosition: 0.5,
        });
      }
    },
    [orderedMessages],
  );

  const handleSend = useCallback(
    async (text: string) => {
      try {
        console.log("[ChatScreen] send start", {
          chatId,
          withUser,
          length: text.length,
          replyId: replyTo?.id,
          attachmentCount: pendingAttachments.length,
        });

        // Pass un-uploaded attachments to sendMessage — uploads happen there with the epoch key
        const attachmentsToSend = pendingAttachments.length > 0
          ? [...pendingAttachments]
          : undefined;

        await sendMessage(text, replyTo?.id ?? null, attachmentsToSend);
        setReplyTo(null);
        setPendingAttachments([]);
        console.log("[ChatScreen] send success", { chatId, withUser });
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } catch (error: any) {
        console.error("[ChatScreen] send failed", {
          chatId,
          withUser,
          error: error?.message || error,
        });
        Alert.alert("Error", error.message || "Failed to send message");
      }
    },
    [sendMessage, replyTo, chatId, withUser, pendingAttachments],
  );

  // Determine sender name for a reply target
  const getReplyInfo = useCallback(
    (replyId: number | null | undefined) => {
      if (!replyId) return { replyText: null, replySender: null };
      const replyMsg = messageMap.get(replyId);
      if (!replyMsg)
        return { replyText: "[Message not found]", replySender: null };
      const senderName =
        replyMsg.sender_id === auth.userId ? "You" : withUser;
      return {
        replyText: getDisplayText(replyMsg),
        replySender: senderName,
      };
    },
    [messageMap, auth.userId, withUser],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: LocalMessage; index: number }) => {
      const isSent = item.sender_id === auth.userId;
      const { replyText, replySender } = getReplyInfo(item.reply_id);

      return (
        <SwipeableMessageRow
          item={item}
          index={index}
          isSent={isSent}
          replyText={replyText}
          replySender={replySender}
          onReplyPress={
            item.reply_id
              ? () => handleScrollToMessage(item.reply_id!)
              : undefined
          }
          onSwipeReply={handleSwipeReply}
          decryptedPaths={decryptedPaths}
          thumbnailPaths={thumbnailPaths}
          onDownloadAttachment={handleDownloadAttachment}
          onSaveAttachment={handleSaveAttachment}
        />
      );
    },
    [auth.userId, getReplyInfo, handleScrollToMessage, handleSwipeReply, decryptedPaths, thumbnailPaths, handleDownloadAttachment, handleSaveAttachment],
  );

  const renderEmpty = () => (
    <Animated.View
      entering={FadeIn.delay(300).duration(500)}
      style={styles.emptyContainer}
    >
      <Text style={styles.emptyText}>No messages yet. Say hi! 👋</Text>
    </Animated.View>
  );

  // Determine the reply-to sender name for the input bar
  const replyToSender = replyTo
    ? replyTo.sender_id === auth.userId
      ? "You"
      : withUser
    : null;

  return (
    <GestureDetector gesture={backSwipeGesture}>
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <View style={styles.flex}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.accent} />
          </Pressable>

          <Pressable onPress={() => navigation.navigate("Profile")} style={styles.userInfo}>
            <Avatar name={withUser} size={40} />
            <View style={styles.userTextContainer}>
              <Text style={styles.userName}>{withUser}</Text>
              <Text style={styles.userStatus}>Tap for profile</Text>
            </View>
          </Pressable>

          <View style={styles.headerRight} />
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={orderedMessages}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={[
            styles.messagesContent,
            { paddingBottom: composerHeight + 8 },
            orderedMessages.length === 0 && styles.messagesContentEmpty,
          ]}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          inverted={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={(info) => {
            // Fallback: scroll to approximate offset
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }}
          onContentSizeChange={handleContentSizeChange}
        />

        {/* Floating composer (no absolute; overlaps via negative margin) */}
        <View
          onLayout={handleComposerLayout}
          style={[styles.composer, { marginTop: -composerHeight }]}
        >
          {replyTo ? (
            <ReplyPreview
              replyText={getDisplayText(replyTo)}
              replySender={replyToSender ?? undefined}
              onDismiss={handleCancelReply}
              isInputBar
            />
          ) : null}

          <AttachmentUploadProgress
            attachments={pendingAttachments}
            onRemove={handleRemoveAttachment}
          />

          <MessageInput
            onSend={handleSend}
            disableSend={isSending || !auth.isAuthenticated}
            disableInput={!auth.isAuthenticated}
            onDisabledPress={() =>
              setToastMessage("Not connected to server. Please check the URL in settings.")
            }
            onAttachPress={auth.isAuthenticated ? handleAttachPress : undefined}
            hasAttachments={pendingAttachments.some((pa) => pa.status === "uploaded" || pa.status === "queued")}
          />
        </View>
        </View>
        <Toast message={toastMessage} onHide={() => setToastMessage(null)} />
      </SafeAreaView>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  userInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 8,
  },
  userTextContainer: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  userStatus: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  headerRight: {
    width: 44,
  },
  messagesContent: {
    padding: 8,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  messagesContentEmpty: {
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  swipeableRow: {
    position: "relative",
  },
  replyIconContainer: {
    position: "absolute",
    left: 8,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 32,
  },
  swipeableContent: {
    width: "100%",
  },
  composer: {
    zIndex: 10,
    elevation: 10,
    backgroundColor: Colors.transparent,
  },
});
