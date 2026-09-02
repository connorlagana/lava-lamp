/**
 * The runtime this package is allowed to assume.
 *
 * Core is compiled without `lib.dom`, deliberately — the type checker is the
 * cheapest possible test that nothing in here has reached for a browser. But a
 * handful of globals genuinely do exist in both a browser and Hermes, and this
 * file is the explicit, reviewable list of them. Anything not named here is not
 * available, which is the point: adding to this list is a decision, not an
 * accident.
 */

declare function setTimeout(handler: () => void, timeout?: number): number;
declare function clearTimeout(handle?: number): void;
declare function requestAnimationFrame(cb: (time: number) => void): number;
declare function cancelAnimationFrame(handle: number): void;
declare const performance: { now(): number };

declare function fetch(input: string, init?: RequestInit): Promise<Response>;

interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface Response {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

declare class TextDecoder {
  constructor(label?: string);
  decode(input?: Uint8Array): string;
}
