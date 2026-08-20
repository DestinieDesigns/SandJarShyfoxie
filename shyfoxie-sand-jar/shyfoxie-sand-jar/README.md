# Shyfoxie's LIVE Sand Jar

An interactive sand-art jar built for TikTok LIVE. **Likes fill the jar. Gifts
color the sand.** It's a transparent Browser Source you can drop into
**Streamlabs Desktop or OBS** over your gameplay or webcam — either running
locally or hosted for free on **GitHub Pages** — and it works fully offline
with test buttons before you ever touch a real TikTok connection.

- Individual falling grains, piling, sliding, small avalanches — a real
  (grid-based) sand simulation, not a filling bar.
- Gifts pour their own colored sand and tint whatever likes pour in next,
  so the jar naturally builds up in colored **layers**.
- A full celebration sequence at 100%: shake → spill → sparkles → "JAR
  FULL!" → glow → drain → new jar.
- A test control panel so you can try everything without being live.
- An optional, isolated TikTok bridge you can wire up later.

---

## 1. Quick start (test mode, no TikTok needed)

You need [Node.js](https://nodejs.org) 18+ installed (just for the tiny
local static server — there's no build step and no dependencies to install
for the visual itself).

```bash
node serve.js
```

Then open:

```
http://localhost:5500/?mode=test
```

You'll see the jar plus a **TEST CONTROLS** panel in the top-right corner.
Click the like/gift buttons and watch the sand fall, layer, and eventually
fill the jar and celebrate. This is milestone #1 — everything works with
zero TikTok setup.

> Why a server instead of double-clicking `index.html`? The app uses native
> `<script type="module">` imports, and most browsers block ES modules from
> loading over `file://` URLs. `serve.js` is a ~40-line zero-dependency
> static file server that sidesteps that.

### Useful URL parameters

| Param | Values | Effect |
|---|---|---|
| `mode` | `test` (default) / `live` | Shows/hides the test control panel and enables/disables the TikTok bridge connection |
| `debug` | `true` | Shows the FPS / particle count / state overlay |
| `bg` | `on` | Adds a visible backdrop, purely to make the jar easier to see in a plain browser tab. **The background is transparent by default in every mode** — this is what makes it safe to drop straight into Streamlabs/OBS with no extra config. |

Example: `http://localhost:5500/?mode=live&debug=true`

---

## 2. Project structure

```
shyfoxie-sand-jar/
├── index.html              # entry point
├── serve.js                 # zero-dependency local static server
├── package.json
├── README.md
├── .nojekyll                 # tells GitHub Pages to skip Jekyll processing
│
├── .github/
│   └── workflows/
│       └── deploy-pages.yml    # optional auto-deploy to GitHub Pages
│
├── src/
│   ├── main.js               # wiring: config → jar → UI → events
│   ├── config.js              # ALL tunable values live here
│   ├── events.js               # central event bus / handleEvent()
│   │
│   ├── sand/
│   │   ├── SandSimulation.js    # grid-based falling-sand physics
│   │   ├── SandRenderer.js       # canvas drawing, grain texture, sparkles
│   │   └── SandColors.js          # gift name -> color resolution
│   │
│   ├── jar/
│   │   ├── Jar.js                # likes/gifts -> sand amount & color
│   │   ├── JarCelebration.js      # the 100%-full sequence
│   │   └── JarHistory.js           # localStorage log of completed jars
│   │
│   ├── ui/
│   │   ├── Alerts.js              # queued gift alert popups
│   │   ├── Counter.js              # animated like counter
│   │   └── DebugPanel.js            # ?debug=true overlay
│   │
│   └── integrations/
│       ├── MockEvents.js           # test buttons + optional ambient demo traffic
│       └── TikTokAdapter.js         # WebSocket client for the bridge (below)
│
├── server/                    # OPTIONAL — only needed for real TikTok LIVE
│   ├── tiktok-bridge.js
│   ├── package.json
│   └── .env.example
│
├── styles/
│   ├── main.css / jar.css / animations.css / debug.css
│
├── assets/sounds/, assets/images/   # empty by default — see Sound section
│
└── test/                      # optional automated sanity checks (see below)
    ├── smoke.mjs                 # general flow: likes, gifts, celebration, shake
    └── smoke-live.mjs             # verifies ?mode=live hides all dev/test UI
```

---

## 3. Configuring it (no code changes needed)

Everything tunable lives in **`src/config.js`**: brand name/title, the
likes-per-percent conversion rate, the sand color palette, gift → color
mappings, which UI elements are shown, sound, jar dimensions, and more.
Open it and read the comments — every field is documented there.

A few of the most common tweaks:

