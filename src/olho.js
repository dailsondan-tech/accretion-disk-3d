import * as THREE from 'three';

// HTML da cena (canvas, rótulos, título e botões). Os painéis CONFIG/cartão/editor são criados mais abaixo.
const TEMPLATE = `
  <canvas id="cena"></canvas>
  <div id="skills"></div>
  <div id="skills-titulo"><button id="t-prev" aria-label="Tópico anterior">‹</button><span id="t-nome">SKILLS</span><button id="t-next" aria-label="Próximo tópico">›</button></div>
  <button id="focobtn" title="Modo foco (tecla F)">FOCO</button>
  <button id="cfgbtn">CONFIG</button>
  <button id="reset">RESET</button>
  <div id="foco-dica">MODO FOCO · F ou Esc para sair</div>
  <div id="marca" aria-hidden="true"><span class="dot"></span><span>SEGUNDO CÉREBRO – CLAUDE IA</span></div>
  <div id="term" aria-hidden="true"><div class="th">TERMINAL</div><pre class="tb"></pre></div>
  <div id="fps">-- FPS</div>`;

/**
 * Monta a cena do Olho do Universo dentro de `root` (um elemento com tamanho definido).
 * Devolve uma função dispose() que remove tudo (eventos, animação, WebGL).
 */
export function mountOlho(root, opts = {}) {
  root.classList.add('olho-raiz');
  root.innerHTML = TEMPLATE;
  root.tabIndex = -1;                                   // para receber teclas (F, Esc) só quando o foco está aqui
  const $ = (id) => root.querySelector('#' + id);
  const cleanups = [];                                  // tudo que precisa ser desfeito no dispose()
  const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); cleanups.push(() => t.removeEventListener(ev, fn, o)); };
  let vw = Math.max(1, root.clientWidth), vh = Math.max(1, root.clientHeight);   // tamanho do quadro (no protótipo era a janela)
  const setMouse = (e) => { const r = root.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; };
  const canvas = $('cena');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0); // fundo vem do CSS

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(0, 0, 18);

// ---------- Ajustes (valores iniciais) ----------
const EYE_R = 1.2;           // raio do olho
const GOLD_SCALE = 1.2;       // tamanho da parte dourada (o olho não muda)
const DISK_R = EYE_R * 6.4 * GOLD_SCALE;   // como na imagem: disco ~5,8x o raio do olho    // raio do disco (olho ~1/7 da largura)
const N = 520000;            // partículas do disco
const RINGS = 220;           // quantidade de "sulcos" finos
const VIEW_SHIFT_X = 2.4;    // deslocamento MÁXIMO para a esquerda (janela estreita): sobra espaço à direita para os nomes das skills
let viewShiftX = VIEW_SHIFT_X;   // valor real, calculado no resize(): em janela larga vai a 0 e o olho fica no centro
const VIEW_SCALE = 1.15;     // conjunto 15% maior na tela
const TILT_Y = 0.5;          // gira em torno do eixo vertical: o lado direito se afasta e afina (como na imagem)
const TILT_X = -0.25;        // ~20° de inclinação
const TILT_Z = 0.26;         // ~15° do eixo maior
const ORBIT_SPEED = 0.25;    // velocidade de órbita
const DENSITY = 1.12;        // multiplicador de brilho da poeira

// ---------- Olho (sempre círculo perfeito) ----------
const eye = new THREE.Mesh(
  new THREE.CircleGeometry(EYE_R, 96),
  new THREE.MeshBasicMaterial({ color: 0x010203, transparent: true, depthTest: false })
);
eye.renderOrder = 10;
eye.position.z = 0.02;
scene.add(eye);

const halo = new THREE.Mesh(
  new THREE.RingGeometry(EYE_R, EYE_R + 0.075, 128),
  new THREE.MeshBasicMaterial({ color: 0xfff1d2, transparent: true, depthTest: false })
);
halo.renderOrder = 11;
halo.position.z = 0.03;
scene.add(halo);

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

