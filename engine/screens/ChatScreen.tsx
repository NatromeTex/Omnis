import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    FlatList,
  LayoutChangeEvent,
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
import { Avatar, MessageBubble, MessageInput, ReplyPreview } from "../components";
import { useApp, useChat } from "../context";
import { Colors } from "../theme";
import type { LocalMessage } from "../types";

interface ChatScreenProps {
  chatId: number;
  withUser: string;
  onBack: () => void;
  onOpenProfile: () => void;
}

function SwipeableMessageRow({
  item,
  index,
  isSent,
  replyText,
  replySender,
  onReplyPress,
  onSwipeReply,
}: {
  item: LocalMessage;
  index: number;
  isSent: boolean;
  replyText?: string | null;
  replySender?: string | null;
  onReplyPress?: () => void;
  onSwipeReply: (message: LocalMessage) => void;
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
            message={item.plaintext || "[Encrypted]"}
            timestamp={item.created_at}
            isSent={isSent}
            index={index}
            replyText={replyText}
            replySender={replySender}
            onReplyPress={onReplyPress}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export function ChatScreen({
  chatId,
  withUser,
  onBack,
  onOpenProfile,
}: ChatScreenProps) {
  const flatListRef = useRef<FlatList>(null);
  const { auth } = useApp();
  const { messages, isSending, openChat, closeChat, sendMessage } = useChat();

  // Reply state
  const [replyTo, setReplyTo] = useState<LocalMessage | null>(null);

  // Composer (reply preview + input) height for bottom padding + overlap
  const [composerHeight, setComposerHeight] = useState(72);
  const handleComposerLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.ceil(event.nativeEvent.layout.height);
    setComposerHeight((prev) => (Math.abs(prev - next) > 1 ? next : prev));
  }, []);

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
    openChat(chatId);
    return () => closeChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);



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
    onBack();
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
        });
        await sendMessage(text, replyTo?.id ?? null);
        setReplyTo(null);
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
    [sendMessage, replyTo, chatId, withUser],
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
        replyText: replyMsg.plaintext || "[Encrypted]",
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
        />
      );
    },
    [auth.userId, getReplyInfo, handleScrollToMessage, handleSwipeReply],
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
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
        <View style={styles.flex}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.accent} />
          </Pressable>

          <Pressable onPress={onOpenProfile} style={styles.userInfo}>
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
            { paddingBottom: composerHeight + 12 },
            orderedMessages.length === 0 && styles.messagesContentEmpty,
          ]}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          inverted={false}
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={(info) => {
            // Fallback: scroll to approximate offset
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
          }}
          onContentSizeChange={() => {
            if (orderedMessages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
        />

        {/* Floating composer (no absolute; overlaps via negative margin) */}
        <View
          onLayout={handleComposerLayout}
          style={[styles.composer, { marginTop: -composerHeight }]}
        >
          {replyTo ? (
            <ReplyPreview
              replyText={replyTo.plaintext || "[Encrypted]"}
              replySender={replyToSender ?? undefined}
              onDismiss={handleCancelReply}
              isInputBar
            />
          ) : null}

          <MessageInput onSend={handleSend} disabled={isSending} />
        </View>
        </View>
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
