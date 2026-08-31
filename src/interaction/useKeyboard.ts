import { useEffect } from 'react';
import { useApp, useCamera } from '../store/app';
import { childrenOf, descendants, siblingsOf, subtree } from '../model/graph';
import { worldToScreen } from '../canvas/camera';
import type { ID } from '../model/types';

/**
 * Keyboard-first. The whole application is reachable without the mouse, and
 * nothing here shadows a browser shortcut the user still needs.
 */

const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
};

export function useKeyboard() {
  const app = useApp();
  const cam = useCamera();

  useEffect(() => {
    const ensureVisible = (id: ID) => {
      const node = app.board.nodes[id];
      if (!node) return;
      const p = worldToScreen(cam.cameraRef.current, node);
      const m = 90;
      const { w, h } = cam.viewport;
      if (p.x < m || p.y < m || p.x > w - m || p.y > h - m) cam.centerNode(id);
    };

    const go = (id: ID | undefined | null) => {
      if (!id) return;
      app.select(id);
      ensureVisible(id);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const typing = isTypingTarget(e.target);
      const editing = app.ui.editingId;
      const selected = app.ui.selectedId;

      // ---- always available ----
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        app.setUI({ paletteOpen: !app.ui.paletteOpen, paletteSeed: '' });
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        app.toast('Saved on this device as you think');
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        if (typing && !editing) return;
        e.preventDefault();
        if (e.shiftKey) app.redo();
        else app.undo();
        return;
      }
      if (mod && (e.key === '0' || e.key === ')')) {
        e.preventDefault();
        cam.fitAll();
        return;
      }
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        cam.zoomBy(1.25);
        return;
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        cam.zoomBy(0.8);
        return;
      }

      // ---- while editing a node ----
      if (editing) {
        if (e.key === 'Tab') {
          e.preventDefault();
          const parent = editing;
          (document.activeElement as HTMLElement | null)?.blur();
          app.createChild(parent);
          return;
        }
        if (e.key === 'Enter' && (mod || e.altKey)) {
          e.preventDefault();
          const sib = editing;
          (document.activeElement as HTMLElement | null)?.blur();
          app.createSibling(sib);
        }
        return;
      }

      if (typing) return;

      // ---- canvas keys ----
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          if (app.ui.paletteOpen) app.setUI({ paletteOpen: false });
          else if (app.ui.linkingFrom) app.setUI({ linkingFrom: null });
          else if (app.ui.openId) app.open(null);
          else if (app.ui.focusId) {
            app.focus(null);
            cam.fitAll();
          } else app.select(null);
          return;
        case 'Tab':
          e.preventDefault();
          if (selected) app.createChild(selected);
          return;
        case 'Enter':
          e.preventDefault();
          if (!selected) return;
          if (mod || e.altKey) app.createSibling(selected);
          else app.edit(selected);
          return;
        case 'ArrowUp':
          e.preventDefault();
          if (selected) go(app.board.nodes[selected]?.parentId ?? null);
          return;
        case 'ArrowDown':
          e.preventDefault();
          if (selected) go(childrenOf(app.index, selected)[0]);
          return;
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          if (!selected) return;
          const sibs = siblingsOf(app.board, app.index, selected);
          const i = sibs.indexOf(selected);
          const next = e.key === 'ArrowLeft' ? sibs[i - 1] : sibs[i + 1];
          go(next);
          return;
        }
        case 'Backspace':
        case 'Delete': {
          e.preventDefault();
          if (!selected) return;
          const kids = descendants(app.index, selected).length;
          if (kids > 0 && app.ui.confirmDeleteId !== selected) {
            app.setUI({ confirmDeleteId: selected });
            app.toast(`Delete this and ${kids} thought${kids === 1 ? '' : 's'} below? Press delete again`);
            return;
          }
          app.deleteThought(selected);
          return;
        }
        default:
          break;
      }

      if (e.key === '/' && !mod) {
        e.preventDefault();
        app.setUI({ paletteOpen: true, paletteSeed: '' });
        return;
      }

      if (mod || e.altKey || !selected) return;

      switch (e.key.toLowerCase()) {
        case 'e':
          e.preventDefault();
          app.edit(selected);
          break;
        case 'f':
          e.preventDefault();
          if (app.ui.focusId === selected) {
            app.focus(null);
            cam.fitAll();
          } else {
            app.focus(selected);
            cam.fitNodes(subtree(app.index, selected), 1.1);
          }
          break;
        case 'l':
          e.preventDefault();
          app.setUI({ linkingFrom: selected });
          app.toast('Click another thought to connect');
          break;
        case 't':
          e.preventDefault();
          app.tidy(selected);
          break;
        case 'n':
          e.preventDefault();
          app.open(selected);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [app, cam]);

  // A pending delete confirmation expires as soon as attention moves.
  useEffect(() => {
    if (!app.ui.confirmDeleteId) return;
    const t = window.setTimeout(() => app.setUI({ confirmDeleteId: null }), 4000);
    return () => window.clearTimeout(t);
  }, [app]);
}
