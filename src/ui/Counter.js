// ============================================================================
// Counter.js
// Smoothly animates a number display (used for the like counter) instead
// of snapping straight to the new value. Formats large numbers with
// thousands separators.
// ============================================================================

export class Counter {
  /**
   * @param {HTMLElement} el the element whose textContent will be updated
   * @param {object} options { durationMs }
   */
  constructor(el, options = {}) {
    this.el = el;
    this.durationMs = options.durationMs ?? 600;
    this.displayValue = 0;
    this.targetValue = 0;
    this._animStart = null;
    this._animFrom = 0;
    this._raf = null;
  }

  /** Snap immediately to a value with no animation (used on jar reset). */
  reset(value = 0) {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    this.displayValue = value;
    this.targetValue = value;
    this._render();
  }

  setTarget(value) {
    if (value === this.targetValue) return;
    this._animFrom = this.displayValue;
    this.targetValue = value;
    this._animStart = performance.now();
    if (!this._raf) this._tick();
  }

  _tick() {
    this._raf = requestAnimationFrame((now) => {
      const elapsed = now - this._animStart;
      const t = Math.min(1, elapsed / this.durationMs);
      // Ease-out so the counter "settles" rather than stopping abruptly.
      const eased = 1 - Math.pow(1 - t, 3);
      this.displayValue = Math.round(this._animFrom + (this.targetValue - this._animFrom) * eased);
      this._render();

      if (t < 1) {
        this._tick();
      } else {
        this._raf = null;
      }
    });
  }

  _render() {
    this.el.textContent = this.displayValue.toLocaleString("en-US");
  }

  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
  }
}
