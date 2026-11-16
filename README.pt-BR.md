# Accretion Disk 3D (plugin do Obsidian)

[English](README.md) · **Português**

Seu cofre como um buraco negro em 3D: um olho preto, um disco de partículas douradas e, em volta, uma meia-lua com os nomes das suas notas, ligadas ao olho por linhas curvas com bolinhas de luz.

## Demonstração

[Ver a demonstração (MP4, 30 s)](media/demo.mp4)

## Abrir
Ícone de olho na barra lateral, ou o comando **Abrir Accretion Disk 3D** (Cmd+P).

## O que dá para fazer
- **Trocar de lista:** setinhas ao lado do título. Role ou arraste sobre os nomes para girar a roleta.
- **Selecionar uma nota:** clique (ou segure / duplo clique, conforme a configuração). Clique na nota ativa para abrir o cartão com o começo do texto.
- **ABRIR NOTA:** abre a nota numa aba.
- **RENOMEAR NOTA:** edita o nome da nota ali mesmo (Enter salva, Esc cancela). O Obsidian atualiza os links que apontavam para ela, se a opção "Atualizar links internos automaticamente" estiver ligada.
- **CAMINHO ATÉ…** (ou o comando "Caminho entre notas"): digite o nome de outra nota e veja o menor caminho de links entre as duas, numa caixa com botões clicáveis e uma linha dourada no arco.
- **Zoom pelos anéis:** aproxime (roda do mouse, pinça no trackpad ou os comandos **Aproximar** / **Afastar**). Os nomes do arco apagam e entram dois anéis com as notas mais ligadas do cofre; bem perto, os números do cofre aparecem dentro do olho. Afaste para voltar às listas.
- **FOCO** (tecla F): esconde os painéis. **RESET**: volta a vista ao início.

## De onde vêm as listas
- **CLIENTES:** se alguma nota tiver a tag `#cliente` (ou estiver na pasta `Clientes`), só essas aparecem. Sem nenhuma marcação, o plugin reconhece pelo título com "ESTADO ATUAL".
- **REGRAS:** título começando com "Regra"/"Regras", pasta `Regras` ou tag `#regra`.
- **SKILLS:** "skill" no título, pasta `Skills` ou tag `#skill`.
- **RECENTES**, **MAIS LIGADAS**, **ÓRFÃS** (sem nenhum link) e **PARADAS** (sem alteração há mais de 30 dias por padrão; configurável).
- Uma lista para cada pasta de primeiro nível com 3 notas ou mais.
- Cada lista mostra até 150 notas. Notas criadas nas últimas 48 h brilham mais. As linhas ligam as notas que realmente têm link entre si.
- A vista se atualiza sozinha alguns segundos depois de o cofre mudar.

## Configurações (botão CONFIG)
| Opção | Para que serve |
|---|---|
| Como selecionar um item | Clicar, segurar ou duplo clique |
| Brilho | Intensidade do dourado |
| Linhas suaves (2ª camada) | Quantidade de linhas finas por item |
| Qualidade | Automática (ajusta pelo FPS), alta, média ou baixa |
| Nota "parada" após | 15, 30, 60 ou 90 dias sem alteração (lista PARADAS) |
| Pausar se ficar sem mexer | 5, 10, 30 minutos ou nunca. Sempre pausa quando a vista fica escondida |
| Pulso de luz aleatório | Pulso a cada ~10 s |
| Meteoro dourado | Um meteoro passa de vez em quando |
| Painel de terminal decorativo | Código "digitado" no canto esquerdo (só visual) |
| Som discreto | Sons suaves ao passar e clicar |
| Letras por nome | Tamanho máximo dos nomes no arco |
| Destacar notas recentes (48 h) | Liga/desliga o brilho das notas novas |
| Modo vizinhança | Só a nota ativa e as ligadas ficam em destaque |

As configurações ficam salvas no `data.json` do plugin.

## Desempenho
A animação pausa quando a vista fica escondida e, por padrão, após 5 minutos sem mexer o mouse. A qualidade se ajusta sozinha pelo FPS. Somente desktop; placas de vídeo fracas podem precisar da qualidade baixa.

## Desenvolvimento
```
cd plugin
npm install
npm run dev       # compila em modo observação para o cofre de teste
npm run build     # versão de produção em plugin/dist
npm run harness   # cena sem o Obsidian, em http://127.0.0.1:5174
```
Requer Obsidian 1.5.0 ou mais novo.
