// PROTOTYPE — throwaway. Serves ui-proto.html so the ?variant= URL + arrow-key switcher work.
// Run: bun run ui  ->  http://localhost:5178/?variant=A
const html = await Bun.file(new URL("./ui-proto.html", import.meta.url)).text();
const server = Bun.serve({ port: 5178, fetch: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }) });
console.log(`UI prototype: http://localhost:${server.port}/?variant=A   (variants: A spreadsheet · B dashboard · C wizard)`);
