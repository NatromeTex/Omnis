import type { IMessage } from "react-native-gifted-chat";
import { mediaManager } from "../services/mediaManager";
import type { LocalMessage, PendingAttachment } from "../types";
import type { OptimisticMessage } from "./model";

export interface OmnisGiftedMessage extends IMessage {
  omnisSource: "server" | "optimistic";
  omnisLocalMessage?: LocalMessage;
  omnisOptimisticMessage?: OptimisticMessage;
  omnisAttachmentCount: number;
}

function toDate(value: string): Date {
  if (value.endsWith("Z") || value.includes("+")) {
    return new Date(value);
  }
  return new Date(`${value}Z`);
}

function attachmentText(attachments: PendingAttachment[]): string {
  if (attachments.length === 0) return "";
  if (attachments.length === 1) return "Attachment";
  return `${attachments.length} Attachments`;
}

export function fromLocalMessage(
  message: LocalMessage,
  currentUserId: number,
  peerName: string,
  selfName: string,
): OmnisGiftedMessage {
  const parsed = message.plaintext ? mediaManager.getDisplayText(message.plaintext) : "[Encrypted]";
  const isSelf = message.sender_id === currentUserId;
  const attachmentCount = message.attachments?.length ?? 0;

  return {
    _id: `srv-${message.id}`,
    text: parsed,
    createdAt: toDate(message.created_at),
    user: {
      _id: message.sender_id,
      name: isSelf ? selfName : peerName,
    },
    pending: false,
    sent: true,
    received: !isSelf,
    omnisSource: "server",
    omnisLocalMessage: message,
    omnisAttachmentCount: attachmentCount,
  };
}

export function fromOptimisticMessage(
  optimistic: OptimisticMessage,
  currentUserId: number,
  selfName: string,
): OmnisGiftedMessage {
  const summary = attachmentText(optimistic.attachments);
  const text = optimistic.text || (summary ? `📎 ${summary}` : "");
  const isFailed = optimistic.state === "failed";

  return {
    _id: optimistic.id,
    text,
    createdAt: toDate(optimistic.createdAt),
    user: {
      _id: currentUserId,
      name: selfName,
    },
    pending: optimistic.state === "sending",
    sent: optimistic.state === "sent",
    received: false,
    omnisSource: "optimistic",
    omnisOptimisticMessage: optimistic,
    omnisAttachmentCount: optimistic.attachments.length,
    ...(isFailed ? { system: false } : {}),
  };
}
