/**
 * WebSocket Service
 * Manages real-time WebSocket connections for chat messaging
 */

import { ENDPOINTS } from "../constants";
import type { WsServerFrame } from "../types";
import { getApiBaseUrl, getAuthToken, getDeviceId } from "./storage";

type WsMessageHandler = (frame: WsServerFrame) => void;
type WsStatusHandler = (status: "connected" | "disconnected" | "error") => void;

const PING_INTERVAL_MS = 25_000;
const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 15_000];

class ChatWebSocket {
  private ws: WebSocket | null = null;
  private chatId: number | null = null;
  private onMessage: WsMessageHandler | null = null;
  private onStatus: WsStatusHandler | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionallyClosed = false;

  /**
   * Connect to a chat's WebSocket endpoint
   */
  async connect(
    chatId: number,
    onMessage: WsMessageHandler,
    onStatus?: WsStatusHandler,
  ): Promise<void> {
    // Disconnect any existing connection
    this.disconnect();

    this.chatId = chatId;
    this.onMessage = onMessage;
    this.onStatus = onStatus ?? null;
    this.intentionallyClosed = false;
    this.reconnectAttempt = 0;

    await this._open();
  }

  /**
   * Internal: open the WebSocket connection
   */
  private async _open(): Promise<void> {
    try {
      const token = await getAuthToken();
      const deviceId = await getDeviceId();

      if (!token || !this.chatId) {
        console.warn("[WS] Missing token or chatId, cannot connect");
        return;
      }

      const httpBase = await getApiBaseUrl();
      // Convert http(s) to ws(s)
      const wsBase = httpBase.replace(/^http/, "ws");
      const path = ENDPOINTS.CHAT_WS.replace(
        "{chat_id}",
        this.chatId.toString(),
      );
      const url = `${wsBase}${path}?token=${encodeURIComponent(token)}&device_id=${encodeURIComponent(deviceId)}`;

      console.log("[WS] Connecting to", path);

      const ws = new WebSocket(url);

      ws.onopen = () => {
        console.log("[WS] Connected", { chatId: this.chatId });
        this.reconnectAttempt = 0;
        this.onStatus?.("connected");
        this._startPing();
      };

      ws.onmessage = (event) => {
        try {
          const frame: WsServerFrame = JSON.parse(event.data);
          this.onMessage?.(frame);
        } catch (e) {
          console.error("[WS] Failed to parse frame:", e);
        }
      };

      ws.onerror = (event) => {
        console.error("[WS] Error:", event);
        this.onStatus?.("error");
      };

      ws.onclose = (event) => {
        console.log("[WS] Closed", { code: event.code, reason: event.reason });
        this._stopPing();
        this.ws = null;
        this.onStatus?.("disconnected");

        if (!this.intentionallyClosed) {
          this._scheduleReconnect();
        }
      };

      this.ws = ws;
    } catch (error) {
      console.error("[WS] Failed to open:", error);
      this.onStatus?.("error");
      if (!this.intentionallyClosed) {
        this._scheduleReconnect();
      }
    }
  }

  /**
   * Send a ping frame to keep the connection alive
   */
  private _startPing() {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
      }
    }, PING_INTERVAL_MS);
  }

  private _stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * Schedule a reconnection attempt with exponential back-off
   */
  private _scheduleReconnect() {
    if (this.reconnectTimer) return;

    const delay =
      RECONNECT_DELAYS[
        Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)
      ];
    console.log(
      `[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt + 1})`,
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.reconnectAttempt++;
      await this._open();
    }, delay);
  }

  /**
   * Disconnect from the WebSocket
   */
  disconnect() {
    this.intentionallyClosed = true;
    this._stopPing();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.chatId = null;
    this.onMessage = null;
    this.onStatus = null;
    this.reconnectAttempt = 0;
  }

  /**
   * Check if the WebSocket is currently connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const chatSocket = new ChatWebSocket();
