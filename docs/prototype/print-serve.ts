// PROTOTYPE — throwaway. Serves print-proto.html so the ?variant= URL + arrow-key switcher + the
// browser Print preview work. Run: bun run print  ->  http://localhost:5179/?variant=A
const html = await Bun.file(new URL("./print-proto.html", import.meta.url)).text();
const server = Bun.serve({ port: 5179, fetch: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }) });
console.log(`Print prototype: http://localhost:${server.port}/?variant=A   (variants: A wall-grid · B ref-slips · C court-sheets — then Print)`);
