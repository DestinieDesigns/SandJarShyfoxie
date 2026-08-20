// ============================================================================
// tiktok-bridge.js
// A small standalone Node process that connects to a real TikTok LIVE
// stream using the unofficial "tiktok-live-connector" package, then
// re-broadcasts normalized {type:"like"|"gift"} events to any browser
// tabs connected over a local WebSocket.
//
// This is intentionally isolated from the rest of the app:
//   - It's the ONLY file that knows anything about TikTok.
//   - It never touches your TikTok password (only your public @username).
//   - If TikTok changes something and this package breaks, only this file
//     is affected — the sand jar visual keeps working fine in test mode.
//
// SETUP:
//   1. cd server
//   2. npm install
//   3. Copy .env.example to .env and set TIKTOK_USERNAME=youraccountname
//      (no @ symbol, and no password — this only reads public livestream
//      data, the same data any viewer's browser already receives).
//   4. npm start
//   5. Open the sand jar with ?mode=live in your browser / OBS source.
//
// NOTE: tiktok-live-connector is an unofficial, community-maintained
// project (not affiliated with or endorsed by TikTok/ByteDance). TikTok
// has no official public API for reading livestream events, so this is
// the best currently-viable approach — but it can require an API key from
// Euler Stream (the signing service it depends on) if you hit rate limits,
// and it may need to be updated if TikTok changes its internal protocol.
// Keep the package up to date: npm update tiktok-live-connector
// ============================================================================

import "dotenv/config";
import { WebSocketServer } from "ws";
import { TikTokLiveConnection, WebcastEvent } from "tiktok-live-connector";

const USERNAME = process.env.TIKTOK_USERNAME;
const PORT = parseInt(process.env.BRIDGE_PORT || "8081", 10);

if (!USERNAME) {
  console.error(
    "\nMissing TIKTOK_USERNAME.\n" +
      "Copy server/.env.example to server/.env and set TIKTOK_USERNAME=youraccountname (no @, no password).\n"
  );
  process.exit(1);
}

// -- Local WebSocket server the browser overlay connects to -----------------
const wss = new WebSocketServer({ port: PORT });
console.log(`[bridge] WebSocket server listening on ws://localhost:${PORT}`);

function broadcast(payload) {
  const json = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(json);
  });
}

wss.on("connection", (ws) => {
  console.log("[bridge] browser overlay connected");
  ws.send(JSON.stringify({ type: "bridge-status", connectedToTikTok: connection.state?.isConnected ?? false, room: USERNAME }));
});

// -- TikTok LIVE connection ---------------------------------------------
const connection = new TikTokLiveConnection(USERNAME);

connection
  .connect()
  .then((state) => {
    console.log(`[bridge] connected to @${USERNAME}'s LIVE (roomId ${state.roomId})`);
    broadcast({ type: "bridge-status", connectedToTikTok: true, room: USERNAME });
  })
  .catch((err) => {
    console.error("[bridge] failed to connect to TikTok LIVE:", err?.message || err);
    console.error("[bridge] is the account currently live? Is the username correct (no @)?");
  });

// Likes arrive as a running total per user session — we forward the
// per-event count so the front-end's own batching handles smoothing.
connection.on(WebcastEvent.LIKE, (data) => {
  broadcast({
    type: "like",
    username: data.user?.uniqueId || "viewer",
    count: data.likeCount || 1,
  });
});

connection.on(WebcastEvent.GIFT, (data) => {
  // Gifts can arrive as "streakable" — TikTok sends repeated small updates
  // while the sender holds down a repeatable gift, then a final event with
  // repeatEnd=true. We only forward on streak end (or non-streakable gifts)
  // so a single gift doesn't spam five sand pours.
  const isStreakable = data.giftType === 1;
  if (isStreakable && !data.repeatEnd) return;

  broadcast({
    type: "gift",
    username: data.user?.uniqueId || "viewer",
    giftName: data.giftName || "Unknown",
    repeatCount: data.repeatCount || 1,
  });
});

connection.on(WebcastEvent.DISCONNECTED, () => {
  console.warn("[bridge] disconnected from TikTok LIVE — the stream may have ended.");
  broadcast({ type: "bridge-status", connectedToTikTok: false, room: USERNAME });
});

process.on("SIGINT", () => {
  console.log("\n[bridge] shutting down...");
  wss.close();
  process.exit(0);
});
