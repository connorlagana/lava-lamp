import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { PAPER, type ID, type Point } from '@field/core';
import './config';
import { AppProvider, useApp } from './store/app';
import { SessionProvider, useSession } from './account/session';
import { LibraryProvider } from './library/library';
import { hydrateSession } from './config';
import { Board } from './canvas/Board';
import { Chrome } from './ui/Chrome';
import { EmptyHint } from './ui/EmptyHint';
import { Editor } from './ui/Editor';
import { RadialMenu } from './ui/RadialMenu';
import { MoreSheet } from './ui/MoreSheet';
import { NoteSheet } from './ui/NoteSheet';
import { CommandSheet } from './ui/CommandSheet';
import { LinkLabel } from './ui/LinkLabel';
import { DeleteGate } from './ui/DeleteGate';
import { AccountSheet } from './ui/AccountSheet';
import { LibrarySheet } from './ui/LibrarySheet';
import { Welcome } from './ui/Welcome';
import { loadGreeted, saveGreeted } from './persist/db';

/**
 * Field, on a phone.
 *
 * The same board, the same layout engine, the same commands — everything in
 * `@field/core` is byte for byte what the web app runs. What changes is only
 * how a person reaches it: no keyboard, so the actions gather in a ring around
 * whatever was last touched, and the panels are sheets rather than overlays.
 */

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function Shell({ greeted }: { greeted: boolean }) {
  const app = useApp();
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreId, setMoreId] = useState<ID | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [answered, setAnswered] = useState(greeted);

  /**
   * The welcome, asked once.
   *
   * Not while a stored session is still being restored — `unknown` resolves in
   * a moment and asking someone who is already signed in to sign in is worse
   * than a moment of paper. And not at all in a build with no keys in it, where
   * there is nothing to sign into and the app is a sheet of paper on one phone,
   * which is the only thing it ever depends on being.
   */
  const welcome = session.enabled && session.status === 'anonymous' && !answered;

  const dismissWelcome = useCallback(() => {
    setAnswered(true);
    saveGreeted();
  }, []);

  useEffect(() => {
    if (app.ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [app.ready]);

  // A tap on a thought selects it — and rings it. A second tap on the thought
  // already selected is how you get into its words, which is the phone's
  // version of the desktop's Return.
  const onTapNode = useCallback(
    (id: ID) => {
      const a = app;
      if (a.ui.linkingFrom && a.ui.linkingFrom !== id) {
        a.link(a.ui.linkingFrom, id);
        return;
      }
      if (a.ui.selectedId === id) a.edit(id);
      else a.select(id);
    },
    [app],
  );

  // Empty paper clears the selection if there is one, and otherwise starts a
  // thought where the finger landed. Exactly as the web app does.
  const onTapEmpty = useCallback(
    (at: Point) => {
      if (app.ui.linkingFrom) app.setUI({ linkingFrom: null });
      else if (app.ui.selectedId || app.ui.editingId) app.setUI({ selectedId: null, editingId: null });
      else app.createRootAt(at);
    },
    [app],
  );

  // A tap near a dotted line opens its label. There is nothing else a line
  // can be tapped for, so it needs no selection step in between.
  const onTapLink = useCallback((id: ID) => app.setUI({ editingLinkId: id }), [app]);

  return (
    <View style={styles.app}>
      <Board onTapNode={onTapNode} onTapEmpty={onTapEmpty} onTapLink={onTapLink} />

      <RadialMenu onNote={(id) => app.open(id)} onMore={(id) => setMoreId(id)} />
      <EmptyHint visible={Object.keys(app.board.nodes).length === 0 && !welcome} />
      <Editor />
      <Chrome onOpenMenu={() => setMenuOpen(true)} />

      <MoreSheet id={moreId} onClose={() => setMoreId(null)} />
      <NoteSheet />
      <LinkLabel />
      <DeleteGate />
      <CommandSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onAccount={() => setAccountOpen(true)}
        onLibrary={() => setLibraryOpen(true)}
      />
      <AccountSheet open={accountOpen} onClose={() => setAccountOpen(false)} />
      <LibrarySheet open={libraryOpen} onClose={() => setLibraryOpen(false)} />

      {/* Last, so it is over everything the board puts on the paper. */}
      <Welcome open={welcome} onDismiss={dismissWelcome} />

      <StatusBar style="dark" />
    </View>
  );
}

export default function App() {
  const [booted, setBooted] = useState(false);
  // Read before the first render rather than after it, so a returning phone
  // never flashes the welcome on its way past.
  const [greeted, setGreeted] = useState(true);

  useEffect(() => {
    (async () => {
      const [, , seen] = await Promise.all([
        // The keychain is asynchronous and the core wants a synchronous read,
        // so the session is pulled into memory before anything can ask for it.
        hydrateSession(),
        // The same five faces Skia draws with, registered with the platform so
        // the TextInput that sits over a thought while you edit it is set in
        // the very same outlines. See `ui/Editor.tsx`.
        Font.loadAsync({
          'field-depth-0': require('../assets/fonts/depth-0.ttf'),
          'field-depth-1': require('../assets/fonts/depth-1.ttf'),
          'field-depth-2': require('../assets/fonts/depth-2.ttf'),
          'field-depth-3': require('../assets/fonts/depth-3.ttf'),
          'field-depth-4': require('../assets/fonts/depth-4.ttf'),
        }),
        loadGreeted(),
      ]);
      setGreeted(seen === true);
      setBooted(true);
    })();
  }, []);

  if (!booted) return null;

  return (
    <GestureHandlerRootView style={styles.app}>
      <SafeAreaProvider>
        <AppProvider>
          <SessionProvider>
            <LibraryProvider>
              <Shell greeted={greeted} />
            </LibraryProvider>
          </SessionProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: PAPER,
  },
});
