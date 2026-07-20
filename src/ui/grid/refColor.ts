// Deterministic referee colour assignment — unique per tournament roster.
//
// makeRefColorMap(ids) sorts the referee ids, then spaces hues evenly around the colour wheel using
// the golden-angle step (137.508°) so adjacent assignments are as perceptually different as
// possible.  Saturation and lightness are pinned for legibility as text on a light background.
//
// The resulting Map is stable as long as the set of ids is unchanged; adding a referee rotates every
// colour slightly but never produces a duplicate.  Use this wherever the full roster is available.

const GOLDEN_ANGLE = 137.508; // degrees — maximises minimum hue distance between consecutive steps

export function makeRefColorMap(ids: readonly string[]): Map<string, string> {
  const sorted = [...ids].sort(); // stable, deterministic order
  const map = new Map<string, string>();
  sorted.forEach((id, i) => {
    const hue = (i * GOLDEN_ANGLE) % 360;
    map.set(id, `hsl(${hue.toFixed(1)}, 60%, 40%)`);
  });
  return map;
}

// Convenience: colour a single id against a full roster.
export function refColor(id: string, roster: readonly string[]): string {
  return makeRefColorMap(roster).get(id) ?? `hsl(0, 0%, 50%)`;
}
