/**
 * ReplyPreview Component
 * Shows a preview of the message being replied to, like WhatsApp.
 * Used both inline in MessageBubble and as the reply bar above MessageInput.
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "../theme";

interface ReplyPreviewProps {
  /** Display text of the replied message */
  replyText: string;
  /** Sender name of the replied message */
  replySender?: string;
  /** Whether this preview is inside a sent bubble */
  isSent?: boolean;
  /** Callback when the reply preview is tapped (scroll to original) */
  onPress?: () => void;
  /** Callback to dismiss the reply (only for the input bar variant) */
  onDismiss?: () => void;
  /** Whether this is the input-bar style (with close button) */
  isInputBar?: boolean;
}

export function ReplyPreview({
  replyText,
  replySender,
  isSent = false,
  onPress,
  onDismiss,
  isInputBar = false,
}: ReplyPreviewProps) {
  const content = (
    <View
      style={[
        styles.container,
        isInputBar
          ? styles.containerInputBar
          : isSent
            ? styles.containerSent
            : styles.containerReceived,
      ]}
    >
      <View
        style={[styles.accent, isInputBar && styles.accentInputBar]}
      />
      <View style={[styles.textContainer, isInputBar && styles.textContainerInputBar]}>
        {replySender ? (
          <Text
            style={[styles.sender, isInputBar && styles.senderInputBar]}
            numberOfLines={1}
          >
            {replySender}
          </Text>
        ) : null}
        <Text style={styles.text} numberOfLines={1}>
          {replyText}
        </Text>
      </View>
      {isInputBar && onDismiss ? (
        <Pressable onPress={onDismiss} style={styles.dismissButton} hitSlop={8}>
          <Ionicons name="close" size={18} color={Colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );

  if (onPress && !isInputBar) {
    return (
      <Pressable onPress={onPress} style={styles.pressable}>
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  pressable: {
    width: "100%",
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 4,
    overflow: "hidden",
  },
  containerSent: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  containerReceived: {
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  containerInputBar: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 8,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  accent: {
    width: 3,
    alignSelf: "stretch",
    backgroundColor: Colors.accent,
    borderRadius: 2,
    marginRight: 8,
  },
  accentInputBar: {
    backgroundColor: Colors.accent,
  },
  textContainer: {
    flexShrink: 1,
    gap: 1,
  },
  textContainerInputBar: {
    flex: 1,
  },
  sender: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.accent,
  },
  senderInputBar: {
    color: Colors.accent,
  },
  text: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  dismissButton: {
    marginLeft: 8,
    padding: 2,
  },
});
