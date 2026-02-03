/**
 * Header Component
 * Navigation header with back gesture support
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../theme";

interface HeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  leftComponent?: React.ReactNode;
  rightComponent?: React.ReactNode;
  subtitle?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Header({
  title,
  showBack = false,
  onBack,
  leftComponent,
  rightComponent,
  subtitle,
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack?.();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.leftSection}>
        {showBack ? (
          <AnimatedPressable
            style={[styles.backButton, animatedStyle]}
            onPress={handleBack}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
          >
            <Ionicons name="chevron-back" size={28} color={Colors.accent} />
          </AnimatedPressable>
        ) : (
          leftComponent
        )}
      </View>

      <View style={styles.centerSection}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.rightSection}>{rightComponent}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 12,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  leftSection: {
    width: 48,
    alignItems: "flex-start",
  },
  centerSection: {
    flex: 1,
    alignItems: "center",
  },
  rightSection: {
    width: 48,
    alignItems: "flex-end",
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 20,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: "600",
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
});