const glow = new THREE.Mesh(
  new THREE.PlaneGeometry(EYE_R * 2.9, EYE_R * 2.9),
  new THREE.MeshBasicMaterial({
    map: radialTexture([[0.62, 'rgba(255,214,140,0.28)'], [1, 'rgba(255,214,140,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
);
glow.position.z = 0.01;
scene.add(glow);

// Névoa azul-aço bem fraca atrás do disco
const mist = new THREE.Mesh(
  new THREE.PlaneGeometry(DISK_R * 2.6, DISK_R * 2.6),
  new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(40,75,115,0.30)'], [0.55, 'rgba(25,50,80,0.14)'], [1, 'rgba(10,20,35,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
);
mist.position.z = -2;
scene.add(mist);

// ---------- Estrelas de fundo ----------
{
  const n = 500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 60;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 34;
    pos[i * 3 + 2] = -5 - Math.random() * 10;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xcfd8e8, size: 0.05, transparent: true, opacity: 0.45, depthWrite: false,
  })));
}

// ---------- Fundo: linhas finas azuladas que cruzam a tela e poeira espalhada (como na imagem) ----------
{
  let seed = 23; const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pos = [], col = [];
  for (let k = 0; k < 16; k++) {
    const cx = (rr() - 0.5) * 40, cy = (rr() - 0.5) * 24, rad = 9 + rr() * 16;
    const a0 = rr() * Math.PI * 2, span = 0.5 + rr() * 1.4, seg = 80;
    const b = 0.07 + rr() * 0.09;
    for (let i = 0; i < seg; i++) {
      [i, i + 1].forEach((j) => {
        const a = a0 + (span * j) / seg, fade = Math.sin((Math.PI * j) / seg);
        pos.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, -7);
        col.push(0.35 * b * fade * 3, 0.5 * b * fade * 3, 0.75 * b * fade * 3);
      });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  // poeira dourada solta, longe do disco
  const n = 2500, dp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rr() * Math.PI * 2, r = 8 + Math.pow(rr(), 0.8) * 8;
    dp[i * 3] = Math.cos(a) * r * 1.25; dp[i * 3 + 1] = Math.sin(a) * r * 0.85; dp[i * 3 + 2] = (rr() - 0.5) * 6;
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  scene.add(new THREE.Points(dg, new THREE.PointsMaterial({
    color: 0xd69a55, size: 0.05, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending,
  })));
}

// ---------- Disco de poeira dourada ----------
function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const aR = new Float32Array(N);
const aTheta = new Float32Array(N);
const aSize = new Float32Array(N);
const aBright = new Float32Array(N);
const aZ = new Float32Array(N);
const aWarp = new Float32Array(N);
const aPh = new Float32Array(N);

// cada sulco tem seu próprio brilho (dá o aspecto de disco de vinil)
const ringBright = new Float32Array(RINGS + 1);
for (let k = 0; k <= RINGS; k++) ringBright[k] = 0.5 + 0.5 * Math.pow(Math.random(), 1.2);

// Perfil medido na imagem de referência (u = distância do olho, em raios do olho):
//  halo | espaço vazio 1,05-1,7 | fios separados 1,8-2,4 | faixa forte 2,4-3,8 (linha mais forte ~3,05)
//  | fios que afinam e se separam 3,8-5,3 | brilhinhos soltos 5,3-6,5
// aleatório determinístico por anel (cada anel ganha sua própria inclinação e altura)
const hh = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.7;

for (let i = 0; i < N; i++) {
  const z = Math.random();
  let u, bright, size = 1;
  if (z < 0) {                                    // fiozinho tênue dentro do espaço vazio
    u = 1.7 + (Math.random() - 0.5) * 0.01; bright = 0.35; size = 0.8;
  } else if (z < 0.025) {                             // fios separados, poucos e individuais
    u = 2.25 + Math.floor(Math.random() * 2) * 0.15 + (Math.random() - 0.5) * 0.012;
    bright = 0.4 + 0.15 * Math.random(); size = 0.85;
  } else if (z < 0.06) {                            // a linha de brilho mais forte (discreta, não um anel branco)
    u = 3.05 + gauss() * 0.05; bright = 0.85; size = 1.05;
  } else if (z < 0.74) {                             // faixa forte: muitos fios finos, bordas macias dos dois lados
    let k, d;
    do {
      k = Math.floor(Math.random() * 280);
      u = 2.2 + k * 0.011 + (Math.random() - 0.5) * 0.006;
      d = smooth(2.2, 2.75, u) * (1 - smooth(4.0, 5.2, u));
    } while (Math.random() > d);
    const bump = Math.exp(-Math.pow((u - 3.3) / 1.3, 2));
    bright = (0.42 + 0.75 * bump) * ringBright[k];
  } else if (z < 0.94) {                             // dissipando: fios mais afastados e mais fracos
    const k = Math.floor(Math.random() * 32);
    u = 4.5 + k * 0.045 + (Math.random() - 0.5) * (0.02 + (k / 32) * 0.05);
    bright = (0.28 + 0.5 * (1 - k / 32)) * ringBright[k]; size = 0.85;
  } else {                                           // poeira solta no fim
    u = 5.0 + Math.random() * 1.0;
    bright = 0.25 + Math.random() * 0.5; size = 0.6 + Math.random() * 0.6;
  }
  const dissolve = smooth(4.0, 6.0, u);
  const sparkle = Math.random() < 0.008 ? 1.6 : 1.0;
  aR[i] = u * EYE_R * GOLD_SCALE;
  aTheta[i] = Math.random() * Math.PI * 2;
  // profundidade: cada anel é um círculo inclinado, em altura diferente (nada de prato chapado)
  const key = Math.round(u * 70);
  aWarp[i] = (hh(key) - 0.5) * 0.15 * (0.35 + 0.65 * smooth(1.8, 3.5, u));
  aPh[i] = hh(key + 999) * Math.PI * 2;
  aZ[i] = (hh(key + 555) - 0.5) * 1.0 + (Math.random() - 0.5) * 0.05 * (1 + dissolve * 6);
  aBright[i] = bright * (0.8 + Math.random() * 0.2) * sparkle;
  aSize[i] = size * (0.7 + Math.random() * 0.8) * (sparkle > 1 ? 1.5 : 1);
}

const diskGeo = new THREE.BufferGeometry();
diskGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
diskGeo.setAttribute('aR', new THREE.BufferAttribute(aR, 1));
diskGeo.setAttribute('aTheta', new THREE.BufferAttribute(aTheta, 1));
diskGeo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
diskGeo.setAttribute('aBright', new THREE.BufferAttribute(aBright, 1));
diskGeo.setAttribute('aZ', new THREE.BufferAttribute(aZ, 1));
diskGeo.setAttribute('aWarp', new THREE.BufferAttribute(aWarp, 1));
diskGeo.setAttribute('aPh', new THREE.BufferAttribute(aPh, 1));

const diskMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  uniforms: {
    uTime: { value: 0 },
    uSpeed: { value: ORBIT_SPEED },
    uDensity: { value: DENSITY },
    uSizeK: { value: 1 },                   // compensação de tamanho quando a qualidade corta partículas
    uPx: { value: renderer.getPixelRatio() },
    uCam: { value: 20 },
    uDiskR: { value: DISK_R },
  },
  vertexShader: /* glsl */ `
    attribute float aR, aTheta, aSize, aBright, aZ, aWarp, aPh;
    uniform float uTime, uSpeed, uPx, uCam, uDiskR, uSizeK;
    varying float vB;
    varying float vMix;
    varying float vOut;
    void main() {
      float w = uSpeed / pow(aR, 1.5);          // órbita: dentro gira mais rápido
      float a = aTheta + uTime * w;
      vec3 p = vec3(cos(a) * aR, sin(a) * aR, aZ + aR * aWarp * sin(a - aPh));
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float rel = (-mv.z - uCam) / 9.0;                       // >0 = mais longe, <0 = mais perto
      gl_PointSize = aSize * uPx * uSizeK * (20.0 / -mv.z) * clamp(1.0 - rel * 0.15, 0.8, 1.2);
      vB = aBright * clamp(1.0 - rel * 0.3, 0.6, 1.1);   // perto brilha mais, longe suaviza
      vMix = clamp((aBright - 1.3) * 0.6, 0.0, 0.3);
      vOut = smoothstep(0.4, 0.95, aR / uDiskR);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uDensity;
    varying float vB;
    varying float vMix;
    varying float vOut;
    void main() {
      vec2 d = gl_PointCoord - 0.5;
      float f = smoothstep(0.5, 0.05, length(d));
      vec3 gold = vec3(0.93, 0.56, 0.21);
      vec3 deep = vec3(0.86, 0.45, 0.15);           // mais para fora, o âmbar fica mais fundo (nunca branco)
      vec3 col = mix(mix(gold, deep, vOut * 0.7), vec3(1.0, 0.88, 0.68), vMix);
      gl_FragColor = vec4(col * min(vB, 1.0) * uDensity, f * 0.44);
    }
  `,
});

const disk = new THREE.Points(diskGeo, diskMat);
disk.frustumCulled = false;
const diskGroup = new THREE.Group();
diskGroup.rotation.set(TILT_X, TILT_Y, TILT_Z, 'ZXY');
diskGroup.add(disk);

// brilho macio âmbar por baixo da poeira (vazio perto do olho, pico ~3 raios, apaga na borda)
const bandGlow = new THREE.Mesh(
  new THREE.PlaneGeometry(DISK_R * 2, DISK_R * 2),
  new THREE.MeshBasicMaterial({
    map: radialTexture([
      [0, 'rgba(235,140,50,0)'], [0.26, 'rgba(235,140,50,0)'], [0.33, 'rgba(235,140,50,0.12)'],
      [0.42, 'rgba(235,140,50,0.30)'], [0.60, 'rgba(235,140,50,0.18)'], [0.80, 'rgba(235,140,50,0.06)'], [1, 'rgba(235,140,50,0)'],
    ]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
);
bandGlow.position.z = -0.02;
diskGroup.add(bandGlow);

// Fumaça leve depois do dourado (nuvem fina e irregular, quase imperceptível)
function smokeTexture() {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  let seed = 5; const rr = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // base: anel largo bem fraco
  const base = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S / 2);
  base.addColorStop(0, 'rgba(150,135,125,0)');
  base.addColorStop(0.45, 'rgba(150,135,125,0.028)');
  base.addColorStop(0.75, 'rgba(120,125,135,0.028)');
  base.addColorStop(1, 'rgba(120,125,135,0)');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  // manchas suaves para dar o aspecto esfumaçado
  for (let i = 0; i < 520; i++) {
    const ang = rr() * Math.PI * 2, rad = (0.34 + rr() * 0.58) * (S / 2), size = 25 + rr() * 80;
    const x = S / 2 + Math.cos(ang) * rad, y = S / 2 + Math.sin(ang) * rad;
    const gr = g.createRadialGradient(x, y, 0, x, y, size);
    const warm = rr() < 0.6;
    gr.addColorStop(0, warm ? 'rgba(190,150,105,0.016)' : 'rgba(120,135,160,0.016)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - size, y - size, size * 2, size * 2);
  }
  return new THREE.CanvasTexture(c);
}
// fumaça "viva": a textura é deformada devagar no shader (ondula como névoa) além de girar
function smokeMat(ph) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uMap: { value: smokeTexture() }, uT: { value: 0 }, uO: { value: 0.5 }, uPh: { value: ph } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uT, uO, uPh; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5;
        p += 0.055 * vec2(sin(p.y * 7.0 + uT * 0.6 + uPh), cos(p.x * 7.0 - uT * 0.5 + uPh));
        p += 0.028 * vec2(sin(p.y * 16.0 - uT * 0.8 + uPh * 2.0), cos(p.x * 14.0 + uT * 0.7));
        vec4 t = texture2D(uMap, p + 0.5);
        gl_FragColor = vec4(t.rgb, t.a * uO);
        #include <colorspace_fragment>
      }`,
  });
}
const smoke = new THREE.Mesh(new THREE.PlaneGeometry(DISK_R * 3, DISK_R * 3), smokeMat(0));
smoke.position.z = -0.03;
diskGroup.add(smoke);
// 2ª camada de fumaça girando devagar ao contrário: as duas se cruzam e dão a sensação de névoa passando
const smoke2 = new THREE.Mesh(smoke.geometry, smokeMat(2.4));
smoke2.position.z = -0.035; smoke2.scale.setScalar(0.92); smoke2.rotation.z = 1.7;
smoke.material.uniforms.uO.value = 0.7; smoke2.material.uniforms.uO.value = 0.42;
diskGroup.add(smoke2);

// Disco azul-escuro bem sutil perto do olho (como na imagem)
const innerDisc = new THREE.Mesh(
  new THREE.PlaneGeometry(EYE_R * 4.6, EYE_R * 4.6),
  new THREE.MeshBasicMaterial({
    map: radialTexture([[0, 'rgba(28,50,82,0.34)'], [0.62, 'rgba(28,50,82,0.26)'], [1, 'rgba(28,50,82,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
);
innerDisc.position.z = -0.04;
diskGroup.add(innerDisc);
scene.add(diskGroup);

// ---------- Configurações (salvas no navegador; no plugin vão para o data.json) ----------
let cfgMemoria = {};
const armazem = opts.armazem || { ler: () => cfgMemoria, salvar: (c) => { cfgMemoria = c; } };
const cfg = Object.assign({ clique: 'clicar', brilho: 1, recentes: true, vizinhanca: false, camada2: 2, letras: 22, qualidade: 'auto', pausar: true, pausaMin: 5, paradasDias: 30, som: false, pulsos: true, meteoro: true },
  armazem.ler());
const saveCfg = () => armazem.salvar({ ...cfg });
canvas.style.filter = `brightness(${cfg.brilho})`;

// ---------- Tópicos e roleta de itens (meia-lua) ----------
// Os itens ficam num círculo em volta do olho; só a parte da direita aparece (a "meia-lua").
// Arrastar/rolar em cima dos nomes gira a roleta. No plugin, cada tópico vem do cofre do usuário.
const SKILLS = [
  'Roteiro de vídeo', 'Pesquisa', 'Legendas', 'Edição', 'Tráfego pago', 'Criativos',
  'Relatório', 'Copywriting', 'Cores e marca', 'Áudio', 'Locução', 'Thumbnails', 'Reels',
  'Prompt de imagem', 'Prompt de vídeo', 'Calendário', 'Briefing', 'Orçamento',
  'Análise de conta', 'Rastreio', 'Publicação', 'Roteiro de anúncio', 'Revisão',
  'Organização', 'Resumo', 'Ideias',
];
const NOTAS_COFRE = ["2026-10-04", "Acesso Claude - acesso ao terminal (plano e riscos) 2026-10-17", "Agência de Publicidade", "Apollo - 7 carrosséis novos (23-10)", "Apollo - Ajuste 29-10 (concentrar verba)", "Apollo - Check segunda 26-10", "Apollo - Check sexta 30-10", "Apollo - ESTADO ATUAL", "Apollo - Modelo de Relatórios", "Apollo - Relatório semana 17-10 a 23-10 (imagem)", "Apollo - Status 23-10", "Biblioteca de modelos de legenda - 8 estilos (30-10-2026)", "Boteco Caminho D'Ksa - ESTADO ATUAL", "Bíblia de Personagem", "CLAUDE - Índice-mãe do Segundo Cérebro (05-11-2026)", "Camisa SSP-AM - Fonte SSP Collegiate e método de criar fonte (14-11-2026)", "Carrossel vs Reels - Análise e Decisões por Cliente", "Celular do Pai - Otimização via ADB (02-11-2026)", "Check segunda 02-11 (Max Car e Apollo)", "Checklist de Continuidade de Cena", "Choperia Lugui e Restaurante Ancho - ESTADO ATUAL", "Claude Code - Orquestração Opus + Haiku + Sonnet (reel ULTRACODE)", "Conectores Claude", "Convite Aniversário Sobrinho", "Dr. Simão - Campanhas Meta Ads (28-10-2026)", "Dr. Simão - Carrossel INSS 3 documentos (2026-10-14)", "Dr. Simão - ESTADO ATUAL", "Edição de vídeo - progresso 31 out", "Edição de vídeo com Claude Code no HD externo", "Erros Comuns em Geração de Imagem", "Funk Noar - Cover Suno (letra final + configuração)", "Hugo Bacelar - Análise Reels abr-ago 2026", "Hugo Bacelar - Datas comemorativas novembro 2026 (cards)", "Hugo Bacelar - Diagnóstico simples para enviar ao cliente", "Hugo Bacelar - ESTADO ATUAL", "Hugo Bacelar - Planejamento de novembro 2026 (calendário + roteiros)", "Hugo Bacelar - Plano de conteúdo 30 dias (orgânico)", "Hugo Bacelar - Resumo da conversa (30-31 out 2026)", "Hugo Bacelar - Roteiro Quem é Hugo Bacelar (versão melhorada)", "Hugo Bacelar - Roteiro vídeo Avenida Brasil (Compensa)", "Hugo Bacelar - Roteiro vídeo prevenção ao suicídio (para gravação)", "Instagram + Claude - Automação, Metricool e materiais Astrevo (2026-10-14)", "Legendas - Biblioteca de 9 modelos (02-11-2026)", "Lista de afazeres do Dan", "Lona Mural Família", "Mac - Limpeza de espaço (02-11-2026)", "Mac - Print com tela escura travada (solução 02-11-2026)", "Marketing Skills (coreyhaines31) - Plano de instalação (2026-10-14)", "Max Car - Check quarta 28-10", "Max Car - Check segunda 26-10", "Max Car - ESTADO ATUAL", "Max Car - Fechamento semana 26-10 a 30-10", "Max Car - Fechamento semana 31-10 a 02-11", "Max Car - Modelo de Relatórios", "Max Car - Onix Hatch carrossel publicado (23-10)", "Max Car - Oroch sem mínimo (28-10)", "Max Car - Oroch volta com Reels (23-10)", "Max Car - Parcial 23-10 e 24-10", "Max Car - Relatório PIX 23-10 a 02-11", "Max Car - Relatório semanal 23-10 a 02-11 (versão final)", "Max Car - Resumo para nova conversa (03-11-2026)", "Max Car - Subir 3 carros novos (Voyage, Saveiro, Onix Plus Joy) - PENDENTE", "Minhas Finanças - Painel (07-11-2026)", "Modelo de legenda - palavra amarela passando (30-10-2026)", "Método Cena + FIX (Keyframes Consistentes)", "Noar Combustíveis - ESTADO ATUAL", "Noar Turismo - ESTADO ATUAL", "Novo Negócio", "Obsidian - Gráfico 3D (Cortex Graph) configurado 2026-10-31", "PIX 23-10 (Max Car e Apollo)", "Pesquisa - Linguagem de prompt para video IA (03-11-2026)", "Plano Vídeo Aniversário de Manaus 357 anos (Instagram do Dan)", "Playbook Campanha IA com Personagem Fixo", "Plugin Obsidian próprio - visual Olho do Universo (referência 31-10-2026)", "Plugin Olho do Universo - Andamento do protótipo (14-11-2026)", "Plugin Olho do Universo - Imagens-alvo e próximos passos (14-11-2026)", "Point da Esfirra - Grande Vitória - ESTADO ATUAL", "Point da Esfirra - Viver Melhor - ESTADO ATUAL", "Portfólio Dan", "Portfólio Dan - Diagnóstico 2026-10-29", "Rafaela", "Rede Social e Curso Dan", "Reel Salto em Presidente Figueiredo - Plano (02-11-2026)", "Referência - Reel Segundo Cérebro com Obsidian e Claude (silvestri_gabriel, 05-11-2026)", "Referência - Reel Voz grátis com IA (fabiojaniolima) e resumo da sessão (05-11-2026)", "Regra - Boas-vindas e mensagem pronta personalizada nos anuncios de carro (05-11-2026)", "Regra - Como salvar notas no Obsidian e na nuvem (02-11-2026)", "Regra - Palavras atual e finalizado por cliente (02-11-2026)", "Regra - Terminal do Mac (Desktop Commander) (02-11-2026)", "Regras de Tráfego Pago", "Regras de mockup profissional 2026-10-29", "Relatórios de Tráfego Dashboard", "Resultado - Teste do VoiceStudio no Mac (05-11-2026)", "Resumo para nova conversa - Plugin Obsidian e vídeo com Claude Code (31-10-2026)", "Resumo para nova conversa - Plugin Olho do Universo (14-11-2026)", "Rota Romantica POA-Gramado 18-10", "Space Magnific - Mockups Campanha Ramon 2026-10-29", "Teatro Amazonas Vídeo", "Template Cliente", "Tome Gelo - ESTADO ATUAL", "Treinamento LoRA Magnific", "Técnicas Nano Banana", "Upload Magnific funcionando - Space ligado 2026-10-29", "Viagem SC-Gramado 2027 - Roteiro 7 dias e orçamento", "Vídeo Aniversário Amiga 30 Anos", "iFood - Estratégias de venda (pesquisa 2026-10-14)", "iFood - Plano loja (endereço, Anota Aí, cardápio) - 2026-10-13", "iFood x Anota Aí - Vinculação e comparação de cardápio (Grande Vitória) - 2026-10-15", "Índice de Contexto - como abrir conversa por cliente"];   // TESTE: títulos reais das notas do cofre do Dan (no plugin vêm do próprio cofre)
const TOPICS_PADRAO = [
  { nome: 'SKILLS', itens: SKILLS },
  { nome: 'ANOTAÇÕES', itens: NOTAS_COFRE },
  { nome: 'CLIENTES', itens: ['Apollo', 'Max Car', 'Hugo Bacelar', 'Dr. Simão', "Boteco Caminho D'Ksa", 'Choperia Lugui', 'Restaurante Ancho',
    'Noar Combustíveis', 'Noar Turismo', 'Point da Esfirra - Grande Vitória', 'Point da Esfirra - Viver Melhor', 'Tome Gelo'] },
  { nome: 'REGRAS', itens: ['Boas-vindas nos anúncios de carro', 'Como salvar notas no Obsidian', 'Palavras atual e finalizado',
    'Terminal do Mac', 'Regras de Tráfego Pago', 'Regras de mockup profissional', 'Palavras do cliente'] },
];
// tópicos e nomes podem ser editados no CONFIG (salvos no navegador; no plugin virão do cofre)
let topicosMemoria = null;
function carregarTopicos() {
  try {
    const t = topicosMemoria;
    if (Array.isArray(t) && t.length && t.every((x) => x && typeof x.nome === 'string' && Array.isArray(x.itens) && x.itens.length)) return t;
  } catch (e) { /* usa o padrão */ }
  return TOPICS_PADRAO.map((t) => ({ nome: t.nome, itens: [...t.itens] }));
}
// Com cofre real (plugin): cada tópico vem das notas; itens são objetos {nome, caminho, links, recente}.
const COFRE = opts.cofre || null;
let META = [];                 // dados das notas do tópico aberto (vazio no teste)
let TOPICS = COFRE ? COFRE.topicos().map((t) => ({ nome: t.nome, itens: t.itens.map((n) => n.nome), meta: t.itens })) : carregarTopicos();
if (!TOPICS.length) TOPICS = [{ nome: 'COFRE VAZIO', itens: ['Crie algumas notas'], meta: [{ nome: 'Crie algumas notas', caminho: null, links: [], recente: false }] }];
// nome curto e padronizado: tira datas e parênteses, troca " - " por espaço e corta em N letras com "…"
function shortName(n, max) {
  let t = n.replace(/\([^)]*\)/g, '').replace(/\b\d{4}-\d{2}-\d{2}\b/g, '').replace(/\b\d{1,2}-\d{1,2}(-\d{2,4})?\b/g, '')
    .replace(/\s+-\s+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!t) t = n;
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}
const SLOTS = 150;                      // lugares no círculo (máximo de itens por tópico)
const STEP = (2 * Math.PI) / SLOTS;     // ângulo entre bolinhas vizinhas
const ARC_R = 8.6;                      // arco concêntrico, logo fora do disco
const ARC_SPAN = THREE.MathUtils.degToRad(48);
const wrapPI = (a) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const U_ROT = { value: 0 };
const U_SPAN = { value: ARC_SPAN };
const U_OPEN = { value: 1 };                    // (reservado) 1 = aberto
const U_FADE = { value: 0 };                    // transparência geral do arco: some/aparece na troca de tópico
const U_SPAN_SOFT = { value: ARC_SPAN * 1.2 };   // as linhas suaves aparecem numa faixa bem maior (mais acima e mais abaixo)
const arcGroup = new THREE.Group();     // tudo que gira junto com a roleta
scene.add(arcGroup);

let openT = 0, pulsePts = null, pulseRun = false, pulseT = 0, nudge = 0, eyePulse = 0;   // animações
const pulseU = { value: 0 };
// som bem discreto (só depois do primeiro clique; ligado no CONFIG)
let actx = null, lastTickT = 0;
function tick(f = 880, v = 0.03, d = 0.05) {
  if (!cfg.som) return;
  const now = performance.now();
  if (now - lastTickT < 45) return;
  lastTickT = now;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
  } catch (e) { /* sem áudio */ }
}
let topicIdx = 0, N_ITEMS = 0, NAMES = [], itemA = [], curves = [], LINKS = [], RECENT = [];
let arcMat = null, flowMat = null, beadList = [], flowBase = [], baseLines = null, vertItem = [], softLines = null, softItem = [];
let activeIdx = 0, activeLine = null, linkLines = null, neighSet = new Set();
let rotCur = 0, rotTarget = 0;          // giro da roleta (radianos)
const clampRot = (r) => (N_ITEMS >= SLOTS ? r : Math.min((N_ITEMS - 1) * STEP, Math.max(0, r)));

// trecho de GLSL que calcula a visibilidade (some nas pontas da meia-lua)
const VIS_GLSL = `
  float visOf(float ang) {
    float w = ang + uRot; w -= 6.2831853 * floor((w + 3.14159265) / 6.2831853);
    return 1.0 - smoothstep(uSpan * 0.8, uSpan * 1.05, abs(w));
  }`;

// Arco dourado em faixa (mais grossa que 1 px), apagando nas pontas
const U_SWEEP = { value: 9 };                 // ângulo (mundo) da bolinha dourada que varre o arco; 9 = fora
const U_SWK = { value: 0 };                   // brilho da bolinha varredora
{
  const seg = 200, ext = ARC_SPAN * 1.3, hw = 0.05;
  const pos = new Float32Array((seg + 1) * 2 * 3), side = new Float32Array((seg + 1) * 2), kk = new Float32Array((seg + 1) * 2);
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = -ext + (2 * ext * i) / seg, k = 1 - Math.pow(Math.abs(a) / ext, 3);
    for (let j = 0; j < 2; j++) {
      const r = ARC_R + (j ? hw : -hw);
      pos.set([Math.cos(a) * r, Math.sin(a) * r, 0], (i * 2 + j) * 3);
      side[i * 2 + j] = j ? 1 : -1; kk[i * 2 + j] = k;
    }
    if (i < seg) { const q = i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('aK', new THREE.BufferAttribute(kk, 1));
  g.setIndex(idx);
  const ribbon = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `attribute float aSide, aK; varying float vS, vK; void main(){ vS = aSide; vK = aK; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying float vS, vK; void main(){ float e = 1.0 - vS * vS; float b = vK * (0.28 + 0.5 * e * e);
      gl_FragColor = vec4(vec3(1.0, 0.78, 0.42), b); }`,
  }));
  ribbon.frustumCulled = false;
  scene.add(ribbon);
  // bolinha dourada que percorre o arco
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const sweepMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uS: U_SWEEP, uK: U_SWK, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: `uniform float uS, uK, uPx; varying float vB;
      void main(){ vec4 mv = modelViewMatrix * vec4(cos(uS) * ${ARC_R.toFixed(2)}, sin(uS) * ${ARC_R.toFixed(2)}, 0.1, 1.0);
        gl_Position = projectionMatrix * mv; vB = uK; gl_PointSize = 26.0 * uPx * (18.0 / -mv.z); }`,
    fragmentShader: `varying float vB; void main(){ float d = length(gl_PointCoord - 0.5);
      float core = smoothstep(0.22, 0.0, d), halo = smoothstep(0.5, 0.0, d) * 0.6;
      vec3 col = mix(vec3(1.0, 0.72, 0.28), vec3(1.0, 0.95, 0.8), core);
      gl_FragColor = vec4(col * vB, (core + halo) * vB); }`,
  });
  const sp = new THREE.Points(pg, sweepMat); sp.frustumCulled = false; scene.add(sp);
}

function rnd(seed) { let x = seed; return () => (x = (x * 16807) % 2147483647) / 2147483647; }

// material das linhas: some nas pontas da meia-lua junto com a roleta
function makeLineMat(span) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uRot: U_ROT, uSpan: span, uOpen: U_OPEN, uFade: U_FADE },
    vertexShader: /* glsl */ `
      attribute vec3 aCol; attribute float aAng, aMul; uniform float uRot, uSpan, uOpen, uFade; varying vec3 vC;
      ${VIS_GLSL}
      void main() {
        float v = visOf(aAng);
        vC = aCol * v * v * v * aMul * uFade;        // linhas somem mais rápido que as bolinhas (sem "sombras" nas pontas)
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position * uOpen, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC;
      void main() {
        gl_FragColor = vec4(vC, 1.0);
        #include <colorspace_fragment>
        // linha apagada tem que ficar transparente (e não preta): alpha = brilho
        vec3 c = gl_FragColor.rgb;
        float m = max(c.r, max(c.g, c.b));
        if (m < 0.004) discard;
        gl_FragColor = vec4(c / m, m);
      }`,
  });
}
function makeLines(pos, col, ang, span = U_SPAN) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('aAng', new THREE.BufferAttribute(new Float32Array(ang), 1));
  g.setAttribute('aMul', new THREE.BufferAttribute(new Float32Array(ang.length).fill(1), 1));
  const l = new THREE.LineSegments(g, makeLineMat(span));
  l.frustumCulled = false;
  arcGroup.add(l);
  return l;
}
function disposeLines(l) { if (l) { arcGroup.remove(l); l.geometry.dispose(); l.material.dispose(); } }

// Pontos brilhantes: bolinhas do arco + contas viajando nas linhas (mesmo shader, tipos diferentes)
function makeBeads(count, makeVertex) {
  const g = new THREE.BufferGeometry();
  const attrs = { aA: [], aB: [], aC: [], aPhase: [], aSpeed: [], aSize: [], aBright: [], aAng: [] };
  for (let i = 0; i < count; i++) makeVertex(i, attrs);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(attrs.aA.flat()), 3));
  g.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(attrs.aB.flat()), 3));
  g.setAttribute('aC', new THREE.BufferAttribute(new Float32Array(attrs.aC.flat()), 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(attrs.aPhase), 1));
  g.setAttribute('aSpeed', new THREE.BufferAttribute(new Float32Array(attrs.aSpeed), 1));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(attrs.aSize), 1));
  g.setAttribute('aBright', new THREE.BufferAttribute(new Float32Array(attrs.aBright), 1));
  g.setAttribute('aAng', new THREE.BufferAttribute(new Float32Array(attrs.aAng), 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: renderer.getPixelRatio() }, uRot: U_ROT, uSpan: U_SPAN, uOpen: U_OPEN, uFade: U_FADE, uSweep: U_SWEEP, uSwK: U_SWK },
    vertexShader: /* glsl */ `
      attribute vec3 aA, aB, aC; attribute float aPhase, aSpeed, aSize, aBright, aAng;
      uniform float uTime, uPx, uRot, uSpan, uOpen, uFade, uSweep, uSwK; varying float vB;
      ${VIS_GLSL}
      void main() {
        float t = aSpeed > 0.0 ? fract(aPhase + uTime * aSpeed) : 0.0;   // 0 = bolinha do arco, 1 = no olho
        vec3 p = (1.0 - t) * (1.0 - t) * aA + 2.0 * (1.0 - t) * t * aC + t * t * aB;
        p *= uOpen;
        float fade = aSpeed > 0.0 ? smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.88, 1.0, t)) : 1.0;
        float vis = visOf(aAng);
        float gl = 0.0;
        if (aSpeed <= 0.0) { float w = aAng + uRot; w -= 6.2831853 * floor((w + 3.14159265) / 6.2831853); float q = (w - uSweep) / 0.04; gl = exp(-q * q) * uSwK; }
        vB = aBright * fade * vis * uFade * (1.0 + 2.4 * gl);
        vec4 mv = modelViewMatrix * vec4(p.xy, p.z + 0.06, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPx * (18.0 / -mv.z) * uOpen * (1.0 + 0.9 * gl);
      }`,
    fragmentShader: /* glsl */ `
      varying float vB;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.28, 0.0, d);
        float halo = smoothstep(0.5, 0.0, d) * 0.45;
        vec3 col = mix(vec3(1.0, 0.72, 0.28), vec3(1.0, 0.95, 0.8), core);
        gl_FragColor = vec4(col * vB, (core + halo) * vB);
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  arcGroup.add(pts);
  m.userData.geo = g;
  return m;
}

// Onda de luz do clique: uma conta grande que corre da bolinha até o olho
function makePulse() {
  const g = new THREE.BufferGeometry();
  ['position', 'aA', 'aB', 'aC'].forEach((n) => g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(3), 3)));
  g.setAttribute('aAng', new THREE.BufferAttribute(new Float32Array(1), 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uP: pulseU, uPx: { value: renderer.getPixelRatio() }, uRot: U_ROT, uSpan: U_SPAN, uOpen: U_OPEN },
    vertexShader: /* glsl */ `
      attribute vec3 aA, aB, aC; attribute float aAng;
      uniform float uP, uPx, uRot, uSpan, uOpen; varying float vB;
      ${VIS_GLSL}
      void main() {
        float t = uP;
        vec3 p = (1.0 - t) * (1.0 - t) * aA + 2.0 * (1.0 - t) * t * aC + t * t * aB;
        p *= uOpen;
        float k = sin(3.14159 * t);
        vB = 1.6 * k * visOf(aAng);
        vec4 mv = modelViewMatrix * vec4(p.xy, p.z + 0.08, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (8.0 + 24.0 * k) * uPx * (18.0 / -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      varying float vB;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float core = smoothstep(0.28, 0.0, d);
        float halo = smoothstep(0.5, 0.0, d) * 0.45;
        vec3 col = mix(vec3(1.0, 0.78, 0.38), vec3(1.0, 0.97, 0.88), core);
        gl_FragColor = vec4(col * vB, (core + halo) * vB);
      }`,
  });
  pulsePts = new THREE.Points(g, m);
  pulsePts.frustumCulled = false;
  arcGroup.add(pulsePts);
  pulseRun = false; pulseU.value = 0;
}
function startPulse(idx = activeIdx, quiet = false) {
  if (!pulsePts || pulseRun) return;
  const cv = curves[idx], g = pulsePts.geometry;
  g.attributes.aA.set(cv.a); g.attributes.aB.set(cv.b); g.attributes.aC.set(cv.c);
  g.attributes.aAng.array[0] = cv.ang;
  ['aA', 'aB', 'aC', 'aAng'].forEach((n) => { g.attributes[n].needsUpdate = true; });
  pulseT = 0; pulseRun = true;
  if (!quiet) { nudge = 1; tick(520, 0.04, 0.12); }
}

