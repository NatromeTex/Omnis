/**
 * AttachmentUploadProgress
 * Displays pending attachment upload status in the composer area.
 * Shows thumbnail/icon, file name, progress bar, and cancel button.
 */

import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getMediaType } from "../../types";
import type { PendingAttachment } from "../../types";
import { Colors } from "../../theme";

interface AttachmentUploadProgressProps {
  attachments: PendingAttachment[];
  onRemove: (uploadId: string) => void;
}

export function AttachmentUploadProgress({
  attachments,
  onRemove,
}: AttachmentUploadProgressProps) {
  if (attachments.length === 0) return null;

  return (
    <View style={styles.container}>
      {attachments.map((att) => (
        <AttachmentChip key={att.uploadId} attachment={att} onRemove={onRemove} />
      ))}
    </View>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment;
  onRemove: (uploadId: string) => void;
}) {
  const mediaType = getMediaType(attachment.mimeType);
  const icon = getIcon(mediaType);
  const statusColor = getStatusColor(attachment.status);
  const statusLabel = getStatusLabel(attachment.status);

  return (
    <View style={styles.chip}>
      <View style={[styles.iconContainer, { backgroundColor: statusColor + "22" }]}>
        <Ionicons name={icon} size={18} color={statusColor} />
      </View>

      <View style={styles.chipInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {attachment.fileName}
        </Text>
        <View style={styles.statusRow}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel}
          </Text>
          {attachment.status === "uploading" && (
            <Text style={styles.progressText}>
              {Math.round(attachment.progress * 100)}%
            </Text>
          )}
        </View>
        {(attachment.status === "encrypting" || attachment.status === "uploading") && (
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.max(attachment.progress * 100, 2)}%`,
                  backgroundColor: statusColor,
                },
              ]}
            />
          </View>
        )}
      </View>

      <Pressable
        style={styles.removeButton}
        onPress={() => onRemove(attachment.uploadId)}
        hitSlop={8}
      >
        <Ionicons
          name={attachment.status === "failed" ? "refresh" : "close"}
          size={16}
          color={Colors.textMuted}
        />
      </Pressable>
    </View>
  );
}

function getIcon(mediaType: string): keyof typeof Ionicons.glyphMap {
  switch (mediaType) {
    case "image": return "image-outline";
    case "video": return "videocam-outline";
    case "audio": return "musical-note-outline";
    case "pdf": return "document-text-outline";
    default: return "document-outline";
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "queued": return Colors.textMuted;
    case "encrypting": return "#FFB300";
    case "retrying": return "#FF9800";
    case "uploading": return Colors.accent;
    case "uploaded": return "#4CAF50";
    case "failed": return "#F44336";
    default: return Colors.textMuted;
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "queued": return "Queued";
    case "encrypting": return "Encrypting…";
    case "retrying": return "Retrying…";
    case "uploading": return "Uploading…";
    case "uploaded": return "Ready";
    case "failed": return "Failed";
    default: return status;
  }
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 6,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  chipInfo: {
    flex: 1,
  },
  fileName: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: "500",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    fontSize: 11,
  },
  progressText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  progressBar: {
    height: 3,
    backgroundColor: Colors.border,
    borderRadius: 1.5,
    marginTop: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 1.5,
  },
  removeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
});
