// Build do plugin.
//  npm run dev   -> compila direto para o cofre de teste e fica observando (watch)
//  npm run build -> versão final em plugin/dist (manifest.json + main.js + styles.css)
import esbuild from "esbuild";
import { builtinModules } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const producao = process.argv[2] === "production";

const saida = producao
  ? resolve(aqui, "dist")
  : resolve(aqui, "../cofre-teste/.obsidian/plugins/accretion-disk");

mkdirSync(saida, { recursive: true });

// manifest.json e styles.css são copiados a cada (re)build
const copiarEstaticos = {
  name: "copiar-estaticos",
  setup(build) {
    build.onEnd(() => {
      for (const f of ["manifest.json", "styles.css"]) {
        copyFileSync(resolve(aqui, f), resolve(saida, f));
      }
      // Arquivo .hotreload faz o plugin Hot Reload recarregar sozinho (passo 2)
      if (!producao) copyFileSync(resolve(aqui, ".hotreload"), resolve(saida, ".hotreload"));
      console.log(`[olho] pronto -> ${saida}`);
    });
  },
};

const contexto = await esbuild.context({
  entryPoints: [resolve(aqui, "src/main.js")],
  bundle: true,
  format: "cjs",
  target: "es2020",
  platform: "node",
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*", ...builtinModules],
  outfile: resolve(saida, "main.js"),
  sourcemap: producao ? false : "inline",
  minify: producao,
  treeShaking: true,
  logLevel: "info",
  plugins: [copiarEstaticos],
});

if (producao) {
  await contexto.rebuild();
  await contexto.dispose();
} else {
  await contexto.watch();
  console.log("[olho] observando mudanças em plugin/src ...");
}
