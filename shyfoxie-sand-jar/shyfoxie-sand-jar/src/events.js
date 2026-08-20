// ============================================================================
// events.js
// A tiny central event bus. Every part of the app (mock buttons, the
// TikTok adapter, future integrations) funnels through `handleEvent()`.
// Nothing downstream needs to know where an event came from.
// ============================================================================

/**
 * @typedef {Object} LikeEvent
 * @property {"like"} type
 * @property {string} [username]
 * @property {number} count
 *
 * @typedef {Object} GiftEvent
 * @property {"gift"} type
 * @property {string} [username]
 * @property {string} giftName
 * @property {number} [repeatCount]
 *
 * @typedef {Object} ShakeEvent
 * @property {"shake"} type
 * A reusable Sand Engine action, not tied to any platform — the test
 * button, and later a Twitch/TikTok bridge, both just send {type:"shake"}.
 */

class EventBus {
  constructor() {
    this.listeners = new Map(); // eventType -> Set<fn>
    this.lastEvent = null; // for the debug panel
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type).delete(fn); // unsubscribe handle
  }

  emit(type, payload) {
    this.lastEvent = { type, payload, at: Date.now() };
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        // A single bad listener should never crash the stream overlay.
        console.error(`[events] listener for "${type}" threw:`, err);
      }
    }
  }
}

export const bus = new EventBus();

/**
 * The single normalized entry point for all incoming events, regardless
 * of origin (test buttons, mock generator, TikTok adapter, future
 * follow/share/comment support).
 * @param {LikeEvent|GiftEvent|Object} event
 */
export function handleEvent(event) {
  if (!event || typeof event.type !== "string") {
    console.warn("[events] ignored malformed event:", event);
    return;
  }

  switch (event.type) {
    case "like":
      bus.emit("like", {
        username: event.username || "viewer",
        count: Math.max(0, Math.floor(event.count || 0)),
      });
      break;

    case "gift":
      bus.emit("gift", {
        username: event.username || "viewer",
        giftName: event.giftName || "Unknown",
        repeatCount: Math.max(1, Math.floor(event.repeatCount || 1)),
      });
      break;

    case "follow":
      bus.emit("follow", { username: event.username || "viewer" });
      break;

    case "share":
      bus.emit("share", { username: event.username || "viewer" });
      break;

    case "comment":
      // `count` lets a single normalized event represent a batch of
      // comments (useful for mock/demo traffic); real single comments
      // from the TikTok bridge just omit it and default to 1.
      bus.emit("comment", {
        username: event.username || "viewer",
        text: event.text || "",
        count: Math.max(1, Math.floor(event.count || 1)),
      });
      break;

    case "shake":
      // No payload needed — shaking redistributes whatever sand already
      // exists, it doesn't matter who or what triggered it.
      bus.emit("shake", {});
      break;

    // Reserved for future expansion — architected for, not implemented yet.
    // These are here so a future Twitch/TikTok bridge can start sending
    // them today without hitting the "unknown event type" warning below;
    // dedicated Sand Engine behavior for each (e.g. "chat -> tiny gray
    // sand") gets wired up when that integration is actually built —
    // `comment`, `follow`, and `share` above are the working templates
    // for how that wiring will look.
    case "subscribe": // Twitch subscription / TikTok subscribe
    case "giftSub": // Twitch gift subscription
    case "bits": // Twitch bits/cheer
    case "channelPoints": // Twitch channel point redemption
      bus.emit(event.type, event);
      break;

    default:
      console.warn(`[events] unknown event type "${event.type}"`);
  }
}
