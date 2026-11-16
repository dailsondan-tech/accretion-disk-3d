// Servidor de teste da cena (sem Obsidian): http://127.0.0.1:5174
import esbuild from "esbuild";
import { copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));

const ctx = await esbuild.context({
  entryPoints: [resolve(aqui, "src/harness.js")],
  bundle: true,
  format: "iife",
  target: "es2020",
  outfile: resolve(aqui, "dev/harness.js"),
  sourcemap: "inline",
  logLevel: "info",
  plugins: [{
    name: "css",
    setup(b) { b.onEnd(() => copyFileSync(resolve(aqui, "styles.css"), resolve(aqui, "dev/styles.css"))); },
  }],
});
await ctx.watch();
const { port } = await ctx.serve({ servedir: resolve(aqui, "dev"), port: 5174, host: "127.0.0.1" });
console.log(`[olho] teste da cena em http://127.0.0.1:${port}`);
