import { AppProvider, useApp } from './store/app';
import { Canvas } from './canvas/Canvas';
import { Chrome } from './ui/Chrome';
import { CommandPalette } from './ui/CommandPalette';
import { NoteSheet } from './ui/NoteSheet';
import { useKeyboard } from './interaction/useKeyboard';

function Shell() {
  const app = useApp();
  useKeyboard();

  return (
    <div className="app" data-ready={app.ready || undefined}>
      <Canvas />
      <Chrome />
      <NoteSheet />
      <CommandPalette />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