```js
likesPerPercent: 500,       // higher = jar fills more slowly per like
jarCapacity: 100,
resetDurationMs: 9000,      // total time for the full celebration sequence
giftColors: {
  "rose": "pink",
  "lion": "gold",
  // add your own: "galaxy": "purple", or a raw hex: "confetti": "#ff00aa"
},
bigGifts: ["lion", "galaxy", "rainbow"], // get a bigger stream + glow
```

---

## 4. How the fill math works

- The sand grid has a fixed number of cells (`config.simulation.cols x
  rows`). ~90% occupancy is treated as "100% full" (real poured sand never
  perfectly packs every cell, and this keeps the celebration triggering at
  a moment that actually looks full).
- **Likes** convert into grains: `grains = (likeCount / likesPerPercent) *
  (capacityCells / 100)`. Likes are batched (see `config.batching`) so a
  flood of individual TikTok likes becomes one smooth pour every ~350ms
  instead of hundreds of tiny events.
- **Gifts** add a smaller amount of sand in their own color
  (`giftBaseAmountPercent` per gift, multiplied for `bigGifts`), and also
  tint the *next* several seconds of like-driven sand the same color —
  that's what produces the colored layering effect as different gifts
  come in over time.

---

## 5. The 100%-full celebration

When the jar reaches capacity, `JarCelebration.js` runs a staged sequence
(shake → spill → sparkles → "JAR FULL!" banner → glow → drain → new jar),
scaled to `config.resetDurationMs` (default 9 seconds). The jar stops
accepting new likes/gifts while the celebration is playing, then
immediately starts accepting them again once the new jar appears — matching
"the jar must actually reset" rather than looping a fake animation.

Every completed jar is logged (jar number, timestamp, total likes, colors
used, gift count) to `localStorage` via `JarHistory.js`, capped at
`config.history.maxEntries` entries.

---

## 6. Shake Jar

A settle/flatten action for the sand *already* in the jar — it's for
tidying up a lopsided or peaky pile, not for adding excitement points.
Click **🫨 Shake Jar** in the test panel (or send a normalized `{type:
"shake"}` event — see below) and:

- The glass visibly rocks side to side for ~2 seconds (`config.shake.durationMs`),
  gently decaying and tilting like a real jar being nudged, then settles
  back to level (`styles/animations.css`, `.jar--shaking` /
  `jarShakeSettle`).
- Under the hood, `SandSimulation.startShake()` temporarily makes sand
  more willing to slide off a slope and runs a "surface pass" that hops
  grains sideways from taller columns to shorter neighbors —
  `SandSimulation._shakeSurfacePass()` in `src/sand/SandSimulation.js`.
  This only ever **moves** existing grains between cells; nothing is
  created, deleted, or recolored. The jar number, like count, and fill
  percentage are completely untouched — verified by an automated check in
  `test/smoke.mjs`.
- Sand keeps resettling naturally for a moment after the shake stops,
  since the normal per-frame physics step never pauses.
- Respects `config.effects.reduceFlashing` — the glass motion is skipped
  for accessibility, though the sand still physically resettles.

Shake is a first-class Sand Engine event, not something hard-wired to the
button — see the next section.

---

## 7. The event architecture (and what's already prepared for Twitch)

Every interaction — a like, a gift, a follow, a shake, eventually Twitch
chat/bits/subs — enters the app through exactly one place:
`handleEvent()` in `src/events.js`. It normalizes whatever comes in and
puts it on a small internal event bus (`bus`); everything else (the Jar,
the UI, alerts) only ever listens to that bus. This is what makes the
test buttons a genuine stand-in for a real event source rather than a
separate "fake" code path — clicking **Shake Jar**, for instance, calls
`handleEvent({type: "shake"})`, the *exact* same call a future Twitch/TikTok
bridge would make.

Already wired end-to-end (event → Jar behavior → UI): `like`, `gift`,
`follow`, `share`, `comment`, `shake`.

Reserved but not yet implemented — `events.js` already forwards these
without warning so a future bridge can start sending them immediately,
but there's no Sand Engine behavior attached yet:

- `subscribe` — Twitch subscription / TikTok subscribe
- `giftSub` — Twitch gift subscription
- `bits` — Twitch bits/cheer
- `channelPoints` — Twitch channel point redemption

When you're ready to wire one up, `Jar.addFollow()` / `Jar.addShare()` /
`Jar.addCommentBatch()` in `src/jar/Jar.js` are the templates to copy —
each just resolves a config-driven color/amount and pours a small amount
of sand, the same shape every future event type will need. The Sand
Engine itself (`src/sand/`) never needs to change for any of this; it has
no concept of TikTok, Twitch, or any other platform.

