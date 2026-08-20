// Quick smoke test: boots the app inside jsdom with a stubbed 2D canvas
// context (jsdom has no real canvas backend) and drives it through the
// same paths a person clicking the test buttons would exercise, checking
// nothing throws and a few invariants hold.
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
import { pathToFileURL } from "url";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

const dom = new JSDOM(html, {
  url: "http://localhost/index.html?mode=test&debug=true",
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
global.WebSocket = class { addEventListener() {} close() {} };

// jsdom canvases have no real 2D backend — stub just enough of the API
// surface that SandRenderer touches so we can exercise the surrounding
// logic (physics, jar state, celebration, UI wiring) end to end.
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

  const click = (sel) => document.querySelector(sel).dispatchEvent(new window.Event("click", { bubbles: true }));

  console.log("clicking +100 likes...");
  click('[data-testaction="like:100"]');

  console.log("clicking Rose gift...");
  click('[data-testaction="gift:Rose"]');

  console.log("clicking Blue Heart gift...");
  click('[data-testaction="gift:Blue Heart"]');

  console.log("running ~120 animation frames...");
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }

  console.log("clicking Fill Jar...");
  click('[data-testaction="fill-jar"]');

  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }

  console.log("clicking Trigger Celebration...");
  click('[data-testaction="trigger-celebration"]');

  // Let a full celebration cycle (default ~9s) play out.
  await new Promise((r) => setTimeout(r, 10500));

  const likeCount = document.getElementById("likeCount").textContent;
  const jarNumber = document.getElementById("jarNumber").textContent;
  const percent = document.getElementById("percentValue").textContent;
  const hasTestBg = document.body.classList.contains("has-test-bg");

  console.log({ likeCount, jarNumber, percent, failed, hasTestBg });

  if (hasTestBg) {
    console.error(
      "SMOKE TEST FAILED — body got a visible background by default. " +
        "This must stay transparent for Streamlabs/OBS compatibility unless ?bg=on is set."
    );
    process.exit(1);
  }

  if (parseInt(jarNumber, 10) < 2) {
    console.error("SMOKE TEST FAILED — jar number did not increment after celebration.");
    process.exit(1);
  }

  // -- Shake Jar: must redistribute sand, not add/remove/reset anything ----
  console.log("adding some sand to the new jar before shaking...");
  click('[data-testaction="like:1000"]');
  click('[data-testaction="gift:Lion"]');
  await new Promise((r) => setTimeout(r, 3000)); // let the pour fully settle

  const percentBeforeShake = document.getElementById("percentValue").textContent;
  const jarNumberBeforeShake = document.getElementById("jarNumber").textContent;
  const likesBeforeShake = document.getElementById("likeCount").textContent;

  console.log("clicking Shake Jar...");
  click('[data-testaction="shake"]');

  const jarEl = document.getElementById("jar");
  const gotShakingClass = jarEl.classList.contains("jar--shaking");

  await new Promise((r) => setTimeout(r, 3000)); // past config.shake.durationMs (2000ms default) + buffer

  const stillShaking = jarEl.classList.contains("jar--shaking");
  const percentAfterShake = document.getElementById("percentValue").textContent;
  const jarNumberAfterShake = document.getElementById("jarNumber").textContent;
  const likesAfterShake = document.getElementById("likeCount").textContent;

  console.log({
    gotShakingClass,
    stillShaking,
    percentBeforeShake,
    percentAfterShake,
    jarNumberBeforeShake,
    jarNumberAfterShake,
    likesBeforeShake,
    likesAfterShake,
  });

  if (!gotShakingClass) {
    console.error("SMOKE TEST FAILED — clicking Shake Jar did not add the jar--shaking class.");
    process.exit(1);
  }
  if (stillShaking) {
    console.error("SMOKE TEST FAILED — jar--shaking class was never removed after the shake duration.");
    process.exit(1);
  }
  if (percentBeforeShake !== percentAfterShake) {
    console.error(
      `SMOKE TEST FAILED — shake changed the fill percent (${percentBeforeShake}% -> ${percentAfterShake}%); ` +
        "it must only redistribute existing sand, never add or remove any."
    );
    process.exit(1);
  }
  if (jarNumberBeforeShake !== jarNumberAfterShake || likesBeforeShake !== likesAfterShake) {
    console.error("SMOKE TEST FAILED — shake changed the jar number or like count; it must leave both untouched.");
    process.exit(1);
  }

  if (failed) {
    console.error("SMOKE TEST FAILED — an error was thrown during execution.");
    process.exit(1);
  }
  console.log("SMOKE TEST PASSED");
  process.exit(0);
}

run().catch((err) => {
  console.error("SMOKE TEST THREW:", err);
  process.exit(1);
});
