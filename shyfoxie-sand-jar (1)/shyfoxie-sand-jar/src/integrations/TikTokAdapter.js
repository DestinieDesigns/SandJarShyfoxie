// ============================================================================
// TikTokAdapter.js
// Bridges real TikTok LIVE events into the app's normalized event system.
//
// IMPORTANT CONTEXT (read before wiring this up):
// TikTok has no official public API for reading livestream events. The
// viable community approach as of 2026 is the open-source
// "tiktok-live-connector" Node package (zerodytrash/TikTok-Live-Connector),
// which reads the same Webcast data any viewer's browser receives. It does
// NOT require your TikTok password — only your public @username. That
// package must run in Node (not the browser), so this file does NOT talk
// to TikTok directly. Instead:
//
//   TikTok LIVE  ->  server/tiktok-bridge.js (Node, uses tiktok-live-connector)
//                ->  local WebSocket
//                ->  THIS adapter (runs in the browser)
//                ->  handleEvent() -> rest of the app
//
// This keeps all TikTok-specific / potentially-fragile code isolated in
// one Node process that's easy to restart or swap out, while the visual
// app never has to know TikTok exists. See server/README.md for setup.
//
// This adapter is entirely optional — in TEST mode the app never loads it.
// ============================================================================

import { handleEvent } from "../events.js";

export class TikTokAdapter {
  /**
   * @param {{url:string, autoReconnect:boolean, reconnectDelayMs:number}} config
   * @param {{onStateChange?: (state:string)=>void}} callbacks
   */
  constructor(config, callbacks = {}) {
    this.config = config;
    this.callbacks = callbacks;
    this.socket = null;
    this.state = "disconnected"; // disconnected | connecting | connected | error
  }

  connect() {
    this._setState("connecting");
    try {
      this.socket = new WebSocket(this.config.url);
    } catch (err) {
      console.error("[TikTokAdapter] failed to open WebSocket:", err);
      this._setState("error");
      this._scheduleReconnect();
      return;
    }

    this.socket.addEventListener("open", () => this._setState("connected"));

    this.socket.addEventListener("message", (msg) => {
      let data;
      try {
        data = JSON.parse(msg.data);
      } catch {
        console.warn("[TikTokAdapter] received non-JSON message, ignoring");
        return;
      }
      this._handleBridgeMessage(data);
    });

    this.socket.addEventListener("close", () => {
      this._setState("disconnected");
      this._scheduleReconnect();
    });

    this.socket.addEventListener("error", () => {
      this._setState("error");
    });
  }

  disconnect() {
    this._reconnectRequested = false;
    this.socket?.close();
  }

  _scheduleReconnect() {
    if (!this.config.autoReconnect) return;
    setTimeout(() => this.connect(), this.config.reconnectDelayMs);
  }

  _setState(state) {
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }

  /**
   * The bridge server already normalizes TikTok's raw payloads into our
   * {type:"like"|"gift", ...} shape (see server/tiktok-bridge.js), so this
   * is mostly a pass-through — but we validate defensively since this data
   * ultimately comes from an unofficial, reverse-engineered source.
   */
  _handleBridgeMessage(data) {
    if (data?.type === "like" || data?.type === "gift") {
      handleEvent(data);
    } else if (data?.type === "bridge-status") {
      // e.g. { type: "bridge-status", connectedToTikTok: true, room: "..." }
      this.callbacks.onBridgeStatus?.(data);
    }
  }
}
