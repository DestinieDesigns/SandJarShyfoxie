// ============================================================================
// SandSimulation.js
// A grid-based falling-sand cellular automaton. This is the physics core:
// it has no idea about likes, gifts, or the DOM — it just owns a grid of
// colored cells and knows how to make them fall, slide, and pile up.
//
// Why grid-based instead of per-grain physics objects: a livestream
// overlay needs to run for hours without leaking memory or slowing down.
// A fixed-size typed array grid gives us O(cells) memory that never grows,
// and each simulation step is a cheap single pass over the grid.
// ============================================================================

export class SandSimulation {
  /**
   * @param {number} cols
   * @param {number} rows
   * @param {{sandPhysicsIntensity:number}} options
   */
  constructor(cols, rows, options = {}) {
    this.cols = cols;
    this.rows = rows;
    this.intensity = options.sandPhysicsIntensity ?? 1.0;

    // 0 = empty. Any other value is an index into this.colorTable.
    this.grid = new Uint16Array(cols * rows);

    // colorTable[0] is unused (reserved for "empty").
    this.colorTable = ["#000000"];
    this._colorToId = new Map();

    // A queue of pending "pours" so large amounts trickle in visually
    // instead of appearing instantly. Each entry drains a few grains
    // per simulation step.
    this._pourQueue = [];

    // Overflow grains that spilled above row 0 during the celebration
    // sequence — rendered separately, above the jar body.
    this.overflowGrains = [];

    this._stepParity = 0; // alternates scan direction to avoid a left/right bias
    this.filledCount = 0; // running count, avoids a full-grid scan every frame
  }

  // -- Color table -----------------------------------------------------------

  _idForColor(hex) {
    if (this._colorToId.has(hex)) return this._colorToId.get(hex);
    const id = this.colorTable.length;
    this.colorTable.push(hex);
    this._colorToId.set(hex, id);
    return id;
  }

  colorAt(row, col) {
    const id = this.grid[row * this.cols + col];
    return id === 0 ? null : this.colorTable[id];
  }

  // -- Pouring -----------------------------------------------------------

  /**
   * Queue `grainCount` grains of the given color(s) to pour in from the
   * top over the next several simulation steps, roughly centered on
   * `centerCol` (defaults to the jar's horizontal middle) with some jitter
   * so the stream doesn't look like a perfectly straight line.
   * @param {number} grainCount
   * @param {string[]} colors one or more hex colors (multiple = rainbow-ish mix)
   * @param {object} opts { centerCol, spread, big }
   */
  pour(grainCount, colors, opts = {}) {
    if (grainCount <= 0) return;
    const centerCol = opts.centerCol ?? Math.floor(this.cols / 2);
    const spread = opts.spread ?? (opts.big ? 10 : 5);
    this._pourQueue.push({
      remaining: Math.floor(grainCount),
      colorIds: colors.map((c) => this._idForColor(c)),
      centerCol,
      spread,
      big: !!opts.big,
    });
  }

  get isPouring() {
    return this._pourQueue.length > 0;
  }

  get pendingPourGrains() {
    return this._pourQueue.reduce((sum, p) => sum + p.remaining, 0);
  }

  _dispensePours() {
    if (this._pourQueue.length === 0) return;

    // Grains dispensed this step scales with intensity but is capped so a
    // massive pour can't dump thousands of grains in a single frame.
    const perStepCap = 26 * this.intensity;

    for (let i = this._pourQueue.length - 1; i >= 0; i--) {
      const p = this._pourQueue[i];
      let toSpawn = Math.min(p.remaining, Math.ceil(perStepCap / this._pourQueue.length));

      while (toSpawn > 0 && p.remaining > 0) {
        const jitter = Math.round((Math.random() - 0.5) * p.spread * 2);
        const col = Math.min(this.cols - 1, Math.max(0, p.centerCol + jitter));
        this._spawnAtTop(col, p.colorIds[Math.floor(Math.random() * p.colorIds.length)]);
        p.remaining--;
        toSpawn--;
      }

      if (p.remaining <= 0) this._pourQueue.splice(i, 1);
    }
  }

  _spawnAtTop(col, colorId) {
    const idx = col; // row 0
    if (this.grid[idx] === 0) {
      this.grid[idx] = colorId;
      this.filledCount++;
    } else {
      // Column is jammed at the very top — this grain overflows the jar.
      // The caller (Jar/JarCelebration) decides what to do with overflow;
      // we just track it so nothing is silently lost.
      this.overflowGrains.push({ col, colorId, y: -1, vy: 0 });
    }
  }

