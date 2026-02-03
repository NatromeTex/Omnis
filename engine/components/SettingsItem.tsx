/**
 * SettingsItem Component
 * Individual setting row item
 */

import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from "react-native-reanimated";
import { Colors } from "../theme";

interface BaseSettingsItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  iconColor?: string;
}

interface NavigationSettingsItemProps extends BaseSettingsItemProps {
  type: "navigation";
  onPress: () => void;
}

interface ToggleSettingsItemProps extends BaseSettingsItemProps {
  type: "toggle";
  value: boolean;
  onValueChange: (value: boolean) => void;
}

interface ButtonSettingsItemProps extends BaseSettingsItemProps {
  type: "button";
  onPress: () => void;
  destructive?: boolean;
}

interface ValueSettingsItemProps extends BaseSettingsItemProps {
  type: "value";
  value: string;
  valueColor?: string;
  onPress: () => void;
}

type SettingsItemProps =
  | NavigationSettingsItemProps
  | ToggleSettingsItemProps
  | ButtonSettingsItemProps
  | ValueSettingsItemProps;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function SettingsItem(props: SettingsItemProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (props.type !== "toggle") {
      scale.value = withSpring(0.98, { damping: 15, stiffness: 300 });
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  const handlePress = () => {
    if (props.type === "toggle") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    (props as any).onPress?.();
  };

  const renderRight = () => {
    switch (props.type) {
      case "navigation":
        return (
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        );
      case "toggle":
        return (
          <Switch
            value={props.value}
            onValueChange={(value) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              props.onValueChange(value);
            }}
            trackColor={{ false: Colors.surface, true: Colors.accent }}
            thumbColor={Colors.textPrimary}
          />
        );
      case "value":
        return (
          <View style={styles.valueContainer}>
            <Text
              style={[
                styles.valueText,
                props.valueColor
                  ? { color: props.valueColor, fontWeight: "600" }
                  : null,
              ]}
              numberOfLines={1}
            >
              {props.value}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={Colors.textMuted}
            />
          </View>
        );
      case "button":
        return null;
      default:
        return null;
    }
  };

  const titleColor =
    props.type === "button" && (props as ButtonSettingsItemProps).destructive
      ? Colors.error
      : Colors.textPrimary;

  const Wrapper = props.type === "toggle" ? View : AnimatedPressable;

  return (
    <Wrapper
      style={[styles.container, props.type !== "toggle" && animatedStyle]}
      onPress={props.type !== "toggle" ? handlePress : undefined}
      onPressIn={props.type !== "toggle" ? handlePressIn : undefined}
      onPressOut={props.type !== "toggle" ? handlePressOut : undefined}
    >
      <View style={styles.iconContainer}>
        <Ionicons
          name={props.icon}
          size={22}
          color={props.iconColor || Colors.accent}
        />
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, { color: titleColor }]}>{props.title}</Text>
        {props.subtitle && (
          <Text style={styles.subtitle}>{props.subtitle}</Text>
        )}
      </View>

      {renderRight()}
    </Wrapper>
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
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.surfaceVariant,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "500",
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  valueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  valueText: {
    color: Colors.textSecondary,
    fontSize: 14,
    maxWidth: 120,
  },
});
