/**
 * MessageBubble Component
 * Individual message bubble in chat
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { Colors } from "../theme";

interface MessageBubbleProps {
  message: string;
  timestamp: string;
  isSent: boolean;
  index?: number;
}

export function MessageBubble({
  message,
  timestamp,
  isSent,
  index = 0,
}: MessageBubbleProps) {
  const formatTime = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Animated.View
      entering={FadeInUp.delay(index * 30).duration(200)}
      style={[
        styles.container,
        isSent ? styles.containerSent : styles.containerReceived,
      ]}
    >
      <View
        style={[
          styles.bubble,
          isSent ? styles.bubbleSent : styles.bubbleReceived,
        ]}
      >
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.timestamp}>{formatTime(timestamp)}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 2,
    maxWidth: "80%",
  },
  containerSent: {
    alignSelf: "flex-end",
  },
  containerReceived: {
    alignSelf: "flex-start",
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingBottom: 6,
  },
  bubbleSent: {
    backgroundColor: Colors.messageSent,
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    backgroundColor: Colors.messageReceived,
    borderBottomLeftRadius: 4,
  },
  message: {
    color: Colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
  },
  timestamp: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: "right",
    marginTop: 4,
  },
});
