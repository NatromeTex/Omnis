/**
 * MessageInput Component
 * Text input for composing messages
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { MAX_MESSAGE_LENGTH } from "../constants";
import { Colors } from "../theme";
import type { LocalMessage } from "../types";
import { ReplyPreview } from "./ReplyPreview";

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  bottomInset?: number;
  /** The message being replied to */
  replyTo?: LocalMessage | null;
  /** Display name of the reply message sender */
  replyToSender?: string | null;
  /** Called when user dismisses the reply */
  onCancelReply?: () => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MessageInput({
  onSend,
  disabled = false,
  bottomInset = 0,
  replyTo,
  replyToSender,
  onCancelReply,
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const scale = useSharedValue(1);

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && !disabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onSend(trimmedMessage);
      setMessage("");
    }
  };

  const canSend = message.trim().length > 0 && !disabled;

  return (
    <View
      style={[styles.wrapper, { paddingBottom: Math.max(bottomInset, 8) }]}
    >
      {replyTo ? (
        <ReplyPreview
          replyText={replyTo.plaintext || "[Encrypted]"}
          replySender={replyToSender ?? undefined}
          onDismiss={onCancelReply}
          isInputBar
        />
      ) : null}
      <View style={styles.container}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            placeholder="Message"
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            editable={!disabled}
            selectionColor={Colors.accent}
          />
        </View>
        <AnimatedPressable
          style={[
            styles.sendButton,
            canSend && styles.sendButtonActive,
            animatedButtonStyle,
          ]}
          onPress={handleSend}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={!canSend}
        >
          <Ionicons
            name="send"
            size={20}
            color={canSend ? Colors.background : Colors.textMuted}
          />
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 8,
    gap: 8,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 120,
  },
  input: {
    color: Colors.textPrimary,
    fontSize: 16,
    maxHeight: 100,
    minHeight: 24,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonActive: {
    backgroundColor: Colors.accent,
  },
});
