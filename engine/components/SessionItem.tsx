/**
 * SessionItem Component
 * Displays a session in the profile page
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
    FadeIn,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { Colors } from "../theme";
import type { Session } from "../types";

interface SessionItemProps {
  session: Session;
  onRevoke: (sessionId: number) => void;
  index?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SessionItem({
  session,
  onRevoke,
  index = 0,
}: SessionItemProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handleRevoke = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRevoke(session.id);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDeviceIcon = () => {
    const ua = session.user_agent?.toLowerCase() || "";
    if (
      ua.includes("mobile") ||
      ua.includes("android") ||
      ua.includes("iphone")
    ) {
      return "phone-portrait-outline";
    }
    if (ua.includes("tablet") || ua.includes("ipad")) {
      return "tablet-portrait-outline";
    }
    return "desktop-outline";
  };

  return (
    <Animated.View
      entering={FadeIn.delay(index * 50).duration(300)}
      style={styles.container}
    >
      <View style={styles.iconContainer}>
        <Ionicons
          name={getDeviceIcon()}
          size={24}
          color={Colors.textSecondary}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.deviceId} numberOfLines={1}>
            {session.device_id.slice(0, 8)}...
          </Text>
          {session.current && (
            <View style={styles.currentBadge}>
              <Text style={styles.currentText}>Current</Text>
            </View>
          )}
        </View>
        <Text style={styles.userAgent} numberOfLines={1}>
          {session.user_agent || "Unknown device"}
        </Text>
        <Text style={styles.date}>
          Last active: {formatDate(session.last_accessed)}
        </Text>
      </View>

      {!session.current && (
        <AnimatedPressable
          style={[styles.revokeButton, animatedStyle]}
          onPress={handleRevoke}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <Ionicons name="close-circle" size={24} color={Colors.error} />
        </AnimatedPressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 8,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceVariant,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deviceId: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  currentBadge: {
    backgroundColor: Colors.accent,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  currentText: {
    color: Colors.background,
    fontSize: 10,
    fontWeight: "600",
  },
  userAgent: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  date: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  revokeButton: {
    padding: 8,
  },
});
