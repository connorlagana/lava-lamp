import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, useCamera } from '../store/app';
import { buildCommands, type Command } from '../commands/registry';
import { searchNodes } from '../model/graph';

/**
 * One field, one list, no chrome. Thoughts first when the query matches any,
 * commands after. Sub-lists (accents, conviction) push a shallow page rather
 * than opening a menu.
 */

export function CommandPalette() {
  const app = useApp();
  const cam = useCamera();
  const [query, setQuery] = useState(app.ui.paletteSeed);
  const [page, setPage] = useState<Command[] | null>(null);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = app.ui.paletteOpen;

  useEffect(() => {
    if (open) {
      setQuery(app.ui.paletteSeed);
      setPage(null);
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => app.setUI({ paletteOpen: false, paletteSeed: '' });

  const commands = useMemo(
    () => (page ? page : buildCommands({ app, cam, close })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [app, cam, page, open],
  );

  const hits = useMemo(() => (page ? [] : searchNodes(app.board, query, 6)), [app.board, query, page]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, page ? 14 : 9);
    return commands.filter((c) => c.title.toLowerCase().includes(q)).slice(0, 8);
  }, [commands, query, page]);

  const rows: { kind: 'node' | 'command'; key: string; primary: string; secondary?: string; run: () => void }[] = [
    ...hits.map((h) => ({
      kind: 'node' as const,
      key: `n:${h.id}`,
      primary: app.board.nodes[h.id]?.text || 'Untitled',
      secondary: h.path,
      run: () => {
        close();
        app.select(h.id);
        cam.centerNode(h.id, 1);
      },
    })),
    ...filtered.map((c) => ({
      kind: 'command' as const,
      key: `c:${c.id}`,
      primary: c.title,
      secondary: c.hint,
      run: () => {
        if (c.children) {
          setPage(c.children());
          setQuery('');
          setCursor(0);
          return;
        }
        c.run?.();
      },
    })),
  ];

  useEffect(() => {
    if (cursor > rows.length - 1) setCursor(Math.max(0, rows.length - 1));
  }, [rows.length, cursor]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (page) {
        setPage(null);
        setCursor(0);
      } else close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(rows.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      rows[cursor]?.run();
    } else if (e.key === 'Backspace' && !query && page) {
      e.preventDefault();
      setPage(null);
    }
  };

  return (
    <div className="palette-scrim" onPointerDown={close}>
      <div className="palette" onPointerDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          spellCheck={false}
          placeholder={page ? 'choose' : 'search thoughts, or type a command'}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
        />
        {rows.length > 0 && (
          <div className="palette-rows">
            {rows.map((row, i) => (
              <button
                key={row.key}
                className="palette-row"
                data-active={i === cursor || undefined}
                data-kind={row.kind}
                onPointerEnter={() => setCursor(i)}
                onClick={row.run}
              >
                <span className="primary">{row.primary}</span>
                {row.secondary && <span className="secondary">{row.secondary}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
