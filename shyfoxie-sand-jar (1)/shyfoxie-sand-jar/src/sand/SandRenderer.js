// ============================================================================
// SandRenderer.js
// Draws a SandSimulation's grid onto a <canvas>. Purely visual — this file
// never mutates simulation state (except the small sparkle particle list it
// owns for its own decoration).
//
// Performance approach: we render the grid at a modest internal pixel
// resolution (a few px per cell) and let the browser scale the canvas up
// via CSS to fit the jar. Grain variation (brightness/shadow/highlight) is
// derived from a deterministic hash of each cell's position, so grains
// don't "twinkle" randomly every frame — only the handful of cells that
// change between steps look different.
// ============================================================================

function hash2(a, b) {
  // Cheap deterministic pseudo-random in [0,1) from two integers.
  let h = a * 374761393 + b * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 10000) / 10000;
}

export class SandRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {SandSimulation} simulation
   * @param {object} options { cellPx, enableSparkles, enableGlassReflection }
   */
  constructor(canvas, simulation, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.sim = simulation;
    this.cellPx = options.cellPx ?? 4;
    this.enableSparkles = options.enableSparkles ?? true;

    canvas.width = simulation.cols * this.cellPx;
    canvas.height = simulation.rows * this.cellPx;

    this.sparkles = []; // {x,y,life,maxLife,size}
    this._sparkleTimer = 0;
  }

  /** Spawn a small burst of sparkles at a grid position (col,row). Capped. */
  addSparkleBurst(col, row, count = 6) {
    if (!this.enableSparkles) return;
    const MAX_SPARKLES = 220; // hard cap to protect long-run memory/perf
    for (let i = 0; i < count && this.sparkles.length < MAX_SPARKLES; i++) {
      this.sparkles.push({
        x: col * this.cellPx + this.cellPx / 2,
        y: row * this.cellPx + this.cellPx / 2,
        vx: (Math.random() - 0.5) * 1.2,
        vy: -Math.random() * 1.5 - 0.3,
        life: 0,
        maxLife: 30 + Math.random() * 30,
        size: 1 + Math.random() * 1.8,
      });
    }
  }

  _updateSparkles() {
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const s = this.sparkles[i];
      s.life++;
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.03; // gentle gravity pulls sparkles back down
      if (s.life >= s.maxLife) this.sparkles.splice(i, 1);
    }
  }

  /**
   * Randomly emit ambient sparkles on top of freshly-settled sand, purely
   * for visual polish. Throttled internally so this stays cheap.
   */
  _maybeEmitAmbientSparkle() {
    if (!this.enableSparkles) return;
    this._sparkleTimer++;
    if (this._sparkleTimer < 14) return;
    this._sparkleTimer = 0;
    if (this.sim.filledCount === 0) return;
    if (this.sparkles.length > 60) return;

    // Pick a random column and find the topmost filled cell in it.
    const col = Math.floor(Math.random() * this.sim.cols);
    for (let row = 0; row < this.sim.rows; row++) {
      if (this.sim.grid[row * this.sim.cols + col] !== 0) {
        if (Math.random() < 0.5) this.addSparkleBurst(col, row, 1);
        break;
      }
    }
  }

  render() {
    const { ctx, canvas, sim, cellPx } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // -- Sand grains --------------------------------------------------------
    for (let row = 0; row < sim.rows; row++) {
      const rowBase = row * sim.cols;
      for (let col = 0; col < sim.cols; col++) {
        const id = sim.grid[rowBase + col];
        if (id === 0) continue;
        const baseColor = sim.colorTable[id];

        // Deterministic per-cell variation so grains look natural without
        // recomputing randomness (and without flicker) every frame.
        const n = hash2(row, col);
        const brightness = (n - 0.5) * 0.22; // -0.11..0.11
        const px = col * cellPx;
        const py = row * cellPx;
        const size = cellPx - (n > 0.85 ? 1 : 0); // slight size variation

        ctx.fillStyle = this._shaded(baseColor, brightness);
        ctx.fillRect(px, py, size, size);

        // Occasional tiny highlight for a subtle sparkle-in-the-sand look.
        if (n > 0.94) {
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.fillRect(px, py, 1, 1);
        } else if (n < 0.05) {
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.fillRect(px + size - 1, py + size - 1, 1, 1);
        }
      }
    }

    // -- Falling stream (visual only, follows pending pours) ----------------
    if (sim.isPouring) {
      this._drawStreamHint();
    }

    // -- Sparkle particles ---------------------------------------------------
    this._maybeEmitAmbientSparkle();
    this._updateSparkles();
    for (const s of this.sparkles) {
      const alpha = 1 - s.life / s.maxLife;
      ctx.fillStyle = `rgba(255, 244, 214, ${Math.max(0, alpha).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawStreamHint() {
    const { ctx, sim, cellPx, canvas } = this;
    // A soft translucent column suggesting where sand is currently pouring.
    const cols = sim._pourQueue?.length ? sim._pourQueue : [];
    for (const p of cols) {
      const x = p.centerCol * cellPx;
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.25);
      grad.addColorStop(0, "rgba(255,255,255,0.28)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(x - cellPx, 0, cellPx * 3, canvas.height * 0.22);
    }
  }

  _shaded(hex, amount) {
    // amount: -1..1, cheap inline shade (avoids importing SandColors here)
    const clean = hex.replace("#", "");
    const num = parseInt(clean, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    const adj = (c) => Math.max(0, Math.min(255, Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
    r = adj(r);
    g = adj(g);
    b = adj(b);
    return `rgb(${r}, ${g}, ${b})`;
  }
}
