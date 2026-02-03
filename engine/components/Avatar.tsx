/**
 * Avatar Component
 * Displays a circular avatar with color and initials
 */

import React, { useMemo } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

interface AvatarProps {
  name: string;
  size?: number;
  style?: object;
}

// Generate a consistent color from a string
function stringToColor(str: string): string {
  const colors = [
    "#E57373",
    "#F06292",
    "#BA68C8",
    "#9575CD",
    "#7986CB",
    "#64B5F6",
    "#4FC3F7",
    "#4DD0E1",
    "#4DB6AC",
    "#81C784",
    "#AED581",
    "#DCE775",
    "#FFD54F",
    "#FFB74D",
    "#FF8A65",
    "#A1887F",
  ];

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

export function Avatar({ name, size = 48, style }: AvatarProps) {
  const backgroundColor = useMemo(() => stringToColor(name), [name]);
  const initial = name.charAt(0).toUpperCase();
  const fontSize = size * 0.4;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
        style,
      ]}
    >
      <Text style={[styles.initial, { fontSize }]}>{initial}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  initial: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});
