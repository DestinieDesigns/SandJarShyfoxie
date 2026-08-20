// ============================================================================
// Jar.js
// The Jar ties together the physics (SandSimulation) and the visuals
// (SandRenderer), and translates "business logic" — likes, gifts, jar
// numbers — into sand pours and fill percentages. This is the piece that
// knows what a "like" or a "gift" *means* for the sand; the simulation
// itself has no idea what a like is.
// ============================================================================

import { SandSimulation } from "../sand/SandSimulation.js";
import { SandRenderer } from "../sand/SandRenderer.js";
import { SandColors } from "../sand/SandColors.js";

const JAR_NUMBER_KEY = "shyfoxie_sand_jar_number";

export class Jar {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} config the app CONFIG object
   */
  constructor(canvas, config) {
    this.config = config;
    this.canvas = canvas;

    const { cols, rows } = config.simulation;
    this.simulation = new SandSimulation(cols, rows, {
      sandPhysicsIntensity: config.effects.sandPhysicsIntensity,
    });
    this.renderer = new SandRenderer(canvas, this.simulation, {
      cellPx: 4,
      enableSparkles: config.effects.enableSparkles,
    });
    this.colors = new SandColors(config);

    // Real packed sand never fills every single grid cell (small gaps
    // between grains and along the settling surface are normal), so we
    // treat ~90% grid occupancy as "100% full". This also means the jar
    // visually looks nicely filled right when the celebration triggers,
    // rather than requiring physically-impossible perfect packing.
    this.capacityCells = Math.floor(cols * rows * 0.9);

    this.totalLikes = 0;
    this.totalFollows = 0;
    this.totalShares = 0;
    this.totalComments = 0;
    this.jarNumber = this._loadJarNumber();
    this.isFull = false;
    this._shakeTimer = null;

    // Simple pub-sub so main.js / UI modules can react without polling.
    this._listeners = { full: [], percentChange: [], shakeStart: [], shakeEnd: [] };
  }

  on(event, fn) {
    this._listeners[event]?.push(fn);
  }

  _emit(event, payload) {
    for (const fn of this._listeners[event] || []) fn(payload);
  }

  _loadJarNumber() {
    if (!this.config.persistJarNumber) return 1;
    try {
      const stored = localStorage.getItem(JAR_NUMBER_KEY);
      return stored ? parseInt(stored, 10) || 1 : 1;
    } catch {
      return 1; // localStorage unavailable (e.g. some OBS browser source configs)
    }
  }

  _saveJarNumber() {
    if (!this.config.persistJarNumber) return;
    try {
      localStorage.setItem(JAR_NUMBER_KEY, String(this.jarNumber));
    } catch {
      /* non-fatal */
    }
  }

  // -- Converting real-world events into sand -------------------------------

  /** How many grains correspond to one percentage point of the jar. */
  get grainsPerPercent() {
    return this.capacityCells / 100;
  }

  addLikes(count) {
    if (this.isFull || count <= 0) return;
    this.totalLikes += count;

    const grains = Math.round((count / this.config.likesPerPercent) * this.grainsPerPercent);
    if (grains <= 0) return;

    // Likes always pour in the current "default" sand color unless a
    // gift is actively changing the stream color (handled by main.js
    // tracking the "active color" and passing it in — see addLikesColored).
    this.pourGrains(grains, [this.config.defaultSandColor], { big: count >= 1000 });
  }

  /** Same as addLikes but with an explicit color (used when a gift recently changed the active stream color). */
  addLikesColored(count, colorHex) {
    if (this.isFull || count <= 0) return;
    this.totalLikes += count;
    const grains = Math.round((count / this.config.likesPerPercent) * this.grainsPerPercent);
    if (grains <= 0) return;
    this.pourGrains(grains, [colorHex], { big: count >= 1000 });
  }

  addGift(giftName, repeatCount = 1) {
    if (this.isFull) return null;
    const colors = this.colors.colorForGift(giftName);
    const isBig = this.colors.isBigGift(giftName);
    const multiplier = isBig ? this.config.giftBigMultiplier : 1;

    const percent = this.config.giftBaseAmountPercent * repeatCount * multiplier;
    const grains = Math.round(percent * this.grainsPerPercent);

    this.pourGrains(Math.max(grains, 4), colors, { big: isBig });

    return { colors, isBig };
  }

  pourGrains(grains, colors, opts = {}) {
    this.simulation.pour(grains, colors, opts);
  }

  /** Resolves a config color entry — either a palette key ("purple") or a raw hex ("#a970ff"). */
  _resolveColor(value) {
    if (!value) return this.config.defaultSandColor;
    return value.startsWith("#") ? value : this.colors.paletteHex(value);
  }

  // -- Social events: follows, shares, comments -------------------------------
  // These are architected the same way as gifts (their own small sand
  // contribution + optional alert) but are driven by config.social instead
  // of a name-lookup table, since there's only one "kind" of each.

  addFollow(username) {
    const cfg = this.config.social.follow;
    if (!cfg.enabled || this.isFull) return null;
    this.totalFollows++;

    const colorHex = this._resolveColor(cfg.color);
    if (cfg.addsSand) {
      const grains = Math.round(cfg.amountPercent * this.grainsPerPercent);
      this.pourGrains(Math.max(grains, 3), [colorHex], { big: cfg.big });
    }
    return { colorHex, big: cfg.big, showAlert: cfg.showAlert };
  }

  addShare(username) {
    const cfg = this.config.social.share;
    if (!cfg.enabled || this.isFull) return null;
    this.totalShares++;

    const colorHex = this._resolveColor(cfg.color);
    if (cfg.addsSand) {
      const grains = Math.round(cfg.amountPercent * this.grainsPerPercent);
      this.pourGrains(Math.max(grains, 3), [colorHex], { big: cfg.big });
    }
    return { colorHex, big: cfg.big, showAlert: cfg.showAlert };
  }

  /**
   * Comments are batched by the caller (main.js) the same way likes are —
   * this just converts an already-batched count into a (usually tiny)
   * pour, since a single comment shouldn't visibly move the jar.
   */
  addCommentBatch(count) {
    const cfg = this.config.social.comment;
    this.totalComments += count;
    if (!cfg.enabled || !cfg.addsSand || this.isFull || count <= 0) return;

    const grains = Math.round((count / cfg.commentsPerPercent) * this.grainsPerPercent);
    if (grains <= 0) return;
    const colorHex = this._resolveColor(cfg.color);
    this.pourGrains(grains, [colorHex]);
  }

  // -- Per-frame update ------------------------------------------------------

  /** Advance physics + render. Returns the current fill percent. */
  update() {
    const steps = this.config.simulation.maxStepsPerFrame;
    this.simulation.stepMultiple(steps);
    this.renderer.render();

    const percent = this.simulation.fillPercent(this.capacityCells);
    this._emit("percentChange", percent);

    if (!this.isFull && percent >= this.config.jarCapacity) {
      this.isFull = true;
      this._emit("full", { jarNumber: this.jarNumber, totalLikes: this.totalLikes });
    }

    return percent;
  }

  get percent() {
    return Math.min(100, this.simulation.fillPercent(this.capacityCells));
  }

  // -- Shake Jar --------------------------------------------------------------

  /**
   * Redistributes the sand already in the jar — no grains added, removed,
   * or recolored, and the jar number / percent / totals are untouched.
   * Safe to call from anywhere (test button today; a normalized
   * {type:"shake"} event from any future event source tomorrow — see
   * events.js). Returns false (and does nothing) if a shake is already in
   * progress or the jar is mid-celebration, so triggers can't stack.
   */
  shake() {
    if (this.simulation.isShaking || this.isFull) return false;

    const cfg = this.config.shake;
    this.simulation.startShake(cfg.sandIntensityBoost);
    this._emit("shakeStart", { durationMs: cfg.durationMs });

    clearTimeout(this._shakeTimer);
    this._shakeTimer = setTimeout(() => {
      this.simulation.stopShake();
      this._emit("shakeEnd", {});
      // The grid keeps resettling naturally after this — update() always
      // steps the physics every frame regardless of shake state — so
      // nothing further is needed here to satisfy "keep settling briefly
      // after the jar stops shaking."
    }, cfg.durationMs);

    return true;
  }

  /** Called by JarCelebration once the drain animation finishes. */
  startNewJar() {
    this.simulation.clear();
    this.totalLikes = 0;
    this.totalFollows = 0;
    this.totalShares = 0;
    this.totalComments = 0;
    this.isFull = false;
    this.jarNumber += 1;
    this._saveJarNumber();
    return this.jarNumber;
  }

  /** Force-fill for the "Fill Jar" test button — pours a large amount and fast-forwards physics. */
  debugFillToFull() {
    const remainingPercent = Math.max(0, this.config.jarCapacity - this.percent);
    const grains = Math.ceil((remainingPercent / 100) * this.capacityCells) + 40;
    this.pourGrains(grains, [this.config.defaultSandColor]);
    // Fast-forward simulation so the fill feels immediate for testing.
    for (let i = 0; i < 400 && this.simulation.isPouring; i++) this.simulation.step();
  }

  debugEmpty() {
    this.simulation.clear();
    this.isFull = false;
  }
}
