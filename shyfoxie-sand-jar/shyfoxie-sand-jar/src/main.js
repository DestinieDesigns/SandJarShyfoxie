// ============================================================================
// main.js
// Application bootstrap. This file's job is wiring, not logic: it creates
// the Jar, hooks the event bus up to it, drives the render loop, and
// reflects state into the DOM. All the interesting behavior lives in the
// modules it imports.
// ============================================================================

import { CONFIG, applyUrlOverrides } from "./config.js";
import { bus, handleEvent } from "./events.js";
import { Jar } from "./jar/Jar.js";
import { JarCelebration } from "./jar/JarCelebration.js";
import { JarHistory } from "./jar/JarHistory.js";
import { Counter } from "./ui/Counter.js";
import { Alerts } from "./ui/Alerts.js";
import { DebugPanel } from "./ui/DebugPanel.js";
import { attachTestControls, AmbientSimulator } from "./integrations/MockEvents.js";
import { TikTokAdapter } from "./integrations/TikTokAdapter.js";

const config = applyUrlOverrides(CONFIG);

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const el = {
  canvas: document.getElementById("sandCanvas"),
  jar: document.getElementById("jar"),
  jarBanner: document.getElementById("jarBanner"),
  jarGlowRing: document.getElementById("jarGlowRing"),
  jarNumber: document.getElementById("jarNumber"),
  likeCount: document.getElementById("likeCount"),
  percentValue: document.getElementById("percentValue"),
  giftAlert: document.getElementById("giftAlert"),
  debugPanel: document.getElementById("debugPanel"),
  testPanel: document.getElementById("testPanel"),
  title: document.querySelector('[data-el="title"]'),
  statLikes: document.querySelector('[data-el="likes"]'),
  statJarnum: document.querySelector('[data-el="jarnum"]'),
  statPercent: document.querySelector('[data-el="percent"]'),
  ambientToggle: document.getElementById("ambientToggle"),
};

// ---------------------------------------------------------------------------
// Apply config to the DOM (sizes, visibility, mode, debug, accessibility)
// ---------------------------------------------------------------------------
document.documentElement.style.setProperty("--jar-w", `${config.jar.width}px`);
document.documentElement.style.setProperty("--jar-h", `${config.jar.height}px`);
document.documentElement.style.setProperty("--neck-w-ratio", config.jar.neckWidthRatio);
document.documentElement.style.setProperty("--neck-h-ratio", config.jar.neckHeightRatio);
document.documentElement.style.setProperty("--ui-scale", config.ui.uiScale);

if (config.testBackground === "on") {
  // Transparency is the default everywhere — including test mode — because
  // this page is meant to be droppable straight into a Streamlabs/OBS
  // Browser Source with zero config. A visible backdrop is opt-in only,
  // for when you want one while eyeballing the jar in a plain browser tab.
  document.body.classList.add("has-test-bg");
}

if (config.effects.reduceFlashing) document.body.classList.add("reduce-flashing");

el.title.textContent = config.title;
setHidden(el.title.parentElement, !config.ui.showTitle);
setHidden(el.statLikes, !config.ui.showLikeCounter);
setHidden(el.statJarnum, !config.ui.showJarNumber);
setHidden(el.statPercent, !config.ui.showPercentage);
setHidden(el.debugPanel, !config.debug);
setHidden(el.testPanel, config.mode !== "test");

function setHidden(node, hidden) {
  if (!node) return;
  if (hidden) node.setAttribute("data-hidden", "true");
  else node.removeAttribute("data-hidden");
}

// ---------------------------------------------------------------------------
// Core pieces
// ---------------------------------------------------------------------------
const jar = new Jar(el.canvas, config);
el.jarNumber.textContent = jar.jarNumber;

const history = new JarHistory(config);
const counter = new Counter(el.likeCount);
const alerts = new Alerts(el.giftAlert, { enabled: config.effects.enableAlerts, holdMs: 2600 });
const debugPanel = config.debug ? new DebugPanel(el.debugPanel) : null;

let activeColor = config.defaultSandColor;
let activeColorTimeout = null;
let giftsThisJar = 0;
let paused = false;
let wsState = "n/a";

