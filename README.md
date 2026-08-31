# Field

An infinite sheet of warm white paper for thinking about industries, technologies,
problems and career paths. No toolbar, no sidebar, no cards. Hierarchy is carried
by typography and space; everything else stays hidden until you reach for it.

It opens blank, with one question on it — *What will we be creating today?* — and
*tap anywhere to start* underneath. There is a worked example (energy, housing,
AI, with cross-links and a long note) behind **Load the example map** in `⌘K`,
for anyone who would rather see the idea than begin one.

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # typecheck + production bundle into dist/
```

Works entirely offline and locally. No accounts, no server, no network calls.

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
is remembered too.

From `⌘K`: **Export map as JSON**, **Import map from JSON**, **Export view as PNG**,
**Export whole map as PNG**, **Export whole map as SVG**, plus **Clear the board**
and **Load the example map** (which asks first, unless the sheet is already blank).

Images are not screenshots of the DOM — the board is redrawn as SVG using the same
typography metrics the canvas uses, so exports include off-screen thoughts, come out
at any resolution, and the SVG is real vector output.

The JSON is the storage format verbatim: ids, text, notes, attributes, parent links,
cross-links and their labels, positions, accents, depth and timestamps. Adding cloud
sync later is a transport problem, not a migration.

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

```
src/
  model/        types, graph queries, layout, the demo map
  commands/     pure Board -> Board transforms + the command palette vocabulary
  store/        one provider: board, history, transient UI, camera
  canvas/       viewport gestures, world transform, node and edge layers,
                typography metrics, geometry, palette
  ui/           command palette, note sheet, the little chrome there is
  interaction/  keyboard map
  persist/      IndexedDB, JSON import/export, SVG and PNG rendering
```

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
- **No animation library.** Interaction transitions are CSS (150–400ms); the ambient
  motion — the drifting washes and the breathing field behind a selected thought —
  is GPU-only transform keyframes on 7–12 second cycles. Camera flights interpolate
  the world point under the screen centre with zoom in log space, which is what
  makes a long jump feel like a map rather than a swing. All of it stands down under
  `prefers-reduced-motion`.

## Deliberate omissions

No grid, no minimap, no node shapes, no colour picker on the canvas, no counters, no
inspector panel, no auto-arrange of the whole map. Anything that could wait until it
was asked for is waiting behind `⌘K`.
# lava-lamp
