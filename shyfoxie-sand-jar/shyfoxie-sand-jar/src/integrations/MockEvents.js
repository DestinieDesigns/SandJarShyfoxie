// ============================================================================
// MockEvents.js
// Lets the whole app be developed and demoed without any TikTok connection.
// Wires up the on-screen test control buttons (data-testaction attributes)
// to the same handleEvent() entry point that a real TikTok adapter would
// use, so "the front-end doesn't care where events came from" is actually
// true in practice, not just in theory.
// ============================================================================

import { handleEvent } from "../events.js";

const TEST_USERNAMES = ["Dreamy", "Sunshine", "Nightowl", "Mochi", "Pixel", "Comet", "Willow"];

function randomUsername() {
  return TEST_USERNAMES[Math.floor(Math.random() * TEST_USERNAMES.length)];
}

/**
 * Attach click handlers to every element with [data-testaction] inside root.
 * Supported actions (via data-testaction / data-value):
 *   like:10 | like:100 | like:1000
 *   gift:Rose | gift:Heart | gift:Blue Heart | gift:Flower | gift:Lion | gift:Rainbow
 *   fill-jar | empty-jar | trigger-celebration | reset-jar | shake
 *   pause-sim | resume-sim
 */
export function attachTestControls(root, handlers = {}) {
  root.querySelectorAll("[data-testaction]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [action, value] = btn.dataset.testaction.split(":");

      switch (action) {
        case "like":
          handleEvent({ type: "like", username: randomUsername(), count: parseInt(value, 10) });
          break;
        case "gift":
          handleEvent({ type: "gift", username: randomUsername(), giftName: value, repeatCount: 1 });
          break;
        case "shake":
          // Goes through the exact same normalized event path a future
          // Twitch/TikTok bridge would use to trigger it — see events.js.
          handleEvent({ type: "shake" });
          break;
        case "fill-jar":
          handlers.onFillJar?.();
          break;
        case "empty-jar":
          handlers.onEmptyJar?.();
          break;
        case "trigger-celebration":
          handlers.onTriggerCelebration?.();
          break;
        case "reset-jar":
          handlers.onResetJar?.();
          break;
        case "pause-sim":
          handlers.onPause?.();
          break;
        case "resume-sim":
          handlers.onResume?.();
          break;
        default:
          console.warn("[MockEvents] unknown test action:", btn.dataset.testaction);
      }
    });
  });
}

/**
 * Optional ambient traffic generator — simulates a trickle of likes and
 * occasional gifts so the jar keeps filling on its own during a demo.
 * Entirely separate from the manual test buttons; off by default.
 */
export class AmbientSimulator {
  constructor({ giftNames = ["Rose", "Heart", "Blue Heart", "Flower", "Lion"] } = {}) {
    this.giftNames = giftNames;
    this._interval = null;
  }

  start() {
    if (this._interval) return;
    this._interval = setInterval(() => {
      handleEvent({
        type: "like",
        username: randomUsername(),
        count: 1 + Math.floor(Math.random() * 8),
      });
      if (Math.random() < 0.06) {
        const gift = this.giftNames[Math.floor(Math.random() * this.giftNames.length)];
        handleEvent({ type: "gift", username: randomUsername(), giftName: gift, repeatCount: 1 });
      }
    }, 400);
  }

  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}
