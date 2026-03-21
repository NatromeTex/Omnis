/**
 * AudioComponent
 * Renders audio attachment with inline play/pause controls.
 */

import { Ionicons } from "@expo/vector-icons";
import { Audio, type AVPlaybackStatus } from "expo-av";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
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
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [durationMs, setDurationMs] = useState(0);
  const [positionMs, setPositionMs] = useState(0);

  const normalizedUri = uri
    ? (uri.startsWith("file://") ? uri : `file://${uri}`)
    : null;

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      setIsPlaying(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
    setIsPlaying(status.isPlaying);
    setDurationMs(status.durationMillis ?? 0);
    setPositionMs(status.positionMillis ?? 0);

    if (status.didJustFinish) {
      setIsPlaying(false);
      setPositionMs(0);
    }
  };

  const handlePress = async () => {
    if (!normalizedUri) return;

    setIsLoading(true);

    try {
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync(
          { uri: normalizedUri },
          { shouldPlay: true, progressUpdateIntervalMillis: 250 },
          onPlaybackStatusUpdate,
        );
        soundRef.current = sound;
        return;
      }

      const status = await soundRef.current.getStatusAsync();
      if (!status.isLoaded) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        const { sound } = await Audio.Sound.createAsync(
          { uri: normalizedUri },
          { shouldPlay: true, progressUpdateIntervalMillis: 250 },
          onPlaybackStatusUpdate,
        );
        soundRef.current = sound;
        return;
      }

      if (status.isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        if (status.didJustFinish) {
          await soundRef.current.setPositionAsync(0);
        }
        await soundRef.current.playAsync();
      }
    } catch (error) {
      setIsLoading(false);
      console.warn("[AudioComponent] Could not play audio file", error);
    }
  };

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, []);

  const displayDurationMs = Math.max(durationMs, positionMs);
  const timeLabel = formatDuration(positionMs, displayDurationMs);

  return (
    <Pressable
      onPress={handlePress}
      style={styles.container}
      disabled={!normalizedUri}
    >
      <View style={styles.iconContainer}>
        <Ionicons
          name={normalizedUri ? "musical-notes" : "hourglass-outline"}
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
        {normalizedUri ? (
          <Text style={styles.fileSize}>{timeLabel}</Text>
        ) : null}
      </View>
      {normalizedUri && (
        <View style={styles.playWrap}>
          {isLoading ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Ionicons
              name={isPlaying ? "pause-circle" : "play-circle"}
              size={32}
              color={Colors.accent}
            />
          )}
        </View>
      )}
    </Pressable>
  );
}

function formatDuration(positionMs: number, durationMs: number): string {
  const total = Math.max(0, Math.floor((durationMs || 0) / 1000));
  const pos = Math.max(0, Math.floor((positionMs || 0) / 1000));
  const pMin = Math.floor(pos / 60);
  const pSec = pos % 60;
  const tMin = Math.floor(total / 60);
  const tSec = total % 60;
  return `${pMin}:${String(pSec).padStart(2, "0")} / ${tMin}:${String(tSec).padStart(2, "0")}`;
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
  playWrap: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
});
