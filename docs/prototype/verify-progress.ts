// PROTOTYPE — throwaway. Runs progress-proto.html's script under a minimal DOM shim to catch runtime
// errors without a browser (executes render() + every variant in its initial state). Timers never
// fire here (no begin() call), so this checks static render only — not a substitute for eyeballing a solve.
class Node {
  tagName: string; children: any[] = []; className = ""; attrs: Record<string, string> = {}; innerHTML = "";
  constructor(t: string) { this.tagName = t.toUpperCase(); }
  get nodeType() { return 1; }
  setAttribute(k: string, v: string) { this.attrs[k] = v; }
  addEventListener() {}
  append(...c: any[]) { this.children.push(...c); }
  replaceChildren(...c: any[]) { this.children = c; }
  get classList() { return { add() {} }; }
  get childElementCount() { return this.children.filter((c) => c && c.nodeType === 1).length; }
  get textContent() { return this.children.map((c) => (c?.nodeType === 3 ? c.text : c?.textContent ?? "")).join(""); }
}
const roots: Record<string, Node> = { root: new Node("div"), sw: new Node("div") };
(globalThis as any).document = {
  createElement: (t: string) => new Node(t),
  createTextNode: (s: string) => ({ nodeType: 3, text: String(s) }),
  getElementById: (id: string) => roots[id] ?? null,
  querySelector: () => null,
};
(globalThis as any).location = new URL("http://localhost/?variant=A");
(globalThis as any).history = { replaceState() {} };
(globalThis as any).addEventListener = () => {};

const html = await Bun.file(new URL("./progress-proto.html", import.meta.url)).text();
const code = html.match(/<script>([\s\S]*)<\/script>/)![1];
const V: any = {};
new Function(code + "\n;Object.assign(arguments[0],{VariantA,VariantB,VariantC,render,VARIANTS,SOLVE});")(V);

for (const k of ["A", "B", "C"] as const) {
  const node = V.VARIANTS[k][1]();
  const count = node.childElementCount;
  if (count < 1) throw new Error(`variant ${k} rendered empty`);
  console.log(`variant ${k} (${V.VARIANTS[k][0]}): renders OK, top-level children=${count}`);
}
console.log(`switcher after initial render(): "${roots.sw.textContent.trim()}"`);
console.log(`root after initial render(): children=${roots.root.childElementCount}`);
console.log("ALL VARIANTS RENDER — no runtime error");