// Anel branco do item ativo (e um igual, mais fraco, para o item sob o mouse)
const ringGeo = new THREE.RingGeometry(0.2, 0.235, 48);
const activeRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
const hoverRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
hoverRing.visible = false;
scene.add(activeRing, hoverRing);

// vizinhança do item ativo: ele mesmo + os itens ligados a ele
function updateNeigh() { neighSet = new Set([activeIdx, ...LINKS[activeIdx]]); }

let PATHSET = new Set();        // notas do caminho mostrado (destacadas no arco)
let PATHLIST = [];              // as mesmas, na ordem do caminho
let pathMesh = null;
// Linha dourada ligando, em ordem, as notas do caminho que estão na lista aberta (curva puxada para o olho)
function rebuildPathLine() {
  if (pathMesh) { arcGroup.remove(pathMesh); pathMesh.geometry.dispose(); pathMesh.material.dispose(); pathMesh = null; }
  if (PATHLIST.length < 2 || !META.length) return;
  const pos = META.slice(0, N_ITEMS).map((n) => n.caminho);
  const idx = PATHLIST.map((c) => pos.indexOf(c));
  const P = [], SD = [], AN = [], TT = [], IX = [];
  const SEGS = 28, HW = 0.07;
  for (let k = 0; k + 1 < idx.length; k++) {
    const i = idx[k], j = idx[k + 1];
    if (i < 0 || j < 0 || i === j) continue;
    const A = curves[i].a, B = curves[j].a;
    const C = [(A[0] + B[0]) * 0.28, (A[1] + B[1]) * 0.28, 0];            // controle puxado para o olho
    const a0 = itemA[i], da = wrapPI(itemA[j] - itemA[i]);
    const base = P.length / 3;
    let px = 0, py = 0;
    for (let s2 = 0; s2 <= SEGS; s2++) {
      const t = s2 / SEGS, u = 1 - t;
      const x = u * u * A[0] + 2 * u * t * C[0] + t * t * B[0], y = u * u * A[1] + 2 * u * t * C[1] + t * t * B[1];
      const ex = u * (C[0] - A[0]) + t * (B[0] - C[0]), ey = u * (C[1] - A[1]) + t * (B[1] - C[1]);
      const el = Math.hypot(ex, ey) || 1, nx = -ey / el, ny = ex / el;
      for (const sd of [-1, 1]) { P.push(x + nx * HW * sd, y + ny * HW * sd, 0.05); SD.push(sd); AN.push(a0 + da * t); TT.push(t + k); IX.push(k); }
      px = x; py = y;
    }
  }
  if (!P.length) return;
  const index = [];
  let off = 0;
  for (let k = 0; k + 1 < idx.length; k++) {
    const i = idx[k], j = idx[k + 1];
    if (i < 0 || j < 0 || i === j) continue;
    for (let s2 = 0; s2 < SEGS; s2++) { const q = off + s2 * 2; index.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    off += (SEGS + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(SD), 1));
  g.setAttribute('aAng', new THREE.BufferAttribute(new Float32Array(AN), 1));
  g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(TT), 1));
  g.setIndex(index);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uRot: U_ROT, uSpan: U_SPAN, uFade: U_FADE },
    vertexShader: /* glsl */ `
      attribute float aSide, aAng, aT; uniform float uRot, uSpan; varying float vS, vT, vV;
      ${VIS_GLSL}
      void main() { vS = aSide; vT = aT; vV = visOf(aAng); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uFade; varying float vS, vT, vV;
      void main() {
        float e = 1.0 - vS * vS;
        float run = 0.55 + 0.45 * sin(uTime * 3.2 - vT * 9.0);
        float a = vV * uFade * (0.25 + 0.75 * e * e) * run;
        gl_FragColor = vec4(vec3(1.0, 0.80, 0.42) * a * 1.6, a);
      }`,
  });
  pathMesh = new THREE.Mesh(g, m);
  pathMesh.frustumCulled = false; pathMesh.renderOrder = 5;
  arcGroup.add(pathMesh);
}

