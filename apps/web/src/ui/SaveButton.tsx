import { useEffect, useRef, useState } from 'react';
import { useSession } from '../account/session';
import { useLibrary } from '../library/library';

/**
 * One button, bottom left, opposite the command hint.
 *
 * It says what will happen if you press it and nothing else. A map that has
 * never been saved offers to save it; a saved map with changes offers to save
 * them; a saved map with none stands down to its own title and a blob of wax
 * that warms once when a save lands.
 */

export function SaveButton() {
  const lib = useLibrary();
  const session = useSession();
  const [pulse, setPulse] = useState(0);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPulse((p) => p + 1);
  }, [lib.savedAt]);

  // No Neon keys in this build: the app is local-only and says nothing about it.
  if (!lib.enabled) return null;

  const signedIn = session.status === 'signed-in';
  const saved = !!lib.remoteId;
  const settled = saved && !lib.dirty;

  const label = lib.saving
    ? 'Saving…'
    : settled
      ? lib.title
      : saved
        ? 'Save changes'
        : signedIn
          ? 'Save this map'
          : 'Save this map';

  return (
    <div className="save-cluster">
      <button
        className="save-btn"
        data-settled={settled || undefined}
        data-busy={lib.saving || undefined}
        onClick={() => lib.save()}
        title={signedIn ? 'Save this map to your account' : 'Create an account to keep this map'}
      >
        <i key={pulse} className="save-wax" aria-hidden />
        <span>{label}</span>
      </button>

      {signedIn && (
        <button
          className="save-shelf"
          title="Your saved maps"
          onClick={() => {
            lib.openSheet('library');
            void lib.refresh();
          }}
        >
          maps
        </button>
      )}
    </div>
  );
}
