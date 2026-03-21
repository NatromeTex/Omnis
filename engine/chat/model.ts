import type { PendingAttachment, LocalMessage } from "../types";

export type UiMessageState = "sending" | "sent" | "failed";

export interface OptimisticMessage {
  id: string;
  text: string;
  createdAt: string;
  attachments: PendingAttachment[];
  replyId?: number | null;
  replyText?: string;
  replySender?: string;
  state: UiMessageState;
  error?: string;
}

export interface MessageEnvelope {
  source: "server" | "optimistic";
  localMessage?: LocalMessage;
  optimisticMessage?: OptimisticMessage;
}
