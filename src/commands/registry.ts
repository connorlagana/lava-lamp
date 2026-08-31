import type { AppApi, CameraApi } from '../store/app';
import type { Accent, Conviction, ThoughtType } from '../model/types';
import { ACCENTS, CONVICTIONS, THOUGHT_TYPES } from '../model/types';
import { ACCENT_LABEL } from '../canvas/palette';
import { subtree } from '../model/graph';
import { demoBoard } from '../model/demo';
import { emptyBoard } from './board';
import { exportJSON, exportPNG, exportSVG, pickJSONFile } from '../persist/io';
import { visibleWorldRect } from '../canvas/camera';

/**
 * The command palette's vocabulary. Commands that need a selection simply do
 * not appear without one, which is what keeps the list short.
 */

export interface Command {
  id: string;
  title: string;
  hint?: string;
  run?: () => void;
  children?: () => Command[];
}

export interface CommandContext {
  app: AppApi;
  cam: CameraApi;
  close: () => void;
}

export function buildCommands({ app, cam, close }: CommandContext): Command[] {
  const selected = app.ui.selectedId;
  const node = selected ? app.board.nodes[selected] : null;
  const out: Command[] = [];

  const withClose = (fn: () => void) => () => {
    close();
    fn();
  };

  out.push({
    id: 'create',
    title: 'Create thought',
    hint: 'click the page',
    run: withClose(() => {
      const rect = visibleWorldRect(cam.cameraRef.current, cam.viewport);
      app.createRootAt({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
    }),
  });

  if (node) {
    out.push({
      id: 'child',
      title: 'Create child',
      hint: 'Tab',
      run: withClose(() => app.createChild(node.id)),
    });
    out.push({
      id: 'sibling',
      title: 'Create sibling',
      hint: 'Cmd Enter',
      run: withClose(() => app.createSibling(node.id)),
    });
    out.push({
      id: 'open',
      title: 'Open notes',
      hint: 'double click',
      run: withClose(() => app.open(node.id)),
    });
    out.push({
      id: 'focus',
      title: app.ui.focusId === node.id ? 'Exit focus' : 'Focus branch',
      hint: 'F',
      run: withClose(() => {
        if (app.ui.focusId === node.id) {
          app.focus(null);
          cam.fitAll();
        } else {
          app.focus(node.id);
          cam.fitNodes(subtree(app.index, node.id), 1.1);
        }
      }),
    });
    out.push({
      id: 'tidy',
      title: 'Tidy branch',
      hint: 'T',
      run: withClose(() => {
        app.tidy(node.id);
        setTimeout(() => cam.fitNodes(subtree(app.index, node.id), 1.05), 40);
      }),
    });
    out.push({
      id: 'link',
      title: 'Link thought',
      hint: 'L',
      run: withClose(() => {
        app.setUI({ linkingFrom: node.id });
        app.toast('Click another thought to connect');
      }),
    });
    out.push({
      id: 'accent',
      title: 'Change accent',
      children: () =>
        ACCENTS.map((a: Accent) => ({
          id: `accent:${a}`,
          title: ACCENT_LABEL[a],
          run: withClose(() => app.setAccent(node.id, a, true)),
        })),
    });
    out.push({
      id: 'conviction',
      title: 'Mark conviction',
      children: () => [
        ...CONVICTIONS.map(({ id, label }: { id: Conviction; label: string }) => ({
          id: `conviction:${id}`,
          title: label,
          run: withClose(() => app.setAttrs(node.id, { conviction: id })),
        })),
        {
          id: 'conviction:none',
          title: 'Clear',
          run: withClose(() => app.setAttrs(node.id, { conviction: null })),
        },
      ],
    });
    out.push({
      id: 'type',
      title: 'Set thought type',
      children: () => [
        ...THOUGHT_TYPES.map((t: ThoughtType) => ({
          id: `type:${t}`,
          title: t.replace('-', ' ').replace(/^./, (c) => c.toUpperCase()),
          run: withClose(() => app.setType(node.id, t)),
        })),
        { id: 'type:none', title: 'Clear', run: withClose(() => app.setType(node.id, null)) },
      ],
    });
    out.push({
      id: 'delete',
      title: 'Delete thought',
      hint: 'Backspace',
      run: withClose(() => app.deleteThought(node.id)),
    });
  }

  if (app.ui.focusId && app.ui.focusId !== selected) {
    out.push({
      id: 'unfocus',
      title: 'Exit focus',
      hint: 'Esc',
      run: withClose(() => {
        app.focus(null);
        cam.fitAll();
      }),
    });
  }

  out.push({ id: 'fit', title: 'Zoom to fit', hint: 'Cmd 0', run: withClose(() => cam.fitAll()) });
  out.push({
    id: 'home',
    title: 'Return home',
    run: withClose(() => {
      app.focus(null);
      app.select(null);
      cam.fitAll();
    }),
  });

  out.push({ id: 'export-json', title: 'Export map as JSON', run: withClose(() => exportJSON(app.board)) });
  out.push({
    id: 'import-json',
    title: 'Import map from JSON',
    run: withClose(async () => {
      try {
        const board = await pickJSONFile();
        app.replaceBoard(board, 'Map imported');
        setTimeout(() => cam.fitAll(), 30);
      } catch {
        app.toast('That file could not be read');
      }
    }),
  });
  out.push({
    id: 'export-png-view',
    title: 'Export view as PNG',
    run: withClose(async () => {
      const rect = visibleWorldRect(cam.cameraRef.current, cam.viewport);
      await exportPNG(app.board, { rect }, 2, 'field-view');
      app.toast('PNG saved');
    }),
  });
  out.push({
    id: 'export-png-full',
    title: 'Export whole map as PNG',
    run: withClose(async () => {
      await exportPNG(app.board, {}, 2);
      app.toast('PNG saved');
    }),
  });
  out.push({
    id: 'export-svg',
    title: 'Export whole map as SVG',
    run: withClose(() => {
      exportSVG(app.board);
      app.toast('SVG saved');
    }),
  });

  out.push({
    id: 'clear',
    title: 'Clear the board',
    children: () => [
      {
        id: 'clear:yes',
        title: 'Yes, clear every thought',
        run: withClose(() => {
          app.replaceBoard(emptyBoard(app.board.title), 'Board cleared. Cmd Z brings it back');
          setTimeout(() => cam.animateTo({ x: cam.viewport.w / 2, y: cam.viewport.h / 2, z: 1 }), 30);
        }),
      },
      { id: 'clear:no', title: 'Keep it', run: withClose(() => undefined) },
    ],
  });
  const loadExample = withClose(() => {
    const b = demoBoard();
    app.replaceBoard(b, 'Example map loaded');
    setTimeout(() => cam.fitNodes(Object.keys(b.nodes)), 30);
  });
  out.push(
    // Nothing to lose on a blank sheet, so nothing to confirm.
    boardIsEmpty(app)
      ? { id: 'demo', title: 'Load the example map', run: loadExample }
      : {
          id: 'demo',
          title: 'Load the example map',
          children: () => [
            { id: 'demo:yes', title: 'Replace everything with the example', run: loadExample },
            { id: 'demo:no', title: 'Never mind', run: withClose(() => undefined) },
          ],
        },
  );

  return out;
}

export const boardIsEmpty = (app: AppApi) => Object.keys(app.board.nodes).length === 0;
