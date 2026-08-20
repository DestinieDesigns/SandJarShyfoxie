// Smoke test for LIVE mode specifically: boots the app with ?mode=live and
// verifies every developer-only surface (test panel, debug panel, and — as
// a belt-and-suspenders check — debug info even if ?debug=true is also
// passed) is fully hidden, and the background stays transparent. This is
// the single most important guarantee for the real Streamlabs overlay, so
// it gets its own dedicated check rather than being buried in the general
// smoke test.
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
import { pathToFileURL } from "url";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// Deliberately also passing &debug=true — config.js is supposed to force
// debug off in live mode regardless, so this doubles as a test of that
// hardening (see applyUrlOverrides in src/config.js).
const dom = new JSDOM(html, {
  url: "http://localhost/index.html?mode=live&debug=true",
  runScripts: "outside-only",
  resources: "usable",
  pretendToBeVisual: true,
});

const { window } = dom;
global.window = window;
global.document = window.document;
global.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
};
global.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.performance = { now: () => Date.now() };
global.URLSearchParams = window.URLSearchParams;
global.Audio = class { play() { return Promise.resolve(); } set volume(v) {} };

let wsCreated = false;
global.WebSocket = class {
  constructor(url) {
    wsCreated = true;
    this.url = url;
  }
  addEventListener() {}
  close() {}
};

window.HTMLCanvasElement.prototype.getContext = function () {
  return {
    clearRect() {},
    fillRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
  };
};

let failed = false;
window.addEventListener("error", (e) => {
  failed = true;
  console.error("window error:", e.error || e.message);
});

async function run() {
  await import(pathToFileURL(new URL("../src/main.js", import.meta.url).pathname).href);
  await new Promise((r) => setTimeout(r, 300));

  const testPanel = document.getElementById("testPanel");
  const debugPanel = document.getElementById("debugPanel");
  const hasTestBg = document.body.classList.contains("has-test-bg");

  const testPanelHidden = testPanel.getAttribute("data-hidden") === "true";
  const debugPanelHidden = debugPanel.getAttribute("data-hidden") === "true";
  // The shake button (and every other test control) lives inside
  // #testPanel in the DOM, so confirming the panel itself is hidden is
  // sufficient — but check directly too, since that's the actual
  // real-world failure mode ("a button visibly floating over my stream").
  const shakeButtonInsideHiddenPanel = testPanel.contains(document.querySelector('[data-testaction="shake"]'));

  console.log({
    testPanelHidden,
    debugPanelHidden,
    shakeButtonInsideHiddenPanel,
    hasTestBg,
    attemptedTikTokConnection: wsCreated,
    failed,
  });

  if (!testPanelHidden) {
    console.error("LIVE MODE SMOKE TEST FAILED — #testPanel is not hidden with ?mode=live.");
    process.exit(1);
  }
  if (!debugPanelHidden) {
    console.error(
      "LIVE MODE SMOKE TEST FAILED — #debugPanel is not hidden with ?mode=live (even with &debug=true present)."
    );
    process.exit(1);
  }
  if (!shakeButtonInsideHiddenPanel) {
    console.error("LIVE MODE SMOKE TEST FAILED — Shake Jar button is not contained within the hidden test panel.");
    process.exit(1);
  }
  if (hasTestBg) {
    console.error("LIVE MODE SMOKE TEST FAILED — background is not transparent by default in live mode.");
    process.exit(1);
  }
  if (!wsCreated) {
    console.error("LIVE MODE SMOKE TEST FAILED — the TikTok bridge WebSocket was never attempted in live mode.");
    process.exit(1);
  }
  if (failed) {
    console.error("LIVE MODE SMOKE TEST FAILED — an error was thrown during execution.");
    process.exit(1);
  }

  console.log("LIVE MODE SMOKE TEST PASSED");
  process.exit(0);
}

run().catch((err) => {
  console.error("LIVE MODE SMOKE TEST THREW:", err);
  process.exit(1);
});
