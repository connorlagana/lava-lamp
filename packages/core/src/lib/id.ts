let counter = 0;

export function uid(prefix = 'n'): string {
  counter = (counter + 1) % 1e6;
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}
