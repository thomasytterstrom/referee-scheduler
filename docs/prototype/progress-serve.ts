// PROTOTYPE — throwaway. Serves progress-proto.html so the ?variant= URL + arrow-key switcher work.
// Run: bun run progress  ->  http://localhost:5179/?variant=A
const html = await Bun.file(new URL("./progress-proto.html", import.meta.url)).text();
const server = Bun.serve({ port: 5179, fetch: () => new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }) });
console.log(`Progress-UI prototype: http://localhost:${server.port}/?variant=A   (variants: A inline · B modal · C live grid)`);