// tamanho e brilho das bolinhas: ativa grande, ligadas a ela médias, recentes (48 h) um pouco maiores
function refreshBeads() {
  updateNeigh();
  const g = arcMat.userData.geo, sz = g.attributes.aSize.array, br = g.attributes.aBright.array;
  for (let i = 0; i < N_ITEMS; i++) {
    const rec = cfg.recentes && RECENT[i];
    sz[i] = rec ? 9 : 6; br[i] = rec ? 1.0 : 0.8;
    if (cfg.vizinhanca && !neighSet.has(i)) br[i] *= 0.2;
    labelEls[i].classList.toggle('recente', !!rec);
    const noCam = !!(META[i] && PATHSET.has(META[i].caminho));
    labelEls[i].classList.toggle('caminho', noCam);
    if (noCam) { sz[i] = Math.max(sz[i], 12); br[i] = 1.0; }
  }
  LINKS[activeIdx].forEach((j) => { sz[j] = Math.max(sz[j], 10); br[j] = 1.0; });
  sz[activeIdx] = 15; br[activeIdx] = 1.0;
  g.attributes.aSize.needsUpdate = true; g.attributes.aBright.needsUpdate = true;
  rebuildPathLine();
  // modo vizinhança: linhas e contas dos itens que não são vizinhos ficam quase apagadas
  const mul = baseLines.geometry.attributes.aMul;
  for (let v = 0; v < vertItem.length; v++) mul.array[v] = !cfg.vizinhanca || neighSet.has(vertItem[v]) ? 1 : 0.06;
  mul.needsUpdate = true;
  if (softLines) {
    const sm = softLines.geometry.attributes.aMul;
    for (let v = 0; v < softItem.length; v++) sm.array[v] = !cfg.vizinhanca || neighSet.has(softItem[v]) ? 1 : 0.06;
    sm.needsUpdate = true;
  }
  const fb = flowMat.userData.geo.attributes.aBright.array;
  beadList.forEach((bd, n) => { fb[n] = flowBase[n] * (!cfg.vizinhanca || neighSet.has(bd.i) ? 1 : 0.06); });
  flowMat.userData.geo.attributes.aBright.needsUpdate = true;
}

// Linha de destaque do item ativo (mais forte e mais grossa) e ligações dele com outros itens
function rebuildActiveLine() {
  disposeLines(activeLine);
  const cv = curves[activeIdx], SEG = 36, pos = [], col = [], ang = [];
  [-0.016, 0, 0.016].forEach((o) => {
    for (let k = 0; k < SEG; k++) {
      [k, k + 1].forEach((j) => {
        const t = j / SEG, u = 1 - t;
        pos.push(u * u * cv.a[0] + 2 * u * t * cv.c[0] + t * t * cv.b[0] + cv.nx * o,
                 u * u * cv.a[1] + 2 * u * t * cv.c[1] + t * t * cv.b[1] + cv.ny * o,
                 u * u * cv.a[2] + 2 * u * t * cv.c[2] + 0.06);
        const f = 0.95 * (0.8 - 0.4 * t);
        col.push(1.0 * f, 0.82 * f, 0.55 * f); ang.push(cv.ang);
      });
    }
  });
  activeLine = makeLines(pos, col, ang);
}
function rebuildLinks() {
  disposeLines(linkLines);
  const SEG = 28, pos = [], col = [], ang = [], i = activeIdx, A = curves[i].a;
  LINKS[i].forEach((j) => {
    const B = curves[j].a, d = wrapPI(itemA[j] - itemA[i]);
    const rc = ARC_R * (1 - 0.6 * Math.min(1, Math.abs(d) * 3)), m = itemA[i] + d / 2;   // curva "para dentro" do arco
    const cx = Math.cos(m) * rc, cy = Math.sin(m) * rc;
    for (let k = 0; k < SEG; k++) {
      [k, k + 1].forEach((jj) => {
        const t = jj / SEG, u = 1 - t;
        pos.push(u * u * A[0] + 2 * u * t * cx + t * t * B[0], u * u * A[1] + 2 * u * t * cy + t * t * B[1], u * A[2] + t * B[2] + 0.06);
        const f = 0.3 + 0.4 * Math.sin(Math.PI * t);
        col.push(1.0 * f, 0.9 * f, 0.7 * f); ang.push(itemA[i] + d * t);
      });
    }
  });
  linkLines = makeLines(pos, col, ang);
}

// Rótulos em HTML, posicionados pela projeção das bolinhas
// (só os itens pares mostram nome; os outros mostram o nome ao passar o mouse)
const labelsEl = $('skills');
let labelEls = [];
const labelW = [];
function measureLabels() { labelEls.forEach((el, i) => { labelW[i] = el.offsetWidth; }); }
if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureLabels);
const titleEl = $('skills-titulo');
const titleName = $('t-nome');
const _v = new THREE.Vector3();
let ITEM = [];
const mouse = { x: -999, y: -999 };
let dragging = false;
let hoverIdx = -1;
let cardOpen = false;
let pxPerRad = 600;                                   // quantos pixels vale 1 radiano da roleta na tela
// a roleta só gira com o mouse em cima de um NOME (não em cima das linhas)
function inZone(x, y) {
  if (zoomCur > 2.2) return false;                 // com bastante zoom a roleta está apagada: a roda só aproxima
  for (let i = 0; i < N_ITEMS; i++) {
    const it = ITEM[i];
    if (it.hidden || it.vis < 0.3) continue;
    const dx = x - it.x;
    if (Math.abs(y - it.y) < 11 && dx > 2 && dx < 14 + (labelW[i] || 90) + 16) return true;
  }
  return false;
}

// Monta um tópico: bolinhas, linhas, contas, ligações e nomes
function clearTopic() {
  [...arcGroup.children].forEach((c) => { arcGroup.remove(c); c.geometry.dispose(); c.material.dispose(); });
  activeLine = linkLines = softLines = pathMesh = null;
  labelsEl.innerHTML = '';
  hoverIdx = -1;
}
// Linhas até o olho: as principais (com bolinha no arco) + uma 2ª camada de linhas mais suaves
function buildBaseLines() {
  const SEG = 36, pos = [], col = [], ang = [];
  vertItem = [];
  const add = (cv, i, o, strength, P, C, A, V) => {
    for (let k = 0; k < SEG; k++) {
      [k, k + 1].forEach((j) => {
        const t = j / SEG, u = 1 - t;
        const x = u * u * cv.a[0] + 2 * u * t * cv.c[0] + t * t * cv.b[0] + cv.nx * o;
        const y = u * u * cv.a[1] + 2 * u * t * cv.c[1] + t * t * cv.b[1] + cv.ny * o;
        const zz = u * u * cv.a[2] + 2 * u * t * cv.c[2];
        const f = strength * (0.75 - 0.45 * t);
        P.push(x, y, zz + 0.05); C.push(1.0 * f, 0.8 * f, 0.5 * f); A.push(cv.ang); V.push(i);
      });
    }
  };
  curves.forEach((cv, i) => {                              // principais
    (cv.thick ? [-0.016, 0, 0.016] : [0]).forEach((o) => add(cv, i, o, 0.3 * (cv.thick ? 1.15 : 1), pos, col, ang, vertItem));
  });
  baseLines = makeLines(pos, col, ang);
  // 2ª camada: linhas mais fracas que saem de QUALQUER ponto do arco (também acima e abaixo dos nomes)
  const sp = [], sc = [], sa = [];
  softItem = [];
  const Rx = rnd(500 + topicIdx * 13);
  const full = N_ITEMS >= SLOTS, lo = full ? -2 * Math.PI : -(N_ITEMS - 1) * STEP - 0.25, hi = full ? 0 : 0.25;
  const total = cfg.camada2 * N_ITEMS;
  for (let n = 0; n < total; n++) {
    const a = lo + Rx() * (hi - lo);
    const sx = Math.cos(a) * ARC_R, sy = Math.sin(a) * ARC_R;
    const endA = a + (Rx() - 0.5) * 1.8;
    const b = [Math.cos(endA) * EYE_R * 1.015, Math.sin(endA) * EYE_R * 1.015, 0];
    const dx = b[0] - sx, dy = b[1] - sy, len = Math.hypot(dx, dy);
    const bend = (Rx() < 0.5 ? -1 : 1) * (0.08 + Rx() * 0.35) * len;
    const c = [(sx + b[0]) / 2 - (dy / len) * bend, (sy + b[1]) / 2 + (dx / len) * bend, (Rx() - 0.5) * 8];
    const item = Math.min(N_ITEMS - 1, Math.max(0, Math.round(-a / STEP)));
    add({ a: [sx, sy, (Rx() - 0.5) * 0.6], c, b, nx: -dy / len, ny: dx / len, ang: a }, item, 0, 0.11, sp, sc, sa, softItem);
  }
  softLines = total ? makeLines(sp, sc, sa, U_SPAN_SOFT) : null;
}

function buildTopic(ti) {
  clearTopic();
  topicIdx = ti;
  NAMES = TOPICS[ti].itens.slice(0, SLOTS); N_ITEMS = NAMES.length;
  itemA = Array.from({ length: N_ITEMS }, (_, i) => -i * STEP);   // índice cresce para baixo na tela
  const R = rnd(11 + ti * 7);
  curves = [];
  for (let i = 0; i < N_ITEMS; i++) {
    const a = itemA[i];
    const sx = Math.cos(a) * ARC_R, sy = Math.sin(a) * ARC_R;
    const endA = a + (R() - 0.5) * 1.0;                  // chegada espalhada no halo
    const b = [Math.cos(endA) * EYE_R * 1.015, Math.sin(endA) * EYE_R * 1.015, 0];
    const dx = b[0] - sx, dy = b[1] - sy, len = Math.hypot(dx, dy);
    const bend = (R() < 0.5 ? -1 : 1) * (0.10 + R() * 0.30) * len;  // curvatura diferente em cada linha
    const za = (R() - 0.5) * 0.6, zc = (R() - 0.5) * 8;      // cada linha passa numa profundidade diferente
    const c = [(sx + b[0]) / 2 - (dy / len) * bend, (sy + b[1]) / 2 + (dx / len) * bend, zc];
    curves.push({ a: [sx, sy, za], c, b, nx: -dy / len, ny: dx / len, thick: R() < 0.12, ang: a });
  }
  buildBaseLines();
  arcMat = makeBeads(N_ITEMS, (i, a) => {                 // bolinhas fixas do arco
    const c = curves[i].a;
    a.aA.push(c); a.aB.push(c); a.aC.push(c);
    a.aPhase.push(0); a.aSpeed.push(0);
    a.aSize.push(6); a.aBright.push(0.8); a.aAng.push(itemA[i]);
  });
  beadList = [];                                          // contas viajando até o olho (nunca em fila)
  curves.forEach((cv, i) => {
    const n = 1 + Math.floor(R() * 2);
    for (let k = 0; k < n; k++) beadList.push({ i, phase: R(), speed: 0.03 + R() * 0.10, size: 6.5 + R() * 6 });
  });
  flowBase = beadList.map(() => 0.8 + R() * 0.3);
  flowMat = makeBeads(beadList.length, (n, a) => {
    const bd = beadList[n], cv = curves[bd.i];
    a.aA.push(cv.a); a.aB.push(cv.b); a.aC.push(cv.c);
    a.aPhase.push(bd.phase); a.aSpeed.push(bd.speed);
    a.aSize.push(bd.size); a.aBright.push(flowBase[n]); a.aAng.push(cv.ang);
  });
  makePulse();
  // ligações entre itens: cada item é ligado a 2–4 outros (a maioria perto dele na roleta)
  const R2 = rnd(77 + ti);
  META = TOPICS[ti].meta || [];
  LINKS = META.length ? META.slice(0, N_ITEMS).map((n) => n.links.filter((j) => j < N_ITEMS)) : Array.from({ length: N_ITEMS }, (_, i) => {
    const n = Math.min(N_ITEMS - 1, 2 + Math.floor(R2() * 3)), set = new Set();
    while (set.size < n) {
      let j = R2() < 0.75 ? i + (R2() < 0.5 ? -1 : 1) * (1 + Math.floor(R2() * 14)) : Math.floor(R2() * N_ITEMS);
      j = ((j % N_ITEMS) + N_ITEMS) % N_ITEMS;
      if (j !== i) set.add(j);
    }
    return [...set];
  });
  RECENT = META.length ? META.map((n) => n.recente) : NAMES.map((_, i) => (i * 7 + 3) % 11 === 0);   // SIMULADO: no plugin vem da data de criação da nota
  labelEls = NAMES.map((name, i) => {
    const el = document.createElement('div');
    el.className = 'skill';
    el.textContent = shortName(name, cfg.letras); el.title = name;
    el.style.visibility = 'hidden';
    labelsEl.appendChild(el);
    return el;
  });
  ITEM = Array.from({ length: N_ITEMS }, () => ({ x: 0, y: 0, vis: 0, w: 0, hidden: true }));
  activeIdx = Math.min(13, N_ITEMS - 1);
  labelEls[activeIdx].classList.add('ativa');
  rotTarget = activeIdx * STEP;
  rotCur = rotTarget + 16 * STEP;                       // os nomes entram descendo, como uma roleta
  U_ROT.value = rotCur;
  measureLabels();
  refreshBeads(); rebuildActiveLine(); rebuildLinks();
  openT = 0; U_FADE.value = 0;                            // transição: aparece aos poucos enquanto desce
  titleName.textContent = `${TOPICS[ti].nome}`;
  titleName.title = `${N_ITEMS} itens`;
}
buildTopic(0);

