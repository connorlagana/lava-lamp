import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { type Accent, BLOB_MAX, blobPath, fieldPad, hasAttrs, joinLamp, lampClock, lavaFor, measure, padding, stackFor, styleFor, type Thought, waxFor } from '@field/core';

/**
 * A thought. Not a card: words floating in their own blob of wax, and two
 * affordances that only exist while you are looking at it.
 *
 * The bubble is a line, not a fill: one closed curve ringing the words in the
 * thought's own pigment, swept from that pigment into the one it melts toward.
 * A headline's curve is never still — `blob.ts` hands it a new outline thirty
 * times a second from one clock shared by the whole board. Deeper thoughts hold
 * the organic shape they were born with, which is the hierarchy.
 *
 * The redraw is an attribute write on the paths and nothing else. Nothing here
 * moves the node, the text, or the layout — only the curvature of the outline.
 *
 * The curve is drawn in real pixels rather than a normalised square that gets
 * stretched to the box. A stretched space would carry the stroke with it and
 * lay down a line thicker at the top of a wide bubble than at its side; in
 * pixels the rim is one weight the whole way round, and it thickens with the
 * zoom exactly as the branch feeding it does.
 */

/** How far past the field box the <svg> reaches, so a bulge is never clipped. */
const SPILL = BLOB_MAX + 0.06;

export interface NodeViewProps {
  node: Thought;
  /** resolved up the branch, so a family shares one hue — see graph.pigmentOf */
  pigment: Accent;
  selected: boolean;
  editing: boolean;
  dim: boolean;
  linkTarget: boolean;
  onPointerDown: (e: React.PointerEvent, id: string) => void;
  onDoubleClick: (id: string) => void;
  onCommitText: (id: string, text: string) => void;
  onLiveText: (id: string, text: string) => void;
  onAddChild: (id: string) => void;
  onHandleDown: (e: React.PointerEvent, id: string) => void;
  onHover: (id: string | null) => void;
}

