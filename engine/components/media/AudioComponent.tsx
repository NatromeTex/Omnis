/**
 * AudioComponent
 * Renders audio attachment as a styled card with play controls.
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "../../theme";

interface AudioComponentProps {
  uri: string | null;
  fileName?: string;
  fileSize?: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AudioComponent({
  uri,
  fileName,
  fileSize,
}: AudioComponentProps) {
  const handlePress = async () => {
    if (uri) {
      try {
        await Linking.openURL(`file://${uri}`);
      } catch {
        console.warn("[AudioComponent] Could not open audio file");
      }
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={styles.container}
      disabled={!uri}
    >
      <View style={styles.iconContainer}>
        <Ionicons
          name={uri ? "musical-notes" : "hourglass-outline"}
          size={24}
          color={Colors.accent}
        />
      </View>
      <View style={styles.info}>
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName || "Audio"}
        </Text>
        {fileSize != null && (
          <Text style={styles.fileSize}>{formatSize(fileSize)}</Text>
        )}
      </View>
      {uri && (
        <Ionicons name="play-circle" size={32} color={Colors.accent} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    width: 240,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceVariant,
    justifyContent: "center",
    alignItems: "center",
  },
  info: {
    flex: 1,
  },
  fileName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "500",
  },
  fileSize: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
