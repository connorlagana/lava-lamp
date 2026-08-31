import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApp, useCamera } from '../store/app';
import type { Camera, Level } from '../model/types';
import { ACCENTS, CONVICTIONS, THOUGHT_TYPES } from '../model/types';
import { ancestors } from '../model/graph';
import { ACCENT_LABEL, ACCENT_RGB } from '../canvas/palette';

/**
 * The long form. A sheet of the same paper, laid over the canvas, holding the
 * thinking that has no business being visible on the map.
 */

const LEVELS: Level[] = ['', 'low', 'medium', 'high'];
const URL_RE = /https?:\/\/[^\s<>"')]+/g;

export function NoteSheet() {
  const app = useApp();
  const cam = useCamera();
  const id = app.ui.openId;
  const node = id ? app.board.nodes[id] : null;
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const restore = useRef<Camera | null>(null);
  const [showAttrs, setShowAttrs] = useState(false);

  // Zoom in on the way in, and put the map back exactly as it was on the way out.
  useEffect(() => {
    if (!id) return;
    restore.current = cam.cameraRef.current;
    cam.centerNode(id, Math.max(cam.cameraRef.current.z, 1));
    setShowAttrs(false);
    return () => {
      if (restore.current) cam.animateTo(restore.current, 520);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useLayoutEffect(() => {
    for (const el of [titleRef.current, areaRef.current]) {
      if (!el) continue;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [node?.id, node?.note, node?.text]);

  const links = useMemo(() => (node?.note.match(URL_RE) ?? []).slice(0, 8), [node?.note]);
  const path = useMemo(
    () => (node ? ancestors(app.board, node.id).map((a) => app.board.nodes[a].text) : []),
    [app.board, node],
  );

  if (!node) return null;
  const close = () => app.open(null);

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <div
      className="sheet-scrim"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && e.metaKey)) {
          e.preventDefault();
          close();
        }
      }}
    >
      <article className="sheet" style={{ ['--accent' as string]: ACCENT_RGB[node.accent] }}>
        {path.length > 0 && (
          <nav className="sheet-path">
            {path.map((p, i) => (
              <span key={i}>
                {p}
                {i < path.length - 1 && <i>/</i>}
              </span>
            ))}
          </nav>
        )}

        <textarea
          ref={titleRef}
          className="sheet-title"
          value={node.text}
          rows={1}
          spellCheck={false}
          placeholder="Untitled thought"
          onChange={(e) => {
            app.setText(node.id, e.target.value.replace(/\n/g, ' '));
            grow(e.target);
          }}
        />

        <textarea
          ref={areaRef}
          className="sheet-note"
          value={node.note}
          placeholder={'Why this is interesting. What would have to be true. Who is already doing it.\n\nPaste a link and it will collect itself below.'}
          spellCheck
          onChange={(e) => {
            app.setNote(node.id, e.target.value);
            grow(e.target);
          }}
        />

        {links.length > 0 && (
          <div className="sheet-links">
            {links.map((href) => (
              <a key={href} href={href} target="_blank" rel="noreferrer noopener">
                {hostOf(href)}
              </a>
            ))}
          </div>
        )}

        <footer className="sheet-foot">
          <button className="ghost" onClick={() => setShowAttrs((v) => !v)}>
            {showAttrs ? 'hide attributes' : 'attributes'}
          </button>
          <span className="spacer" />
          <span className="stamp">edited {relative(node.updatedAt)}</span>
        </footer>

        {showAttrs && (
          <section className="attrs">
            <Row label="Interest">
              <Scale value={node.attrs.interest ?? null} onChange={(v) => app.setAttrs(node.id, { interest: v })} />
            </Row>
            <Row label="Founder fit">
              <Scale value={node.attrs.founderFit ?? null} onChange={(v) => app.setAttrs(node.id, { founderFit: v })} />
            </Row>
            <Row label="Market size">
              <input
                className="attr-text"
                value={node.attrs.marketSize ?? ''}
                placeholder="Huge, $4B, unclear"
                onChange={(e) => app.setAttrs(node.id, { marketSize: e.target.value })}
              />
            </Row>
            <Row label="Knowledge barrier">
              <Choice
                options={LEVELS}
                value={node.attrs.knowledgeBarrier ?? ''}
                onChange={(v) => app.setAttrs(node.id, { knowledgeBarrier: v as Level })}
              />
            </Row>
            <Row label="Capital intensity">
              <Choice
                options={LEVELS}
                value={node.attrs.capitalIntensity ?? ''}
                onChange={(v) => app.setAttrs(node.id, { capitalIntensity: v as Level })}
              />
            </Row>
            <Row label="Conviction">
              <Choice
                options={['', ...CONVICTIONS.map((c) => c.id)]}
                value={node.attrs.conviction ?? ''}
                onChange={(v) => app.setAttrs(node.id, { conviction: (v || null) as never })}
              />
            </Row>
            <Row label="Type">
              <Choice
                options={['', ...THOUGHT_TYPES]}
                value={node.type ?? ''}
                onChange={(v) => app.setType(node.id, (v || null) as never)}
              />
            </Row>
            <Row label="Accent">
              <div className="swatches">
                {ACCENTS.map((a) => (
                  <button
                    key={a}
                    title={ACCENT_LABEL[a]}
                    className="swatch"
                    data-active={node.accent === a || undefined}
                    style={{ ['--sw' as string]: ACCENT_RGB[a], opacity: a === 'none' ? 0.25 : 1 }}
                    onClick={() => app.setAccent(node.id, a, true)}
                  />
                ))}
              </div>
            </Row>
          </section>
        )}
      </article>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="attr-row">
      <span className="attr-label">{label}</span>
      <div className="attr-value">{children}</div>
    </div>
  );
}

function Scale({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="scale">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          className="tick"
          data-on={value != null && n <= value ? true : undefined}
          onClick={() => onChange(value === n ? null : n)}
          title={`${n} of 10`}
        />
      ))}
      <span className="scale-read">{value != null ? `${value}/10` : ''}</span>
    </div>
  );
}

function Choice({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="choice">
      {options.map((o) => (
        <button
          key={o || 'none'}
          data-on={value === o || undefined}
          onClick={() => onChange(o)}
        >
          {o ? o.replace('-', ' ') : 'unset'}
        </button>
      ))}
    </div>
  );
}

const hostOf = (href: string) => {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
};

function relative(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