  // -- Simulation step ---------------------------------------------------

  /** Advance the physics by one tick. */
  step() {
    this._dispensePours();

    const { cols, rows, grid } = this;
    this._stepParity ^= 1;
    const leftToRight = this._stepParity === 0;

    // Bottom-to-top so a grain that falls doesn't get processed again
    // this same step (which would let it "teleport" multiple rows).
    for (let row = rows - 2; row >= 0; row--) {
      const rowBase = row * cols;
      const belowBase = rowBase + cols;

      for (let i = 0; i < cols; i++) {
        const col = leftToRight ? i : cols - 1 - i;
        const idx = rowBase + col;
        const val = grid[idx];
        if (val === 0) continue;

        const belowIdx = belowBase + col;
        if (grid[belowIdx] === 0) {
          grid[belowIdx] = val;
          grid[idx] = 0;
          continue;
        }

        // Straight down is blocked — try diagonal settling. Real sand
        // doesn't always take the first available diagonal, so we weight
        // the choice a little to keep piles looking organic.
        const canLeft = col > 0 && grid[belowBase + col - 1] === 0;
        const canRight = col < cols - 1 && grid[belowBase + col + 1] === 0;

        if (canLeft && canRight) {
          const goLeft = Math.random() < 0.5;
          const target = belowBase + (goLeft ? col - 1 : col + 1);
          grid[target] = val;
          grid[idx] = 0;
        } else if (canLeft || canRight) {
          // Higher intensity = more willing to slide instead of settling,
          // which produces slightly more dramatic avalanches.
          if (Math.random() < 0.85 * this.intensity) {
            const target = belowBase + (canLeft ? col - 1 : col + 1);
            grid[target] = val;
            grid[idx] = 0;
          }
        }
        // else: fully settled, stays put.
      }
    }
  }

  /** Run multiple physics steps in one call (used for "Fill Jar" test button etc). */
  stepMultiple(n) {
    for (let i = 0; i < n; i++) this.step();
  }

  // -- Measurement ---------------------------------------------------------

  /** Count of currently occupied cells (recomputed lazily, grid is small). */
  countFilled() {
    let count = 0;
    for (let i = 0; i < this.grid.length; i++) if (this.grid[i] !== 0) count++;
    this.filledCount = count;
    return count;
  }

  get totalCells() {
    return this.cols * this.rows;
  }

  /** 0-100+ (can exceed 100 momentarily during overflow before a reset). */
  fillPercent(capacityCells) {
    return (this.countFilled() / capacityCells) * 100;
  }

  /**
   * Remove up to `n` grains starting from the bottom rows upward, used by
   * the jar-completion drain animation so the sand looks like it's
   * emptying out through the base rather than just vanishing.
   * Returns the number actually removed.
   */
  drainFromBottom(n) {
    let removed = 0;
    for (let row = this.rows - 1; row >= 0 && removed < n; row--) {
      const base = row * this.cols;
      for (let col = 0; col < this.cols && removed < n; col++) {
        if (this.grid[base + col] !== 0) {
          this.grid[base + col] = 0;
          removed++;
        }
      }
    }
    this.filledCount = Math.max(0, this.filledCount - removed);
    return removed;
  }

  /** Remove up to `n` grains from the very top rows (used for "spill over the rim"). */
  spillFromTop(n, rowSpan = 6) {
    let removed = 0;
    for (let row = 0; row < Math.min(rowSpan, this.rows) && removed < n; row++) {
      const base = row * this.cols;
      for (let col = 0; col < this.cols && removed < n; col++) {
        if (this.grid[base + col] !== 0) {
          this.grid[base + col] = 0;
          removed++;
        }
      }
    }
    this.filledCount = Math.max(0, this.filledCount - removed);
    return removed;
  }

  /** Empties the entire grid (used on reset). */
  clear() {
    this.grid.fill(0);
    this._pourQueue = [];
    this.overflowGrains = [];
    this.filledCount = 0;
  }

  /** Which distinct colors are currently present (for history logging). */
  colorsUsed() {
    const seen = new Set();
    for (let i = 0; i < this.grid.length; i++) {
      const id = this.grid[i];
      if (id !== 0) seen.add(this.colorTable[id]);
    }
    return Array.from(seen);
  }
}
