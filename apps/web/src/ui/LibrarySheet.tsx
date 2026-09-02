import { useEffect, useRef, useState } from 'react';
import { useSession } from '../account/session';
import { useLibrary } from '../library/library';

/**
 * Two small screens that share a scrim: naming a map on its way out, and the
 * shelf of maps already saved. Neither is a file manager — one input and one
 * list, in the same voice as the rest of the app.
 */

export function LibrarySheet() {
  const lib = useLibrary();
  const open = lib.sheet === 'name' || lib.sheet === 'library';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        lib.openSheet('none');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, lib]);

  if (!open) return null;

  return (
    <div className="gate-scrim" onPointerDown={() => lib.openSheet('none')}>
      <div className="gate" onPointerDown={(e) => e.stopPropagation()}>
        {lib.sheet === 'name' ? <NameMap /> : <Shelf />}
      </div>
    </div>
  );
}

function NameMap() {
  const lib = useLibrary();
  const [title, setTitle] = useState(() => lib.suggestedTitle());
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 60);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!lib.saving) void lib.saveAs(title);
      }}
    >
      <h2 className="gate-title">Name this map</h2>
      <p className="gate-sub">So you can find it again on the shelf.</p>
      <label className="gate-field">
        <span>Title</span>
        <input ref={ref} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </label>
      <button className="gate-go" type="submit" disabled={lib.saving}>
        {lib.saving ? 'Saving…' : 'Save to my account'}
      </button>
    </form>
  );
}

function Shelf() {
  const lib = useLibrary();
  const session = useSession();
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <>
      <h2 className="gate-title">Your maps</h2>
      <p className="gate-sub">
        {session.account?.email ? `Signed in as ${session.account.email}` : 'Signed in'}
      </p>

      {lib.loadingMaps && !lib.maps.length && <p className="shelf-empty">Looking on the shelf…</p>}
      {!lib.loadingMaps && !lib.maps.length && (
        <p className="shelf-empty">Nothing saved yet. The save button puts the first one here.</p>
      )}

      <ul className="shelf">
        {lib.maps.map((m) => (
          <li key={m.id} className="shelf-row" data-current={m.id === lib.remoteId || undefined}>
            <button className="shelf-open" onClick={() => void lib.openMap(m.id)}>
              <span className="shelf-name">{m.title}</span>
              <span className="shelf-meta">
                {m.nodeCount} {m.nodeCount === 1 ? 'thought' : 'thoughts'} · {when(m.updatedAt)}
              </span>
            </button>
            {confirming === m.id ? (
              <span className="shelf-confirm">
                <button
                  className="shelf-yes"
                  onClick={() => {
                    setConfirming(null);
                    void lib.removeMap(m.id);
                  }}
                >
                  delete
                </button>
                <button onClick={() => setConfirming(null)}>keep</button>
              </span>
            ) : (
              <button className="shelf-del" title="Delete this map" onClick={() => setConfirming(m.id)}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>

      <p className="gate-alt">
        <button type="button" onClick={() => void session.signOut().then(() => lib.openSheet('none'))}>
          Sign out
        </button>
      </p>
    </>
  );
}

/** Rough is right here: nobody needs a timestamp for their own map. */
function when(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'saved';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
