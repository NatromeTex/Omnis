/**
 * AttachmentRenderer
 * Dynamically renders one or more attachments for a message.
 * Picks the right component based on MIME type.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getMediaType } from "../../types";
import type { MessageAttachment, MessageMediaMeta } from "../../types";
import { Colors } from "../../theme";
import { getExtensionFromMime } from "../../services/mediaManager";
import { ImageComponent } from "./ImageComponent";
import { VideoComponent } from "./VideoComponent";
import { AudioComponent } from "./AudioComponent";
import { PdfComponent } from "./PdfComponent";
import { GenericFileComponent } from "./GenericFileComponent";

interface AttachmentRendererProps {
  /** Server-side attachment metadata (from message payload) */
  attachments?: MessageAttachment[];
  /** Parsed media metadata from decrypted ciphertext */
  mediaMeta?: MessageMediaMeta | null;
  /** Map of upload_id → decrypted local file path */
  decryptedPaths?: Map<string, string>;
  /** Map of upload_id → video thumbnail path */
  thumbnailPaths?: Map<string, string>;
  /** Called when user taps an attachment to download/save */
  onDownload?: (attachment: MessageAttachment) => void;
  /** Called when user taps to save a decrypted file */
  onSave?: (uploadId: string, fileName: string, mimeType: string) => void;
}

function buildFallbackFileName(mimeType: string): string {
  const type = getMediaType(mimeType);
  const ext = getExtensionFromMime(mimeType);
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `Omnis_${type}_${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}${ext}`;
}

export function AttachmentRenderer({
  attachments,
  mediaMeta,
  decryptedPaths,
  thumbnailPaths,
  onDownload,
  onSave,
}: AttachmentRendererProps) {
  if (!attachments || attachments.length === 0) return null;

  // Build a lookup from upload_id → meta info
  const metaLookup = new Map<string, {
    file_name: string;
    mime_type: string;
    file_size: number;
    nonce: string;
  }>();

  if (mediaMeta?.attachments) {
    for (const a of mediaMeta.attachments) {
      metaLookup.set(a.upload_id, a);
    }
  }

  return (
    <View style={styles.container}>
      {attachments.map((att, idx) => {
        const meta = metaLookup.get(att.upload_id);
        const mimeType = meta?.mime_type || att.mime_type;
        const fileName = meta?.file_name || buildFallbackFileName(mimeType);
        const fileSize = meta?.file_size || att.total_size;
        const mediaType = getMediaType(mimeType);
        const decryptedPath = decryptedPaths?.get(att.upload_id) || null;
        const thumbnailPath = thumbnailPaths?.get(att.upload_id) || null;
        const uri = decryptedPath ? `file://${decryptedPath}` : null;

        return (
          <View key={att.upload_id || idx} style={styles.attachmentItem}>
            {renderAttachment(
              mediaType,
              uri,
              decryptedPath,
              thumbnailPath,
              fileName,
              mimeType,
              fileSize,
            )}
            {!decryptedPath && (
              <Pressable
                style={styles.downloadOverlay}
                onPress={() => onDownload?.(att)}
              >
                <View style={styles.downloadButton}>
                  <Ionicons name="download-outline" size={20} color={Colors.textPrimary} />
                  <Text style={styles.downloadText}>
                    {formatSize(fileSize)}
                  </Text>
                </View>
              </Pressable>
            )}
            {decryptedPath && onSave && (
              <Pressable
                style={styles.saveButton}
                onPress={() => onSave(att.upload_id, fileName, mimeType)}
              >
                <Ionicons name="save-outline" size={16} color={Colors.accent} />
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

function renderAttachment(
  mediaType: string,
  uri: string | null,
  decryptedPath: string | null,
  thumbnailPath: string | null,
  fileName: string,
  mimeType: string,
  fileSize: number,
) {
  switch (mediaType) {
    case "image":
      return <ImageComponent uri={uri} />;
    case "video":
      return (
        <VideoComponent
          uri={decryptedPath}
          thumbnailUri={thumbnailPath}
          fileName={fileName}
        />
      );
    case "audio":
      return (
        <AudioComponent
          uri={decryptedPath}
          fileName={fileName}
          fileSize={fileSize}
        />
      );
    case "pdf":
      return (
        <PdfComponent
          uri={decryptedPath}
          fileName={fileName}
          fileSize={fileSize}
        />
      );
    default:
      return (
        <GenericFileComponent
          uri={decryptedPath}
          fileName={fileName}
          mimeType={mimeType}
          fileSize={fileSize}
        />
      );
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    marginBottom: 4,
  },
  attachmentItem: {
    position: "relative",
  },
  downloadOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 12,
  },
  downloadButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  downloadText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: "500",
  },
  saveButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
});
