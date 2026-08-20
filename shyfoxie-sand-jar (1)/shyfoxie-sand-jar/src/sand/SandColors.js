// ============================================================================
// SandColors.js
// Resolves a gift name into a sand color using CONFIG.giftColors +
// CONFIG.sandPalette. Keeps all color logic in one place so the rest of
// the app just asks "what color is this gift" and gets an answer.
// ============================================================================

export function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

export function rgbToCss({ r, g, b }, a = 1) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Slightly lighten or darken a hex color. amount: -1..1 */
export function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const adj = (c) => {
    const v = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return rgbToCss({ r: adj(r), g: adj(g), b: adj(b) });
}

const RAINBOW_ORDER = ["red", "orange", "gold", "green", "cyan", "blue", "purple", "pink"];

export class SandColors {
  constructor(config) {
    this.config = config;
    this._rainbowIndex = 0;
  }

  /** List of {key, hex} for UI swatches / test buttons. */
  paletteList() {
    return Object.entries(this.config.sandPalette).map(([key, hex]) => ({ key, hex }));
  }

  paletteHex(key) {
    return this.config.sandPalette[key] || this.config.defaultSandColor;
  }

  /**
   * Resolve a gift name to one or more hex colors.
   * Returns an array because the "rainbow" gift produces a rotating set.
   */
  colorForGift(giftName) {
    const key = (giftName || "").trim().toLowerCase();
    const mapped = this.config.giftColors[key];

    if (!mapped) return [this.config.defaultSandColor];

    if (mapped === "rainbow") {
      // Cycle so consecutive rainbow gifts don't all start on red.
      const order = RAINBOW_ORDER.map((k) => this.paletteHex(k));
      const rotated = order.slice(this._rainbowIndex).concat(order.slice(0, this._rainbowIndex));
      this._rainbowIndex = (this._rainbowIndex + 1) % order.length;
      return rotated;
    }

    // mapped may be a palette key ("pink") or a raw hex ("#ff00aa")
    if (mapped.startsWith("#")) return [mapped];
    return [this.paletteHex(mapped)];
  }

  isBigGift(giftName) {
    const key = (giftName || "").trim().toLowerCase();
    return this.config.bigGifts.includes(key);
  }
}
