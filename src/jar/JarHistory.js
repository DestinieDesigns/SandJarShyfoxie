// ============================================================================
// JarHistory.js
// Saves a lightweight record each time a jar completes. No cloud storage —
// everything lives in localStorage, capped to a max number of entries so
// it can't grow unbounded over a long streaming career.
// ============================================================================

export class JarHistory {
  constructor(config) {
    this.config = config.history;
  }

  _load() {
    if (!this.config.enabled) return [];
    try {
      const raw = localStorage.getItem(this.config.storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  _save(entries) {
    try {
      localStorage.setItem(this.config.storageKey, JSON.stringify(entries));
    } catch {
      /* storage may be unavailable/full — history is a nice-to-have, not critical */
    }
  }

  /**
   * @param {{jarNumber:number, totalLikes:number, colorsUsed:string[], giftCount:number}} entry
   */
  record(entry) {
    if (!this.config.enabled) return;
    const entries = this._load();
    entries.unshift({
      ...entry,
      completedAt: new Date().toISOString(),
    });
    while (entries.length > this.config.maxEntries) entries.pop();
    this._save(entries);
  }

  all() {
    return this._load();
  }

  clear() {
    this._save([]);
  }
}
