// ============================================================= PDF direto ===
// Exporta as folhas A4 do PLOA em PDF SEM abrir o diálogo de impressão e SEM
// nenhuma dependência nova (o workflow roda `npm ci`; qualquer pacote obrigaria
// a subir um package-lock.json). A técnica é a mesma do PNG (exportar.js):
//
//   1. a folha (que na tela fica `display:none`) é clonada para um "palco" fora
//      da tela, marcado com `.folha-render` (modo claro forçado), onde as regras
//      de leiaute da folha passam a valer e o conteúdo ganha layout mensurável;
//   2. o conteúdo é PAGINADO em folhas A4 por medição — cada bloco é encaixado
//      na página corrente enquanto couber; o gráfico de ações (longo) é quebrado
//      item a item / linha a linha, repetindo o cabeçalho do card em cada folha;
//   3. cada folha A4 é rasterizada (foreignObject → canvas → JPEG), com o rodapé
//      próprio (data/hora da exportação à esquerda, "pág. X/Y" à direita);
//   4. as imagens entram num PDF escrito à mão (uma imagem por página, A4
//      retrato) e o arquivo é baixado direto.
//
// Sem window.print(), o navegador não injeta cabeçalho ("Análise LOA — …"),
// endereço nem data no papel — quem manda no cabeçalho e no rodapé é este módulo.

import { baixar, nomeArquivo } from './exportar.js'

const MM = 96 / 25.4
const A4_W = Math.round(210 * MM)          // 794 px
const A4_H = Math.round(297 * MM)          // 1123 px
const MARGEM = Math.round(10 * MM)         // 38 px (topo e laterais)
const RODAPE = Math.round(12 * MM)         // 45 px reservados ao rodapé
const CONT_W = A4_W - MARGEM * 2           // largura útil do conteúdo
const USAVEL = A4_H - MARGEM - RODAPE      // altura útil do conteúdo (~1040 px)
const ESCALA = 2                            // densidade da rasterização

// -- serialização de estilo (idêntica à do PNG, ver exportar.js) -------------
function declaracoes(estilo) {
  return estilo.cssText || Array.from(estilo).map((p) => `${p}:${estilo.getPropertyValue(p)}`).join(';')
}
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

