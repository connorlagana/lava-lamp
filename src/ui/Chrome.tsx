import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useCamera } from '../store/app';
import { ancestors } from '../model/graph';

/**
 * Everything that is permanently on screen, which is almost nothing: an
 * ancestry line when you are deep in a branch, a focus pill when the world is
 * narrowed, one key hint in the corner, and a whisper when something happens.
 */

export function Chrome() {
  const app = useApp();
  const cam = useCamera();
  const { selectedId, focusId, toast } = app.ui;

  const trail = useMemo(() => {
    const id = selectedId ?? focusId;
    if (!id || !app.board.nodes[id]) return [];
    return [...ancestors(app.board, id), id].map((nid) => ({ id: nid, text: app.board.nodes[nid].text }));
  }, [app.board, selectedId, focusId]);

  const focusNode = focusId ? app.board.nodes[focusId] : null;
  const empty = Object.keys(app.board.nodes).length === 0;

  return (
    <>
      {trail.length > 1 && (
        <nav className="trail" aria-label="ancestry">
          {trail.map((t, i) => (
            <button
              key={t.id}
              className="crumb"
              data-current={i === trail.length - 1 || undefined}
              onClick={() => {
                app.select(t.id);
                cam.centerNode(t.id);
              }}
            >
              {t.text || 'untitled'}
              {i < trail.length - 1 && <i>/</i>}
            </button>
          ))}
        </nav>
      )}

      {focusNode && (
        <button
          className="focus-pill"
          onClick={() => {
            app.focus(null);
            cam.fitAll();
          }}
        >
          focus <b>{focusNode.text}</b> <i>esc</i>
        </button>
      )}

      <button
        className="corner"
        onClick={() => app.setUI({ paletteOpen: true, paletteSeed: '' })}
        title="Search and commands"
      >
        <SavedDot />
        <span>&#8984;K</span>
      </button>

      {/* Stays mounted so it can fade out the moment the first thought lands. */}
      <div className="empty-hint" data-on={empty || undefined} aria-hidden={!empty}>
        <p className="tagline">What will we be creating today?</p>
        <p className="prompt">tap anywhere to start</p>
      </div>

      <div className="toast" data-on={toast ? true : undefined}>
        {toast}
      </div>
    </>
  );
}

/** Breathes once when the map reaches disk. Reassurance without a status bar. */
function SavedDot() {
  const { savedAt } = useApp();
  const [pulse, setPulse] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPulse((p) => p + 1);
  }, [savedAt]);
  return <i key={pulse} className="saved-dot" />;
}
