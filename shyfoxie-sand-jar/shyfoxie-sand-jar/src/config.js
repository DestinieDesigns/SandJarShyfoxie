// ============================================================================
// CONFIG.js
// Central configuration for Shyfoxie's LIVE Sand Jar.
// Every tunable value in the whole app lives here. Nothing else should
// hard-code brand text, colors, thresholds, or timings.
// ============================================================================

export const CONFIG = {
  // ---- Branding / UI text -------------------------------------------------
  brandName: "SHYFOXIE",
  title: "SHYFOXIE'S LIVE SAND",

  // Which UI elements are visible. Every one of these can be toggled from
  // the on-screen settings panel (test mode) or via URL params.
  ui: {
    showTitle: true,
    showBrandName: true,
    showJarNumber: true,
    showLikeCounter: true,
    showPercentage: true,
    showAlerts: true,
    showDebugPanel: false, // controlled by ?debug=true, not by settings
    uiScale: 1.0,
  },

  // ---- Likes -> sand conversion -------------------------------------------
  // Higher number = more likes required to fill the jar.
  likesPerPercent: 500,

  // ---- Jar capacity / reset ------------------------------------------------
  jarCapacity: 100, // percent
  resetDurationMs: 9000, // total time for the full celebration+drain sequence
  persistJarNumber: true, // keep jar # across page reloads via localStorage

  // ---- Colors --------------------------------------------------------------
  // The default palette. Users can add/edit entries without touching
  // simulation code — SandColors.js just reads this object.
  sandPalette: {
    pink: "#FF5FA8",
    red: "#FF4D5D",
    blue: "#55AAFF",
    purple: "#A970FF",
    gold: "#FFD447",
    green: "#65D68A",
    cyan: "#58D8E8",
    orange: "#FF9B4A",
    white: "#F5F5F5",
  },
  defaultSandColor: "#FF5FA8",

  // Gift name -> palette key (or a direct hex value). Case-insensitive
  // lookup is performed in SandColors.js. Unknown gifts fall back to
  // defaultSandColor.
  giftColors: {
    "rose": "pink",
    "heart": "red",
    "blue heart": "blue",
    "flower": "purple",
    "tiktok": "cyan",
    "lion": "gold",
    "galaxy": "purple",
    "rainbow": "rainbow", // special-cased: cycles through the palette
  },

  // Gifts that should trigger a bigger visual moment (larger stream,
  // glow, sparkle burst) in addition to their color.
  bigGifts: ["lion", "galaxy", "rainbow"],

  // Gifts add a *small* amount of sand of their own (on top of coloring
  // whatever likes are already pouring) — enough to feel like a moment,
  // without competing with likes as the primary fill driver.
  giftBaseAmountPercent: 0.15, // % of jar capacity per gift unit
  giftBigMultiplier: 4, // multiplier applied for bigGifts

  // ---- Social events: follows, shares, comments -----------------------------
  // Likes and gifts are the primary drivers, but follows/shares/comments can
  // optionally add a little sand and/or a celebratory moment too. Every
  // piece of this is toggleable — set an "enable*" flag to false to make an
  // event type purely cosmetic (alert only) or fully ignored.
  social: {
    follow: {
      enabled: true, // false = follow events are ignored entirely
      addsSand: true,
      amountPercent: 0.4, // % of jar capacity per follow
      color: "purple", // palette key or a raw hex like "#ff00aa"
      big: false, // true = bigger stream + brief glow, like a bigGift
      showAlert: true,
    },
    share: {
      enabled: true,
      addsSand: true,
      amountPercent: 0.6, // shares are rarer and help reach, so worth a bit more
      color: "cyan",
      big: true, // shares get the "bigGift"-style stream + glow moment
      showAlert: true,
    },
    comment: {
      enabled: true,
      // Comments arrive far too often for one-comment-one-pour (same
      // problem as likes), so they're batched on the same interval as
      // likes and converted at a much lower rate. Set addsSand to false
      // to make comments purely a "someone's chatting" sparkle instead.
      addsSand: true,
      commentsPerPercent: 4000, // how many comments = 1% of the jar
      color: "white",
      showAlert: false, // way too frequent for a popup per comment
    },
  },

  // ---- Effects toggles -------------------------------------------------
  effects: {
    enableParticles: true,
    enableSparkles: true,
    enableAlerts: true,
    enableGlassReflection: true,
    reduceFlashing: false, // accessibility: dampens sudden bright flashes
    sandPhysicsIntensity: 1.0, // 0.5 = calmer, 1.5 = more chaotic settling
    particleIntensity: 1.0, // scales grain count per unit of sand
  },

  // ---- Sound (all default OFF) --------------------------------------------
  sound: {
    enabled: false,
    masterVolume: 0.5,
    files: {
      pour: "assets/sounds/pour.mp3",
      gift: "assets/sounds/gift.mp3",
      milestone: "assets/sounds/milestone.mp3",
      complete: "assets/sounds/complete.mp3",
      reset: "assets/sounds/reset.mp3",
    },
  },

  // ---- Like batching -------------------------------------------------------
  batching: {
    flushIntervalMs: 350, // how often queued likes are flushed into one pour
    maxPourPerFlush: 4000, // safety cap so one flush can't dump enormous sand
  },

  // ---- Simulation grid -------------------------------------------------
  simulation: {
    // Grid resolution. Each cell renders as a small block of "grains" so
    // the visual reads as fine sand while the physics stays cheap.
    // Chosen to roughly match the jar body's on-screen aspect ratio (see
    // jar.width/height/neckHeightRatio below) so grains render close to
    // square rather than stretched.
    cols: 130,
    rows: 164,
    maxStepsPerFrame: 2, // physics steps per animation frame (stability vs speed)
    cellRenderPadding: 0, // px gap between rendered cells (0 = seamless)
  },

  // ---- Jar geometry (CSS px at 1x scale; the jar container is responsive) -
  jar: {
    width: 460,
    height: 660,
    neckWidthRatio: 0.62, // neck width as a fraction of body width
    neckHeightRatio: 0.12, // neck height as a fraction of total height
  },

  // ---- History -------------------------------------------------------------
  history: {
    enabled: true,
    maxEntries: 50,
    storageKey: "shyfoxie_sand_jar_history",
  },

  // ---- Shake Jar -------------------------------------------------------
  // A settle/flatten action for the sand ALREADY in the jar — it
  // redistributes existing grains (via SandSimulation.startShake/stopShake)
  // rather than adding or removing any. Triggered by the test button today
  // and, later, by a normalized {type:"shake"} event from any connected
  // event source (see events.js) — the Sand Engine doesn't care who asked.
  shake: {
    durationMs: 2000, // total visible shake+resettle time (spec target: ~1.5-2.5s)
    sandIntensityBoost: 1.6, // temporary multiplier on sliding eagerness while shaking
  },

  // ---- WebSocket (for the optional TikTok bridge) ---------------------------
  websocket: {
    url: "ws://localhost:8081",
    autoReconnect: true,
    reconnectDelayMs: 3000,
  },
};

// Small helper: URL query params can override a few high-value settings
// without editing this file, e.g. ?mode=live&debug=true
export function applyUrlOverrides(config) {
  const params = new URLSearchParams(window.location.search);

  const mode = params.get("mode"); // "test" | "live"
  const resolvedMode = mode === "live" ? "live" : "test"; // default to test if unspecified

  // Debug/performance info is a developer-only concern. It's only ever
  // available in test mode — ?debug=true is silently ignored in live mode
  // so a stray or malicious query param can't leak dev info onto a real
  // stream overlay. This is enforced here (not just left to the UI) so it
  // can't be bypassed by anything downstream.
  const debug = resolvedMode === "live" ? false : params.get("debug") === "true";

  // Background is transparent by default everywhere (required for use as
  // a Streamlabs/OBS Browser Source). Pass ?bg=on to opt into a visible
  // backdrop for easier viewing in a normal browser tab.
  const bg = params.get("bg");

  return {
    ...config,
    mode: resolvedMode,
    debug,
    testBackground: bg || null,
  };
}
