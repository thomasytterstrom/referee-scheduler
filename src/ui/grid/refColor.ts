// Deterministic Referee.id -> stable HSL color. A referee's identity (never its mutable name)
// drives one fixed hue via a 32-bit FNV-1a hash; saturation/lightness are pinned so every hue
// stays legible as text on a light background. Exported so every view colors a ref identically.

export function refColor(id: string): string {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
  }
  const hue = (hash >>> 0) % 360;
  return `hsl(${hue}, 60%, 40%)`;
}