function NodeViewImpl({
  node,
  pigment,
  selected,
  editing,
  dim,
  linkTarget,
  onPointerDown,
  onDoubleClick,
  onCommitText,
  onLiveText,
  onAddChild,
  onHandleDown,
  onHover,
}: NodeViewProps) {
  const s = styleFor(node.depth);
  const m = measure(node.text, node.depth);
  const p = padding(node.depth);
  const editorRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const waxA = useRef<SVGPathElement>(null);
  const draft = useRef(node.text);

  // Entering edit mode: fill the element imperatively so React never fights
  // the browser over the caret, then select to the end.
  useLayoutEffect(() => {
    if (!editing) return;
    const el = editorRef.current;
    if (!el) return;
    draft.current = node.text;
    el.textContent = node.text;
    el.setAttribute('contenteditable', 'plaintext-only');
    if (el.getAttribute('contenteditable') !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    el.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  // Grow with the words: the node re-measures as you type so the text always
  // wraps exactly the way the finished thought will.
  useEffect(() => {
    if (!editing) return;
    const el = editorRef.current;
    const root = rootRef.current;
    if (!el || !root) return;
    const sync = () => {
      const text = el.textContent ?? '';
      draft.current = text;
      const next = measure(text, node.depth);
      root.style.setProperty('--w', `${next.w}px`);
      root.style.setProperty('--h', `${next.h}px`);
      onLiveText(node.id, text);
    };
    el.addEventListener('input', sync);
    return () => el.removeEventListener('input', sync);
  }, [editing, node.depth, node.id, onLiveText]);

  const commit = () => onCommitText(node.id, draft.current);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!editing) return;
    // Enter finishes. Everything else is left to the browser.
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      commit();
    }
  };

  const lava = lavaFor(pigment, node.depth);
  const fp = fieldPad(m, p, node.depth);
  const wax = waxFor(node.id, node.depth);

  // The rim is drawn in the <svg>'s own pixel space: the field box, grown by
  // enough room for the widest bulge, with the words at dead centre.
  const rx = m.w / 2 + fp.x;
  const ry = m.h / 2 + fp.y;
  const box = { w: rx * 2 * SPILL, h: ry * 2 * SPILL };

  // The outline lives entirely outside React: it is written straight onto the
  // two paths by the shared clock, so a morphing headline costs no render.
  // `wax` is cached by id, so this subscribes once and holds.
  useEffect(() => {
    if (!wax.live) return;
    const a = waxA.current;
    if (!a) return;
    return joinLamp((clock) =>
      a.setAttribute('d', blobPath(wax.a, clock, box.w / 2, box.h / 2, rx, ry)),
    );
  }, [wax, box.w, box.h, rx, ry]);

  // First paint lands wherever the clock happens to be, so a node scrolling
  // into view arrives mid-morph rather than starting one.
  const clock = lampClock();

  const style = {
    '--x': `${node.x}px`,
    '--y': `${node.y}px`,
    '--w': `${m.w}px`,
    '--h': `${m.h}px`,
    '--px': `${p.x}px`,
    '--py': `${p.y}px`,
    '--fx': `${fp.x}px`,
    '--fy': `${fp.y}px`,
    '--fs': `${s.size}px`,
    '--fw': s.weight,
    '--ff': stackFor(s.family),
    '--tr': `${s.tracking}em`,
    '--lh': s.lineHeight,
    '--ia': s.ink,
    '--accent': lava.rgb,
    '--rim': `${lava.rim}px`,
    '--rim-ink': lava.ink,
  } as React.CSSProperties;

  const conviction = node.attrs.conviction ?? null;

  return (
    <div
      ref={rootRef}
      className="thought"
      data-id={node.id}
      style={style}
      data-selected={selected || undefined}
      data-editing={editing || undefined}
      data-dim={dim || undefined}
      data-target={linkTarget || undefined}
      data-rejected={conviction === 'rejected' || undefined}
      data-depth={Math.min(node.depth, 4)}
      onPointerDown={(e) => onPointerDown(e, node.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick(node.id);
      }}
      onPointerEnter={() => onHover(node.id)}
      onPointerLeave={() => onHover(null)}
    >
      <svg
        className="field"
        width={box.w}
        height={box.h}
        viewBox={`0 0 ${round(box.w)} ${round(box.h)}`}
        aria-hidden
      >
        <path
          ref={waxA}
          className="rim"
          stroke={`url(#rim-${lava.primary})`}
          vectorEffect="non-scaling-stroke"
          d={blobPath(wax.a, clock, box.w / 2, box.h / 2, rx, ry)}
        />
      </svg>

      {node.type && <div className="kind">{node.type.replace('-', ' ')}</div>}

      {editing ? (
        <div
          key="edit"
          ref={editorRef}
          className="text editing"
          role="textbox"
          tabIndex={-1}
          spellCheck={false}
          suppressContentEditableWarning
          onKeyDown={onKeyDown}
          onBlur={commit}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain').replace(/\s+/g, ' ').trim();
            document.execCommand('insertText', false, text);
          }}
        />
      ) : (
        <div key="view" className="text" data-empty={node.text.trim() ? undefined : true}>
          {m.lines.map((line, i) => (
            <div key={i} className="line">
              {line || ' '}
            </div>
          ))}
        </div>
      )}

      <div className="marks" aria-hidden>
        {conviction && <i className={`conviction c-${conviction}`} />}
        {(node.note.trim().length > 0 || hasAttrs(node.attrs)) && <i className="note-mark" />}
      </div>

      <button
        className="affordance plus"
        title="Add a thought beneath (Tab)"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onAddChild(node.id);
        }}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
          <path d="M6 2.6v6.8M2.6 6h6.8" />
        </svg>
      </button>

      <button
        className="affordance handle"
        title="Drag to connect (L)"
        onPointerDown={(e) => {
          e.stopPropagation();
          onHandleDown(e, node.id);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <i />
      </button>
    </div>
  );
}

const round = (n: number) => Math.round(n * 10) / 10;

export const NodeView = memo(NodeViewImpl);
