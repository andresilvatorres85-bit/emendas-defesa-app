// ============================================================= exportações ===
// Nenhuma dependência nova: o app é 100% estático e o workflow roda `npm ci`,
// então qualquer biblioteca obrigaria a subir também o package-lock.json —
// custo alto para um ganho que dá para obter no navegador.
//
// Aqui mora a exportação PNG (o PPTX está em pptx.js e reaproveita `baixar` e
// `nomeArquivo` daqui). A folha `@media print` continua no styles.css: quem
// quiser um PDF A4 usa o Ctrl+P do navegador, que já sai paginado e vetorial.
//
//  PNG  → o card é clonado, cada nó recebe o seu estilo *computado* inline
//         (dentro de um <img> de SVG nenhuma folha de estilo externa se
//         aplica), o clone entra num <foreignObject> e o SVG é desenhado num
//         canvas ampliado — 3x por padrão, que é o "alta definição" pedido.
//
// Como os valores são os *computados*, tudo já vem resolvido: `light-dark()`,
// `var(--token)` e as media queries do momento. O PNG sai idêntico ao que
// está na tela, no tema em uso e com os filtros aplicados.

const ESCALA = 3
const MARGEM = 24

// Elementos marcados com data-sem-exportar (os próprios botões) saem do clone.
const SEM_EXPORTAR = '[data-sem-exportar]'

function declaracoes(estilo) {
  // cssText é o caminho rápido (Chrome/Safari); o laço é o reserva.
  return estilo.cssText || Array.from(estilo).map((p) => `${p}:${estilo.getPropertyValue(p)}`).join(';')
}

// Copia o estilo computado de `origem` para `destino` e devolve as regras
// necessárias para reproduzir ::before/::after (que o cloneNode não leva).
function copiarEstilo(origem, destino, contador) {
  destino.style.cssText = declaracoes(getComputedStyle(origem))
  let regras = ''
  for (const pseudo of ['::before', '::after']) {
    const p = getComputedStyle(origem, pseudo)
    const conteudo = p.getPropertyValue('content')
    if (!conteudo || conteudo === 'none' || conteudo === 'normal') continue
    const classe = `pe${contador.n++}`
    destino.classList.add(classe)
    regras += `.${classe}${pseudo}{${declaracoes(p)}}`
  }
  return regras
}

export function baixar(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  // libera o objeto depois que o navegador iniciou o download
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function nomeArquivo(titulo, extensao) {
  const base = titulo
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${base}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${extensao}`
}

// Exporta um card (.painel-grafico) em PNG de alta definição.
export async function exportarPNG(card, titulo, contexto) {
  const caixa = card.getBoundingClientRect()
  const largura = Math.ceil(caixa.width)
  const fundo = getComputedStyle(document.body).backgroundColor || '#ffffff'
  const tinta = getComputedStyle(card).color

  const clone = card.cloneNode(true)
  const origens = [card, ...card.querySelectorAll('*')]
  const clones = [clone, ...clone.querySelectorAll('*')]
  const contador = { n: 0 }
  let regras = ''
  for (let i = 0; i < origens.length; i++) regras += copiarEstilo(origens[i], clones[i], contador)
  clone.querySelectorAll(SEM_EXPORTAR).forEach((n) => n.remove())
  clone.style.width = `${largura}px`
  clone.style.margin = '0'

  const moldura = document.createElement('div')
  moldura.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  moldura.style.cssText =
    `box-sizing:border-box;width:${largura + MARGEM * 2}px;padding:${MARGEM}px;` +
    `background:${fundo};color:${tinta};` +
    `font-family:${getComputedStyle(document.body).fontFamily};`
  if (regras) {
    const estilo = document.createElement('style')
    estilo.textContent = regras
    moldura.appendChild(estilo)
  }
  moldura.appendChild(clone)

  if (contexto) {
    const rodape = document.createElement('div')
    rodape.textContent = contexto
    rodape.style.cssText =
      `margin-top:10px;font-size:11px;line-height:1.45;opacity:0.72;` +
      `word-break:break-word;font-family:inherit;`
    moldura.appendChild(rodape)
  }

  // Mede fora da tela: com o estilo já inline, a altura medida é a final.
  moldura.style.position = 'fixed'
  moldura.style.left = '-10000px'
  moldura.style.top = '0'
  document.body.appendChild(moldura)
  const altura = Math.ceil(moldura.getBoundingClientRect().height)
  const larguraTotal = largura + MARGEM * 2
  moldura.style.position = 'static'
  moldura.style.left = 'auto'
  const xml = new XMLSerializer().serializeToString(moldura)
  moldura.remove()

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${larguraTotal}" height="${altura}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${xml}</foreignObject></svg>`

  const img = new Image()
  img.width = larguraTotal
  img.height = altura
  await new Promise((resolver, rejeitar) => {
    img.onload = resolver
    img.onerror = () => rejeitar(new Error('não foi possível rasterizar o gráfico'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(larguraTotal * ESCALA)
  canvas.height = Math.round(altura * ESCALA)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = fundo
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('não foi possível gerar o PNG')
  baixar(blob, nomeArquivo(titulo, 'png'))
}
