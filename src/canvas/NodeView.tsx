import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import type { Thought } from '../model/types';
import { hasAttrs } from '../model/types';
import { measure, padding, styleFor } from './typography';
import { ACCENT_RGB } from './palette';

/**
 * A thought. Not a card: text, a soft field behind it, and two affordances
 * that only exist while you are looking at it.
 */

export interface NodeViewProps {
  node: Thought;
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

  const style = {
    '--x': `${node.x}px`,
    '--y': `${node.y}px`,
    '--w': `${m.w}px`,
    '--h': `${m.h}px`,
    '--px': `${p.x}px`,
    '--py': `${p.y}px`,
    '--fs': `${s.size}px`,
    '--fw': s.weight,
    '--tr': `${s.tracking}em`,
    '--lh': s.lineHeight,
    '--ia': s.ink,
    '--accent': ACCENT_RGB[node.accent],
    '--tinted': node.accent === 'none' ? 0 : 1,
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
      <div className="field" aria-hidden>
        <i className="lobe lobe-a" />
        <i className="lobe lobe-b" />
      </div>

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

export const NodeView = memo(NodeViewImpl);
