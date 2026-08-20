// ============================================================================
// JarCelebration.js
// Plays the 100%-full celebration sequence: shake -> spill -> sparkles ->
// "JAR FULL!" -> glow -> overflow -> drain -> new jar. Pure choreography —
// it manipulates the Jar's simulation directly for the spill/drain visuals
// and toggles CSS classes on the jar element for the shake/glow, but has
// no opinion about likes/gifts/config beyond timing.
// ============================================================================

export class JarCelebration {
  /**
   * @param {Jar} jar
   * @param {HTMLElement} jarEl the DOM element to animate (shake/glow classes)
   * @param {HTMLElement} bannerEl element used to show "JAR FULL!" / "JAR #n" text
   * @param {object} config
   * @param {{onComplete?: Function, onStageChange?: Function, playSound?: Function}} callbacks
   */
  constructor(jar, jarEl, bannerEl, config, callbacks = {}) {
    this.jar = jar;
    this.jarEl = jarEl;
    this.bannerEl = bannerEl;
    this.config = config;
    this.callbacks = callbacks;
    this.playing = false;
    this._timers = [];
    this._drainInterval = null;
  }

  _after(ms, fn) {
    const id = setTimeout(fn, ms);
    this._timers.push(id);
    return id;
  }

  _clearTimers() {
    this._timers.forEach(clearTimeout);
    this._timers = [];
    if (this._drainInterval) {
      clearInterval(this._drainInterval);
      this._drainInterval = null;
    }
  }

  /** Kick off the full sequence. Safe to call only once per completion. */
  play() {
    if (this.playing) return;
    this.playing = true;

    const total = this.config.resetDurationMs;
    // Proportional stage timings so the whole thing scales with
    // resetDurationMs if the user changes it in config.
    const tShake = total * 0.08;
    const tSpill = total * 0.14;
    const tSparkle = total * 0.12;
    const tBanner = total * 0.16;
    const tGlow = total * 0.1;
    const tDrain = total * 0.32; // the longest, most satisfying stage
    const tNewJar = total * 0.08;

    this.callbacks.playSound?.("milestone");
    this._stage("shake");

    let t = 0;
    this._after(t, () => this.jarEl.classList.add("jar--shake"));
    t += tShake;

    this._after(t, () => {
      this.jarEl.classList.remove("jar--shake");
      this._stage("spill");
      // A little sand spills over the rim.
      this.jar.simulation.spillFromTop(Math.round(this.jar.capacityCells * 0.02));
      this.jar.renderer.addSparkleBurst(Math.floor(this.jar.simulation.cols / 2), 2, 10);
    });
    t += tSpill;

    this._after(t, () => {
      this._stage("sparkle");
      const cols = this.jar.simulation.cols;
      for (let i = 0; i < 6; i++) {
        this.jar.renderer.addSparkleBurst(Math.floor(Math.random() * cols), Math.floor(Math.random() * 8), 8);
      }
    });
    t += tSparkle;

    this._after(t, () => {
      this._stage("banner-full");
      this.callbacks.playSound?.("complete");
      this._showBanner(`\u2728 JAR FULL! \u2728`);
    });
    t += tBanner;

    this._after(t, () => {
      this._stage("glow");
      this.jarEl.classList.add("jar--glow");
    });
    t += tGlow;

    this._after(t, () => {
      this._stage("drain");
      this.jarEl.classList.remove("jar--glow");
      this._hideBanner();
      this._runDrain(tDrain);
    });
    t += tDrain;

    this._after(t, () => {
      this._stage("new-jar");
      this.callbacks.playSound?.("reset");
      const newNumber = this.jar.startNewJar();
      this._showBanner(`\u{1F3FA} JAR #${newNumber}\nLET'S FILL IT!`);
      this.callbacks.onNewJar?.(newNumber);
    });
    t += tNewJar;

    this._after(t, () => {
      this._hideBanner();
      this.playing = false;
      this.callbacks.onComplete?.();
    });
  }

  _runDrain(durationMs) {
    const totalGrains = this.jar.simulation.countFilled();
    if (totalGrains === 0) return;

    const tickMs = 40;
    const ticks = Math.max(1, Math.floor(durationMs / tickMs));
    const perTick = Math.ceil(totalGrains / ticks);

    this._drainInterval = setInterval(() => {
      const removed = this.jar.simulation.drainFromBottom(perTick);
      // Occasional sparkle as sand disappears, for polish.
      if (Math.random() < 0.3) {
        this.jar.renderer.addSparkleBurst(
          Math.floor(Math.random() * this.jar.simulation.cols),
          this.jar.simulation.rows - 2,
          2
        );
      }
      if (removed === 0 || this.jar.simulation.countFilled() === 0) {
        clearInterval(this._drainInterval);
        this._drainInterval = null;
      }
    }, tickMs);
  }

  _showBanner(text) {
    if (!this.bannerEl) return;
    this.bannerEl.textContent = text;
    this.bannerEl.classList.add("banner--visible");
  }

  _hideBanner() {
    if (!this.bannerEl) return;
    this.bannerEl.classList.remove("banner--visible");
  }

  _stage(name) {
    this.callbacks.onStageChange?.(name);
  }

  destroy() {
    this._clearTimers();
  }
}