---

## 8. Sound (optional, off by default)

`config.sound.enabled` is `false` out of the box. If you want sound:

1. Drop your own short audio files into `assets/sounds/` matching the
   filenames in `config.sound.files` (`pour.mp3`, `gift.mp3`,
   `milestone.mp3`, `complete.mp3`, `reset.mp3`) — these aren't included,
   since sound is optional and licensing your own clips is up to you.
2. Set `sound.enabled: true` and adjust `sound.masterVolume` in
   `src/config.js`.

Missing sound files fail silently — the visual never depends on sound.

---

## 9. Connecting to real TikTok LIVE

**You don't need this for testing.** The jar is fully functional in
`?mode=test` with zero TikTok setup. Read this section when you're ready
to go live.

### Why a separate server

TikTok has no official public API for reading livestream events. The
current, actively-maintained community approach is
[`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector),
an open-source Node.js package that reads the same public Webcast data any
viewer's browser already receives — **no password or login required, just
your public `@username`, and only while you're actually live.** Because
that package needs to run in Node (not a browser tab), it lives in its own
small process — `server/tiktok-bridge.js` — completely separate from the
visual app. If TikTok ever changes something and the library needs an
update, only that one file/process is affected; the sand jar itself keeps
working fine in test mode regardless.

```
TikTok LIVE → tiktok-live-connector (Node) → server/tiktok-bridge.js
            → local WebSocket (ws://localhost:8081)
            → src/integrations/TikTokAdapter.js (runs in your browser)
            → handleEvent() → the rest of the app
```

### Setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `.env`:

```
TIKTOK_USERNAME=youraccountname   # no @, no password
BRIDGE_PORT=8081
```

Start the bridge (your TikTok account needs to actually be LIVE for the
connection to succeed):

```bash
npm start
```

Then, with the main app also running (`node serve.js` from the project
root), open:

```
http://localhost:5500/?mode=live
```

The overlay will connect to `ws://localhost:8081` (configurable in
`src/config.js` under `websocket.url`) and start receiving real likes and
gifts. If the bridge or TikTok connection drops, the overlay auto-reconnects
(`config.websocket.autoReconnect`) — a dropped connection never crashes the
visual, it just waits.

### Notes on reliability

- `tiktok-live-connector` is **unofficial and community-maintained**, not
  affiliated with or endorsed by TikTok/ByteDance. It can require an API
  key from its signing dependency (Euler Stream) if you hit rate limits —
  see the comments in `server/tiktok-bridge.js` and the package's own docs.
- Keep it updated periodically: `cd server && npm update tiktok-live-connector`.
- Gift "streaks" (holding down a repeatable gift) are only forwarded once
  the streak ends, so one gift doesn't trigger five separate sand pours.

---

## 10. Hosting on GitHub Pages (recommended for Streamlabs)

The whole front-end is a static site — plain HTML/CSS/JS, no build step —
so GitHub Pages is a great fit: you get a permanent HTTPS URL you can
point Streamlabs (or OBS) at, instead of relying on a local server staying
open. It works correctly at a **project-page subpath**
(`https://USERNAME.github.io/REPOSITORY/`) because every asset reference
in the project — `<link>`/`<script>` tags in `index.html`, the ES module
imports between `src/` files, and the sound file paths in `config.js` — is
a relative path, never an absolute `/...` one. Nothing needs to change to
deploy it.

### Deploy it

Pick either method:

**A — Deploy from a branch (simplest, no setup)**
1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to "Deploy from a branch",
   branch `main`, folder `/ (root)`.
4. Save. GitHub will publish at `https://USERNAME.github.io/REPOSITORY/`
   within a minute or two.

**B — GitHub Actions (auto-deploys on every push)**
1. Go to **Settings → Pages → Source** and select "GitHub Actions".
2. The included `.github/workflows/deploy-pages.yml` handles the rest —
   push to `main` and it publishes automatically.

Either way, the repo also ships a `.nojekyll` file at the root, which
tells GitHub Pages to serve the files exactly as they are instead of
running them through Jekyll (which isn't needed here and could otherwise
mangle folder names or file handling).

### Using the hosted URL

Once it's live, treat `https://USERNAME.github.io/REPOSITORY/` exactly
like the local `http://localhost:5500/` URL from the Quick Start section —
the same `?mode=`, `?debug=`, and `?bg=` query parameters all work
identically:

```
https://USERNAME.github.io/REPOSITORY/?mode=test     # test buttons, transparent bg
https://USERNAME.github.io/REPOSITORY/?mode=live      # production, connects to the TikTok bridge if running
```

**The background is transparent by default in every mode** (see the URL
parameters table above) — that's what makes it safe to paste straight into
a Streamlabs/OBS Browser Source with no extra "enable transparency" step.

---

## 11. Using it in Streamlabs Desktop

No OBS required — Streamlabs Desktop's Browser Source works the same way
and is fully supported:

1. Deploy the site to GitHub Pages (see previous section), or run it
   locally with `node serve.js` for quick iteration.
2. In Streamlabs Desktop, in your Scene, click **+ Add Source → Browser
   Source**.
3. Set **URL** to your GitHub Pages link (add `?mode=live` once you're
   ready for production, or leave it as `?mode=test` while you're setting
   things up — see the URL parameters table above).
4. Set **Width/Height** — around **600 × 800** is a good starting point
   (or match your `config.jar` width/height plus margin; the jar is
   responsive and scales down cleanly at smaller sizes too).
5. Leave **"Shutdown source when not visible"** unchecked so the sand
   simulation doesn't reset every time you switch scenes.
6. No transparency checkbox needed — the page's background is transparent
   by default, so it composites cleanly over your game capture or webcam.
7. To click the test-mode buttons while previewing in Streamlabs (rather
   than in a regular browser tab), right-click the source and choose
   **Interact**.
8. Position and resize the source in your scene like any other source.

Test at 1920×1080 and 1280×720 canvases to confirm the jar reads clearly
at your stream's actual resolution — `config.ui.uiScale` and `config.jar`
width/height can be tuned if you want it bigger/smaller.

> **OBS note:** these same steps work unchanged in OBS's Browser Source —
> it's the same underlying Chromium-based browser source technology, so
> nothing here is Streamlabs-specific except the exact menu names.

### About the future TikTok/event bridge and HTTPS

Once you're hosting the front-end on `https://...github.io`, the page
itself is served over HTTPS, but `config.websocket.url` still defaults to
`ws://localhost:8081` — a **local, unencrypted** WebSocket. This still
works: browsers (and Streamlabs' embedded Chromium) exempt connections to
`localhost`/`127.0.0.1` from the usual "HTTPS page can't open an insecure
connection" (mixed-content) restriction, since a loopback connection can't
be intercepted on the network the way a remote one could. This is exactly
the setup described in section 7 — the bridge server runs locally on your
own streaming PC, and Streamlabs' browser source (also running on that
same PC) connects to it over `localhost`.

If you ever move the event server off your local machine (e.g. onto a
remote host), you'll need to switch `websocket.url` to `wss://` (secure
WebSocket) with a valid certificate — a plain `ws://` connection to a
non-localhost host will be blocked by the page's HTTPS mixed-content
policy.

