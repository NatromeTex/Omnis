/**
 * ImageComponent
 * Renders image attachments with loading state and tap-to-fullscreen.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Colors } from "../../theme";

interface ImageComponentProps {
  uri: string | null;
  width?: number;
  height?: number;
  onLoad?: () => void;
}

export function ImageComponent({
  uri,
  width = 240,
  height = 180,
  onLoad,
}: ImageComponentProps) {
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const handleLoad = useCallback(() => {
    setLoading(false);
    onLoad?.();
  }, [onLoad]);

  if (!uri) {
    return (
      <View style={[styles.placeholder, { width, height }]}>
        <ActivityIndicator size="small" color={Colors.accent} />
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setFullscreen(true)}
        style={[styles.container, { width, height }]}
      >
        {loading && (
          <View style={[styles.loadingOverlay, { width, height }]}>
            <ActivityIndicator size="small" color={Colors.accent} />
          </View>
        )}
        <Image
          source={{ uri }}
          style={[styles.image, { width, height }]}
          resizeMode="cover"
          onLoad={handleLoad}
        />
      </Pressable>

      <Modal
        visible={fullscreen}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreen(false)}
      >
        <Pressable
          style={styles.fullscreenOverlay}
          onPress={() => setFullscreen(false)}
        >
          <Image
            source={{ uri }}
            style={styles.fullscreenImage}
            resizeMode="contain"
          />
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: Colors.surface,
  },
  placeholder: {
    borderRadius: 12,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingOverlay: {
    position: "absolute",
    zIndex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.surface,
  },
  image: {
    borderRadius: 12,
  },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullscreenImage: {
    width: "100%",
    height: "100%",
  },
});
