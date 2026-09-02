# Field

An infinite sheet of white paper for thinking about industries, technologies,
problems and career paths. No toolbar, no sidebar, no cards. Hierarchy is carried
by typography, colour and space; everything else stays hidden until you reach for it.

Every thought sits in its own blob of wax — two pigments, slowly moving, lit from
the thought's own id so a map looks the same every time you open it and no two
blobs on screen are ever in step. Headlines are set in Bagel Fat One, everything
growing beneath them in Fraunces.

It opens blank, with one question on it — *What will we be creating today?* — and
*tap anywhere to start* underneath. There is a worked example (energy, housing,
AI, with cross-links and a long note) behind **Load the example map** in `⌘K`,
for anyone who would rather see the idea than begin one.

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # typecheck + production bundle into apps/web/dist/
npm run mobile   # the same board on iOS and Android — see apps/mobile/README.md
```

The map itself works entirely offline: every keystroke goes to IndexedDB in this
browser, with no account and no network involved. An account is optional, and only
buys one thing — somewhere for a map to live besides this browser. See
[Saving](#saving).

---

## The gestures

| | |
|---|---|
| Click empty paper | new thought (first click clears the selection if something is selected) |
| Click a thought | select |
| `E` or `Return` | edit the selected thought |
| `Return` while editing | finish |
| `Tab` | new child beneath |
| `⌘Return` / `⌥Return` | new sibling beside |
| `⇧Tab` / `↑` | go to the parent |
| `↓` `←` `→` | first child, previous sibling, next sibling |
| Double click | open the long note |
| `N` | open the long note of the selected thought |
| Drag a thought | move it (hold `⌥` to bring its whole branch) |
| Drag the small dot on its right | connect it to another thought |
| `L` | start a connection from the keyboard, then click the other thought |
| Click a dotted connection | label it — *requires*, *enables*, *competes with* |
| `F` | focus this branch; the rest of the world fades |
| `T` | tidy this branch and everything under it |
| `⌫` | delete (a branch asks once before it goes) |
| `⌘Z` / `⌘⇧Z` | undo / redo |
| `⌘K` or `/` | search and commands |
| `⌘S` | save the map to your account |
| `⌘0` | zoom to fit · `⌘+` `⌘-` zoom · `Esc` step back out |
| Two-finger scroll | pan · pinch or `⌘`-scroll to zoom · `Space`-drag to pan |

Nothing is ever lost to a keystroke: every structural change is undoable, and a
branch with children asks before it is deleted.

---

## What a thought holds

On the canvas a thought is only its words. Everything else lives one double click
away in the note sheet: the long note, links you paste into it (collected as chips
at the bottom), and optional attributes — interest, founder fit, market size,
knowledge barrier, capital intensity, conviction, type and accent.

Two marks are allowed onto the canvas, both tiny: a dot for conviction
(curious → researching → promising → high conviction → rejected) and a short rule
under the words when there is a note to read. Everything else — the type label, the
`+`, the connection handle — appears only under the cursor.

## Saving

Every change is written to IndexedDB (localStorage if IndexedDB is unavailable),
debounced, with a small dot in the corner blinking once when it lands. The camera
is remembered too. This happens whether or not anyone is signed in, and it is the
only saving the app actually depends on.

### Saving to an account

The button in the bottom left saves the map to an account. Pressing it without one
opens a sheet that makes one — email and password, no email round trip, and the
save carries straight on afterwards. `⌘S` does the same thing. Once a map is saved
the button stands down to the map's name, and lights up again the moment the map
changes. **maps** beside it is the shelf: every map on the account, oldest edits
last, click to open, hover to delete.

A map saved to an account is still saved locally, and losing the network loses
nothing. The account is a shelf, not the floor.

**How it works.** Sign-in is [Neon Auth](https://neon.com/docs/neon-auth/overview),
and maps live in one Postgres table reached through the
[Neon Data API](https://neon.com/docs/data-api/get-started) — so there is still no
server in this repository. The browser talks to PostgREST directly, and every
policy on `maps` is `owner_id = auth.user_id()`, with `owner_id` defaulting to the
same expression on insert. A client cannot write a row it would not be allowed to
read back, and the database verifies the token on every request; nothing in the
browser is trusted with anything.

```sql
create table public.maps (
  id         uuid primary key default gen_random_uuid(),
  owner_id   text not null default auth.user_id(),
  title      text not null default 'Untitled map',
  board      jsonb not null,          -- the export format, verbatim
  node_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Copy `.env.example` to `.env` and fill in three values from your own Neon project
to enable it. Without them the save button does not appear and the app is exactly
what it was before: a sheet of paper in one browser.

The stored `board` column is the same JSON the file exporter writes, so a map that
round-trips through the cloud is the same map that round-trips through disk. An
imported file arrives unlinked on purpose — a map someone sends you must not try to
overwrite the row it came from.

From `⌘K`: **Export map as JSON**, **Import map from JSON**, **Export view as PNG**,
**Export whole map as PNG**, **Export whole map as SVG**, plus **Clear the board**
and **Load the example map** (which asks first, unless the sheet is already blank).

Images are not screenshots of the DOM — the board is redrawn as SVG using the same
typography metrics the canvas uses, so exports include off-screen thoughts, come out
at any resolution, and the SVG is real vector output.

The JSON is the storage format verbatim: ids, text, notes, attributes, parent links,
cross-links and their labels, positions, accents, depth and timestamps — which is
what let the account shelf be a `jsonb` column and a transport, rather than a
migration.

---

## Layout

Placement follows two rules:

1. A branch may tidy itself. The map never tidies itself.
2. Anything you have dragged is pinned, and auto-layout leaves it alone forever
   after — unless you explicitly ask for **Tidy branch**.

New children land in a centred row under their parent, with the row's width buying
extra vertical headroom so wide fans do not flatten into a tangle. Positions carry a
deterministic wobble derived from the thought's id, so the tree reads as growth
rather than as an org chart, and looks identical every time it is drawn.

## Architecture

The repository is a workspace with one shared package and two apps.

```
packages/core/    everything Field knows that is not about a screen
  model/          types, graph queries, layout, the demo map
  commands/       pure Board -> Board transforms
  canvas/         world transform, typography metrics, geometry,
                  the wax palette and per-node lava
  account/        Neon Auth over plain fetch
  library/        the maps table over the Neon Data API

apps/web/         the browser: DOM nodes, SVG edges, IndexedDB, PNG/SVG export
apps/mobile/      iOS and Android: Skia canvas, SQLite, the radial ring
```

`packages/core` is compiled without `lib.dom` on purpose — the type checker is
the cheapest possible test that nothing in it has reached for a browser. The
two things it cannot know for itself are injected: how wide a run of text is
(`setTextMeasurer`) and where the account keys and refresh token live
(`configure`). See `packages/core/src/runtime.d.ts` for the short list of
globals it is allowed to assume.

```bash
npm install
npm run dev       # the web app, http://localhost:5180
npm run build     # typecheck + production bundle
npm run mobile    # expo start
npm run ios       # or npm run android
npm run typecheck # every workspace
```

Some notes on the shape of it:

Some notes on the shape of it:

- **Typography is the layout engine.** `canvas/typography.ts` measures and wraps
  every string through one canvas context. The DOM renders those exact lines, the
  layout uses those exact widths, and the exporter re-wraps identically. One source
  of truth means the board, the file and the picture always agree.
- **Camera lives in its own context** and every prop handed to the memoised node and
  edge layers is identity-stable, so a pan touches one `transform` and nothing
  re-renders. Off-screen thoughts are culled with a margin that scales with the
  view; a 1,200-thought map pans at 60fps and holds ~70 DOM nodes at working zoom.
- **Commands are pure functions.** `commands/board.ts` knows nothing about React,
  the DOM or undo; the store owns history and coalesces typing and dragging into
  single undo steps.
- **No animation library, and no per-blob keyframes.** There are three shared
  `@keyframes` for the wax and three for the lamp behind it. Everything that makes
  one blob different from its neighbour — pigment, partner pigment, period, phase,
  lean — is a custom property written once from the thought's id, and a negative
  `animation-delay` drops each lobe in mid-cycle. Only `transform` is animated, so
  the compositor owns all of it and a board of blobs costs the same as a board of
  words. All of it stands down under `prefers-reduced-motion` — the colour stays,
  only the motion goes.
- **Partner pigments are hue neighbours.** The second lobe multiplies into the
  first, and two colours from opposite sides of the wheel multiply to mud. Teal
  under grape came out a dead navy, which is the one thing a lava lamp never is.
- **Fonts are vendored, not linked.** The board measures its own text through one
  canvas context, so a measurement taken against a fallback face would be baked into
  every node position; the app waits for the real faces before it draws anything and
  throws away whatever it measured first. The same woff2 bytes are inlined as base64
  into exported SVG, because an SVG opened on its own has no page to inherit from
  and one rasterised through an `<img>` may not fetch anything at all.
- **No auth SDK.** Neon Auth is Stack Auth, whose JavaScript SDK pulls in a session
  recorder, a table library, a QR encoder and a TypeScript runner in order to render
  an email field. `account/stack.ts` is five `fetch` calls instead, which keeps the
  dependency list at React and nothing else — and the sign-in sheet in the app's own
  voice.

- **One core, two screens.** The phone is not a second implementation. The
  model, the layout engine, the command transforms and the wax maths are the
  same files the browser runs; what is written twice is only what touches a
  screen. The seam is text measurement, because a browser and Skia do not agree
  to the pixel and the board's layout is derived from measured width — so the
  core owns the wrap and each platform supplies the ruler. On the phone that
  ruler is five static font instances baked from the same variable file the web
  app links, pinned at the weight and optical size the browser resolves for each
  depth; `apps/mobile/scripts/check-font-parity.py` fails the build if they ever
  drift apart. They currently agree to 0.05px on a 22px line.

## Deliberate omissions

No grid, no minimap, no node shapes, no colour picker on the canvas, no counters, no
inspector panel, no auto-arrange of the whole map, no sharing, no collaborators, no
autosave to the account behind your back. Anything that could wait until it was
asked for is waiting behind `⌘K`.
# lava-lamp
