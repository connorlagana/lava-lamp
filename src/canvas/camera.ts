import type { Camera, Point, Rect } from '../model/types';
import { clamp } from '../lib/rand';

export const MIN_ZOOM = 0.12;
export const MAX_ZOOM = 3.2;

export const worldToScreen = (c: Camera, p: Point): Point => ({ x: p.x * c.z + c.x, y: p.y * c.z + c.y });
export const screenToWorld = (c: Camera, p: Point): Point => ({ x: (p.x - c.x) / c.z, y: (p.y - c.y) / c.z });

/** Zoom about a fixed screen point, the way a trackpad pinch should behave. */
export function zoomAt(c: Camera, screen: Point, factor: number): Camera {
  const z = clamp(c.z * factor, MIN_ZOOM, MAX_ZOOM);
  const k = z / c.z;
  return { z, x: screen.x - (screen.x - c.x) * k, y: screen.y - (screen.y - c.y) * k };
}

export function visibleWorldRect(c: Camera, viewport: { w: number; h: number }): Rect {
  const tl = screenToWorld(c, { x: 0, y: 0 });
  const br = screenToWorld(c, { x: viewport.w, y: viewport.h });
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
}

/** Frame a world rect inside the viewport with room to breathe. */
export function fitRect(rect: Rect, viewport: { w: number; h: number }, pad = 120, maxZoom = 1): Camera {
  const w = Math.max(rect.w, 1);
  const h = Math.max(rect.h, 1);
  const z = clamp(
    Math.min((viewport.w - pad * 2) / w, (viewport.h - pad * 2) / h),
    MIN_ZOOM,
    Math.min(MAX_ZOOM, maxZoom),
  );
  return {
    z,
    x: viewport.w / 2 - (rect.x + w / 2) * z,
    y: viewport.h / 2 - (rect.y + h / 2) * z,
  };
}

/** Centre a world point at a chosen zoom, optionally biased upward for a panel. */
export function centerOn(p: Point, viewport: { w: number; h: number }, z: number, yBias = 0): Camera {
  return { z, x: viewport.w / 2 - p.x * z, y: viewport.h / 2 - p.y * z + yBias };
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Interpolating x/y/z directly makes long flights swing wide. Interpolating
 * the world point under the screen centre, with zoom in log space, gives the
 * smooth "fly" you expect from a map.
 */
export function interpolateCamera(a: Camera, b: Camera, t: number, viewport: { w: number; h: number }): Camera {
  const e = easeInOutCubic(clamp(t, 0, 1));
  const center = { x: viewport.w / 2, y: viewport.h / 2 };
  const ca = screenToWorld(a, center);
  const cb = screenToWorld(b, center);
  const z = Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * e);
  const cx = ca.x + (cb.x - ca.x) * e;
  const cy = ca.y + (cb.y - ca.y) * e;
  return { z, x: center.x - cx * z, y: center.y - cy * z };
}

export const cameraEqual = (a: Camera, b: Camera) =>
  Math.abs(a.x - b.x) < 0.4 && Math.abs(a.y - b.y) < 0.4 && Math.abs(a.z - b.z) < 0.001;