function placeRing(ring, idx) {
  const it = ITEM[idx];
  ring.visible = it.vis > 0.3 && U_FADE.value > 0.5;
  ring.position.set(Math.cos(it.w) * ARC_R * U_OPEN.value, Math.sin(it.w) * ARC_R * U_OPEN.value, curves[idx].a[2] + 0.07);
}
function placeLabels() {
  const w = vw, h = vh;
  camera.updateMatrixWorld();
  let best = -1, bestS = 1e9;
  const rb = cardOpen ? root.getBoundingClientRect() : null;
  const cardR = cardOpen ? cardEl.getBoundingClientRect() : null;
  const overCard = cardR && mouse.x + rb.left > cardR.left && mouse.x + rb.left < cardR.right && mouse.y + rb.top > cardR.top && mouse.y + rb.top < cardR.bottom;
  for (let i = 0; i < N_ITEMS; i++) {
    const wa = wrapPI(itemA[i] + rotCur), vis = 1 - sstep(ARC_SPAN * 0.8, ARC_SPAN * 1.05, Math.abs(wa));
    const it = ITEM[i], el = labelEls[i];
    it.w = wa; it.vis = vis;
    if (vis < 0.03) { if (!it.hidden) { el.style.visibility = 'hidden'; it.hidden = true; } continue; }
    if (it.hidden) { el.style.visibility = 'visible'; it.hidden = false; }
    _v.set(Math.cos(wa) * ARC_R * U_OPEN.value, Math.sin(wa) * ARC_R * U_OPEN.value, curves[i].a[2] + 0.06).project(camera);
    const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
    it.x = x; it.y = y;
    const named = i % 2 === 0 || i === activeIdx || i === hoverIdx;
    const dim = cfg.vizinhanca && !neighSet.has(i) ? 0.25 : 1;
    el.style.opacity = named ? vis * dim * U_FADE.value : 0;
    const pill = i === activeIdx || i === hoverIdx;
    el.style.maxWidth = Math.max(60, Math.min(pill ? 320 : 230, w - x - (pill ? 24 : 34))) + 'px';     // nome comprido é cortado com "…" antes da borda da tela
    el.style.transform = `translate(${x + (i === activeIdx || i === hoverIdx ? 22 : 14)}px, ${y}px) translateY(-50%)`;
    if (!dragging && !overCard && vis > 0.5) {
      const dx = mouse.x - x, dy = Math.abs(mouse.y - y);
      const onBead = Math.hypot(dx, dy) < 9;
      const onLabel = (i % 2 === 0 || i === activeIdx) && dy < 6.5 && dx > -4 && dx < 14 + (labelW[i] || 90) + 10;
      if (onBead || onLabel) { const sc = dy + Math.max(0, -dx); if (sc < bestS) { bestS = sc; best = i; } }
    }
  }
  // nomes vizinhos de uma pílula (ativa/sob o mouse) ficam quase apagados para não se sobrepor
  [activeIdx, hoverIdx].forEach((f) => {
    if (f < 0) return;
    for (let i = 0; i < N_ITEMS; i++) {
      if (i === activeIdx || i === hoverIdx || ITEM[i].hidden || i % 2) continue;
      if (Math.abs(ITEM[i].y - ITEM[f].y) < 13) labelEls[i].style.opacity = ITEM[i].vis * 0.12;
    }
  });
  // escala da roleta na tela (para o arrastar acompanhar o mouse)
  _v.set(ARC_R, 0, 0).project(camera); const y0 = (-_v.y * 0.5 + 0.5) * h;
  _v.set(Math.cos(0.1) * ARC_R, Math.sin(0.1) * ARC_R, 0).project(camera);
  pxPerRad = Math.max(50, Math.abs((-_v.y * 0.5 + 0.5) * h - y0) / 0.1);
  if (best !== hoverIdx) {
    if (hoverIdx >= 0 && labelEls[hoverIdx]) labelEls[hoverIdx].classList.remove('hover');
    if (best >= 0) { labelEls[best].classList.add('hover'); tick(1100, 0.02, 0.04); }
    hoverIdx = best;
    canvas.style.cursor = best >= 0 ? 'pointer' : 'grab';
  }
  placeRing(activeRing, activeIdx);
  hoverRing.visible = false;
  if (hoverIdx >= 0 && hoverIdx !== activeIdx) placeRing(hoverRing, hoverIdx);
  _v.set(Math.cos(ARC_SPAN * 1.18) * ARC_R, Math.sin(ARC_SPAN * 1.18) * ARC_R, 0).project(camera);
  titleEl.style.transform = `translate(${(_v.x * 0.5 + 0.5) * w}px, ${(-_v.y * 0.5 + 0.5) * h}px) translate(-20%, -140%)`;
}