The Sand Engine (`src/sand/`, `src/jar/`) has no idea any of this exists —
it only ever receives normalized `{type: "like"|"gift"|...}` events
through `handleEvent()` (see `src/events.js`), regardless of whether
they came from a test button, the TikTok bridge, or any future
Twitch/other-platform event server you point `websocket.url` at. Swapping
or adding an event source never requires touching `src/sand/` or
`src/jar/`.

---

## 12. Performance & long-run stability

- The sand simulation is a **fixed-size typed array grid** — memory never
  grows no matter how long the stream runs.
- Sparkle particles are capped (hard limit inside `SandRenderer.js`) so a
  gift storm can't spiral into thousands of particles.
- The render loop pauses entirely when the browser tab/OBS source is
  hidden (`document.hidden`), so it doesn't burn CPU when off-screen.
- Turn on `?debug=true` to watch FPS, sand cell count, and pending-pour
  size live while stress-testing (e.g. mashing the like buttons or running
  the ambient demo traffic generator in the test panel).

Two automated sanity checks are included — one boots the whole app in a
headless DOM and clicks through likes/gifts/fill/celebrate/shake (checking
the jar resets correctly and that shaking never adds, removes, or resets
any sand), the other specifically verifies `?mode=live` hides every
test/debug element and stays transparent:

```bash
npm install    # installs jsdom, dev-only, not needed to run the app itself
npm run smoke-test
```

---

## 13. Accessibility

- `config.effects.reduceFlashing: true` disables the jar-shake and glow
  animations for anyone sensitive to that kind of motion, while keeping
  the rest of the experience intact.
- Alerts and percentage/like text are never color-only indicators — labels
  and numbers are always present alongside the color.
- Every UI element (title, jar number, like counter, percentage, alerts)
  can be individually toggled off in `config.ui`.

---

## 14. What's deliberately NOT included

- No paid APIs, no cloud services, no database — everything after the
  optional TikTok bridge is local files and `localStorage`.
- No build step, no bundler, no framework — plain ES modules, so you can
  open any file and read exactly what it does.