// Rasteriza um nó já posicionado numa folha A4 (com moldura e rodapé) e devolve
// um dataURL JPEG. Os estilos computados são copiados para inline — dentro de um
// <img> de SVG nenhuma folha de estilo externa se aplica.
async function rasterizarPagina(conteudo, { rodape, num, total }) {
  const fonte = getComputedStyle(document.body).fontFamily

  const clone = conteudo.cloneNode(true)
  const origens = [conteudo, ...conteudo.querySelectorAll('*')]
  const clones = [clone, ...clone.querySelectorAll('*')]
  const contador = { n: 0 }
  let regras = ''
  for (let i = 0; i < origens.length; i++) regras += copiarEstilo(origens[i], clones[i], contador)
  clone.style.width = `${CONT_W}px`
  clone.style.margin = '0'

  const moldura = document.createElement('div')
  moldura.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  moldura.style.cssText =
    `box-sizing:border-box;width:${A4_W}px;height:${A4_H}px;` +
    `padding:${MARGEM}px ${MARGEM}px ${RODAPE}px;` +
    `background:#ffffff;color:#111827;font-family:${fonte};position:relative;overflow:hidden;`
  if (regras) {
    const estilo = document.createElement('style')
    estilo.textContent = regras
    moldura.appendChild(estilo)
  }
  moldura.appendChild(clone)

  const rod = document.createElement('div')
  rod.style.cssText =
    `position:absolute;left:${MARGEM}px;right:${MARGEM}px;bottom:${Math.round(5.5 * MM)}px;` +
    `display:flex;justify-content:space-between;align-items:baseline;` +
    `font-family:${fonte};font-size:8pt;color:#6b7280;`
  const esq = document.createElement('span'); esq.textContent = rodape
  const dir = document.createElement('span'); dir.textContent = `pág. ${num}/${total}`
  rod.appendChild(esq); rod.appendChild(dir)
  moldura.appendChild(rod)

  const xml = new XMLSerializer().serializeToString(moldura)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${A4_W}" height="${A4_H}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${xml}</foreignObject></svg>`

  const img = new Image()
  img.width = A4_W; img.height = A4_H
  await new Promise((ok, erro) => {
    img.onload = ok
    img.onerror = () => erro(new Error('falha ao rasterizar a página do PDF'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })

  const canvas = document.createElement('canvas')
  canvas.width = A4_W * ESCALA; canvas.height = A4_H * ESCALA
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.92)
}

// Distribui o conteúdo da folha em páginas A4. Devolve os elementos de conteúdo
// (um por página), já anexados ao palco e medidos.
function paginar(folha, palco) {
  const paginas = []
  let atual = null
  let vazia = true

  const novaPagina = () => {
    atual = document.createElement('div')
    atual.className = 'pdf-pagina-conteudo'
    atual.style.cssText = `width:${CONT_W}px;`
    palco.appendChild(atual)
    paginas.push(atual)
    vazia = true
  }
  novaPagina()

  // Encaixa um bloco inteiro; se estourar a altura útil e a página já tem algo,
  // empurra para uma folha nova.
  const encaixar = (node) => {
    atual.appendChild(node)
    if (!vazia && atual.scrollHeight > USAVEL) {
      atual.removeChild(node)
      novaPagina()
      atual.appendChild(node)
    }
    vazia = false
  }

  // Card longo (ações): monta a casca (cabeçalho + gráfico/tabela sem as linhas)
  // e injeta as linhas uma a uma, abrindo folha nova quando estoura. A casca é
  // repetida em cada folha, então o cabeçalho e o cabeçalho da tabela seguem.
  const encaixarFluido = (card) => {
    const seletorLista = () => card.querySelector('.pbar-lista') || card.querySelector('table.matriz tbody')
    const listaOrigem = seletorLista()
    if (!listaOrigem) { encaixar(card.cloneNode(true)); return }
    const linhas = Array.from(listaOrigem.children)

    // casca = card sem as linhas (mantém cabeçalho, thead da tabela e legenda)
    const casca = card.cloneNode(true)
    ;(casca.querySelector('.pbar-lista') || casca.querySelector('table.matriz tbody')).replaceChildren()

    if (!vazia) novaPagina()
    let shell = casca.cloneNode(true)
    let destino = shell.querySelector('.pbar-lista') || shell.querySelector('table.matriz tbody')
    atual.appendChild(shell); vazia = false

    for (const linha of linhas) {
      destino.appendChild(linha.cloneNode(true))
      if (destino.children.length > 1 && atual.scrollHeight > USAVEL) {
        destino.removeChild(destino.lastChild)
        novaPagina()
        shell = casca.cloneNode(true)
        destino = shell.querySelector('.pbar-lista') || shell.querySelector('table.matriz tbody')
        atual.appendChild(shell); vazia = false
        destino.appendChild(linha.cloneNode(true))
      }
    }
  }

  const grupos = folha.querySelectorAll(':scope > .pdf-pagina')
  grupos.forEach((grupo, gi) => {
    // Grupo marcado como "nova página" força quebra (respeita o agrupamento
    // pedido: ação numa folha própria, "Por Força" na folha final, etc.).
    if (gi > 0 && grupo.classList.contains('pdf-pagina-nova') && !vazia) novaPagina()
    for (const bloco of grupo.children) {
      if (bloco.classList.contains('pdf-card-fluido')) encaixarFluido(bloco)
      else encaixar(bloco.cloneNode(true))
    }
  })
  return paginas
}

// Escreve um PDF (A4 retrato) com uma imagem JPEG por página. Estrutura mínima:
// catálogo, árvore de páginas e, por página, o objeto Page, o content stream que
// desenha a imagem ocupando toda a MediaBox, e a própria imagem (XObject
// DCTDecode). xref e trailer fecham o arquivo.
function montarPDF(imagens) {
  const te = new TextEncoder()
  const partes = []
  let len = 0
  const put = (x) => { const u = x instanceof Uint8Array ? x : te.encode(x); partes.push(u); len += u.length }
  const off = []
  const N = imagens.length
  const W = 595.276, H = 841.89 // A4 em pontos

  put('%PDF-1.4\n')
  off[1] = len; put('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  const kids = []
  for (let i = 0; i < N; i++) kids.push(`${3 + i * 3} 0 R`)
  off[2] = len
  put(`2 0 obj\n<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${N} >>\nendobj\n`)

  for (let i = 0; i < N; i++) {
    const pageN = 3 + i * 3, contentN = 4 + i * 3, imgN = 5 + i * 3
    const im = imagens[i]
    off[pageN] = len
    put(`${pageN} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
        `/Resources << /XObject << /Im0 ${imgN} 0 R >> >> /Contents ${contentN} 0 R >>\nendobj\n`)
    const cs = `q\n${W} 0 0 ${H} 0 0 cm\n/Im0 Do\nQ\n`
    off[contentN] = len
    put(`${contentN} 0 obj\n<< /Length ${te.encode(cs).length} >>\nstream\n`); put(cs); put('endstream\nendobj\n')
    off[imgN] = len
    put(`${imgN} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.data.length} >>\nstream\n`)
    put(im.data); put('\nendstream\nendobj\n')
  }

  const maxObj = 2 + N * 3
  const xrefPos = len
  let xref = `xref\n0 ${maxObj + 1}\n0000000000 65535 f \n`
  for (let n = 1; n <= maxObj; n++) xref += String(off[n]).padStart(10, '0') + ' 00000 n \n'
  put(xref)
  put(`trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`)

  const out = new Uint8Array(len)
  let p = 0
  for (const u of partes) { out.set(u, p); p += u.length }
  return new Blob([out], { type: 'application/pdf' })
}

function jpegParaBytes(dataUrl) {
  const bin = atob(dataUrl.split(',')[1])
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}

// Ponto de entrada. `folha` é o elemento `.folha-pdf` da subaba em tela.
export async function exportarFolhaPDF(folha, titulo) {
  if (!folha) throw new Error('folha do PDF não encontrada')
  const rodape = 'Extraído em ' +
    new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  const palco = document.createElement('div')
  palco.className = 'folha-pdf folha-render'
  palco.style.cssText = `position:fixed;left:-100000px;top:0;width:${CONT_W}px;background:#fff;`
  document.body.appendChild(palco)

  try {
    const paginas = paginar(folha, palco)
    const imagens = []
    for (let i = 0; i < paginas.length; i++) {
      const url = await rasterizarPagina(paginas[i], { rodape, num: i + 1, total: paginas.length })
      imagens.push({ data: jpegParaBytes(url), w: A4_W * ESCALA, h: A4_H * ESCALA })
    }
    baixar(montarPDF(imagens), nomeArquivo(titulo, 'pdf'))
  } finally {
    palco.remove()
  }
}