// ---------- Meteoro dourado: de vez em quando cruza o fundo, por trás do disco ----------
const meteor = new THREE.Group();
meteor.visible = false;
{
  const L = 9, Wd = 0.2;
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(L, Wd), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uA; varying vec2 vUv; void main(){ float t = vUv.x, v = abs(vUv.y - 0.5) * 2.0;
      float a = min(1.0, pow(t, 2.0) * 1.8) * (1.0 - v * v); vec3 col = mix(vec3(1.0, 0.62, 0.2), vec3(1.0, 0.95, 0.8), pow(t, 5.0));
      gl_FragColor = vec4(col * a * uA, a * uA); }`,
  }));
  tail.position.x = -L / 2;                       // a cabeça fica na origem do grupo, a cauda vai para trás
  meteor.add(tail);
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const head = new THREE.Points(hg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uA: tail.material.uniforms.uA, uPx: { value: renderer.getPixelRatio() } },
    vertexShader: `uniform float uPx; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 22.0 * uPx * (18.0 / -mv.z); }`,
    fragmentShader: `uniform float uA; void main(){ float d = length(gl_PointCoord - 0.5); float core = smoothstep(0.2, 0.0, d), halo = smoothstep(0.5, 0.0, d) * 0.55;
      vec3 col = mix(vec3(1.0, 0.72, 0.3), vec3(1.0, 0.97, 0.88), core); gl_FragColor = vec4(col * uA, (core + halo) * uA); }`,
  }));
  head.frustumCulled = false; meteor.add(head);
  meteor.position.z = -4;                         // bem atrás do disco
  scene.add(meteor);
}
let meteorT = 2, meteorRun = null;                // 3 s para o primeiro (teste); depois sorteia
function meteorTick(dt) {
  if (meteorRun) {
    const m = meteorRun; m.t += dt / m.dur;
    if (m.t >= 1) { meteorRun = null; meteor.visible = false; return; }
    meteor.position.x = m.x0 + (m.x1 - m.x0) * m.t; meteor.position.y = m.y0 + (m.y1 - m.y0) * m.t;
    meteor.children[0].material.uniforms.uA.value = Math.min(1, m.t * 8) * Math.min(1, (1 - m.t) * 6) * 0.95;
    return;
  }
  meteorT -= dt;
  if (meteorT > 0) return;
  meteorT = 14 + Math.random() * 16;              // intervalo de teste: 14–30 s (depois dá para deixar mais raro)
  if (!cfg.meteoro) return;
  const dir = Math.random() < 0.5 ? 1 : -1, y0 = 3 + Math.random() * 4, drop = 5 + Math.random() * 4;
  const x0 = -dir * 17, x1 = dir * 17;
  meteor.rotation.z = Math.atan2(-drop, x1 - x0);
  meteorRun = { t: 0, dur: 1.8 + Math.random() * 0.7, x0, y0, x1, y1: y0 - drop };
  meteor.visible = true;
}

// ---------- Tela ----------
function resize() {
  vw = Math.max(1, root.clientWidth); vh = Math.max(1, root.clientHeight);
  const w = vw, h = vh;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // enquadra o arco inteiro (e os nomes) em qualquer tamanho de janela
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const needH = ARC_R * Math.sin(ARC_SPAN * 1.25) + 2.6;
  const needW = ARC_R + 6;
  baseZ = Math.max(needH / tan, needW / (tan * camera.aspect)) / VIEW_SCALE;
  // centraliza o olho quando há largura de sobra: só desloca o necessário para os nomes (≈300 px à direita do arco) caberem
  const halfW = baseZ * tan * camera.aspect;                 // meia largura visível, em unidades do mundo
  const wpp = (2 * halfW) / w;                               // unidades do mundo por pixel
  viewShiftX = THREE.MathUtils.clamp(ARC_R + 300 * wpp - halfW, 0, VIEW_SHIFT_X);
  camera.position.z = baseZ / zoomCur;
  camera.updateProjectionMatrix();
  placeLabels();
}

// ---------- Interação: zoom, arrastar, reset ----------
let baseZ = 18;
const ZOOM_MIN = 0.7, ZOOM_MAX = 6;
let zoomTarget = 1, zoomCur = 1;
let tiltXTarget = TILT_X, tiltZTarget = TILT_Z, tiltYTarget = TILT_Y;
let tiltXCur = TILT_X, tiltZCur = TILT_Z, tiltYCur = TILT_Y;
let camX = 0, camY = 0;
const PARALLAX = 2.2;        // quanto a câmera acompanha o mouse (dá a sensação de olhar por dentro)
canvas.style.cursor = 'grab';

on(root, 'wheel', (e) => {
  e.preventDefault();
  setMouse(e);
  if (inZone(mouse.x, mouse.y) && !e.ctrlKey) { rotTarget += (e.deltaY * 0.7) / pxPerRad; inertiaOn = false; snapAt = performance.now() + 160; return; }   // em cima dos nomes: gira a roleta
  const k = e.ctrlKey ? 0.012 : 0.0015;           // pinça do trackpad vem com ctrlKey
  zoomTarget = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomTarget * Math.exp(-e.deltaY * k)));
}, { passive: false });

let lastX = 0, lastY = 0, downX = 0, downY = 0, pressed = false, pressIdx = -1, rodando = false;
let peekPrev = -1, peekTimer = 0, lastClickT = 0, lastClickIdx = -1;
let rotVel = 0, inertiaOn = false, snapAt = 0, lastMoveT = 0;   // inércia e encaixe da roleta
canvas.addEventListener('pointerdown', (e) => {
  root.focus({ preventScroll: true });
  setMouse(e); placeLabels();   // acha o item sob o mouse na hora (clique rápido ou toque)
  pressed = true; pressIdx = hoverIdx; rodando = inZone(mouse.x, mouse.y);
  rotVel = 0; inertiaOn = false; snapAt = 0; lastMoveT = performance.now();
  tick(1, 0.0001, 0.01);                                  // libera o áudio no primeiro clique
  if (cfg.clique === 'segurar' && pressIdx >= 0) {   // segurar: o item fica ativo e o resumo aparece enquanto o botão está apertado
    peekTimer = setTimeout(() => {
      if (!pressed || dragging) return;
      peekPrev = pressIdx !== activeIdx ? activeIdx : -2;     // -2 = já era o ativo
      if (pressIdx !== activeIdx) setActive(pressIdx);
      openCard(pressIdx);
    }, 180);
  }
  downX = lastX = e.clientX; downY = lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
on(root, 'pointermove', (e) => {
  setMouse(e);
  if (!pressed) return;
  if (!dragging && Math.hypot(e.clientX - downX, e.clientY - downY) > 4) { dragging = true; canvas.style.cursor = 'grabbing'; }
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  if (!dragging) return;
  if (rodando) {
    const nowM = performance.now(), dtm = Math.max(8, nowM - lastMoveT) / 1000; lastMoveT = nowM;
    const d = -dy / pxPerRad; rotTarget += d; rotVel = Math.max(-3.5, Math.min(3.5, rotVel * 0.5 + (d / dtm) * 0.5));   // guarda a velocidade para a inércia
    return;
  }   // arrastar nos nomes: gira a roleta
  // vertical: de frente (0) até de lado (~65°); horizontal: gira o disco em torno do eixo vertical
  tiltXTarget = Math.min(0, Math.max(-1.15, tiltXTarget - dy * 0.006));
  tiltYTarget = Math.min(1.1, Math.max(-1.1, tiltYTarget + dx * 0.005));
});
on(root, 'pointerup', () => {
  clearTimeout(peekTimer);
  if (pressed && dragging && rodando) { inertiaOn = Math.abs(rotVel) > 0.4; if (!inertiaOn) snapAt = performance.now(); }
  if (pressed) {
    if (peekPrev !== -1) {                                               // soltou: fecha o resumo e volta ao item de antes
      if (peekPrev >= 0) setActive(peekPrev, false);
      closeCard(); peekPrev = -1;
    }
    else if (!dragging) handleClick(pressIdx);                           // clique sem arrastar
  }
  pressed = false; dragging = false; canvas.style.cursor = 'grab';
});
on(root, 'pointerleave', () => { mouse.x = mouse.y = -999; });

// ---------- Skill ativa e cartão de resumo ----------
const SKILL_INFO = [   // resumos de exemplo (trocar pelos reais depois)
  'Escreve o roteiro de vídeos e Reels: gancho nos primeiros segundos, ritmo das cenas e fechamento com chamada para ação.',
  'Pesquisa um tema em várias fontes e entrega um resumo organizado, com os pontos principais e as referências.',
  'Gera e aplica legendas animadas palavra a palavra em vídeos curtos, com vários modelos de estilo.',
  'Corta, monta e ajusta vídeos: cortes, cor, áudio e exportação em lote.',
  'Analisa e otimiza campanhas de Meta Ads e Google Ads: estrutura, verba, criativos e relatório.',
  'Cria ideias e peças para anúncios e posts, mantendo a identidade visual da marca.',
  'Monta relatórios de resultados com números claros, comparações e próximos passos.',
  'Escreve textos de venda, legendas e chamadas que prendem a atenção e levam à ação.',
  'Define paleta, fontes e regras visuais para manter a marca consistente em tudo.',
  'Cria e trata áudio: trilhas, jingles, efeitos sonoros e limpeza de voz.',
  'Gera locuções e clona vozes para vídeos, anúncios e vinhetas.',
  'Cria capas e miniaturas chamativas para vídeos e posts.',
  'Planeja e produz vídeos curtos verticais, do roteiro à publicação.',
  'Escreve prompts para gerar e editar imagens com IA, mantendo rosto, pose e estilo consistentes.',
  'Escreve prompts para gerar vídeos com IA, com cena, câmera e movimento bem descritos.',
  'Organiza o calendário de conteúdo da semana e do mês, com datas e responsáveis.',
  'Transforma a conversa com o cliente em um briefing claro: objetivo, público e entregas.',
  'Calcula e apresenta orçamentos de forma simples, com itens, prazos e valores.',
  'Faz uma auditoria da conta de anúncios e aponta o que corrigir primeiro.',
  'Configura e confere o rastreio de conversas e vendas para medir o resultado de verdade.',
  'Prepara e agenda publicações nas redes, com texto, arte e horário.',
  'Escreve roteiros curtos para anúncios em vídeo, focados em conversão.',
  'Revisa textos, artes e vídeos antes de enviar: erros, tom de voz e consistência.',
  'Organiza notas, arquivos e pastas para tudo ficar fácil de achar.',
  'Resume conversas, documentos e vídeos longos nos pontos que importam.',
  'Gera ideias de conteúdo, campanhas e projetos a partir de um tema.',
];
const cardEl = document.createElement('div');
cardEl.id = 'skill-card';
cardEl.innerHTML = '<button class="x" aria-label="Fechar">×</button><div class="k"></div><h3></h3><p></p><button class="abrir">ABRIR NOTA</button><button class="camBtn">CAMINHO ATÉ…</button><button class="renBtn">RENOMEAR NOTA</button><div class="renErro"></div>';
root.appendChild(cardEl);
function openCard(idx) {
  cardEl.querySelector('.k').textContent = `${TOPICS[topicIdx].nome} ${String(idx + 1).padStart(3, '0')} / ${N_ITEMS}`;
  cardEl.querySelector('h3').textContent = NAMES[idx];
  const pEl = cardEl.querySelector('p'), abrirBtn = cardEl.querySelector('.abrir');
  const meta = META[idx];
  abrirBtn.style.display = COFRE && meta && meta.caminho ? '' : 'none';
  cardEl.querySelector('.camBtn').style.display = abrirBtn.style.display;
  cardEl.querySelector('.renBtn').style.display = abrirBtn.style.display;
  cardEl.querySelector('.renErro').textContent = '';
  cancelarRenomear();
  if (COFRE && meta && meta.caminho) {
    pEl.textContent = '…';
    const cam = meta.caminho;
    COFRE.resumo(cam).then((t) => { if (cardOpen && NAMES[idx] === meta.nome) pEl.textContent = t || 'Nota sem texto.'; });
  } else pEl.textContent = (topicIdx === 0 && SKILL_INFO[idx]) || 'Resumo de exemplo. No plugin aqui aparece um resumo curto do conteúdo da nota.';
  cardEl.classList.add('open'); cardOpen = true;
}
// ---------- Caminho entre duas notas ----------
const camEl = document.createElement('div');
camEl.id = 'caminho';
camEl.innerHTML = '<button class="x" aria-label="Fechar">×</button><div class="ch">CAMINHO ENTRE NOTAS</div><div class="de"></div><input type="text" placeholder="Para qual nota? Digite o nome…"><div class="res"></div><div class="cadeia"></div>';
root.appendChild(camEl);
const camIn = camEl.querySelector('input'), camRes = camEl.querySelector('.res'), camCad = camEl.querySelector('.cadeia');
function fecharCaminho() { camEl.classList.remove('open'); PATHLIST = []; PATHSET = new Set(); camCad.innerHTML = ''; camRes.innerHTML = ''; camIn.value = ''; if (labelEls.length) refreshBeads(); }
function abrirCaminho() {
  const m = META[activeIdx]; if (!COFRE || !m || !m.caminho) return;
  camEl.querySelector('.de').textContent = 'DE: ' + m.nome;
  camEl.classList.add('open'); closeCard(); camIn.focus();
}
function mostrarCaminho(de, para) {
  const r = COFRE.caminho(de, para.caminho);
  camRes.innerHTML = ''; camCad.innerHTML = '';
  if (!r) { camCad.textContent = 'Sem ligação entre essas duas notas (nem por outras notas).'; PATHLIST = []; PATHSET = new Set(); refreshBeads(); return; }
  const t = document.createElement('div'); t.className = 'n'; t.textContent = r.length === 1 ? 'É a mesma nota' : `${r.length - 1} ${r.length === 2 ? 'passo' : 'passos'}`; camCad.appendChild(t);
  r.forEach((n, i) => {
    if (i) { const s = document.createElement('span'); s.className = 'seta'; s.textContent = '→'; camCad.appendChild(s); }
    const b = document.createElement('button'); b.className = 'chip'; b.textContent = shortName(n.nome, 22); b.title = n.nome;
    b.addEventListener('click', () => COFRE.abrir(n.caminho)); camCad.appendChild(b);
  });
  PATHLIST = r.map((n) => n.caminho); PATHSET = new Set(PATHLIST); refreshBeads();
}
camIn.addEventListener('input', () => {
  camRes.innerHTML = ''; camCad.innerHTML = '';
  COFRE.buscar(camIn.value).forEach((n) => {
    const b = document.createElement('button'); b.className = 'op'; b.textContent = n.nome;
    b.addEventListener('click', () => { camIn.value = n.nome; mostrarCaminho(META[activeIdx].caminho, n); });
    camRes.appendChild(b);
  });
});
camEl.querySelector('.x').addEventListener('click', fecharCaminho);
cardEl.querySelector('.camBtn').addEventListener('click', abrirCaminho);
on(root, 'keydown', (e) => { if (e.key === 'Escape' && camEl.classList.contains('open')) fecharCaminho(); });
// Renomear a nota direto do cartão (o Obsidian atualiza os links que apontam para ela)
let renIn = null;
function cancelarRenomear() { if (renIn) { renIn.remove(); renIn = null; cardEl.querySelector('h3').style.display = ''; } }
cardEl.querySelector('.renBtn').addEventListener('click', () => {
  const m = META[activeIdx]; if (!COFRE || !m || !m.caminho || renIn) return;
  const h3 = cardEl.querySelector('h3'), erro = cardEl.querySelector('.renErro');
  renIn = document.createElement('input'); renIn.type = 'text'; renIn.className = 'renIn';
  renIn.value = m.caminho.replace(/^.*\//, '').replace(/\.md$/i, '');
  h3.style.display = 'none'; h3.after(renIn); renIn.focus(); renIn.select();
  renIn.addEventListener('keydown', async (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); cancelarRenomear(); erro.textContent = ''; }
    if (e.key === 'Enter') {
      const r = await COFRE.renomear(m.caminho, renIn.value);
      if (!r.ok) { erro.textContent = r.erro; return; }
      cancelarRenomear(); erro.textContent = 'Renomeada.';
      if (r.caminho) { m.caminho = r.caminho; h3.textContent = r.caminho.replace(/^.*\//, '').replace(/\.md$/i, ''); }
      setTimeout(() => dispose.recarregar && dispose.recarregar(true), 700);
    }
  });
  erro.textContent = 'Enter salva · Esc cancela';
});
function closeCard() { cardEl.classList.remove('open'); cardOpen = false; }
cardEl.querySelector('.x').addEventListener('click', closeCard);
cardEl.querySelector('.abrir').addEventListener('click', () => { const m = META[activeIdx]; if (COFRE && m && m.caminho) COFRE.abrir(m.caminho); });
on(root, 'keydown', (e) => { if (e.key === 'Escape') closeCard(); });

function setActive(idx, fx = true) {
  const old = activeIdx; activeIdx = idx;
  labelEls[old].classList.remove('ativa'); labelEls[idx].classList.add('ativa');
  refreshBeads(); rebuildActiveLine(); rebuildLinks();
  measureLabels();
  if (fx) startPulse();
}
function clickAt(idx) {
  if (idx < 0) { closeCard(); return; }                         // clicou no vazio: fecha o cartão
  if (idx === activeIdx) { cardOpen ? closeCard() : openCard(idx); }   // clicou na ativa: abre o resumo
  else { setActive(idx); closeCard(); }                          // clicou em outra: ela vira a ativa
}

// clique conforme o modo escolhido na configuração
function handleClick(idx) {
  if (cfg.clique === 'duplo') {
    if (idx < 0) { closeCard(); lastClickIdx = -1; return; }
    const now = performance.now();
    if (idx === lastClickIdx && now - lastClickT < 400) { clickAt(idx); lastClickIdx = -1; }
    else { lastClickIdx = idx; lastClickT = now; }
  } else if (cfg.clique === 'segurar') {
    if (idx < 0) closeCard();                                              // clique rápido não faz nada; é preciso segurar
  } else clickAt(idx);
}

// ---------- Painel de configuração ----------
const cfgBtn = $('cfgbtn');
const cfgEl = document.createElement('div');
cfgEl.id = 'cfg';
cfgEl.innerHTML = `
  <h4>CONFIGURAÇÃO</h4>
  <div class="g">COMO SELECIONAR UM ITEM</div>
  <div class="seg" id="cfg-clique">
    <button data-v="clicar">Clicar</button><button data-v="segurar">Segurar</button><button data-v="duplo">Duplo clique</button>
  </div>
  <div class="d" id="cfg-clique-d"></div>
  <div class="g">BRILHO <span id="cfg-brv"></span></div>
  <input type="range" id="cfg-brilho" min="0.5" max="1.6" step="0.05">
  <div class="g">LINHAS SUAVES (2ª CAMADA) <span id="cfg-c2v"></span></div>
  <input type="range" id="cfg-c2" min="0" max="4" step="1">
  <div class="g">QUALIDADE</div>
  <select id="cfg-q"><option value="auto">Automática</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select>
  <div class="g">PAUSAR SE FICAR SEM MEXER</div>
  <select id="cfg-pausa"><option value="5">Após 5 minutos</option><option value="10">Após 10 minutos</option><option value="30">Após 30 minutos</option><option value="0">Nunca (permanente)</option></select>
  <div class="d">Sempre pausa quando a vista fica escondida ou a janela minimizada.</div>
  <div class="g">NOTA "PARADA" APÓS</div>
  <select id="cfg-paradas"><option value="15">15 dias sem mexer</option><option value="30">30 dias sem mexer</option><option value="60">60 dias sem mexer</option><option value="90">90 dias sem mexer</option></select>
  <label class="chk"><input type="checkbox" id="cfg-pulsos"> Pulso de luz aleatório (a cada ~10 s)</label>
  <label class="chk"><input type="checkbox" id="cfg-meteoro"> Meteoro dourado passando de vez em quando</label>
  <label class="chk"><input type="checkbox" id="cfg-terminal"> Painel de terminal decorativo (canto esquerdo)</label>
  <label class="chk"><input type="checkbox" id="cfg-som"> Som discreto ao passar e clicar</label>
  <div class="g">LETRAS POR NOME <span id="cfg-lv"></span></div>
  <input type="range" id="cfg-letras" min="10" max="40" step="1">
  <label class="chk"><input type="checkbox" id="cfg-rec"> Destacar notas recentes (48 h)</label>
  <label class="chk"><input type="checkbox" id="cfg-viz"> Modo vizinhança (só o item e os ligados)</label>
  <button id="cfg-edit" class="big">Editar tópicos e nomes…</button>
  <div class="g">DICAS</div>
  <div class="soon">Modo foco: tecla F. Caminho entre notas: botão no cartão da nota ou comando na paleta (Cmd+P). As listas CLIENTES, REGRAS e SKILLS vêm do nome, da pasta ou da tag (#cliente, #regra, #skill) das notas.</div>`;
root.appendChild(cfgEl);
const DESC = { clicar: 'Um clique seleciona o item. Clicar no item ativo abre o resumo.', segurar: 'Segure o botão em cima de um item: ele fica selecionado e o resumo aparece. Ao soltar, volta ao que estava.', duplo: 'Dois cliques seguidos selecionam. Um clique só passa o mouse.' };
function syncCfg() {
  cfgEl.querySelectorAll('#cfg-clique button').forEach((b) => b.classList.toggle('on', b.dataset.v === cfg.clique));
  $('cfg-clique-d').textContent = DESC[cfg.clique];
  $('cfg-brilho').value = cfg.brilho;
  $('cfg-brv').textContent = Math.round(cfg.brilho * 100) + '%';
  $('cfg-c2').value = cfg.camada2;
  $('cfg-c2v').textContent = cfg.camada2 ? `${cfg.camada2} por item` : 'desligadas';
  $('cfg-q').value = cfg.qualidade;
  $('cfg-pausa').value = String(cfg.pausaMin);
  $('cfg-paradas').value = String(cfg.paradasDias);
  $('cfg-som').checked = cfg.som;
  $('cfg-terminal').checked = cfg.terminal !== false;
  $('cfg-pulsos').checked = cfg.pulsos;
  $('cfg-meteoro').checked = cfg.meteoro;
  $('cfg-letras').value = cfg.letras;
  $('cfg-lv').textContent = cfg.letras;
  $('cfg-rec').checked = cfg.recentes;
  $('cfg-viz').checked = cfg.vizinhanca;
  canvas.style.filter = `brightness(${cfg.brilho})`;
}
cfgEl.querySelectorAll('#cfg-clique button').forEach((b) => b.addEventListener('click', () => { cfg.clique = b.dataset.v; saveCfg(); syncCfg(); }));
$('cfg-brilho').addEventListener('input', (e) => { cfg.brilho = +e.target.value; saveCfg(); syncCfg(); });
$('cfg-c2').addEventListener('input', (e) => {
  cfg.camada2 = +e.target.value; saveCfg(); syncCfg();
  disposeLines(baseLines); disposeLines(softLines); buildBaseLines(); refreshBeads();
});
$('cfg-q').addEventListener('change', (e) => { cfg.qualidade = e.target.value; saveCfg(); setQuality(); });
$('cfg-pausa').addEventListener('change', (e) => { cfg.pausaMin = +e.target.value; saveCfg(); lastActivity = performance.now(); });
$('cfg-paradas').addEventListener('change', (e) => { cfg.paradasDias = +e.target.value; saveCfg(); setTimeout(() => dispose.recarregar && dispose.recarregar(true), 100); });
$('cfg-pulsos').addEventListener('change', (e) => { cfg.pulsos = e.target.checked; saveCfg(); });
$('cfg-terminal').addEventListener('change', (e) => { cfg.terminal = e.target.checked; saveCfg(); });
$('cfg-meteoro').addEventListener('change', (e) => { cfg.meteoro = e.target.checked; saveCfg(); });
$('cfg-som').addEventListener('change', (e) => { cfg.som = e.target.checked; saveCfg(); tick(660, 0.04, 0.1); });
$('cfg-letras').addEventListener('input', (e) => {
  cfg.letras = +e.target.value; saveCfg(); syncCfg();
  labelEls.forEach((el, i) => { el.textContent = shortName(NAMES[i], cfg.letras); });
  measureLabels();
});
$('cfg-rec').addEventListener('change', (e) => { cfg.recentes = e.target.checked; saveCfg(); refreshBeads(); });
$('cfg-viz').addEventListener('change', (e) => { cfg.vizinhanca = e.target.checked; saveCfg(); refreshBeads(); });
cfgBtn.addEventListener('click', () => cfgEl.classList.toggle('open'));
on(root, 'keydown', (e) => { if (e.key === 'Escape') cfgEl.classList.remove('open'); });
syncCfg();

// ---------- Editor de tópicos e nomes ----------
const edEl = document.createElement('div');
edEl.id = 'ed';
edEl.innerHTML = `
  <div class="top"><h4>TÓPICOS E NOMES</h4><button id="ed-x" aria-label="Fechar">×</button></div>
  <div class="d">Um bloco por tópico. Escreva um nome por linha (até 150 por tópico). No plugin, os nomes virão do seu cofre (pasta, tag ou prefixo); aqui você ajusta à mão ou acrescenta.</div>
  <div id="ed-list"></div>
  <div class="row"><button id="ed-add">+ Novo tópico</button><button id="ed-reset">Restaurar padrão</button><button id="ed-save" class="pri">Salvar e aplicar</button></div>`;
root.appendChild(edEl);
const edList = $('ed-list');
function edBlock(t) {
  const d = document.createElement('div'); d.className = 'tp';
  const n = document.createElement('input'); n.className = 'tn'; n.value = t.nome; n.placeholder = 'Nome do tópico';
  const x = document.createElement('button'); x.className = 'del'; x.textContent = 'Excluir';
  const a = document.createElement('textarea'); a.className = 'ti'; a.rows = 6; a.value = t.itens.join('\n'); a.placeholder = 'Um nome por linha';
  x.addEventListener('click', () => { if (edList.children.length > 1) d.remove(); });
  d.append(n, x, a); edList.appendChild(d);
}
function openEd() { edList.innerHTML = ''; TOPICS.forEach(edBlock); edEl.classList.add('open'); cfgEl.classList.remove('open'); }
$('cfg-edit').addEventListener('click', openEd);
if (COFRE) { $('cfg-edit').style.display = 'none'; }
$('ed-x').addEventListener('click', () => edEl.classList.remove('open'));
on(root, 'keydown', (e) => { if (e.key === 'Escape') edEl.classList.remove('open'); });
$('ed-add').addEventListener('click', () => { if (edList.children.length < 8) edBlock({ nome: 'NOVO TÓPICO', itens: [] }); });
$('ed-reset').addEventListener('click', () => { edList.innerHTML = ''; TOPICS_PADRAO.forEach(edBlock); });
$('ed-save').addEventListener('click', () => {
  const novos = [...edList.children].map((d) => ({
    nome: (d.querySelector('.tn').value.trim() || 'TÓPICO').toUpperCase(),
    itens: d.querySelector('.ti').value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, SLOTS),
  })).filter((t) => t.itens.length);
  if (!novos.length) return;
  TOPICS = novos;
  if (!COFRE) topicosMemoria = novos;
  edEl.classList.remove('open'); closeCard(); leaving = null; buildTopic(0);
});

