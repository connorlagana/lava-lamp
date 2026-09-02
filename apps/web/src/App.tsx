import { AppProvider, useApp } from './store/app';
import { SessionProvider } from './account/session';
import { LibraryProvider } from './library/library';
import { Canvas } from './canvas/Canvas';
import { Chrome } from './ui/Chrome';
import { CommandPalette } from './ui/CommandPalette';
import { NoteSheet } from './ui/NoteSheet';
import { AccountSheet } from './ui/AccountSheet';
import { LibrarySheet } from './ui/LibrarySheet';
import { useKeyboard } from './interaction/useKeyboard';

function Shell() {
  const app = useApp();
  useKeyboard();

  return (
    <div className="app" data-ready={app.ready || undefined}>
      <Canvas />
      <Chrome />
      <NoteSheet />
      <AccountSheet />
      <LibrarySheet />
      <CommandPalette />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <SessionProvider>
        <LibraryProvider>
          <Shell />
        </LibraryProvider>
      </SessionProvider>
    </AppProvider>
  );
}
