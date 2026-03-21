/**
 * VideoComponent
 * Renders video attachments and plays them inline in-app.
 */

import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import React from "react";
import {
  ActivityIndicator,
  Image,
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
  const resolvedVideoUri = uri
    ? (uri.startsWith("file://") ? uri : `file://${uri}`)
    : null;

  const resolvedThumbnailUri = thumbnailUri
    ? (thumbnailUri.startsWith("file://") ? thumbnailUri : `file://${thumbnailUri}`)
    : null;

  const player = useVideoPlayer(resolvedVideoUri, (instance) => {
    instance.loop = false;
  });

  return (
    <View style={[styles.container, { width, height }]}> 
      {resolvedVideoUri ? (
        <VideoView
          player={player}
          style={[styles.video, { width, height }]}
          contentFit="cover"
          nativeControls
          allowsFullscreen
          allowsPictureInPicture
        />
      ) : thumbnailUri ? (
        <Image
          source={{ uri: resolvedThumbnailUri ?? undefined }}
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
      {!resolvedVideoUri && uri && (
        <View style={styles.playOverlay}>
          <View style={styles.playButton}>
            <Ionicons name="play" size={24} color={Colors.textPrimary} />
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
    </View>
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
  video: {
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
