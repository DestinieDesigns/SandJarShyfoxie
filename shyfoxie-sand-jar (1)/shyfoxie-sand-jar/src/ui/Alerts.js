// ============================================================================
// Alerts.js
// Displays gift alerts one at a time from a queue, so a burst of gifts
// doesn't cover the screen with overlapping popups. Each alert animates
// in, holds, animates out, then the next one (if any) takes its turn.
// ============================================================================

const GIFT_EMOJI = {
  rose: "\u{1F339}",
  heart: "\u2764\uFE0F",
  "blue heart": "\u{1F499}",
  flower: "\u{1F338}",
  lion: "\u{1F981}",
  galaxy: "\u{1F30C}",
  rainbow: "\u{1F308}",
};

export class Alerts {
  /**
   * @param {HTMLElement} containerEl
   * @param {object} options { holdMs, enabled }
   */
  constructor(containerEl, options = {}) {
    this.container = containerEl;
    this.holdMs = options.holdMs ?? 2600;
    this.enabled = options.enabled ?? true;
    this.queue = [];
    this._showing = false;
  }

  setEnabled(v) {
    this.enabled = v;
  }

  /**
   * @param {{kind?:string, username:string, giftName?:string, colorLabel:string, big?:boolean}} alert
   * `kind` is "gift" (default), "follow", or "share" — controls wording/emoji.
   */
  push(alert) {
    if (!this.enabled) return;
    // Keep the queue from growing unbounded during a huge gift storm —
    // it's better to drop the oldest excess than to fall further and
    // further behind real time.
    if (this.queue.length > 12) this.queue.shift();
    this.queue.push(alert);
    this._advance();
  }

  _advance() {
    if (this._showing || this.queue.length === 0) return;
    this._showing = true;
    const alert = this.queue.shift();
    this._render(alert);

    setTimeout(() => {
      this.container.classList.remove("alert--visible");
      setTimeout(() => {
        this._showing = false;
        this._advance();
      }, 300); // matches CSS exit transition
    }, this.holdMs);
  }

  _render(alert) {
    const kind = alert.kind || "gift";
    let emoji, line1;

    if (kind === "follow") {
      emoji = "\u{1F49C}"; // 💜
      line1 = `@${escapeHtml(alert.username)} followed!`;
    } else if (kind === "share") {
      emoji = "\u{1F501}"; // 🔁
      line1 = `@${escapeHtml(alert.username)} shared the stream!`;
    } else {
      emoji = GIFT_EMOJI[(alert.giftName || "").toLowerCase()] || "\u{1F381}";
      line1 = `@${escapeHtml(alert.username)} sent ${escapeHtml(alert.giftName)}`;
    }

    this.container.innerHTML = `
      <div class="alert__emoji">${emoji}</div>
      <div class="alert__text">
        <div class="alert__line1">${line1}</div>
        <div class="alert__line2">+ ${escapeHtml(alert.colorLabel).toUpperCase()} SAND</div>
      </div>
    `;
    this.container.classList.toggle("alert--big", !!alert.big);
    // Force reflow so the animation restarts even for back-to-back alerts.
    void this.container.offsetWidth;
    this.container.classList.add("alert--visible");
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
