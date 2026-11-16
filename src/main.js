// Accretion Disk 3D - plugin do Obsidian.
// Registra a vista, o botão na lateral e o comando. A cena 3D está em olho.js (mountOlho),
// portada do protótipo (Parte 6, passo 3).
import { ItemView, Plugin, TFile } from "obsidian";
import { mountOlho } from "./olho.js";

const VIEW_TYPE = "accretion-disk-3d-view";

const MAX_ITENS = 150;
const H48 = 48 * 3600 * 1000;

// Lê o cofre e monta os tópicos: cada item é uma nota, com seus links (nas duas direções).
function lerCofre(app, cfg = {}) {
  const arquivos = app.vault.getMarkdownFiles();
  const res = app.metadataCache.resolvedLinks || {};
  const grau = new Map(arquivos.map((f) => [f.path, 0]));
  const vizinhos = new Map(arquivos.map((f) => [f.path, new Set()]));
  for (const [de, alvos] of Object.entries(res)) {
    if (!vizinhos.has(de)) continue;
    for (const para of Object.keys(alvos)) {
      if (para === de || !vizinhos.has(para)) continue;
      vizinhos.get(de).add(para); vizinhos.get(para).add(de);
    }
  }
  vizinhos.forEach((s, p) => grau.set(p, s.size));
  const agora = Date.now();
  const nota = (f) => ({ nome: f.basename.replace(/\s*-\s*ESTADO ATUAL.*$/i, "").trim() || f.basename, caminho: f.path, recente: agora - f.stat.ctime < H48 });
  const topico = (nome, lista) => {
    const itens = lista.slice(0, MAX_ITENS).map(nota);
    const pos = new Map(itens.map((n, i) => [n.caminho, i]));
    itens.forEach((n) => { n.links = [...vizinhos.get(n.caminho)].filter((p) => pos.has(p)).map((p) => pos.get(p)).slice(0, 6); });
    return { nome, itens };
  };
  const porRecente = [...arquivos].sort((a, b) => b.stat.mtime - a.stat.mtime);
  const porLigacao = [...arquivos].sort((a, b) => grau.get(b.path) - grau.get(a.path) || b.stat.mtime - a.stat.mtime);
  const topicos = [];
  // listas por tipo de nota, reconhecidas pelo nome ou pela pasta (só aparecem se tiverem notas)
  const pasta = (f) => (f.path.includes("/") ? f.path.split("/")[0].toLowerCase() : "");
  const tags = (f) => {
    const c = app.metadataCache.getFileCache(f) || {};
    const fm = c.frontmatter && c.frontmatter.tags;
    return [].concat(fm || [], (c.tags || []).map((t) => t.tag)).map((t) => String(t).replace(/^#/, "").toLowerCase());
  };
  const temMarcados = arquivos.some((f) => pasta(f) === "clientes" || tags(f).includes("cliente"));
  const tipos = [
    // se alguma nota tiver a tag #cliente (ou estiver na pasta Clientes), só essas contam; senão, reconhece pelo nome
    ["CLIENTES", temMarcados
      ? (f) => pasta(f) === "clientes" || tags(f).includes("cliente")
      : (f) => /estado atual/i.test(f.basename)],
    ["REGRAS", (f) => /^regras?\b/i.test(f.basename) || pasta(f) === "regras" || tags(f).includes("regra")],
    ["SKILLS", (f) => /skill/i.test(f.basename) || pasta(f) === "skills" || tags(f).includes("skill")],
  ];
  for (const [nome, ok] of tipos) {
    const vistos = new Set();
    const l = porRecente.filter(ok).filter((f) => { const k = nota(f).nome.toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true; });
    if (l.length) topicos.push(topico(nome, l));
  }
  if (arquivos.length) {
    topicos.push(topico("RECENTES", porRecente));
    topicos.push(topico("MAIS LIGADAS", porLigacao));
    // saúde do cofre: notas sem nenhum link e notas paradas há mais de N dias (cfg.paradasDias, padrão 30) (as mais antigas primeiro)
    const orfas = porRecente.filter((f) => grau.get(f.path) === 0);
    if (orfas.length) topicos.push(topico("ÓRFÃS", orfas));
    const paradas = [...arquivos].filter((f) => agora - f.stat.mtime > (+cfg.paradasDias || 30) * 86400000).sort((a, b) => a.stat.mtime - b.stat.mtime);
    if (paradas.length) topicos.push(topico("PARADAS", paradas));
  }
  // uma lista por pasta de primeiro nível (as maiores)
  const pastas = new Map();
  for (const f of porRecente) {
    const i = f.path.indexOf("/");
    if (i < 0) continue;
    const p = f.path.slice(0, i);
    if (!pastas.has(p)) pastas.set(p, []);
    pastas.get(p).push(f);
  }
  [...pastas.entries()].filter(([, l]) => l.length >= 3).sort((a, b) => b[1].length - a[1].length).slice(0, 4)
    .filter(([p]) => !topicos.some((t) => t.nome === p.toUpperCase()))
    .forEach(([p, l]) => topicos.push(topico(p.toUpperCase(), l)));
  return topicos;
}

// Grafo de links do cofre inteiro (sem direção): caminho -> conjunto de vizinhos
function grafo(app) {
  const res = app.metadataCache.resolvedLinks || {};
  const g = new Map();
  const add = (a, b) => { if (!g.has(a)) g.set(a, new Set()); g.get(a).add(b); };
  for (const [de, alvos] of Object.entries(res)) for (const para of Object.keys(alvos)) { if (de !== para) { add(de, para); add(para, de); } }
  return g;
}
// Menor caminho entre duas notas (busca em largura). Devolve lista de {nome, caminho} ou null.
function caminhoEntre(app, de, para) {
  const g = grafo(app);
  if (de === para) return [de];
  const veio = new Map([[de, null]]); const fila = [de];
  while (fila.length) {
    const x = fila.shift();
    for (const y of g.get(x) || []) {
      if (veio.has(y)) continue;
      veio.set(y, x);
      if (y === para) { const r = [y]; let k = x; while (k !== null) { r.unshift(k); k = veio.get(k); } return r; }
      fila.push(y);
    }
  }
  return null;
}
function buscarNotas(app, texto) {
  const q = texto.trim().toLowerCase();
  if (!q) return [];
  return app.vault.getMarkdownFiles().filter((f) => f.basename.toLowerCase().includes(q))
    .sort((a, b) => a.basename.length - b.basename.length).slice(0, 6).map((f) => ({ nome: f.basename, caminho: f.path }));
}

// Resumo do cofre para o zoom pelos anéis: as notas mais ligadas e alguns números
function resumoCofre(app) {
  const arquivos = app.vault.getMarkdownFiles();
  const g = grafo(app);
  const grau = (f) => (g.get(f.path) ? g.get(f.path).size : 0);
  const hubs = [...arquivos].sort((a, b) => grau(b) - grau(a)).slice(0, 14).filter((f) => grau(f) > 0)
    .map((f) => ({ nome: f.basename, caminho: f.path, grau: grau(f) }));
  let links = 0; g.forEach((s) => { links += s.size; });
  const pastas = new Set(arquivos.map((f) => (f.path.includes("/") ? f.path.split("/")[0] : "")).filter(Boolean));
  return { hubs, notas: arquivos.length, links: Math.round(links / 2), orfas: arquivos.filter((f) => grau(f) === 0).length, pastas: pastas.size };
}

class OlhoView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Accretion Disk 3D";
  }
  getIcon() {
    return "eye";
  }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.addClass("accretion-disk-3d-view");
    this.root = container.createDiv();
    const plugin = this.plugin, app = this.app;
    this.recarregar = null;
    this.dispose = mountOlho(this.root, {
      app,
      armazem: { ler: () => plugin.dados.cfg || {}, salvar: (c) => { plugin.dados.cfg = c; plugin.saveData(plugin.dados); } },
      cofre: {
        topicos: () => lerCofre(app, plugin.dados.cfg || {}),
        resumo_cofre: () => resumoCofre(app),
        renomear: async (caminho, novo) => {
          const f = app.vault.getAbstractFileByPath(caminho);
          if (!(f instanceof TFile)) return { ok: false, erro: "Nota não encontrada." };
          const nome = String(novo || "").trim().replace(/\.md$/i, "");
          if (!nome) return { ok: false, erro: "O nome não pode ficar vazio." };
          if (/[\\/:*?"<>|#^\[\]]/.test(nome)) return { ok: false, erro: "Não use \\ / : * ? \" < > | # ^ [ ] no nome." };
          const pasta = f.parent && f.parent.path && f.parent.path !== "/" ? f.parent.path + "/" : "";
          const novoCaminho = pasta + nome + ".md";
          if (novoCaminho === f.path) return { ok: true, caminho: f.path };
          if (app.vault.getAbstractFileByPath(novoCaminho)) return { ok: false, erro: "Já existe uma nota com esse nome." };
          try { await app.fileManager.renameFile(f, novoCaminho); } catch (e) { return { ok: false, erro: "Não foi possível renomear." }; }
          return { ok: true, caminho: novoCaminho };
        },
        buscar: (t) => buscarNotas(app, t),
        caminho: (de, para) => { const r = caminhoEntre(app, de, para); return r && r.map((p) => { const f = app.vault.getAbstractFileByPath(p); return { nome: f ? f.basename : p, caminho: p }; }); },
        abrir: (caminho) => { const f = app.vault.getAbstractFileByPath(caminho); if (f instanceof TFile) app.workspace.getLeaf("tab").openFile(f); },
        resumo: async (caminho) => {
          const f = app.vault.getAbstractFileByPath(caminho);
          if (!(f instanceof TFile)) return "";
          const txt = await app.vault.cachedRead(f);
          return txt.replace(/^---[\s\S]*?---\s*/, "").replace(/^#+\s.*$/gm, "").replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, "$1").replace(/[*_`>#-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
        },
      },
    });
  }

  zoom(f) {
    if (this.dispose && this.dispose.zoom) this.dispose.zoom(f);
  }

  abrirCaminho() {
    if (this.dispose && this.dispose.abrirCaminho) this.dispose.abrirCaminho();
  }

  // chamado pelo plugin quando o cofre muda
  atualizar() {
    if (this.dispose && this.dispose.recarregar) this.dispose.recarregar();
  }

  async onClose() {
    if (this.dispose) this.dispose();
    this.dispose = null;
    this.contentEl.empty();
  }
}

export default class OlhoUniversoPlugin extends Plugin {
  async onload() {
    this.dados = Object.assign({ cfg: {} }, await this.loadData());
    this.registerView(VIEW_TYPE, (leaf) => new OlhoView(leaf, this));

    // quando o cofre muda (nota nova, link novo, nota apagada), atualiza a vista depois de uns segundos parados
    let t = null;
    const agendar = () => {
      clearTimeout(t);
      t = setTimeout(() => this.app.workspace.getLeavesOfType(VIEW_TYPE).forEach((l) => l.view.atualizar && l.view.atualizar()), 6000);
    };
    this.registerEvent(this.app.metadataCache.on("resolved", agendar));
    this.registerEvent(this.app.vault.on("create", agendar));
    this.registerEvent(this.app.vault.on("delete", agendar));
    this.registerEvent(this.app.vault.on("rename", agendar));
    this.register(() => clearTimeout(t));

    this.addRibbonIcon("eye", "Abrir Accretion Disk 3D", () => this.abrir());
    for (const [id, nome, f] of [["aproximar", "Aproximar (zoom pelos anéis)", 1.6], ["afastar", "Afastar (zoom pelos anéis)", 1 / 1.6]]) {
      this.addCommand({
        id, name: nome,
        callback: () => { const v = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0]; if (v && v.view.zoom) v.view.zoom(f); },
      });
    }
    this.addCommand({
      id: "caminho-entre-notas",
      name: "Caminho entre notas (a partir da nota ativa)",
      callback: async () => {
        await this.abrir();
        const v = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
        if (v && v.view.abrirCaminho) v.view.abrirCaminho();
      },
    });
    this.addCommand({
      id: "abrir-accretion-disk",
      name: "Abrir Accretion Disk 3D",
      callback: () => this.abrir(),
    });
  }

  onunload() {
    // O Obsidian fecha as vistas registradas sozinho ao descarregar.
  }

  async abrir() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}