function setActiveColor(hex) {
  activeColor = hex;
  clearTimeout(activeColorTimeout);
  // After a while with no new gifts, likes fall back to the default color
  // rather than staying tinted by whatever gift last arrived.
  activeColorTimeout = setTimeout(() => {
    activeColor = config.defaultSandColor;
  }, 12000);
}

function colorLabelFor(hex) {
  const entry = jar.colors.paletteList().find((p) => p.hex.toLowerCase() === hex.toLowerCase());
  return entry ? entry.key : "sparkling";
}

function playSound(name) {
  if (!config.sound.enabled) return;
  const src = config.sound.files[name];
  if (!src) return;
  try {
    const audio = new Audio(src);
    audio.volume = config.sound.masterVolume;
    audio.play().catch(() => {
      /* file may not exist yet — sound is optional, fail silently */
    });
  } catch {
    /* non-fatal */
  }
}

// ---------------------------------------------------------------------------
// Celebration
// ---------------------------------------------------------------------------
const celebration = new JarCelebration(jar, el.jar, el.jarBanner, config, {
  playSound,
  onStageChange: (stage) => {
    if (stage === "glow") el.jarGlowRing.classList.add("active");
    if (stage === "drain") el.jarGlowRing.classList.remove("active");
  },
  onNewJar: (newNumber) => {
    el.jarNumber.textContent = newNumber;
    counter.reset(0);
    giftsThisJar = 0;
  },
  onComplete: () => {
    /* ready for the next full cycle */
  },
});

function runCelebration(forced = false) {
  if (celebration.playing) return;
  if (forced) {
    // The manual "Trigger Celebration" test button can fire even if the
    // jar isn't actually full — useful for reviewing the animation itself.
    history.record({
      jarNumber: jar.jarNumber,
      totalLikes: jar.totalLikes,
      colorsUsed: jar.simulation.colorsUsed(),
      giftCount: giftsThisJar,
    });
    celebration.play();
    return;
  }
  history.record({
    jarNumber: jar.jarNumber,
    totalLikes: jar.totalLikes,
    colorsUsed: jar.simulation.colorsUsed(),
    giftCount: giftsThisJar,
  });
  celebration.play();
}

jar.on("full", () => runCelebration(false));

// -- Shake Jar ---------------------------------------------------------------
// Jar.js owns the timing (see Jar.shake()) and emits shakeStart/shakeEnd;
// this is purely the visual side — toggle the CSS animation class for the
// same duration. The physics redistribution happens automatically inside
// jar.update() every frame regardless of whether anything is listening
// here, so even if this wiring were removed the sand would still settle —
// this only controls whether the glass itself visibly rocks.
jar.on("shakeStart", ({ durationMs }) => {
  el.jar.style.setProperty("--shake-duration", `${durationMs}ms`);
  el.jar.classList.add("jar--shaking");
});

jar.on("shakeEnd", () => {
  el.jar.classList.remove("jar--shaking");
});

bus.on("shake", () => {
  jar.shake(); // no-ops harmlessly if already shaking or the jar is mid-celebration
});

// ---------------------------------------------------------------------------
// Event bus wiring: likes are batched, gifts fire (and queue an alert) immediately
// ---------------------------------------------------------------------------
let likeBuffer = 0;

bus.on("like", (payload) => {
  likeBuffer += payload.count;
});

setInterval(() => {
  if (likeBuffer > 0 && !jar.isFull) {
    const amount = Math.min(likeBuffer, config.batching.maxPourPerFlush);
    likeBuffer -= amount;
    jar.addLikesColored(amount, activeColor);
    counter.setTarget(jar.totalLikes);
  }

  if (commentBuffer > 0 && !jar.isFull) {
    // No per-flush cap here — comments already convert to sand at a very
    // low rate (config.social.comment.commentsPerPercent), so even a big
    // buffer only ever produces a handful of grains.
    jar.addCommentBatch(commentBuffer);
    commentBuffer = 0;
  }
}, config.batching.flushIntervalMs);

