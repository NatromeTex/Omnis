/**
 * GenericFileComponent
 * Renders any file type attachment as a styled card with icon and file info.
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "../../theme";

interface GenericFileComponentProps {
  uri: string | null;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getIconName(mimeType?: string): string {
  if (!mimeType) return "document-outline";
  if (mimeType.includes("zip") || mimeType.includes("archive") || mimeType.includes("tar"))
    return "file-tray-stacked";
  if (mimeType.includes("text")) return "document-text-outline";
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv")) return "grid-outline";
  return "document-outline";
}

export function GenericFileComponent({
  uri,
  fileName,
  mimeType,
  fileSize,
}: GenericFileComponentProps) {
  const handlePress = async () => {
    if (uri) {
      try {
        await Linking.openURL(`file://${uri}`);
      } catch {
        console.warn("[GenericFileComponent] Could not open file");
      }
    }
  };

  const ext = fileName?.split(".").pop()?.toUpperCase() || "FILE";

  return (
    <Pressable
      onPress={handlePress}
      style={styles.container}
      disabled={!uri}
    >
      <View style={styles.iconContainer}>
        <Ionicons
          name={getIconName(mimeType) as any}
          size={24}
          color={Colors.accent}
        />
      </View>
      <View style={styles.info}>
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName || "File"}
        </Text>
        <Text style={styles.fileMeta}>
          {ext}{fileSize != null ? ` · ${formatSize(fileSize)}` : ""}
        </Text>
      </View>
      {uri ? (
        <Ionicons name="open-outline" size={20} color={Colors.textMuted} />
      ) : (
        <Ionicons name="hourglass-outline" size={20} color={Colors.textMuted} />
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
    borderRadius: 8,
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
  fileMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
