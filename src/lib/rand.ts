/** Deterministic pseudo-random in [0,1) derived from a string. */
export function hash01(seed: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1_000_003) / 1_000_003;
}

/** Deterministic signed wobble in [-amount, amount]. Keeps layouts organic but stable. */
export function wobble(seed: string, salt: number, amount: number): number {
  return (hash01(seed, salt) * 2 - 1) * amount;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