// ---------- Troca de tópico (setinhas ao lado do título) ----------
let leaving = null;                                        // troca de tópico: a lista velha desce e some, a nova entra descendo
function goTopic(d) {
  if (leaving) return;
  tick(440, 0.035, 0.2); closeCard();
  leaving = { to: (topicIdx + d + TOPICS.length) % TOPICS.length, t: 0 };
  rotTarget -= 10 * STEP; inertiaOn = false; snapAt = 0;
}
$('t-prev').addEventListener('click', () => goTopic(-1));
$('t-next').addEventListener('click', () => goTopic(1));

function resetView() {
  zoomTarget = 1; tiltXTarget = TILT_X; tiltZTarget = TILT_Z; tiltYTarget = TILT_Y;
}
$('reset').addEventListener('click', resetView);
on(root, 'dblclick', (e) => { if (e.target === canvas && hoverIdx < 0 && !inZone(mouse.x, mouse.y)) resetView(); });
{ const ro = new ResizeObserver(() => resize()); ro.observe(root); cleanups.push(() => ro.disconnect()); }
resize();

const fpsEl = $('fps');
let frames = 0, last = performance.now();
const clock = new THREE.Clock();

// ---------- Modo foco: esconde botões, título e nomes; fica só o olho, o disco e o arco ----------
const focoBtn = $('focobtn'), focoDica = $('foco-dica');
function setFoco(on) {
  root.classList.toggle('foco', on);
  cfgEl.classList.remove('open'); edEl.classList.remove('open'); closeCard();
  if (on) { focoDica.classList.add('on'); setTimeout(() => focoDica.classList.remove('on'), 2600); }
}
focoBtn.addEventListener('click', () => setFoco(!root.classList.contains('foco')));
on(root, 'keydown', (e) => {
  if (/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
  if (e.key === 'f' || e.key === 'F') setFoco(!root.classList.contains('foco'));
  if (e.key === '+' || e.key === '=') zoomTarget = Math.min(ZOOM_MAX, zoomTarget * 1.3);
  if (e.key === '-' || e.key === '_') zoomTarget = Math.max(ZOOM_MIN, zoomTarget / 1.3);
  if (e.key === 'Escape') setFoco(false);
});

// ---------- Qualidade (automática ou fixa) ----------
const LEVELS = [
  { pr: Math.min(devicePixelRatio, 2), frac: 1, nome: 'A' },
  { pr: Math.min(devicePixelRatio, 1.5), frac: 0.75, nome: 'M' },
  { pr: Math.min(devicePixelRatio, 1.25), frac: 0.5, nome: 'B' },
];
let qLevel = 0, qChangedAt = 0, noUpUntil = 0, fpsBad = 0, fpsGood = 0;
function applyQuality(l) {
  qLevel = l;
  const pr = LEVELS[l].pr;
  renderer.setPixelRatio(pr);
  [diskMat, arcMat, flowMat, pulsePts && pulsePts.material].forEach((m) => { if (m) m.uniforms.uPx.value = pr; });
  const frac = LEVELS[l].frac;
  diskGeo.setDrawRange(0, Math.floor(N * frac));
  // com menos partículas o dourado ficava opaco: compensa brilho e tamanho para o visual quase não mudar
  diskMat.uniforms.uDensity.value = DENSITY * Math.pow(frac, -0.7);
  diskMat.uniforms.uSizeK.value = Math.pow(frac, -0.25);
  resize();
}
function setQuality() {
  const fixed = { alta: 0, media: 1, baixa: 2 }[cfg.qualidade];
  fpsBad = fpsGood = 0; noUpUntil = 0;
  applyQuality(fixed === undefined ? 0 : fixed);
}
setQuality();

// ---------- Pausa quando inativo ou escondido ----------
let paused = false, lastActivity = performance.now();
function pause() { if (paused) return; paused = true; renderer.setAnimationLoop(null); }
function resume() {
  lastActivity = performance.now();
  if (!paused) return;
  paused = false; frames = 0; last = performance.now(); lastT = clock.getElapsedTime();
  renderer.setAnimationLoop(frame);
}
['pointerenter', 'pointermove', 'pointerdown', 'wheel', 'keydown'].forEach((ev) => on(root, ev, () => { lastActivity = performance.now(); if (paused) resume(); }, { passive: true }));
on(document, 'visibilitychange', () => (document.hidden ? pause() : resume()));
// vista escondida em outra aba do Obsidian: pausa; voltou a aparecer: retoma
{ const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) resume(); else pause(); }); io.observe(root); cleanups.push(() => io.disconnect()); }


// ---------- Terminal decorativo (só visual, sem interação) ----------
let TERM_LINES = [
  '«$» universe --boot',
  '<«canvas» id="cena" />',
  '«const» eye = {r: 1.2, glow: «true»};',
  'load particles ... «520000» ok',
  '«fetch» /vault/index.json',
  '<«div» class="arc">',
  '  link(«nota_a», «nota_b»);',
  'bead.speed = «0.42»;',
  '«await» scan(vault);',
  '</«div»>',
  'gravity.lens(«eye»);',
  '«[ok]» disk ready',
  '«import» { orbit } from "./core";',
  'for (n of notes) «emit»(n);',
  '<«span» class="gold">olho</«span»>',
  'sync «done» · 0 erros',
  '«$» tail -f universe.log',
  'pulse(«random», 10s);',
  'render(«scene», camera);',
  '«[ok]» links updated',
];
function gerarTerm() {
  if (!COFRE) return;
  const curto = (t, n = 18) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
  const ls = [], R = rnd(5);
  TOPICS.forEach((t) => {
    ls.push(`«$» scan «${curto(t.nome, 14)}»`);
    (t.meta || []).slice(0, 8).forEach((n) => {
      ls.push(`open(«${curto(n.nome)}»);`);
      (n.links || []).slice(0, 1).forEach((j) => { const o = t.meta[j]; if (o) ls.push(`  link(«${curto(n.nome, 12)}», «${curto(o.nome, 12)}»);`); });
      if (n.recente) ls.push(`«[new]» ${curto(n.nome, 24)}`);
    });
  });
  if (ls.length > 4) TERM_LINES = ls.sort(() => R() - 0.5).slice(0, 60);
}
gerarTerm();
{
  const tb = root.querySelector('#term .tb');
  const MAXL = 16;
  let li = Math.floor(Math.random() * TERM_LINES.length), ci = 0, shown = [], pauseTicks = 0;
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paint = (cur) => {
    const all = cur === null ? shown : shown.concat(cur);
    tb.innerHTML = all.map((l, i) => {
      let h = esc(l); const open = (h.match(/«/g) || []).length - (h.match(/»/g) || []).length;
      h = h.replace(/«/g, '<b>').replace(/»/g, '</b>') + (open > 0 ? '</b>' : '');
      return h + (i === all.length - 1 ? '<i></i>' : '');
    }).join('\n');
  };
  const tickTerm = () => {
    if (paused || document.hidden) return;
    const show = cfg.terminal !== false && root.clientWidth >= 900 && !root.classList.contains('foco');
    root.querySelector('#term').style.display = show ? '' : 'none';
    root.querySelector('#marca').style.display = show ? '' : 'none';
    if (!show) return;
    if (pauseTicks > 0) { pauseTicks--; paint(shown.length ? null : ''); return; }
    const line = TERM_LINES[li];
    ci += 1 + (Math.random() < 0.3 ? 1 : 0);
    if (ci >= line.length) {
      shown.push(line); if (shown.length > MAXL) shown.shift();
      li = (li + 1) % TERM_LINES.length; ci = 0; pauseTicks = 2 + Math.floor(Math.random() * 6);
      paint(null);
    } else paint(line.slice(0, ci));
  };
  const termTimer = setInterval(tickTerm, 70);
  cleanups.push(() => clearInterval(termTimer));
}


