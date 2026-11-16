// Página de teste: monta a cena num quadro MENOR que a janela, para provar que ela
// fica presa ao quadro (como na vista do Obsidian). Usar: npm --prefix plugin run harness
import { mountOlho } from "./olho.js";

window.__mount = mountOlho;
window.__olho = mountOlho(document.getElementById("raiz"));
