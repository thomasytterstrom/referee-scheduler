// Hand-rolled i18n seam: resolve a dotted key against the English catalogue and substitute {named}
// placeholders. English ships now; a later sv.json is a mechanical swap. No i18n library.

import en from "./en.json";

type Params = Record<string, string | number>;

// Walk the dotted key into the nested catalogue; undefined if any segment misses or is not a string.
function resolve(key: string): string | undefined {
  let node: unknown = en;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function t(key: string, params?: Params): string {
  const template = resolve(key);
  if (template === undefined) return key; // missing strings stay visible, never crash
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