bus.on("gift", (payload) => {
  if (jar.isFull) return; // celebration in progress — new gifts wait for the next jar
  const result = jar.addGift(payload.giftName, payload.repeatCount);
  if (!result) return;
  giftsThisJar++;
  setActiveColor(result.colors[0]);
  playSound("gift");
  alerts.push({
    kind: "gift",
    username: payload.username,
    giftName: payload.giftName,
    colorLabel: colorLabelFor(result.colors[0]),
    big: result.isBig,
  });
});

bus.on("follow", (payload) => {
  if (jar.isFull) return;
  const result = jar.addFollow(payload.username);
  if (!result) return;
  if (config.social.follow.addsSand) setActiveColor(result.colorHex);
  playSound("gift");
  if (result.showAlert) {
    alerts.push({
      kind: "follow",
      username: payload.username,
      colorLabel: colorLabelFor(result.colorHex),
      big: result.big,
    });
  }
});

bus.on("share", (payload) => {
  if (jar.isFull) return;
  const result = jar.addShare(payload.username);
  if (!result) return;
  if (config.social.share.addsSand) setActiveColor(result.colorHex);
  playSound("gift");
  if (result.showAlert) {
    alerts.push({
      kind: "share",
      username: payload.username,
      colorLabel: colorLabelFor(result.colorHex),
      big: result.big,
    });
  }
});

// Comments are extremely high-frequency on a busy stream, so — just like
// likes — they're accumulated into a buffer and flushed on the same
// interval rather than triggering per-comment work.
let commentBuffer = 0;

bus.on("comment", (payload) => {
  commentBuffer += payload.count;
});

// ---------------------------------------------------------------------------
// Test controls (only meaningful in ?mode=test, but harmless if left in the DOM)
// ---------------------------------------------------------------------------
attachTestControls(document, {
  onFillJar: () => jar.debugFillToFull(),
  onEmptyJar: () => jar.debugEmpty(),
  onTriggerCelebration: () => runCelebration(true),
  onResetJar: () => {
    jar.startNewJar();
    el.jarNumber.textContent = jar.jarNumber;
    counter.reset(0);
    giftsThisJar = 0;
  },
  onPause: () => (paused = true),
  onResume: () => (paused = false),
});

const ambient = new AmbientSimulator();
if (el.ambientToggle) {
  el.ambientToggle.addEventListener("click", () => {
    if (ambient._interval) {
      ambient.stop();
      el.ambientToggle.textContent = "Start ambient traffic";
    } else {
      ambient.start();
      el.ambientToggle.textContent = "Stop ambient traffic";
    }
  });
}

// ---------------------------------------------------------------------------
// Optional TikTok bridge (live mode only — never loaded/connected in test mode)
// ---------------------------------------------------------------------------
if (config.mode === "live") {
  const adapter = new TikTokAdapter(config.websocket, {
    onStateChange: (state) => (wsState = state),
    onBridgeStatus: (status) => {
      console.log("[main] TikTok bridge status:", status);
    },
  });
  adapter.connect();
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
function loop() {
  requestAnimationFrame(loop);

  // Pause everything when the tab/OBS source isn't visible — no point
  // burning CPU on physics nobody is watching, and it protects long-run
  // stability if the source is toggled off and on for hours.
  if (document.hidden) return;

  debugPanel?.tickFrame();

  if (!paused) {
    const percent = Math.min(100, jar.update());
    el.percentValue.textContent = Math.floor(percent);
  }

  if (config.debug && debugPanel) {
    debugPanel.render({
      filledCells: jar.simulation.countFilled(),
      capacityCells: jar.capacityCells,
      percent: jar.percent,
      totalLikes: jar.totalLikes,
      sparkleCount: jar.renderer.sparkles.length,
      pendingPour: jar.simulation.pendingPourGrains + likeBuffer,
      lastEvent: bus.lastEvent ? bus.lastEvent.type : "none",
      currentColor: activeColor,
      isFull: jar.isFull,
      isShaking: jar.simulation.isShaking,
      wsState: config.mode === "live" ? wsState : "n/a (test mode)",
    });
  }
}

requestAnimationFrame(loop);
