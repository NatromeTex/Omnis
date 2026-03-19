/**
 * VideoComponent
 * Renders video attachments with a thumbnail preview and play overlay.
 * Tapping opens the video in the system player.
 */

import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Colors } from "../../theme";

interface VideoComponentProps {
  uri: string | null;
  thumbnailUri?: string | null;
  fileName?: string;
  width?: number;
  height?: number;
}

export function VideoComponent({
  uri,
  thumbnailUri,
  fileName,
  width = 240,
  height = 160,
}: VideoComponentProps) {
  const handlePress = async () => {
    if (uri) {
      try {
        if (Platform.OS === "android") {
          // file:// URIs are blocked by Android's FileProvider.
          // Convert to a content:// URI that the system can open.
          const fileUri = uri.startsWith("file://") ? uri : `file://${uri}`;
          const contentUri = await FileSystem.getContentUriAsync(fileUri);
          await Linking.openURL(contentUri);
        } else {
          await Linking.openURL(`file://${uri}`);
        }
      } catch {
        console.warn("[VideoComponent] Could not open video file");
      }
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.container, { width, height }]}
    >
      {thumbnailUri ? (
        <Image
          source={{ uri: `file://${thumbnailUri}` }}
          style={[styles.thumbnail, { width, height }]}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.placeholder, { width, height }]}>
          {!uri ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Ionicons name="videocam" size={32} color={Colors.textMuted} />
          )}
        </View>
      )}
      {uri && (
        <View style={styles.playOverlay}>
          <View style={styles.playButton}>
            <Ionicons name="play" size={28} color={Colors.textPrimary} />
          </View>
        </View>
      )}
      {fileName && (
        <View style={styles.nameOverlay}>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surface,
    position: "relative",
  },
  thumbnail: {
    borderRadius: 12,
  },
  placeholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  playButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingLeft: 4,
  },
  nameOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  fileName: {
    color: Colors.textPrimary,
    fontSize: 11,
  },
});
