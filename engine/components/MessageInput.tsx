/**
 * MessageInput Component
 * Text input and send button for composing messages.
 * No inset or keyboard handling — that is the parent's job
 * (SafeAreaView for nav-bar space, adjustResize for keyboard).
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputContentSizeChangeEvent,
  View,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { MAX_MESSAGE_LENGTH } from "../constants";
import { Colors } from "../theme";

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  disableSend?: boolean;
  disableInput?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const MIN_INPUT_HEIGHT = 44;
const INPUT_LINE_HEIGHT = 20;
const MAX_INPUT_LINES = 5;
const MAX_INPUT_HEIGHT = INPUT_LINE_HEIGHT * MAX_INPUT_LINES + 20;

export function MessageInput({
  onSend,
  disabled = false,
  disableSend,
  disableInput,
}: MessageInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [message, setMessage] = useState("");
  const [inputHeight, setInputHeight] = useState(MIN_INPUT_HEIGHT);
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

  const isSendDisabled = disableSend ?? disabled;
  const isInputDisabled = disableInput ?? disabled;

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && !isSendDisabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onSend(trimmedMessage);
      setMessage("");
      setInputHeight(MIN_INPUT_HEIGHT);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  };

  const handleContentSizeChange = useCallback(
    (event: TextInputContentSizeChangeEvent) => {
      const contentSize = event.nativeEvent.contentSize;
      const nextHeight = Math.max(
        MIN_INPUT_HEIGHT,
        Math.min(
          Math.ceil(contentSize.height),
          MAX_INPUT_HEIGHT,
        ),
      );
      setInputHeight((prev) => (Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));
    },
    [],
  );

  const canSend = message.trim().length > 0 && !isSendDisabled;

  return (
    <View style={styles.container}>
      <TextInput
        ref={inputRef}
        style={[styles.input, { height: inputHeight }]}
        value={message}
        onChangeText={setMessage}
        onContentSizeChange={handleContentSizeChange}
        placeholder="Message"
        placeholderTextColor={Colors.textMuted}
        multiline
        scrollEnabled
        blurOnSubmit={false}
        maxLength={MAX_MESSAGE_LENGTH}
        editable={!isInputDisabled}
        selectionColor={Colors.accent}
      />

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
          color={canSend ? Colors.accentDark : Colors.textMuted}
        />
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    lineHeight: INPUT_LINE_HEIGHT,
    textAlignVertical: "top",
    color: Colors.textPrimary,
    fontSize: 16,
    minHeight: MIN_INPUT_HEIGHT,
    maxHeight: MAX_INPUT_HEIGHT,
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
