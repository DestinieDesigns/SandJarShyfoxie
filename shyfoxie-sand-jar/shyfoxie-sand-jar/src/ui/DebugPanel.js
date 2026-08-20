// ============================================================================
// DebugPanel.js
// A small on-screen readout (FPS, particle counts, current state) shown
// only when ?debug=true is in the URL. Never rendered in normal use.
// ============================================================================

export class DebugPanel {
  constructor(el) {
    this.el = el;
    this._frames = 0;
    this._lastFpsAt = performance.now();
    this._fps = 0;
  }

  /** Call once per animation frame to keep the FPS counter accurate. */
  tickFrame() {
    this._frames++;
    const now = performance.now();
    if (now - this._lastFpsAt >= 500) {
      this._fps = Math.round((this._frames * 1000) / (now - this._lastFpsAt));
      this._frames = 0;
      this._lastFpsAt = now;
    }
  }

  render(state) {
    if (!this.el) return;
    this.el.textContent = [
      `FPS: ${this._fps}`,
      `Sand cells: ${state.filledCells.toLocaleString()} / ${state.capacityCells.toLocaleString()}`,
      `Jar fill: ${state.percent.toFixed(1)}%`,
      `Likes: ${state.totalLikes.toLocaleString()}`,
      `Sparkles: ${state.sparkleCount}`,
      `Pending pour: ${state.pendingPour}`,
      `Last event: ${state.lastEvent}`,
      `Current color: ${state.currentColor}`,
      `Simulation: ${state.isFull ? "CELEBRATING" : state.isShaking ? "SHAKING" : "running"}`,
      `WebSocket: ${state.wsState}`,
    ].join("\n");
  }
}
