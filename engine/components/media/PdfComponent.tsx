/**
 * PdfComponent
 * Renders PDF attachment as a styled card with an icon and tap to open.
 */

import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "../../theme";

interface PdfComponentProps {
  uri: string | null;
  fileName?: string;
  fileSize?: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PdfComponent({ uri, fileName, fileSize }: PdfComponentProps) {
  const handlePress = async () => {
    if (uri) {
      try {
        await Linking.openURL(`file://${uri}`);
      } catch {
        console.warn("[PdfComponent] Could not open PDF file");
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
          name="document-text"
          size={24}
          color="#E53935"
        />
      </View>
      <View style={styles.info}>
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName || "Document.pdf"}
        </Text>
        <Text style={styles.fileType}>
          PDF{fileSize != null ? ` · ${formatSize(fileSize)}` : ""}
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
    backgroundColor: "#E53935" + "18",
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
  fileType: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