// ---------- Zoom pelos anéis ----------
// Aproximando: os nomes do arco apagam; entram dois anéis com as notas mais ligadas do cofre
// e, bem perto, os números do cofre dentro do olho.
const aneisEl = document.createElement('div');
aneisEl.id = 'aneis';
aneisEl.innerHTML = '<div class="r r1"></div><div class="r r2"></div><div class="centro"><div class="n"></div><div class="l"></div></div><div class="dica">‹ Afaste o zoom para voltar às listas</div>';
root.appendChild(aneisEl);
const ANEL = { hubs: [], chips: [], ring1: aneisEl.querySelector('.r1'), ring2: aneisEl.querySelector('.r2'), centro: aneisEl.querySelector('.centro') };
{
  const dados = COFRE && COFRE.resumo_cofre ? COFRE.resumo_cofre() : { hubs: TOPICS[0].itens.slice(0, 12).map((n, i) => ({ nome: n, caminho: null, grau: 12 - i })), notas: 120, links: 340, orfas: 9, pastas: 6 };
  ANEL.hubs = dados.hubs;
  ANEL.centro.querySelector('.n').textContent = `${dados.notas} NOTAS`;
  ANEL.centro.querySelector('.l').textContent = `${dados.links} LINKS · ${dados.orfas} ÓRFÃS · ${dados.pastas} PASTAS`;
  ANEL.hubs.forEach((h, i) => {
    const c = document.createElement('button');
    c.className = 'hub'; c.textContent = shortName(h.nome, 20); c.title = `${h.nome} · ${h.grau} ligações`;
    c.addEventListener('click', () => { if (COFRE && h.caminho) COFRE.abrir(h.caminho); });
    aneisEl.appendChild(c); ANEL.chips.push(c);
  });
}
const _pp = new THREE.Vector3();
function telaDe(x, y) { _pp.set(x, y, 0).project(camera); return [(_pp.x * 0.5 + 0.5) * vw, (-_pp.y * 0.5 + 0.5) * vh]; }
function placeAneis(tNow) {
  const t = sstep(1.7, 2.6, zoomCur), tc = sstep(3.4, 4.4, zoomCur);
  labelsEl.style.opacity = String(1 - t);
  aneisEl.style.opacity = String(t);
  aneisEl.style.pointerEvents = t > 0.5 ? 'auto' : 'none';
  aneisEl.style.visibility = t > 0.01 ? 'visible' : 'hidden';
  if (t <= 0.01) return;
  const [cx, cy] = telaDe(0, 0);
  const r1 = Math.abs(telaDe(EYE_R * 2.6, 0)[0] - cx), r2 = Math.abs(telaDe(EYE_R * 4.4, 0)[0] - cx);
  for (const [el, r] of [[ANEL.ring1, r1], [ANEL.ring2, r2]]) { el.style.width = el.style.height = (r * 2) + 'px'; el.style.left = (cx - r) + 'px'; el.style.top = (cy - r) + 'px'; }
  const n = ANEL.chips.length, n1 = Math.ceil(n / 2);
  ANEL.chips.forEach((c, i) => {
    const anel1 = i < n1, k = anel1 ? i : i - n1, cnt = anel1 ? n1 : n - n1, r = anel1 ? r1 : r2;
    const a = (k / cnt) * Math.PI * 2 + tNow * (anel1 ? 0.03 : -0.02) + (anel1 ? 0 : 0.5);
    c.style.left = (cx + Math.cos(a) * r) + 'px'; c.style.top = (cy + Math.sin(a) * r * 0.82) + 'px';
  });
  ANEL.centro.style.left = cx + 'px'; ANEL.centro.style.top = cy + 'px'; ANEL.centro.style.opacity = String(tc);
}

let lastT = 0, eyeProx = 0, lastCi = null, ambientT = 6;
function frame() {
  const tNow = clock.getElapsedTime();
  const dt = Math.min(0.05, Math.max(0.001, tNow - lastT)); lastT = tNow;
  if (cfg.pausaMin > 0 && performance.now() - lastActivity > cfg.pausaMin * 60000) { pause(); return; }
  diskMat.uniforms.uTime.value = tNow;
  arcMat.uniforms.uTime.value = tNow;
  { const ph = (tNow % 10) / 3.2;      // a cada 10 s, uma passada de ~3 s (de cima para baixo)
    if (ph < 1 && openT >= 1 && !leaving) { const e = ph * ph * (3 - 2 * ph) * 0.35 + ph * 0.65; U_SWEEP.value = ARC_SPAN * 1.2 - e * ARC_SPAN * 2.4; U_SWK.value = Math.sin(Math.PI * Math.min(1, Math.max(0, ph))) ** 0.5; }
    else { U_SWEEP.value = 9; U_SWK.value = 0; } }
  flowMat.uniforms.uTime.value = tNow;
  if (pathMesh) pathMesh.material.uniforms.uTime.value = tNow;

  // transição de tópico: tudo sai do olho e abre
  if (leaving) {
    leaving.t += dt / 0.3; U_FADE.value = 1 - leaving.t * leaving.t * (3 - 2 * Math.min(1, leaving.t));
    if (leaving.t >= 1) { const to = leaving.to; leaving = null; buildTopic(to); }
  } else if (openT < 1) { openT = Math.min(1, openT + dt / 0.6); U_FADE.value = 1 - Math.pow(1 - openT, 3); }
  meteorTick(dt);
  // pulsos aleatórios: de tempos em tempos uma luz sai de uma linha qualquer e faz o olho pulsar
  ambientT -= dt;
  if (ambientT <= 0) {
    ambientT = 7 + Math.random() * 6;
    if (cfg.pulsos && !leaving && !pulseRun && openT >= 1) {
      const vis = []; for (let i = 0; i < N_ITEMS; i++) if (ITEM[i].vis > 0.6) vis.push(i);
      if (vis.length) startPulse(vis[Math.floor(Math.random() * vis.length)], true);
    }
  }
  // fumaça do disco e névoa: movimento bem leve
  smoke.rotation.z = tNow * 0.05; smoke2.rotation.z = 1.7 - tNow * 0.035;
  smoke.position.set(0.5 * Math.sin(tNow * 0.13), 0.4 * Math.cos(tNow * 0.11), -0.03); smoke2.position.set(-0.45 * Math.cos(tNow * 0.1), 0.4 * Math.sin(tNow * 0.14), -0.035);
  smoke.material.uniforms.uT.value = tNow; smoke2.material.uniforms.uT.value = tNow;
  smoke.material.uniforms.uO.value = 0.7 + 0.1 * Math.sin(tNow * 0.31); smoke2.material.uniforms.uO.value = 0.42 + 0.09 * Math.sin(tNow * 0.23 + 1.3);
  mist.scale.setScalar(1 + 0.025 * Math.sin(tNow * 0.17));
  // inércia da roleta e encaixe no nome mais próximo
  if (inertiaOn) {
    rotTarget += rotVel * dt; rotVel *= Math.pow(0.035, dt);
    if (Math.abs(rotVel) < 0.25) { inertiaOn = false; snapAt = performance.now(); }
  }
  if (snapAt && !pressed && !inertiaOn && performance.now() >= snapAt) { rotTarget = Math.round(rotTarget / STEP) * STEP; snapAt = 0; }
  if (!leaving) rotTarget = clampRot(rotTarget);
  rotCur += (rotTarget - rotCur) * 0.18;
  U_ROT.value = rotCur; arcGroup.rotation.z = rotCur;
  const ci = Math.round(rotCur / STEP);
  if (lastCi !== null && ci !== lastCi && N_ITEMS > 1) tick(700, 0.015, 0.03);   // "tic" a cada nome que passa
  lastCi = ci;
  // onda de luz do clique: corre da bolinha até o olho e o olho pulsa quando ela chega
  if (pulseRun) {
    pulseT += dt / 0.75;
    if (pulseT >= 1) { pulseRun = false; pulseU.value = 0; eyePulse = 1; tick(300, 0.05, 0.25); }
    else pulseU.value = pulseT < 0.5 ? 2 * pulseT * pulseT : 1 - Math.pow(-2 * pulseT + 2, 2) / 2;
  }
  nudge *= Math.pow(0.05, dt); eyePulse *= Math.pow(0.02, dt);
  // olho com vida: respira devagar e reage ao mouse chegando perto
  _v.set(0, 0, 0).project(camera);
  const ex = (_v.x * 0.5 + 0.5) * vw, ey = (-_v.y * 0.5 + 0.5) * vh;
  const dEye = mouse.x < -900 ? 1e9 : Math.hypot(mouse.x - ex, mouse.y - ey);
  eyeProx += (sstep(0, 1, 1 - Math.min(1, dEye / 260)) - eyeProx) * 0.1;
  halo.scale.setScalar(1 + 0.004 * Math.sin(tNow * 0.9) + 0.05 * eyePulse + 0.006 * eyeProx);
  glow.scale.setScalar(1 + 0.03 * Math.sin(tNow * 0.7) + 0.18 * eyePulse);
  glow.material.color.setScalar(1 + 1.3 * eyePulse + 0.4 * eyeProx);
  // suaviza zoom e inclinação
  zoomCur += (zoomTarget - zoomCur) * 0.12;
  tiltXCur += (tiltXTarget - tiltXCur) * 0.12;
  tiltZCur += (tiltZTarget - tiltZCur) * 0.12;
  tiltYCur += (tiltYTarget - tiltYCur) * 0.12;
  const mx = mouse.x < -900 ? 0 : (mouse.x / vw - 0.5) * 2;
  const my = mouse.y < -900 ? 0 : (mouse.y / vh - 0.5) * 2;
  camX += (mx * PARALLAX - camX) * 0.06;
  camY += (-my * PARALLAX * 0.7 - camY) * 0.06;
  const shift = viewShiftX / (zoomCur * zoomCur);   // com zoom, o olho volta para o centro
  camera.position.set(shift + camX, camY, (baseZ / zoomCur) * (1 - 0.04 * nudge));
  camera.lookAt(shift, 0, 0);
  diskMat.uniforms.uCam.value = camera.position.length();
  diskGroup.rotation.x = tiltXCur;
  diskGroup.rotation.z = tiltZCur;
  diskGroup.rotation.y = tiltYCur;
  placeLabels();
  camera.updateMatrixWorld();
  placeAneis(tNow);
  renderer.render(scene, camera);
  frames++;
  const now = performance.now();
  if (now - last >= 500) {
    const fps = (frames * 1000) / (now - last);
    fpsEl.textContent = Math.round(fps) + ' FPS · ' + LEVELS[qLevel].nome;
    frames = 0; last = now;
    if (cfg.qualidade === 'auto') {                  // sobe/desce a qualidade sozinha, sem ficar oscilando
      if (fps < 28) { fpsBad++; fpsGood = 0; } else if (fps >= 57) { fpsGood++; fpsBad = 0; } else { fpsBad = fpsGood = 0; }
      if (fpsBad >= 6 && qLevel < 2 && now - qChangedAt > 2500) { applyQuality(qLevel + 1); qChangedAt = now; noUpUntil = now + 60000; fpsBad = 0; frames = 0; last = performance.now(); }
      else if (fpsGood >= 20 && qLevel > 0 && now > noUpUntil) { applyQuality(qLevel - 1); qChangedAt = now; fpsGood = 0; frames = 0; last = performance.now(); }
    }
  }
}
renderer.setAnimationLoop(frame);

  // ---------- Limpeza ao fechar a vista ----------
  function dispose() {
    renderer.setAnimationLoop(null);
    clearTimeout(peekTimer);
    cleanups.forEach((f) => f());
    if (actx) { try { actx.close(); } catch (e) { /* ok */ } }
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      ms.forEach((m) => {
        if (m.map) m.map.dispose();
        if (m.uniforms) Object.values(m.uniforms).forEach((u) => { if (u.value && u.value.isTexture) u.value.dispose(); });
        m.dispose();
      });
    });
    renderer.dispose();
    renderer.forceContextLoss();
    root.classList.remove('olho-raiz', 'foco');
    root.innerHTML = '';
  }
  dispose.abrirCaminho = () => abrirCaminho();
  dispose.zoom = (f) => { zoomTarget = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomTarget * f)); };
  // Atualiza os tópicos quando o cofre muda (notas novas, links novos), mantendo a nota ativa.
  dispose.recarregar = (forcar) => {
    if (!COFRE) return;
    const novos = COFRE.topicos().map((t) => ({ nome: t.nome, itens: t.itens.map((n) => n.nome), meta: t.itens }));
    if (!novos.length) return;
    const sig = (arr) => JSON.stringify(arr.map((t) => [t.nome, t.meta.map((n) => [n.caminho, n.links, n.recente])]));
    if (!forcar && sig(novos) === sig(TOPICS)) return;
    const nomeTopico = TOPICS[topicIdx] && TOPICS[topicIdx].nome, nomeAtiva = NAMES[activeIdx];
    TOPICS = novos; gerarTerm();
    if (leaving) leaving = null;
    const ti = Math.max(0, TOPICS.findIndex((t) => t.nome === nomeTopico));
    buildTopic(ti);
    const k = NAMES.indexOf(nomeAtiva);
    if (k >= 0) { setActive(k, false); rotTarget = k * STEP; rotCur = rotTarget; U_ROT.value = rotCur; }
    openT = 1; U_FADE.value = 1;
  };
  return dispose;
}
