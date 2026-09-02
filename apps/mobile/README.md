# Field, on a phone

The same board as the web app, drawn by Skia instead of the DOM.

```bash
npm install            # from the repo root
npm run mobile         # expo start
npm run ios            # or android
```

Everything the app knows lives in `@field/core` and is shared byte for byte
with the web build: the model, the graph, the layout engine, the commands, the
shape of a blob of wax and the colour it is drawn in. What is written here is
only the part that touches a screen.

## What is different, and why

**The keyboard is gone.** The desktop app is driven from the keys — `Tab` for a
child, `Return` to edit, `N` for the note, `L` to link — and a phone has none
of that. Rather than grow a toolbar, which is the one thing this app has never
had, the actions gather in a ring around whatever was last touched and there is
nothing on screen until then. `+` is always up, so the thing worth learning is
muscle memory. Everything the ring has no room for is behind `···`.

| | |
|---|---|
| Tap empty paper | new thought (first tap clears the selection) |
| Tap a thought | select, and ring it |
| Tap it again | edit its words |
| Drag the ringed thought | move it — no hold, exactly as a press-and-drag does on the web |
| Press and hold any other | pick it up and move it |
| Tap `⟋`, then drag | draw a connection; let go on another thought |
| Tap a dotted line | label it — *requires*, *enables*, *competes with* |
| Drag · pinch | pan · zoom |

A dragged thought moves alone. The desktop brings the whole branch when `Alt`
is down, and there is no second modifier here that is not a hidden mode — so
**Tidy branch** puts a family back in order instead, which is what `Alt` was
mostly being used to avoid needing.

**The selected thought is the one a finger can simply pick up.** The desktop
drags on mousedown, because a mouse can hover and a press is unambiguous; a
finger cannot, because the same touch that would start a drag is the one that
would have panned the board. Selecting first settles it. Every *other* thought
still needs a moment of stillness before it comes up, so panning across a
crowded map is never a game of finding a gap — and nothing of the ring lies over
the thought, so the middle of a bubble belongs to the board.

**A branch is counted before it goes.** A leaf deletes without ceremony; a
thought with anything growing under it says how much, first. Undo brings it
back either way.

**Two pictures, not one.** `canvas/paint.ts` records the board into two Skia
pictures. The still one — words, marks, settled branches, and the rims of every
thought below a headline — is re-recorded only when the board changes. The live
one holds the headline rims *and the lines that land on them*, and is
re-recorded thirty times a second.

The edges have to follow their rims across. A line ends on the rim rather than
at the centre, so leaving it in the still pass pins it to an anchor the rim has
since drifted away from and the join comes apart. Which edges belong to which
pass is worked out by `gatherEdges` when the board changes — never inside the
frame loop, because walking a thousand-thought map thirty times a second to
find the four that are breathing is the kind of cost that only shows up on
somebody else's map.

**The lamp is behind everything.** Six columns of wax rise and fall on their own
clocks, multiplying into each other where they cross, under a fractal-noise
paper grain — `canvas/Lamp.tsx`, driven entirely from Skia's clock on the UI
thread. It never re-enters React, and it costs the board nothing. Two things
there are easy to get wrong and are commented in place: the paper is painted
*inside* that component because multiply against a transparent canvas is a
disappearance, and each column's gradient lives in its own group's local space
because a shader on a shape is otherwise positioned in canvas coordinates and
would sit still while its circle climbed away from it.

**The camera never touches React.** Panning and pinching move three shared
values that drive a transform on the Skia group, entirely on the UI thread. The
store's copy of the camera is updated when a gesture ends, which is when
culling and the rest of the app need to know about it.

**Text is drawn glyph by glyph.** The board's measure adds each depth's
tracking after every character, and Skia has no letter-spacing, so placing each
glyph is the only way a drawn line comes out the width the layout was told it
would be.

## The fonts

This is the part worth understanding before changing anything.

Skia cannot read woff2, and Fraunces is a *variable* font whose default
instance is `wght 900` — nothing like the 500–620 the board actually uses. Left
alone, Skia would measure every string wider than the browser does, and because
`graph.boxOf` feeds the layout engine that is not a cosmetic difference: a map
tidied on a phone would come back wrong on a laptop.

So `scripts/instance-fonts.py` bakes one static TTF per depth, pinned at
exactly the weight and optical size the browser resolves for that depth
(`font-optical-sizing: auto` means `opsz` tracks the font size). `measure` then
has one typeface per depth to ask, and the two platforms agree.

```bash
python3 scripts/instance-fonts.py     # rebuild after changing DEPTH_STYLES
python3 scripts/check-font-parity.py  # prove they still match the variable font
```

`instance-fonts.py` refuses to run if `DEPTH_STYLES` has drifted away from the
pins it knows about. `check-font-parity.py` measures the baked instances
against the variable font's own HVAR deltas and fails if they disagree by more
than per-glyph rounding — currently they agree to 0.05px on a 22px line.

The same five files are registered with the platform under `field-depth-0`…`4`,
so the `TextInput` that sits over a thought while you edit it is set in the very
same outlines Skia is drawing the rest of the board with.

## Accounts

The same three publishable values the web app takes from its `.env`, under
different names because Expo reads them in Node rather than Vite. Copy
`.env.example` to `.env` and fill it in; `app.config.js` folds them into
`expo.extra`, which is where `src/config.ts` looks. `.env` is gitignored, as the
web app's is — there is no reason for the two halves of one app to keep the same
secret in two different ways.

Without them `accountsConfigured()` is false: the account row vanishes from the
⌘ menu, the welcome screen never appears, and the app is a sheet of paper on one
phone, which is the only thing it ever depends on being.

The refresh token goes to the system keychain rather than beside the data;
because the keychain is asynchronous and the core wants a synchronous read, it
is hydrated into memory once at startup before the first render.

**The welcome is asked once.** `ui/Welcome.tsx` is the first thing a new phone
sees, and it offers three ways out and no fourth: sign in, make an account, or
go straight to the paper. Signing in and signing up are one field pair rather
than two doors — an email either has an account behind it or it does not, and
`AccountForm` answers that itself by trying to sign in and making the account if
there is none. The same form is what the ⌘ menu's **Save to an account** opens,
so the two cannot drift apart. Whichever way the welcome is answered, a flag
goes into the same SQLite table the board lives in and it does not come back.
