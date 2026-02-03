/**
 * Chat Screen
 * Individual chat conversation view
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeIn, runOnJS } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, MessageBubble, MessageInput } from "../components";
import { useApp, useChat } from "../context";
import { Colors } from "../theme";
import type { LocalMessage } from "../types";

interface ChatScreenProps {
  chatId: number;
  withUser: string;
  onBack: () => void;
  onOpenProfile: () => void;
}

export function ChatScreen({
  chatId,
  withUser,
  onBack,
  onOpenProfile,
}: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const { auth } = useApp();
  const { messages, isSending, openChat, closeChat, sendMessage } = useChat();

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
      .sort((a, b) => parseUtcTimestamp(a.created_at) - parseUtcTimestamp(b.created_at));
  }, [messages, parseUtcTimestamp]);

  useEffect(() => {
    // debug
    console.log("[ChatScreen] mount", { chatId, withUser });
    openChat(chatId);
    return () => closeChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Swipe right to go back
  const swipeGesture = Gesture.Pan()
    .activeOffsetX(50)
    .onEnd((event) => {
      if (event.translationX > 100) {
        runOnJS(handleBack)();
      }
    });

  const handleBack = () => {
    // debug
    console.log("[ChatScreen] back pressed", { chatId, withUser });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack();
  };

  const handleSend = useCallback(
    async (text: string) => {
      try {
        // debug
        console.log("[ChatScreen] send start", {
          chatId,
          withUser,
          length: text.length,
        });
        await sendMessage(text);
        // debug
        console.log("[ChatScreen] send success", { chatId, withUser });
        // Scroll to bottom after sending
        setTimeout(() => {
          // debug
          console.log("[ChatScreen] scroll to end after send", { chatId });
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } catch (error: any) {
        // debug
        console.error("[ChatScreen] send failed", {
          chatId,
          withUser,
          error: error?.message || error,
        });
        Alert.alert("Error", error.message || "Failed to send message");
      }
    },
    [sendMessage],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: LocalMessage; index: number }) => (
      // debug
      console.log("[ChatScreen] render message", {
        id: item.id,
        epochId: item.epoch_id,
        senderId: item.sender_id,
        index,
      }),
      <MessageBubble
        message={item.plaintext || "[Encrypted]"}
        timestamp={item.created_at}
        isSent={item.sender_id === auth.userId}
        index={index}
      />
    ),
    [auth.userId],
  );

  const renderEmpty = () => (
    <Animated.View
      entering={FadeIn.delay(300).duration(500)}
      style={styles.emptyContainer}
    >
      <Text style={styles.emptyText}>No messages yet. Say hi! 👋</Text>
    </Animated.View>
  );

  return (
    <GestureDetector gesture={swipeGesture}>
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
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
            orderedMessages.length === 0 && styles.messagesContentEmpty,
          ]}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          inverted={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (orderedMessages.length > 0) {
              // debug
              console.log("[ChatScreen] content size changed, scroll", {
                chatId,
                messageCount: orderedMessages.length,
              });
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
        />

        {/* Message Input */}
        <MessageInput
          onSend={handleSend}
          disabled={isSending}
          bottomInset={insets.bottom}
        />
      </KeyboardAvoidingView>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
});
