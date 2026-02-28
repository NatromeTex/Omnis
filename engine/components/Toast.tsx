/**
 * Toast Component
 * Lightweight animated toast notification that slides down from the top.
 */

import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../theme";

interface ToastProps {
  /** Message to display */
  message: string | null;
  /** Called when toast finishes hiding (parent should clear the message) */
  onHide?: () => void;
  /** How long the toast stays visible in ms (default 2500) */
  duration?: number;
}

export function Toast({ message, onHide, duration = 2500 }: ToastProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    translateY.value = withTiming(-120, { duration: 250 });
    opacity.value = withTiming(0, { duration: 250 });
    if (onHide) {
      setTimeout(onHide, 260);
    }
  }, [onHide, translateY, opacity]);

  useEffect(() => {
    if (message) {
      // Show
      translateY.value = withTiming(0, { duration: 300 });
      opacity.value = withTiming(1, { duration: 300 });

      // Auto-hide
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(hide, duration);
    }

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [message, duration, hide, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!message) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + 8 },
        animatedStyle,
      ]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 24,
    right: 24,
    zIndex: 9999,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  text: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
});
