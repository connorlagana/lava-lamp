import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { INK_RGB, PAPER } from '@field/core';
import { useApp } from '../store/app';
import { useLibrary } from '../library/library';
import { Row, Sheet } from './Sheet';

/**
 * The shelf: every map on the account, most recently edited first.
 *
 * The web app puts this behind the word "maps" beside the save button, and
 * deleting is a hover away. There is no hover here, so a long press asks
 * instead — and it does ask, because a map is somebody's thinking and the
 * gesture that opens one should never be one slip away from removing it.
 */

export function LibrarySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const library = useLibrary();
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    if (open) library.refresh().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setNaming(false);
    setConfirming(null);
    onClose();
  };

  const saveNow = async () => {
    if (library.remoteId) {
      library.save();
      close();
      return;
    }
    setTitle(library.suggestedTitle());
    setNaming(true);
  };

  if (naming) {
    return (
      <Sheet open={open} onClose={close} title="Name this map" scroll={false}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Untitled map"
          placeholderTextColor={`rgba(${INK_RGB}, 0.3)`}
          autoFocus
          style={styles.field}
          onSubmitEditing={async () => {
            await library.saveAs(title.trim() || 'Untitled map');
            close();
          }}
        />
        <Pressable
          style={({ pressed }) => [styles.go, pressed && { opacity: 0.7 }]}
          onPress={async () => {
            await library.saveAs(title.trim() || 'Untitled map');
            close();
          }}
        >
          <Text style={styles.goText}>Save</Text>
        </Pressable>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Your maps"
      hint={library.loadingMaps ? 'Fetching…' : undefined}
    >
      <Row
        label={library.dirty || !library.remoteId ? 'Save this map' : 'Saved'}
        hint={library.remoteId ? library.title : 'Not yet on the shelf'}
        onPress={saveNow}
      />

      {library.maps.map((map) => (
        <Pressable
          key={map.id}
          onPress={async () => {
            if (confirming === map.id) return;
            await library.openMap(map.id);
            close();
          }}
          onLongPress={() => setConfirming(map.id)}
          delayLongPress={420}
          style={({ pressed }) => [styles.map, pressed && { opacity: 0.5 }]}
        >
          <View style={styles.mapMain}>
            <Text style={styles.mapTitle} numberOfLines={1}>
              {map.title}
            </Text>
            <Text style={styles.mapMeta}>
              {map.nodeCount} {map.nodeCount === 1 ? 'thought' : 'thoughts'} · {when(map.updatedAt)}
            </Text>
          </View>

          {confirming === map.id ? (
            <View style={styles.confirm}>
              <Pressable onPress={() => setConfirming(null)} hitSlop={8}>
                <Text style={styles.keep}>Keep</Text>
              </Pressable>
              <Pressable
                hitSlop={8}
                onPress={async () => {
                  setConfirming(null);
                  await library.removeMap(map.id);
                }}
              >
                <Text style={styles.delete}>Delete</Text>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      ))}

      {!library.maps.length && !library.loadingMaps ? (
        <Text style={styles.empty}>Nothing on the shelf yet.</Text>
      ) : null}

      <Text style={styles.foot}>
        {app.board.title} is saved on this phone whatever happens here.
      </Text>
    </Sheet>
  );
}

/** Rough, and deliberately so — nobody needs the minute a map was edited. */
function when(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(then).toLocaleDateString();
}

const styles = StyleSheet.create({
  map: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: `rgba(${INK_RGB}, 0.07)`,
  },
  mapMain: { flexShrink: 1 },
  mapTitle: {
    fontFamily: 'field-depth-2',
    fontSize: 16,
    color: `rgba(${INK_RGB}, 0.9)`,
  },
  mapMeta: {
    fontFamily: 'field-depth-4',
    fontSize: 12,
    color: `rgba(${INK_RGB}, 0.42)`,
    marginTop: 2,
  },
  confirm: { flexDirection: 'row', gap: 14 },
  keep: {
    fontFamily: 'field-depth-4',
    fontSize: 13,
    color: `rgba(${INK_RGB}, 0.55)`,
  },
  delete: {
    fontFamily: 'field-depth-4',
    fontSize: 13,
    color: 'rgb(243, 97, 44)',
  },
  empty: {
    fontFamily: 'field-depth-4',
    fontSize: 13,
    color: `rgba(${INK_RGB}, 0.42)`,
    paddingVertical: 16,
  },
  field: {
    fontFamily: 'field-depth-2',
    fontSize: 18,
    color: `rgba(${INK_RGB}, 0.9)`,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: `rgba(${INK_RGB}, 0.14)`,
  },
  go: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: `rgba(${INK_RGB}, 0.9)`,
  },
  goText: { fontFamily: 'field-depth-3', fontSize: 15, color: PAPER },
  foot: {
    fontFamily: 'field-depth-4',
    fontSize: 12,
    color: `rgba(${INK_RGB}, 0.38)`,
    paddingTop: 16,
  },
});
