import { useEffect, useRef } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { useCamera } from '../store/app';

/**
 * Keeping what you are typing into out from under the keyboard.
 *
 * A sheet can move itself: `Sheet` docks at the bottom of the room the keyboard
 * has left and its body scrolls. A field that sits *on the board* cannot — the
 * whole point of the editor is that it is exactly where the words are, and of a
 * link label that it is on the line. So the board moves instead. When the
 * keyboard arrives over the thing being edited, the camera pans up by however
 * much is in the way and no further.
 *
 * It does not pan back. The alternative is the map jumping away from the
 * thought the moment you finish typing, and it would have to fight anyone who
 * panned while the keyboard was up.
 *
 * `bottom` is the lowest screen y that has to stay visible, or null when there
 * is nothing being edited. It is read through a ref because it moves with the
 * camera, and re-subscribing to the keyboard on every frame of a pan is not
 * what this is for.
 */
export function useKeepAboveKeyboard(bottom: number | null, pad = 20) {
  const { setCamera } = useCamera();
  const at = useRef(bottom);
  at.current = bottom;

  useEffect(() => {
    const onShow = (e: KeyboardEvent) => {
      const y = at.current;
      if (y === null) return;
      // `screenY` is the top of the keyboard, so this is the overlap exactly.
      const over = y + pad - e.endCoordinates.screenY;
      if (over <= 0) return;
      setCamera((c) => ({ ...c, y: c.y - over }));
    };
    // iOS announces the keyboard before it arrives, which is early enough to
    // move with it rather than after it. Android only says once it is there.
    const sub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      onShow,
    );
    return () => sub.remove();
  }, [setCamera, pad]);
}
