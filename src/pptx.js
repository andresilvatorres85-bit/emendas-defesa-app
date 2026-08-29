// ================================================== exportação para PPTX ===
// Gera um .pptx **editável** (texto é texto, gráfico é gráfico nativo do
// PowerPoint, com a planilha de dados embutida) sem nenhuma dependência nova.
// O app é 100% estático e o workflow roda `npm ci`: incluir uma biblioteca
// obrigaria a subir também um package-lock.json novo pela interface web.
//
// Um .pptx é apenas um ZIP de XML. Aqui há, em ordem:
//   1. um escritor de ZIP mínimo (método "store", sem compressão — o conteúdo
//      é texto pequeno e o arquivo final fica na casa de centenas de KB);
//   2. as peças fixas do pacote (tema, slide master, layout);
//   3. construtores de forma, caixa de texto e gráfico (DrawingML);
//   4. a montagem dos 7 slides a partir dos dados do Dashboard filtrado.

import { corDoRP, fmtBRL, fmtInt, fmtMilhoes, fmtPct, fmtCompacto } from './dados.js'
import { baixar, nomeArquivo } from './exportar.js'

// ------------------------------------------------------------------ ZIP ---
const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// arquivos: [{ nome, dados: string | Uint8Array }] -> Uint8Array do ZIP
function zipar(arquivos) {
  const cod = new TextEncoder()
  const blocos = []
  const central = []
  let desloc = 0
  for (const arq of arquivos) {
    const conteudo = typeof arq.dados === 'string' ? cod.encode(arq.dados) : arq.dados
    const nome = cod.encode(arq.nome)
    const crc = crc32(conteudo)

    const local = new Uint8Array(30 + nome.length)
    const dv = new DataView(local.buffer)
    dv.setUint32(0, 0x04034b50, true)
    dv.setUint16(4, 20, true) // versão necessária
    dv.setUint16(6, 0, true) // flags
    dv.setUint16(8, 0, true) // método 0 = store
    dv.setUint16(10, 0, true) // hora
    dv.setUint16(12, 0x21, true) // data fixa (01/01/1980) — saída determinística
    dv.setUint32(14, crc, true)
    dv.setUint32(18, conteudo.length, true)
    dv.setUint32(22, conteudo.length, true)
    dv.setUint16(26, nome.length, true)
    local.set(nome, 30)
    blocos.push(local, conteudo)

    const dir = new Uint8Array(46 + nome.length)
    const cv = new DataView(dir.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0x21, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, conteudo.length, true)
    cv.setUint32(24, conteudo.length, true)
    cv.setUint16(28, nome.length, true)
    cv.setUint32(42, desloc, true)
    dir.set(nome, 46)
    central.push(dir)

    desloc += local.length + conteudo.length
  }

  const tamCentral = central.reduce((s, b) => s + b.length, 0)
  const fim = new Uint8Array(22)
  const fv = new DataView(fim.buffer)
  fv.setUint32(0, 0x06054b50, true)
  fv.setUint16(8, arquivos.length, true)
  fv.setUint16(10, arquivos.length, true)
  fv.setUint32(12, tamCentral, true)
  fv.setUint32(16, desloc, true)

  const total = desloc + tamCentral + 22
  const saida = new Uint8Array(total)
  let p = 0
  for (const b of [...blocos, ...central, fim]) {
    saida.set(b, p)
    p += b.length
  }
  return saida
}

// ------------------------------------------------------------- utilidades ---
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart'

const EMU = 360000 // por centímetro
const cm = (v) => Math.round(v * EMU)
const LARG = 33.867 // 16:9 — 13,333 x 7,5 pol
const ALT = 19.05

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// "light-dark(#e87ba4, #d55181)" | "#4a3aa7" -> "E87BA4" (o pptx é claro).
function corSolida(valor, reserva = '2A78D6') {
  const m = /#([0-9a-f]{6})/i.exec(String(valor || ''))
  return m ? m[1].toUpperCase() : reserva
}

// Contraste relativo (WCAG) entre duas cores hex de 6 dígitos.
function luminancia(hex) {
  // Aceita '#abc123' ou 'abc123'; qualquer coisa inválida vira cinza médio, para
  // que corDoRotulo() nunca quebre com uma cor ausente (o cru já é defensivo, mas
  // este é o ponto único por onde toda cor passa antes de virar contraste).
  const s = String(hex ?? '').replace('#', '').padEnd(6, '0').slice(0, 6)
  const c = [0, 2, 4].map((i) => {
    const v = parseInt(s.slice(i, i + 2), 16) / 255
    const w = Number.isFinite(v) ? v : 0.5
    return w <= 0.03928 ? w / 12.92 : ((w + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
// Rótulo impresso DENTRO do segmento: escolhe entre branco e tinta o que
// contrasta melhor com o preenchimento. Nenhuma das duas serve para a paleta
// inteira — branco some no amarelo, tinta some no violeta —, então a escolha é
// medida, não arbitrada.
function corDoRotulo(fundo) {
  return contraste('FFFFFF', fundo) >= contraste('1C1C1A', fundo) ? 'FFFFFF' : '1C1C1A'
}

const TINTA = '1C1C1A'
const TINTA_2 = '4A4A45'
const FRACA = '6E6E68'
const CARTAO = 'F5F5F2'
const BORDA = 'E3E3DD'
const ACENTO = '2A78D6'
const VERDE = '008300'
const AZUL = '2A78D6'
const MAGENTA = 'E87BA4'
const AMARELO = 'EDA100'
const VIOLETA = '4A3AA7'

// ------------------------------------------------- formas e caixas de texto ---
function paragrafo(p) {
  const antes = p.antes ? `<a:spcBef><a:spcPts val="${p.antes}"/></a:spcBef>` : ''
  const pPr = `<a:pPr${p.algn ? ` algn="${p.algn}"` : ''}>${antes}</a:pPr>`
  const runs = (p.runs || [])
    .map((r) => {
      const rPr =
        `<a:rPr lang="pt-BR" sz="${r.sz || 1400}"${r.b ? ' b="1"' : ''}` +
        `${r.spc ? ` spc="${r.spc}"` : ''} dirty="0">` +
        `<a:solidFill><a:srgbClr val="${r.cor || TINTA}"/></a:solidFill></a:rPr>`
      return `<a:r>${rPr}<a:t>${esc(r.t)}</a:t></a:r>`
    })
    .join('')
  return `<a:p>${pPr}${runs}</a:p>`
}

function forma(o) {
  const geom = o.raio != null
    ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${o.raio}"/></a:avLst></a:prstGeom>`
    : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
  const fundo = o.fundo
    ? `<a:solidFill><a:srgbClr val="${o.fundo}"/></a:solidFill>`
    : '<a:noFill/>'
  const linha = o.borda
    ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${o.borda}"/></a:solidFill></a:ln>`
    : '<a:ln><a:noFill/></a:ln>'
  const rec = cm(o.recuo ?? 0.3)
  const corpo =
    `<a:bodyPr wrap="square" lIns="${rec}" tIns="${rec}" rIns="${rec}" bIns="${rec}" ` +
    `anchor="${o.ancora || 't'}"><a:normAutofit/></a:bodyPr>`
  const paragrafos = (o.paragrafos || []).map(paragrafo).join('') || '<a:p/>'
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${o.id}" name="${esc(o.nome || 'Forma')}"/>` +
    '<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
    `<p:spPr><a:xfrm><a:off x="${cm(o.x)}" y="${cm(o.y)}"/>` +
    `<a:ext cx="${cm(o.w)}" cy="${cm(o.h)}"/></a:xfrm>${geom}${fundo}${linha}</p:spPr>` +
    `<p:txBody>${corpo}<a:lstStyle/>${paragrafos}</p:txBody></p:sp>`
  )
}

function quadroGrafico(o) {
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${o.id}" name="${esc(o.nome)}"/>` +
    '<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' +
    `<p:xfrm><a:off x="${cm(o.x)}" y="${cm(o.y)}"/><a:ext cx="${cm(o.w)}" cy="${cm(o.h)}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="${NS_C}">` +
    `<c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="${o.rel}"/>` +
    '</a:graphicData></a:graphic></p:graphicFrame>'
  )
}

function slideXML(corpo) {
  return (
    XML +
    `<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>` +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    corpo +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  )
}

function rels(lista) {
  return (
    XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    lista.map((r) => `<Relationship Id="${r.id}" Type="${r.tipo}" Target="${r.alvo}"/>`).join('') +
    '</Relationships>'
  )
}

const TIPO = {
  slide: `${NS_R}/slide`,
  master: `${NS_R}/slideMaster`,
  layout: `${NS_R}/slideLayout`,
  tema: `${NS_R}/theme`,
  doc: `${NS_R}/officeDocument`,
  chart: `${NS_R}/chart`,
  pacote: `${NS_R}/package`,
  core: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
}

// ------------------------------------------------------------- gráficos ---
function txPr(sz, cor, b) {
  return (
    '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr ' +
    `sz="${sz}"${b ? ' b="1"' : ''}><a:solidFill><a:srgbClr val="${cor}"/></a:solidFill>` +
    '</a:defRPr></a:pPr><a:endParaRPr lang="pt-BR"/></a:p></c:txPr>'
  )
}

const SEM_PINTURA = '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>'

function refCat(cats) {
  return (
    `<c:cat><c:strRef><c:f>Plan1!$A$2:$A$${cats.length + 1}</c:f><c:strCache>` +
    `<c:ptCount val="${cats.length}"/>` +
    cats.map((c, i) => `<c:pt idx="${i}"><c:v>${esc(c)}</c:v></c:pt>`).join('') +
    '</c:strCache></c:strRef></c:cat>'
  )
}

function refVal(vals, col) {
  return (
    `<c:val><c:numRef><c:f>Plan1!$${col}$2:$${col}$${vals.length + 1}</c:f><c:numCache>` +
    '<c:formatCode>#,##0.0</c:formatCode>' +
    `<c:ptCount val="${vals.length}"/>` +
    vals.map((v, i) => `<c:pt idx="${i}"><c:v>${Number(v).toFixed(4)}</c:v></c:pt>`).join('') +
    '</c:numCache></c:numRef></c:val>'
  )
}

function refNome(nome, col) {
  return (
    `<c:tx><c:strRef><c:f>Plan1!$${col}$1</c:f><c:strCache><c:ptCount val="1"/>` +
    `<c:pt idx="0"><c:v>${esc(nome)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`
  )
}

function pontos(cores) {
  return cores
    .map(
      (cor, i) =>
        `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>` +
        `<a:solidFill><a:srgbClr val="${cor}"/></a:solidFill>` +
        '<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>' +
        '</c:spPr></c:dPt>'
    )
    .join('')
}

const FMT_MI = '#,##0.0&quot; mi&quot;'

function envelope(interno) {
  return (
    XML +
    `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">` +
    '<c:roundedCorners val="0"/>' +
    `<c:chart>${interno}</c:chart>` +
    SEM_PINTURA +
    txPr(1200, TINTA_2) +
    '<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData>' +
    '</c:chartSpace>'
  )
}

// Rosca (doughnut) com rótulo de percentual e legenda à direita.
// Rosca (doughnut) com rótulo de percentual e legenda à direita.
// `escala` e `nomeSerie` existem porque as duas bases do app têm ordens de
// grandeza diferentes: as emendas vêm em reais e são exibidas em milhões, o
// PLOA vem em reais e é exibido em BILHÕES. Deixar o divisor fixo em 1e6 fazia
// as fatias do PLOA caírem para 0,0000 no cache numérico do gráfico (que grava
// com 4 casas) — tudo menos a maior fatia virava zero e a rosca saía com uma
// única fatia de 100%.
function graficoRosca(itens, { escala = 1e6, nomeSerie = 'Valor (R$ milhões)' } = {}) {
  // Recorte vazio → 0 fatias geraria faixa invertida `$A$2:$A$1` e ptCount=0,
  // que o PowerPoint acusa como arquivo corrompido. Uma fatia-placeholder mantém
  // o pacote válido (mesma rede de segurança de graficoBarras).
  if (!Array.isArray(itens) || itens.length === 0) {
    itens = [{ rotulo: '(sem dados no recorte selecionado)', valor: 0, cor: 'B3B3AD' }]
  }
  const cats = itens.map((d) => d.rotulo)
  const vals = itens.map((d) => d.valor / escala)
  const cores = itens.map((d) => d.cor)
  const dLbls =
    '<c:dLbls>' + SEM_PINTURA + txPr(1200, TINTA, true) +
    '<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/>' +
    '<c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/></c:dLbls>'
  const ser =
    '<c:ser><c:idx val="0"/><c:order val="0"/>' + refNome(nomeSerie, 'B') +
    pontos(cores) + dLbls + refCat(cats) + refVal(vals, 'B') + '</c:ser>'
  return envelope(
    '<c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>' +
    `<c:doughnutChart><c:varyColors val="1"/>${ser}${dLbls}` +
    '<c:firstSliceAng val="0"/><c:holeSize val="48"/></c:doughnutChart>' +
    SEM_PINTURA + '</c:plotArea>' +
    `<c:legend><c:legendPos val="r"/><c:overlay val="0"/>${txPr(1200, TINTA_2)}</c:legend>` +
    '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>'
  )
}

const FMT_INT = '#,##0'

// Gráfico de barras. Cobre os quatro usos do app:
//   horizontal agrupado  — rankings (autores, partidos)
//   horizontal empilhado — impositivas por C Mil A
//   vertical agrupado    — séries por exercício
//   vertical empilhado / proporção — composição por ano
//
// `cores` pinta ponto a ponto (ranking de autores); `tendencia` acrescenta a
// reta de mínimos quadrados que o PowerPoint calcula sozinho — é linha de
// tendência nativa, não um desenho por cima.
function graficoBarras({
  cats, series, empilhado, proporcao, cores, legenda,
  vertical = false, formato = FMT_MI, tendencia = false,
  rotulos = true, apagarAbaixo = 0,
}) {
  // Robustez do pacote: nunca emitir um gráfico corrompido. Três defeitos de
  // dado quebravam o .pptx com "documento precisa de reparo" no PowerPoint:
  //   (a) recorte vazio → 0 categorias → faixa invertida `$B$2:$B$1` e ptCount=0;
  //   (b) série com comprimento diferente do nº de categorias → cat≠val;
  //   (c) valor não-finito (undefined/NaN) → `<c:v>NaN</c:v>` no cache numérico.
  // Como os agregadores da tela normalizam a maioria disso, o guarda aqui é a
  // rede de segurança única para qualquer painel — inclusive um recorte que o
  // usuário filtre até esvaziar.
  cats = Array.isArray(cats) ? cats.slice() : []
  series = Array.isArray(series) ? series.map((s) => ({ ...s })) : []
  if (cats.length === 0 || series.length === 0) {
    cats = ['(sem dados no recorte selecionado)']
    series = [{ nome: ' ', cor: 'B3B3AD', valores: [0] }]
    cores = null
    legenda = false
    rotulos = false
    // Um placeholder de recorte vazio nunca é empilhado: assim o rótulo interno
    // (que mediria o contraste sobre a cor do segmento) não é sequer calculado.
    empilhado = false
    proporcao = false
  }
  if (Array.isArray(cores)) cores = cores.slice(0, cats.length)
  // alinha cada série ao nº de categorias e força número finito em cada ponto
  series = series.map((s) => ({
    ...s,
    valores: cats.map((_, j) => {
      const v = Number(s.valores?.[j])
      return Number.isFinite(v) ? v : 0
    }),
  }))
  const ax1 = 111111111
  const ax2 = 222222222
  const empilha = empilhado || proporcao
  // `outEnd` só é legal em barra agrupada; empilhada exige `ctr`.
  const posRotulo = empilha ? 'ctr' : 'outEnd'
  // Cor de preenchimento da SÉRIE. Nos gráficos coloridos por coluna (Força, RP)
  // a série não traz `.cor` — a cor vive em `cores`, aplicada ponto a ponto —, e
  // sem este resguardo saía `val="undefined"`, que faz o PowerPoint acusar
  // arquivo corrompido. Preserva qualquer hex de 6 dígitos e só recorre à
  // reserva (a 1ª cor da paleta, ou o azul padrão) quando a série não tem cor.
  const corSerie = (c, alt) => {
    const s = String(c ?? '').replace('#', '')
    if (/^[0-9a-f]{6}$/i.test(s)) return s.toUpperCase()
    const a = String(alt ?? '').replace('#', '')
    return /^[0-9a-f]{6}$/i.test(a) ? a.toUpperCase() : '2A78D6'
  }
  // Totais por categoria, para poder apagar o rótulo de fatias minúsculas.
  const totalCat = cats.map((_, j) => series.reduce((s, x) => s + (x.valores[j] || 0), 0))

  // `apagados` são os <c:dLbl> individuais (idx + delete) e, pelo schema,
  // precisam vir ANTES das propriedades comuns dentro de <c:dLbls>.
  const dLbls = (apagados = '', cor = TINTA_2) =>
    '<c:dLbls>' + apagados +
    `<c:numFmt formatCode="${formato}" sourceLinked="0"/>` + SEM_PINTURA +
    txPr(1000, cor, true) + `<c:dLblPos val="${posRotulo}"/>` +
    `<c:showLegendKey val="0"/><c:showVal val="${rotulos ? 1 : 0}"/><c:showCatName val="0"/>` +
    '<c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>'

  const sers = series
    .map((s, i) => {
      const col = String.fromCharCode(66 + i) // B, C, …
      const pinta = cores ? pontos(cores) : ''
      // Segmento zerado (ou pequeno demais para caber o texto) não ganha
      // rótulo: no empilhado o "0,0 mi" ficava solto ao lado da barra e
      // colidia com o rótulo do segmento vizinho.
      const apagados = s.valores
        .map((v, j) => {
          const parte = totalCat[j] ? v / totalCat[j] : 0
          const some = v <= 0 || (apagarAbaixo > 0 && parte < apagarAbaixo)
          return some ? `<c:dLbl><c:idx val="${j}"/><c:delete val="1"/></c:dLbl>` : ''
        })
        .join('')
      const reta = tendencia
        ? '<c:trendline><c:spPr><a:ln w="22225" cap="rnd">' +
          `<a:solidFill><a:srgbClr val="${corSerie(s.cor, cores && cores[0])}"/></a:solidFill>` +
          '<a:prstDash val="dash"/></a:ln></c:spPr>' +
          '<c:trendlineType val="linear"/>' +
          '<c:dispRSqr val="0"/><c:dispEq val="0"/></c:trendline>'
        : ''
      return (
        `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>` + refNome(s.nome, col) +
        `<c:spPr><a:solidFill><a:srgbClr val="${corSerie(s.cor, cores && cores[0])}"/></a:solidFill>` +
        '<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr>' +
        '<c:invertIfNegative val="0"/>' + pinta +
        dLbls(apagados, empilha ? corDoRotulo(s.cor) : TINTA_2) + reta +
        refCat(cats) + refVal(s.valores, col) + '</c:ser>'
      )
    })
    .join('')

  const agrupamento = proporcao ? 'percentStacked' : empilhado ? 'stacked' : 'clustered'
  const grafico =
    `<c:barChart><c:barDir val="${vertical ? 'col' : 'bar'}"/>` +
    `<c:grouping val="${agrupamento}"/>` +
    `<c:varyColors val="0"/>${sers}${dLbls()}` +
    `<c:gapWidth val="${empilha ? 60 : 45}"/><c:overlap val="${empilha ? 100 : -27}"/>` +
    `<c:axId val="${ax1}"/><c:axId val="${ax2}"/></c:barChart>`

  // Na barra horizontal as categorias são invertidas (maior no topo), e é o
  // valAx que precisa cruzar no máximo para o rótulo ficar à esquerda. Na
  // coluna vertical a ordem natural já é a certa.
  const catAx =
    `<c:catAx><c:axId val="${ax1}"/>` +
    `<c:scaling><c:orientation val="${vertical ? 'minMax' : 'maxMin'}"/></c:scaling>` +
    `<c:delete val="0"/><c:axPos val="${vertical ? 'b' : 'l'}"/>` +
    '<c:numFmt formatCode="General" sourceLinked="1"/>' +
    '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
    `<c:spPr><a:noFill/><a:ln w="9525"><a:solidFill><a:srgbClr val="${BORDA}"/></a:solidFill></a:ln></c:spPr>` +
    txPr(1100, TINTA) +
    `<c:crossAx val="${ax2}"/><c:crosses val="autoZero"/><c:auto val="1"/>` +
    '<c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>'

  const valAx =
    `<c:valAx><c:axId val="${ax2}"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    `<c:delete val="1"/><c:axPos val="${vertical ? 'l' : 'b'}"/>` +
    `<c:numFmt formatCode="${formato}" sourceLinked="0"/>` +
    '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="none"/>' +
    txPr(1000, FRACA) +
    `<c:crossAx val="${ax1}"/><c:crosses val="${vertical ? 'autoZero' : 'max'}"/>` +
    '<c:crossBetween val="between"/></c:valAx>'

  return envelope(
    '<c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>' + grafico + catAx + valAx +
    SEM_PINTURA + '</c:plotArea>' +
    (legenda
      ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txPr(1200, TINTA_2)}</c:legend>`
      : '') +
    '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>'
  )
}

// ------------------------------------------------------------- tabelas ---
// As matrizes ano × categoria do Histórico viram TABELA de verdade no slide
// (a:tbl), não imagem: o texto continua editável e a tabela é redimensionável.
// Sem `tableStyleId` — o pacote não carrega a peça de estilos de tabela, então
// cada célula leva o próprio preenchimento.
function celula(texto, o = {}) {
  const p = paragrafo({
    algn: o.algn || 'r',
    runs: [{ t: texto, sz: o.sz || 1100, b: o.b, cor: o.cor || TINTA_2 }],
  })
  const fundo = o.fundo
    ? `<a:solidFill><a:srgbClr val="${o.fundo}"/></a:solidFill>`
    : '<a:noFill/>'
  // Sem estilo de tabela no pacote, o consumidor desenha borda em tudo por
  // padrão. Só a linha de baixo é declarada; as outras três saem explicitamente
  // sem preenchimento. Ordem obrigatória: lnL, lnR, lnT, lnB.
  const semLinha = (t) => `<a:${t} w="9525"><a:noFill/></a:${t}>`
  const linhas =
    semLinha('lnL') + semLinha('lnR') + semLinha('lnT') +
    `<a:lnB w="9525" cap="flat"><a:solidFill><a:srgbClr val="${BORDA}"/></a:solidFill></a:lnB>`
  return (
    '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>' + p + '</a:txBody>' +
    `<a:tcPr marL="${cm(0.16)}" marR="${cm(0.16)}" marT="${cm(0.08)}" marB="${cm(0.08)}" ` +
    `anchor="ctr">${linhas}${fundo}</a:tcPr></a:tc>`
  )
}

function tabela(o) {
  const sz = o.larguras.length > 8 ? 950 : 1100
  const larguras = o.larguras.map((w) => `<a:gridCol w="${cm(w)}"/>`).join('')
  const cabecalho =
    `<a:tr h="${cm(0.85)}">` +
    o.cabecalho
      .map((t, i) => celula(t, { algn: i === 0 ? 'l' : 'r', b: true, sz: sz - 100, cor: FRACA }))
      .join('') +
    '</a:tr>'
  const corpo = o.linhas
    .map(
      (linha) =>
        `<a:tr h="${cm(0.78)}">` +
        linha
          .map((c, i) =>
            celula(typeof c === 'object' ? c.t : c, {
              algn: i === 0 ? 'l' : 'r',
              b: i === 0 || (typeof c === 'object' && c.b),
              sz,
              cor: i === 0 ? TINTA : TINTA_2,
              fundo: typeof c === 'object' ? c.fundo : undefined,
            })
          )
          .join('') +
        '</a:tr>'
    )
    .join('')
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${o.id}" name="${esc(o.nome)}"/>` +
    '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/>' +
    '</p:nvGraphicFramePr>' +
    `<p:xfrm><a:off x="${cm(o.x)}" y="${cm(o.y)}"/><a:ext cx="${cm(o.w)}" cy="${cm(o.h)}"/></p:xfrm>` +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
    '<a:tbl><a:tblPr firstRow="1" bandRow="1"/>' +
    `<a:tblGrid>${larguras}</a:tblGrid>${cabecalho}${corpo}</a:tbl>` +
    '</a:graphicData></a:graphic></p:graphicFrame>'
  )
}

// Planilha embutida: é ela que faz o "Editar Dados" funcionar no PowerPoint.
function planilha(cats, series) {
  const linhas = []
  const cel = (ref, texto) => `<c r="${ref}" t="inlineStr"><is><t>${esc(texto)}</t></is></c>`
  const num = (ref, v) => `<c r="${ref}"><v>${Number(v).toFixed(4)}</v></c>`
  linhas.push(
    `<row r="1">${cel('A1', 'Categoria')}${series
      .map((s, i) => cel(`${String.fromCharCode(66 + i)}1`, s.nome))
      .join('')}</row>`
  )
  cats.forEach((c, l) => {
    const r = l + 2
    linhas.push(
      `<row r="${r}">${cel(`A${r}`, c)}${series
        .map((s, i) => num(`${String.fromCharCode(66 + i)}${r}`, s.valores[l] ?? 0))
        .join('')}</row>`
    )
  })
  const ct =
    XML +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>'
  return zipar([
    { nome: '[Content_Types].xml', dados: ct },
    {
      nome: '_rels/.rels',
      dados: rels([{ id: 'rId1', tipo: TIPO.doc, alvo: 'xl/workbook.xml' }]),
    },
    {
      nome: 'xl/workbook.xml',
      dados:
        XML +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        `xmlns:r="${NS_R}"><sheets><sheet name="Plan1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      nome: 'xl/_rels/workbook.xml.rels',
      dados: rels([
        { id: 'rId1', tipo: `${NS_R}/worksheet`, alvo: 'worksheets/sheet1.xml' },
      ]),
    },
    {
      nome: 'xl/worksheets/sheet1.xml',
      dados:
        XML +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        `<sheetData>${linhas.join('')}</sheetData></worksheet>`,
    },
  ])
}

// ------------------------------------------------------- peças fixas do pacote ---
const TEMA =
  XML +
  `<a:theme xmlns:a="${NS_A}" name="Emendas"><a:themeElements>` +
  '<a:clrScheme name="Emendas">' +
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
  '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
  `<a:dk2><a:srgbClr val="${TINTA}"/></a:dk2><a:lt2><a:srgbClr val="${CARTAO}"/></a:lt2>` +
  `<a:accent1><a:srgbClr val="${AZUL}"/></a:accent1>` +
  `<a:accent2><a:srgbClr val="${VERDE}"/></a:accent2>` +
  `<a:accent3><a:srgbClr val="${MAGENTA}"/></a:accent3>` +
  `<a:accent4><a:srgbClr val="${AMARELO}"/></a:accent4>` +
  '<a:accent5><a:srgbClr val="1BAF7A"/></a:accent5>' +
  `<a:accent6><a:srgbClr val="${VIOLETA}"/></a:accent6>` +
  `<a:hlink><a:srgbClr val="${AZUL}"/></a:hlink>` +
  `<a:folHlink><a:srgbClr val="${VIOLETA}"/></a:folHlink></a:clrScheme>` +
  '<a:fontScheme name="Emendas">' +
  '<a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
  '</a:fontScheme><a:fmtScheme name="Emendas"><a:fillStyleLst>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) +
  '</a:fillStyleLst><a:lnStyleLst>' +
  ('<a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/>' +
    '</a:solidFill><a:prstDash val="solid"/></a:ln>').repeat(3) +
  '</a:lnStyleLst><a:effectStyleLst>' +
  '<a:effectStyle><a:effectLst/></a:effectStyle>'.repeat(3) +
  '</a:effectStyleLst><a:bgFillStyleLst>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'.repeat(3) +
  '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'

const ARVORE_VAZIA =
  '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
  '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>'

const MAPA_CORES =
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" ' +
  'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" ' +
  'hlink="hlink" folHlink="folHlink"/>'

const MASTER =
  XML +
  `<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld>` +
  '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
  ARVORE_VAZIA +
  `</p:cSld>${MAPA_CORES}` +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>'

const LAYOUT =
  XML +
  `<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1">` +
  `<p:cSld name="Em branco">${ARVORE_VAZIA}</p:cSld>` +
  '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'

// ------------------------------------------------------------ os 7 slides ---
function slideCapa(d) {
  const corpo = [
    forma({ id: 2, nome: 'Faixa', x: 0, y: 0, w: 0.55, h: ALT, fundo: ACENTO }),
    forma({
      id: 3, nome: 'Título', x: 2.2, y: 5.4, w: 29, h: 5, ancora: 'b',
      paragrafos: [{ runs: [{ t: d.titulo, sz: 4000, b: true, cor: TINTA, spc: 40 }] }],
    }),
    forma({
      id: 4, nome: 'Subtítulo', x: 2.25, y: 10.7, w: 29, h: 3.4,
      paragrafos: [
        { runs: [{ t: d.escopo, sz: 1800, cor: TINTA_2 }] },
        { antes: 500, runs: [{ t: d.recorte, sz: 1300, cor: FRACA }] },
        {
          antes: 300,
          runs: [{
            // A capa serve às duas bases. As emendas dizem "N emendas · R$ X";
            // o PLOA diz "N dotações · autógrafo R$ X bi". Quem monta a carga
            // escreve a linha; a capa só a posiciona.
            t: d.linhaResumo
              ?? `${fmtInt(d.stats.qtdEmendas)} emendas · ${fmtBRL(d.stats.valorTotal)}`,
            sz: 1300, b: true, cor: TINTA_2,
          }],
        },
      ],
    }),
    forma({
      id: 5, nome: 'Rodapé', x: 2.25, y: 16.6, w: 29, h: 1.2,
      paragrafos: [{ runs: [{ t: `Extraído em ${d.geradoEm} · fonte: ${d.fonte}`, sz: 1000, cor: FRACA }] }],
    }),
  ].join('')
  return { corpo }
}

function cartao(id, o) {
  return forma({
    id, nome: o.rotulo, x: o.x, y: o.y, w: o.w, h: o.h,
    fundo: CARTAO, borda: BORDA, raio: 4200, ancora: 'ctr', recuo: 0.55,
    paragrafos: [
      { algn: o.algn, runs: [{ t: o.rotulo.toUpperCase(), sz: o.sz ? 1200 : 1050, b: true, cor: FRACA, spc: 120 }] },
      { algn: o.algn, antes: 250, runs: [{ t: o.valor, sz: o.sz || 2800, b: true, cor: TINTA }] },
      { algn: o.algn, antes: 250, runs: [{ t: o.nota, sz: 1050, cor: TINTA_2 }] },
    ],
  })
}

function slideCards(d) {
  const heroi = fmtCompacto(d.stats.valorTotal)
  const imp = fmtCompacto(d.totalImpositivas)
  const corpo = [
    forma({
      id: 2, nome: 'Título', x: 1.6, y: 1.2, w: 30.6, h: 1.6,
      paragrafos: [{ runs: [{ t: 'Visão geral', sz: 2400, b: true, cor: TINTA }] }],
    }),
    forma({
      id: 3, nome: 'Recorte', x: 1.6, y: 2.5, w: 30.6, h: 1,
      paragrafos: [{ runs: [{ t: d.recorte, sz: 1100, cor: FRACA }] }],
    }),
    cartao(4, {
      x: 1.6, y: 4.2, w: 15.2, h: 12.4, algn: 'ctr', sz: 5400,
      rotulo: 'Valor total solicitado',
      valor: `R$ ${heroi.valor} ${heroi.unidade}`.trim(),
      nota: `${fmtBRL(d.stats.valorTotal)} · ${fmtInt(d.stats.qtdEmendas)} emendas em ${fmtInt(d.qtdRegistros)} registros`,
    }),
    cartao(5, {
      x: 17.6, y: 4.2, w: 14.6, h: 3.8, algn: 'l',
      rotulo: 'Emendas', valor: fmtInt(d.stats.qtdEmendas),
      nota: 'Emendas distintas no recorte',
    }),
    cartao(6, {
      x: 17.6, y: 8.5, w: 14.6, h: 3.8, algn: 'l',
      rotulo: 'Parlamentares', valor: fmtInt(d.stats.qtdParlamentares),
      nota: 'Autores distintos das emendas',
    }),
    cartao(7, {
      x: 17.6, y: 12.8, w: 14.6, h: 3.8, algn: 'l',
      rotulo: 'Impositivas', valor: `R$ ${imp.valor} ${imp.unidade}`.trim(),
      nota: `RP6 + RP7 · ${fmtPct(d.pctImpositivas)} do total`,
    }),
    forma({
      id: 8, nome: 'Fonte', x: 1.6, y: 17.1, w: 30.6, h: 1,
      paragrafos: [{ runs: [{ t: `${d.escopo} · extraído em ${d.geradoEm}`, sz: 900, cor: FRACA }] }],
    }),
  ].join('')
  return { corpo }
}

// Slide de um painel: título, subtítulo, total e o conteúdo — que pode ser um
// gráfico (peça `chart` própria) ou uma tabela (desenhada no próprio slide).
// Quantas categorias cabem, sem sobreposição, num slide — separado para tabela
// e para gráfico porque a linha de tabela é mais alta que uma barra horizontal.
// Painéis com mais categorias que isso geram vários slides (2/3, 3/3…), em vez
// de amontoar tudo num quadro só.
const MAX_LINHAS_TABELA = 16
const MAX_BARRAS = 22

// Divide uma lista em blocos de tamanho `n`.
function emBlocos(lista, n) {
  const blocos = []
  for (let i = 0; i < lista.length; i += n) blocos.push(lista.slice(i, i + n))
  return blocos
}

// Quebra um painel em N páginas quando ele tem categorias demais para um slide.
// Devolve sempre um array de painéis (uma página = um painel), já com o sufixo
// "(k/total)" no título. Painéis curtos voltam como um array de um elemento.
// Só pagina o que tem categorias enumeráveis: uma tabela (`tabela.linhas`) ou um
// gráfico de barras cuja fonte de categorias foi anexada em `paginavel`.
function paginarPainel(o) {
  // Tabela: fatiar as linhas, mantendo cabeçalho e larguras.
  if (o.tabela && o.tabela.linhas.length > MAX_LINHAS_TABELA) {
    const blocos = emBlocos(o.tabela.linhas, MAX_LINHAS_TABELA)
    return blocos.map((linhas, i) => ({
      ...o,
      titulo: `${o.titulo} (${i + 1}/${blocos.length})`,
      tabela: { ...o.tabela, linhas },
    }))
  }
  // Barras: fatiar categorias e os valores de cada série em paralelo. O painel
  // anexa `paginavel = { cats, series, construir }` — `construir(cats, series)`
  // devolve um novo `{ grafico, planilha }` para o bloco.
  if (o.paginavel && o.paginavel.cats.length > (o.paginavel.porBloco ?? MAX_BARRAS)) {
    const { cats, series, construir } = o.paginavel
    const blocosCats = emBlocos(cats, o.paginavel.porBloco ?? MAX_BARRAS)
    let base = 0
    return blocosCats.map((fatiaCats, i) => {
      const ini = base
      base += fatiaCats.length
      const fatiaSeries = series.map((s) => ({ ...s, valores: s.valores.slice(ini, ini + fatiaCats.length) }))
      const { grafico, planilha } = construir(fatiaCats, fatiaSeries)
      return {
        ...o,
        titulo: `${o.titulo} (${i + 1}/${blocosCats.length})`,
        grafico,
        planilha,
      }
    })
  }
  return [o]
}

// Monta o(s) slide(s) de UM painel. Retorna sempre um array: um painel longo
// vira vários slides paginados; um curto, um slide só.
function slideGrafico(d, o) {
  return paginarPainel(o).map((pg) => umSlideGrafico(d, pg))
}

function umSlideGrafico(d, o) {
  const corpo = [
    forma({
      id: 2, nome: 'Título', x: 1.6, y: 1.1, w: 20, h: 1.5,
      paragrafos: [{ runs: [{ t: o.titulo, sz: 2400, b: true, cor: TINTA }] }],
    }),
    forma({
      id: 3, nome: 'Subtítulo', x: 1.6, y: 2.4, w: 24, h: 1,
      paragrafos: [{ runs: [{ t: o.sub, sz: 1200, cor: FRACA }] }],
    }),
    // caixa larga: o total do slide dos autores leva o percentual junto e
    // quebrava em duas linhas quando o espaço era o de um número só.
    forma({
      id: 4, nome: 'Total', x: 21.2, y: 1.1, w: 11, h: 1.8, ancora: 'ctr',
      paragrafos: [{ algn: 'r', runs: [{ t: o.total || '', sz: 2000, b: true, cor: TINTA }] }],
    }),
    o.tabela
      ? tabela({ ...o.tabela, id: 5, nome: o.titulo, x: 1.4, y: 3.5, w: 31, h: 13.5 })
      : quadroGrafico({ id: 5, nome: o.titulo, x: 1.4, y: 3.5, w: 31, h: 13.5, rel: 'rId2' }),
    forma({
      id: 6, nome: 'Rodapé', x: 1.6, y: 17.2, w: 30.6, h: 1.1,
      paragrafos: [{ runs: [{ t: `${o.recorte ?? d.recorte} · extraído em ${d.geradoEm}`, sz: 900, cor: FRACA }] }],
    }),
  ].join('')
  return { corpo, grafico: o.grafico, planilha: o.planilha }
}

// ---------------------------------------------------------------- painéis ---
// Cada painel da tela vira uma entrada aqui, com um `id` estável. É esse id que
// o botão PPTX de cada gráfico usa para exportar UM slide, e é a mesma lista
// que monta o baralho inteiro — o slide avulso e o do baralho são o mesmo
// código, então não têm como divergir.

function paineisDashboard(d) {
  const rp = d.porRP.filter((x) => x.valor > 0).map((x) => ({ ...x, cor: corSolida(corDoRP(x.rp)) }))
  const imp = d.impositivas.filter((x) => x.valor > 0).map((x) => ({ ...x, cor: corSolida(x.cor) }))
  const catsA = d.autores.map((a) => (a.uf && a.uf !== 'NA' ? `${a.nome} · ${a.uf}` : a.nome))
  const serieA = [{ nome: 'Valor (R$ milhões)', cor: VERDE, valores: d.autores.map((a) => a.valor / 1e6) }]
  const catsC = d.cmila.map((c) => c.nome)
  const serieC = [
    { nome: 'RP6', cor: MAGENTA, valores: d.cmila.map((c) => c.rp6 / 1e6) },
    { nome: 'RP7', cor: AMARELO, valores: d.cmila.map((c) => c.rp7 / 1e6) },
  ]
  const catsP = d.partidos.map((p) => p.partido)
  const serieP = [{ nome: 'Valor (R$ milhões)', cor: VIOLETA, valores: d.partidos.map((p) => p.valor / 1e6) }]

  return [
    {
      id: 'rp',
      titulo: 'Emendas parlamentares ao PLOA',
      sub: 'Valor solicitado por identificador de resultado primário (RP)',
      total: fmtMilhoes(d.stats.valorTotal),
      grafico: graficoRosca(rp),
      planilha: planilha(rp.map((x) => x.rotulo), [
        { nome: 'Valor (R$ milhões)', valores: rp.map((x) => x.valor / 1e6) },
      ]),
    },
    {
      id: 'impositivas',
      titulo: 'Emendas impositivas',
      sub: 'RP6 por tipo de autor · RP7 por bancada',
      total: fmtMilhoes(d.totalImpositivas),
      grafico: graficoRosca(imp),
      planilha: planilha(imp.map((x) => x.rotulo), [
        { nome: 'Valor (R$ milhões)', valores: imp.map((x) => x.valor / 1e6) },
      ]),
    },
    {
      id: 'autores',
      titulo: '10 maiores autores',
      sub: 'Deputados Federais e Senadores, por valor total · verde = Câmara, azul = Senado',
      total: `${fmtMilhoes(d.totalAutores)} (${fmtPct(d.pctAutoresRP6)} do RP6)`,
      grafico: graficoBarras({
        cats: catsA,
        series: serieA,
        cores: d.autores.map((a) => (a.sigla === 'Sen' ? AZUL : a.sigla === 'Dep' ? VERDE : FRACA)),
      }),
      planilha: planilha(catsA, serieA),
    },
    {
      id: 'cmila',
      titulo: 'Impositivas por C Mil A',
      sub: 'Somente UO do Exército (Comando do Exército, IMBEL e Fundo do Exército)',
      total: fmtMilhoes(d.totalCMilA),
      grafico: graficoBarras({ cats: catsC, series: serieC, empilhado: true, legenda: true }),
      planilha: planilha(catsC, serieC),
    },
    {
      id: 'partidos',
      titulo: 'Emendas por partido',
      sub: 'Exclui comissões e bancadas (sem partido)',
      total: fmtMilhoes(d.totalPartidos),
      grafico: graficoBarras({ cats: catsP, series: serieP }),
      planilha: planilha(catsP, serieP),
      paginavel: {
        cats: catsP, series: serieP,
        construir: (cats, series) => ({
          grafico: graficoBarras({ cats, series }),
          planilha: planilha(cats, series),
        }),
      },
    },
  ]
}

// Larguras da tabela: as colunas de número recebem uma largura fixa confortável
// (2,4 cm cabe "5.933,8" a 9,5 pt) e a primeira coluna fica com toda a sobra —
// é ela que leva nomes longos como "Comando Militar da Amazônia Oriental".
// Com muitos anos a coluna de nome encolhe até um piso e a fonte é que cede.
function larguraTabela(nColunas) {
  const dado = 2.4
  const primeira = Math.max(5.5, 31 - dado * (nColunas - 1))
  const resto = (31 - primeira) / (nColunas - 1)
  return [primeira, ...Array.from({ length: nColunas - 1 }, () => resto)]
}

function paineisHistorico(d) {
  const anos = d.anos
  // Nas tabelas o número vai sem "R$" e sem "mi": a unidade é dita uma vez, no
  // subtítulo, e a coluna fica estreita o suficiente para caber oito anos.
  const fmtM = (v) =>
    (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const emMilhoes = 'valores em R$ milhões'
  // Linha da matriz: nome + um valor por ano + total, com o fundo indicando a
  // variação sobre o ano anterior — a mesma leitura da tela.
  const linhaMatriz = (l) => {
    const celulas = l.valores.map((v, i) => {
      const anterior = i > 0 ? l.valores[i - 1] || 0 : 0
      const subiu = i > 0 && anterior > 0 && v > anterior
      const desceu = i > 0 && anterior > 0 && v < anterior
      return {
        t: v > 0 ? fmtM(v) : '—',
        fundo: subiu ? 'DDE9F8' : desceu ? 'FBE3D8' : undefined,
      }
    })
    return [l.rotulo, ...celulas, { t: fmtM(l.total), b: true }]
  }
  const matriz = (m, rotuloColuna) => ({
    cabecalho: [rotuloColuna, ...anos, 'Total'],
    larguras: larguraTabela(anos.length + 2),
    linhas: m.series.map(linhaMatriz),
  })

  return [
    {
      id: 'hist-valor',
      titulo: 'Valor apresentado por ano',
      sub: 'Total solicitado em cada exercício',
      total: fmtMilhoes(d.totalPeriodo),
      grafico: graficoBarras({
        cats: anos,
        series: [{ nome: 'Valor (R$ milhões)', cor: AZUL, valores: d.serieValor.map((v) => v / 1e6) }],
        vertical: true,
      }),
      planilha: planilha(anos, [{ nome: 'Valor (R$ milhões)', valores: d.serieValor.map((v) => v / 1e6) }]),
    },
    {
      id: 'hist-contagem',
      titulo: 'Emendas e parlamentares por ano',
      sub: 'Quantidade de emendas distintas e de autores distintos · tracejado = tendência linear',
      total: `${fmtInt(d.serieEmendas.reduce((a, b) => a + b, 0))} emendas`,
      grafico: graficoBarras({
        cats: anos,
        series: [
          { nome: 'Emendas', cor: AZUL, valores: d.serieEmendas },
          { nome: 'Parlamentares', cor: VERDE, valores: d.serieParlamentares },
        ],
        vertical: true, legenda: true, formato: FMT_INT, tendencia: true,
      }),
      planilha: planilha(anos, [
        { nome: 'Emendas', valores: d.serieEmendas },
        { nome: 'Parlamentares', valores: d.serieParlamentares },
      ]),
    },
    {
      id: 'hist-impositivas',
      titulo: 'Emendas impositivas por ano',
      sub: 'RP6 (individual) + RP7 (bancada)',
      total: fmtMilhoes(d.serieImpositivo.reduce((a, b) => a + b, 0)),
      grafico: graficoBarras({
        cats: anos,
        series: d.impositivasPorAno.map((s) => ({
          nome: s.rotulo, cor: corSolida(s.cor), valores: s.valores.map((v) => v / 1e6),
        })),
        vertical: true, empilhado: true, legenda: true,
      }),
      planilha: planilha(anos, d.impositivasPorAno.map((s) => ({
        nome: s.rotulo, valores: s.valores.map((v) => v / 1e6),
      }))),
    },
    {
      id: 'hist-rp',
      titulo: 'Composição por RP',
      sub: 'Participação de cada identificador de resultado primário no ano',
      total: '',
      grafico: graficoBarras({
        cats: anos,
        series: d.rpPorAno.map((s) => ({
          nome: s.rotulo, cor: corSolida(s.cor), valores: s.valores.map((v) => v / 1e6),
        })),
        vertical: true, proporcao: true, legenda: true, apagarAbaixo: 0.06,
      }),
      planilha: planilha(anos, d.rpPorAno.map((s) => ({
        nome: s.rotulo, valores: s.valores.map((v) => v / 1e6),
      }))),
    },
    {
      id: 'hist-modalidade',
      titulo: 'Composição por modalidade',
      sub: 'Individual, bancada estadual, comissão e relator — participação no ano',
      total: '',
      grafico: graficoBarras({
        cats: anos,
        series: d.modalidadePorAno.map((s) => ({
          nome: s.rotulo, cor: corSolida(s.cor), valores: s.valores.map((v) => v / 1e6),
        })),
        vertical: true, proporcao: true, legenda: true, apagarAbaixo: 0.06,
      }),
      planilha: planilha(anos, d.modalidadePorAno.map((s) => ({
        nome: s.rotulo, valores: s.valores.map((v) => v / 1e6),
      }))),
    },
    {
      id: 'hist-forca',
      titulo: 'Por Força',
      sub: `Valor solicitado por Força, consolidando as UO de cada uma · ${emMilhoes} · azul = aumento, laranja = queda`,
      total: '',
      tabela: matriz(d.forcaPorAno, 'Força'),
      recorte: d.recorteForca,
    },
    {
      id: 'hist-cmila',
      titulo: 'Impositivas por C Mil A',
      sub: `RP6 + RP7 nas UO do Exército · ${emMilhoes} · azul = aumento, laranja = queda`,
      total: '',
      tabela: matriz(d.cmilaPorAno, 'C Mil A'),
    },
    {
      id: 'hist-partidos',
      titulo: 'Partidos por ano',
      sub: `12 maiores no período · exclui comissões e bancadas · ${emMilhoes}`,
      total: '',
      tabela: matriz(d.partidosPorAno, 'Partido'),
    },
    {
      id: 'hist-autores',
      titulo: 'Autores recorrentes',
      sub: `Parlamentares ordenados por número de exercícios com emenda apresentada · ${emMilhoes}`,
      total: '',
      tabela: matriz(d.autoresPorAno, 'Parlamentar'),
    },
  ]
}

// Slide de resumo do Histórico: um cartão por exercício, com a variação.
function slideAnos(d) {
  const n = d.anos.length
  // Até 5 exercícios cabem numa fileira; daí em diante o slide vira duas
  // fileiras, senão o cartão fica estreito demais e "R$ 13,4 mi" quebra em
  // três linhas. O corpo do texto também acompanha a largura disponível.
  const colunas = n <= 5 ? n : Math.ceil(n / 2)
  const fileiras = Math.ceil(n / colunas)
  const larg = Math.min(9.6, (31 - 0.6 * (colunas - 1)) / colunas)
  const alt = fileiras === 1 ? 8.6 : 5.6
  const apertado = larg < 6
  const cartoes = d.anos.map((ano, i) => {
    const c = fmtCompacto(d.serieValor[i])
    const varia = i === 0
      ? 'primeiro ano da série'
      : `${d.serieValor[i] >= d.serieValor[i - 1] ? '▲' : '▼'} ${fmtPct(
          Math.abs(((d.serieValor[i] - d.serieValor[i - 1]) / (d.serieValor[i - 1] || 1)) * 100)
        )} vs. ano anterior`
    const col = i % colunas
    const fil = Math.floor(i / colunas)
    return forma({
      id: 10 + i,
      nome: `Ano ${ano}`,
      x: 1.4 + col * (larg + 0.6),
      y: 4.6 + fil * (alt + 0.6),
      w: larg,
      h: alt,
      fundo: CARTAO, borda: BORDA, raio: 4200, ancora: 'ctr', recuo: apertado ? 0.35 : 0.5,
      paragrafos: [
        { runs: [{ t: ano, sz: 1000, b: true, cor: FRACA, spc: 120 }] },
        {
          antes: 200,
          runs: [{
            t: `R$ ${c.valor} ${c.unidade}`.trim(),
            sz: apertado ? 1700 : 2200, b: true, cor: TINTA,
          }],
        },
        { antes: 200, runs: [{ t: varia, sz: apertado ? 800 : 950, b: true, cor: TINTA_2 }] },
        {
          antes: 220,
          runs: [{
            t: `${fmtInt(d.serieEmendas[i])} emendas · ${fmtInt(d.serieParlamentares[i])} parlamentares`,
            sz: apertado ? 800 : 950, cor: TINTA_2,
          }],
        },
        {
          antes: 100,
          runs: [{
            t: `${fmtMilhoes(d.serieImpositivo[i])} impositivas`,
            sz: apertado ? 800 : 950, cor: TINTA_2,
          }],
        },
      ],
    })
  })
  const corpo = [
    forma({
      id: 2, nome: 'Título', x: 1.6, y: 1.2, w: 30.6, h: 1.6,
      paragrafos: [{ runs: [{ t: 'Comparativo por exercício', sz: 2400, b: true, cor: TINTA }] }],
    }),
    forma({
      id: 3, nome: 'Recorte', x: 1.6, y: 2.5, w: 30.6, h: 1.4,
      paragrafos: [{ runs: [{ t: d.recorte, sz: 1100, cor: FRACA }] }],
    }),
    ...cartoes,
    forma({
      id: 40, nome: 'Fonte', x: 1.6, y: 17.1, w: 30.6, h: 1,
      paragrafos: [{ runs: [{ t: `${d.escopo} · extraído em ${d.geradoEm}`, sz: 900, cor: FRACA }] }],
    }),
  ].join('')
  return { corpo }
}

// --------------------------------------------------------- painéis PLOA ---
// Mesma mecânica dos painéis das emendas: uma lista de painéis com `id`
// estável, da qual saem TANTO o baralho inteiro QUANTO o slide avulso — os
// dois não têm como divergir porque são o mesmo código.
//
// A unidade aqui é o BILHÃO (o órgão inteiro, R$ 145 bi), contra o milhão das
// emendas. O formato do rótulo acompanha, senão todo número sairia com seis
// dígitos antes da vírgula.
const FMT_BI = '#,##0.00&quot; bi&quot;'
const bi = (v) => v / 1e9
const fmtBiTxt = (v) =>
  `R$ ${bi(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bi`
const AQUA = '1BAF7A'
const LARANJA = 'EB6834'
// Cores institucionais das Forças (espelham as CSS --forca-*): MD cinza,
// Marinha "branco" (cinza-claro que ainda imprime no slide claro), Aeronáutica
// azul, Exército verde.
const FORCA_MD = '6B7280'
const FORCA_EXERCITO = '1F7A33'
const FORCA_MARINHA = 'C7CED8'
const FORCA_AERONAUTICA = '2A78D6'
const VERMELHO = 'E34948'
const COR_AGREGADO = {
  'MINISTÉRIO DA DEFESA': FORCA_MD,
  'EXÉRCITO': FORCA_EXERCITO,
  'MARINHA': FORCA_MARINHA,
  'AERONÁUTICA': FORCA_AERONAUTICA,
}
const COR_GND_PPTX = {
  1: VERMELHO, 2: VIOLETA, 3: AZUL, 4: VERDE, 5: AQUA, 6: MAGENTA, 9: LARANJA,
}

function paineisPLOA(d) {
  // Início do rito: a planilha do exercício ainda não traz o autógrafo. Os
  // painéis são consolidados pelo PL e o autógrafo é omitido (não vira uma
  // segunda série zerada nem um total R$ 0,00). Espelha a tela e o PDF.
  const semAut = !!d.semAut
  // O RP passou a ser lido pelo PL (a cascata da tela mostra o PL): filtrar por
  // autógrafo apagaria todos os RP no início do rito, quando o autógrafo é 0.
  const rp = d.rps.filter((x) => (x.pl || 0) > 0)
    .map((x) => ({ ...x, cor: corSolida(corDoRP(x.rp)) }))

  const catsForca = d.agregados.map((a) => a.rotulo)
  const catsUO = d.uos.map((u) => `${u.uoCod} — ${u.uo}`)
  // No PPTX exportamos TODAS as ações (a tela pagina de 15 em 15; o slide não
  // tem esse limite e o baralho serve de anexo completo).
  const acoes = d.acoes
  const catsAcao = acoes.map((a) => (a.acaoCod === '—' ? a.acao : `${a.acaoCod} — ${a.acao}`))
  const catsGND = d.gnds.map((g) => `GND ${g.gnd}${g.nome ? ` — ${g.nome}` : ''}`)
  // Par PL/Autógrafo, repetido em vários painéis: é a comparação que esta base
  // existe para mostrar. Em UO e Ação a barra pedida é o PL (o autógrafo entra
  // como segunda série); a ordem aqui deixa o PL como primeira série. No início
  // do rito o autógrafo some e resta só a série do PL.
  const parPLAutografo = (itens) => semAut
    ? [{ nome: 'PL', cor: AZUL, valores: itens.map((x) => bi(x.pl)) }]
    : [
        { nome: 'PL', cor: AZUL, valores: itens.map((x) => bi(x.pl)) },
        { nome: 'Autógrafo', cor: LARANJA, valores: itens.map((x) => bi(x.valor ?? x.autografo)) },
      ]

  return [
    {
      id: 'ploa-forcas',
      titulo: 'Total por Força',
      sub: 'Soma das UO de cada Força e da Administração Direta do MD · valor no PL',
      total: fmtBiTxt(d.agregados.reduce((s, a) => s + a.pl, 0)),
      recorte: d.recorteForca,
      grafico: graficoBarras({
        cats: catsForca,
        series: [{ nome: 'PL (R$ bilhões)', valores: d.agregados.map((a) => bi(a.pl)) }],
        cores: d.agregados.map((a) => COR_AGREGADO[a.id] || ACENTO),
        formato: FMT_BI,
      }),
      planilha: planilha(catsForca, [
        { nome: 'PL (R$ bilhões)', valores: d.agregados.map((a) => bi(a.pl)) },
      ]),
    },
    {
      id: 'ploa-uo',
      titulo: 'Valor por Unidade Orçamentária',
      sub: semAut
        ? 'Todas as UO do órgão 52000 · valor no PL (autógrafo ainda não na planilha)'
        : 'Todas as UO do órgão 52000 · barra = PL, traço = autógrafo',
      total: fmtBiTxt(d.totalPL),
      grafico: graficoBarras({
        cats: catsUO, series: parPLAutografo(d.uos), legenda: true, formato: FMT_BI,
      }),
      planilha: planilha(catsUO, parPLAutografo(d.uos)),
      // Muitas UO (17 sem filtro de Órgão) → pagina em vários slides.
      paginavel: {
        cats: catsUO, series: parPLAutografo(d.uos),
        construir: (cats, series) => ({
          grafico: graficoBarras({ cats, series, legenda: true, formato: FMT_BI }),
          planilha: planilha(cats, series),
        }),
      },
    },
    {
      id: 'ploa-rp',
      titulo: 'Por Identificador de Resultado Primário',
      sub: 'Composição do PL por RP · RP6 e RP7 são as emendas impositivas',
      total: fmtBiTxt(d.totalPL),
      // Colunas por RP, uma cor por RP: a altura de cada coluna dá a leitura de
      // tamanho que a cascata da tela oferece, e sai como gráfico nativo. O
      // valor é o do PL (a cascata da tela também).
      grafico: graficoBarras({
        cats: rp.map((x) => x.rotulo),
        series: [{ nome: 'PL (R$ bilhões)', valores: rp.map((x) => bi(x.pl)) }],
        cores: rp.map((x) => corSolida(corDoRP(x.rp))),
        vertical: true, formato: FMT_BI,
      }),
      planilha: planilha(rp.map((x) => x.rotulo), [
        { nome: 'PL (R$ bilhões)', valores: rp.map((x) => bi(x.pl)) },
      ]),
    },
    {
      id: 'ploa-ciclo',
      titulo: 'Evolução no ciclo de aprovação',
      sub: 'Valor de cada Força em cada fase: PL · Ciclo Setorial · Ciclo Geral · Ciclo Plenário · Autógrafo',
      // Total das QUATRO Forças: este painel ignora o filtro de Órgão, e
      // carimbar aqui o total do recorte filtrado contradiria o próprio gráfico.
      // No início do rito a última fase (autógrafo) é 0, então o total soma o PL.
      total: fmtBiTxt(d.ciclos.reduce((s, a) => s + a.fases[semAut ? 0 : a.fases.length - 1], 0)),
      recorte: d.recorteForca,
      // Colunas verticais: as fases são uma sequência ordenada e vão no eixo,
      // como o ano nos painéis do Histórico.
      grafico: graficoBarras({
        cats: FASES_PPTX,
        series: d.ciclos.map((a) => ({
          nome: a.rotulo, cor: COR_AGREGADO[a.id] || ACENTO, valores: a.fases.map(bi),
        })),
        vertical: true, legenda: true, formato: FMT_BI, rotulos: false,
      }),
      planilha: planilha(FASES_PPTX, d.ciclos.map((a) => ({
        nome: a.rotulo, valores: a.fases.map(bi),
      }))),
    },
    {
      id: 'ploa-pl-autografo',
      titulo: 'Do PL ao Autógrafo',
      sub: semAut
        ? 'Saldo líquido do rito legislativo por Força · autógrafo ainda não na planilha'
        : 'Saldo líquido do rito legislativo por Força',
      total: semAut ? '—' : (() => {
        const s = d.plAutografo.reduce((t2, a) => t2 + (a.autografo - a.pl), 0)
        return `${s >= 0 ? '+' : '−'} ${fmtBiTxt(Math.abs(s))}`
      })(),
      recorte: d.recorteForca,
      grafico: graficoBarras({
        cats: d.plAutografo.map((a) => a.rotulo),
        series: semAut
          ? [{ nome: 'PL', cor: AZUL, valores: d.plAutografo.map((a) => bi(a.pl)) }]
          : [
              { nome: 'PL', cor: AZUL, valores: d.plAutografo.map((a) => bi(a.pl)) },
              { nome: 'Autógrafo', cor: LARANJA, valores: d.plAutografo.map((a) => bi(a.autografo)) },
            ],
        vertical: true, legenda: true, formato: FMT_BI,
      }),
      planilha: planilha(d.plAutografo.map((a) => a.rotulo), semAut
        ? [{ nome: 'PL', valores: d.plAutografo.map((a) => bi(a.pl)) }]
        : [
            { nome: 'PL', valores: d.plAutografo.map((a) => bi(a.pl)) },
            { nome: 'Autógrafo', valores: d.plAutografo.map((a) => bi(a.autografo)) },
          ]),
    },
    {
      id: 'ploa-acao',
      titulo: 'Valor por Ação orçamentária',
      sub: semAut
        ? 'Todas as ações do recorte · valor no PL (autógrafo ainda não na planilha)'
        : 'Todas as ações do recorte · barra = PL, traço = autógrafo',
      total: fmtBiTxt(d.totalPL),
      grafico: graficoBarras({
        cats: catsAcao, series: parPLAutografo(acoes), legenda: true, formato: FMT_BI,
      }),
      planilha: planilha(catsAcao, parPLAutografo(acoes)),
      // Muitas ações → o slide único ficaria ilegível. Pedido do usuário: no
      // máximo 10 ações por slide (o par PL/Autógrafo dá 20 barras por quadro).
      paginavel: {
        cats: catsAcao, series: parPLAutografo(acoes), porBloco: 10,
        construir: (cats, series) => ({
          grafico: graficoBarras({ cats, series, legenda: true, formato: FMT_BI }),
          planilha: planilha(cats, series),
        }),
      },
    },
    {
      id: 'ploa-gnd',
      titulo: 'Valor por Grupo de Natureza da Despesa',
      sub: semAut
        ? 'Composição do PL por GND · valor no PL (autógrafo ainda não na planilha)'
        : 'Composição do PL por GND · barra = PL, traço = autógrafo',
      total: fmtBiTxt(d.totalPL),
      grafico: graficoBarras({
        cats: catsGND, series: parPLAutografo(d.gnds), legenda: true, formato: FMT_BI,
      }),
      planilha: planilha(catsGND, parPLAutografo(d.gnds)),
    },
  ]
}

const FASES_PPTX = ['PL', 'Ciclo Setorial', 'Ciclo Geral', 'Ciclo Plenário', 'Autógrafo']

function paineisHistoricoPLOA(d) {
  const anos = d.anos
  const fmtB = (v) =>
    bi(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const emBilhoes = 'valores em R$ bilhões'
  const linhaMatriz = (l) => {
    const celulas = l.valores.map((v, i) => {
      const anterior = i > 0 ? l.valores[i - 1] || 0 : 0
      const subiu = i > 0 && anterior > 0 && v > anterior
      const desceu = i > 0 && anterior > 0 && v < anterior
      return { t: v > 0 ? fmtB(v) : '—', fundo: subiu ? 'DDE9F8' : desceu ? 'FBE3D8' : undefined }
    })
    return [l.rotulo, ...celulas, { t: fmtB(l.total), b: true }]
  }
  const matriz = (series, rotuloColuna) => ({
    cabecalho: [rotuloColuna, ...anos, 'Total'],
    larguras: larguraTabela(anos.length + 2),
    linhas: series.map(linhaMatriz),
  })

  return [
    {
      id: 'hploa-total',
      titulo: 'Projeto de Lei por exercício',
      sub: 'Somatório do PL enviado pelo Executivo em cada exercício · linha tracejada = tendência',
      total: fmtBiTxt(d.totalPeriodo),
      grafico: graficoBarras({
        cats: anos,
        series: [{ nome: 'PL (R$ bilhões)', cor: AZUL, valores: d.resumoAnos.map((a) => bi(a.pl)) }],
        vertical: true, tendencia: true, formato: FMT_BI,
      }),
      planilha: planilha(anos, [
        { nome: 'PL (R$ bilhões)', valores: d.resumoAnos.map((a) => bi(a.pl)) },
      ]),
    },
    {
      id: 'hploa-rito',
      titulo: 'PL × Autógrafo por exercício',
      sub: 'Quanto o rito legislativo alterou o projeto em cada ano',
      total: (() => {
        const s = d.resumoAnos.reduce((t, a) => t + a.delta, 0)
        return `${s >= 0 ? '+' : '−'} ${fmtBiTxt(Math.abs(s))}`
      })(),
      grafico: graficoBarras({
        cats: anos,
        series: [
          { nome: 'PL', cor: AZUL, valores: d.resumoAnos.map((a) => bi(a.pl)) },
          { nome: 'Autógrafo', cor: LARANJA, valores: d.resumoAnos.map((a) => bi(a.autografo)) },
        ],
        vertical: true, legenda: true, formato: FMT_BI, rotulos: false,
      }),
      planilha: planilha(anos, [
        { nome: 'PL', valores: d.resumoAnos.map((a) => bi(a.pl)) },
        { nome: 'Autógrafo', valores: d.resumoAnos.map((a) => bi(a.autografo)) },
      ]),
    },
    {
      id: 'hploa-ciclo',
      titulo: 'Fases do ciclo por exercício',
      sub: 'As cinco fases lado a lado em cada ano',
      total: fmtBiTxt(d.totalPeriodo),
      grafico: graficoBarras({
        cats: anos,
        series: d.ciclosPorAno.series.map((s, i) => ({
          nome: s.rotulo,
          cor: [VIOLETA, AZUL, VERDE, AQUA, LARANJA][i],
          valores: s.valores.map(bi),
        })),
        vertical: true, legenda: true, formato: FMT_BI, rotulos: false,
      }),
      planilha: planilha(anos, d.ciclosPorAno.series.map((s) => ({
        nome: s.rotulo, valores: s.valores.map(bi),
      }))),
    },
    {
      id: 'hploa-forcas',
      titulo: 'Por Força, ao longo dos exercícios',
      sub: 'Valor no autógrafo de cada Força em cada ano',
      total: fmtBiTxt(d.forcasPorAno.series.reduce((s, x) => s + x.total, 0)),
      recorte: d.recorteForca,
      grafico: graficoBarras({
        cats: d.forcasPorAno.anos,
        series: d.forcasPorAno.series.map((s) => ({
          nome: s.rotulo, cor: COR_AGREGADO[s.chave] || ACENTO, valores: s.valores.map(bi),
        })),
        vertical: true, legenda: true, formato: FMT_BI, rotulos: false,
      }),
      planilha: planilha(d.forcasPorAno.anos, d.forcasPorAno.series.map((s) => ({
        nome: s.rotulo, valores: s.valores.map(bi),
      }))),
    },
    {
      id: 'hploa-rp',
      titulo: 'Composição por RP',
      sub: 'Participação de cada resultado primário no autógrafo de cada ano',
      total: fmtBiTxt(d.totalPeriodo),
      grafico: graficoBarras({
        cats: d.rpPorAno.anos,
        series: d.rpPorAno.series.map((s) => ({
          nome: s.rotulo, cor: corSolida(corDoRP(s.chave)), valores: s.valores.map(bi),
        })),
        vertical: true, proporcao: true, legenda: true, formato: FMT_BI,
      }),
      planilha: planilha(d.rpPorAno.anos, d.rpPorAno.series.map((s) => ({
        nome: s.rotulo, valores: s.valores.map(bi),
      }))),
    },
    {
      id: 'hploa-gnd',
      titulo: 'Composição por GND',
      sub: 'Valor por grupo de natureza da despesa em cada exercício',
      total: fmtBiTxt(d.totalPeriodo),
      grafico: graficoBarras({
        cats: d.gndPorAno.anos,
        series: d.gndPorAno.series.map((s) => ({
          nome: s.rotulo, cor: COR_GND_PPTX[s.chave] || ACENTO, valores: s.valores.map(bi),
        })),
        vertical: true, empilhado: true, legenda: true, formato: FMT_BI,
      }),
      planilha: planilha(d.gndPorAno.anos, d.gndPorAno.series.map((s) => ({
        nome: s.rotulo, valores: s.valores.map(bi),
      }))),
    },
    {
      id: 'hploa-uo',
      titulo: 'Unidades orçamentárias por exercício',
      sub: `Valor no autógrafo · ${emBilhoes}`,
      total: fmtBiTxt(d.uoPorAno.series.reduce((s, l) => s + l.total, 0)),
      tabela: matriz(d.uoPorAno.series, 'Unidade orçamentária'),
    },
    {
      id: 'hploa-acao',
      titulo: 'Ações orçamentárias por exercício',
      sub: `Valor no autógrafo · ${emBilhoes}`,
      total: fmtBiTxt(d.acaoPorAno.series.reduce((s, l) => s + l.total, 0)),
      tabela: matriz(d.acaoPorAno.series, 'Ação orçamentária'),
    },
  ]
}

// Cartões de abertura da seção PLOA: as pontas do rito e o tamanho do recorte.
// O PL é o cartão-herói (a leitura primária desta análise, e o único valor
// presente no início do rito); o autógrafo e o saldo saem em branco enquanto a
// planilha do exercício não os traz. Espelha a tela.
function slideCardsPLOA(d) {
  const semAut = !!d.semAut
  const heroi = fmtCompacto(d.totalPL)
  const aut = fmtCompacto(d.totalAutografo)
  const delta = d.totalAutografo - d.totalPL
  const dc = fmtCompacto(Math.abs(delta))
  const pct = d.totalPL ? (delta / d.totalPL) * 100 : 0
  const corpo = [
    forma({
      id: 2, nome: 'Título', x: 1.6, y: 1.2, w: 30.6, h: 1.6,
      paragrafos: [{ runs: [{ t: 'Visão geral do exercício', sz: 2400, b: true, cor: TINTA }] }],
    }),
    forma({
      id: 3, nome: 'Recorte', x: 1.6, y: 2.5, w: 30.6, h: 1,
      paragrafos: [{ runs: [{ t: d.recorte, sz: 1100, cor: FRACA }] }],
    }),
    cartao(4, {
      x: 1.6, y: 4.2, w: 15.2, h: 12.4, algn: 'ctr', sz: 5400,
      rotulo: 'PL do Executivo',
      valor: `R$ ${heroi.valor} ${heroi.unidade}`.trim(),
      nota: `${fmtBiTxt(d.totalPL)} · ${fmtInt(d.qtdDotacoes)} dotações`,
    }),
    cartao(5, {
      x: 17.6, y: 4.2, w: 14.6, h: 3.8, algn: 'l',
      rotulo: 'Autógrafo — valor final',
      valor: semAut ? '—' : `R$ ${aut.valor} ${aut.unidade}`.trim(),
      nota: semAut ? 'Ainda não disponível na planilha' : `${fmtBiTxt(d.totalAutografo)} · fim do rito`,
    }),
    cartao(6, {
      x: 17.6, y: 8.5, w: 14.6, h: 3.8, algn: 'l',
      rotulo: 'Saldo do rito',
      valor: semAut ? '—' : `${delta >= 0 ? '+' : '−'} R$ ${dc.valor} ${dc.unidade}`.trim(),
      nota: semAut ? 'PL → autógrafo · —' : `PL → autógrafo · ${delta >= 0 ? '+' : '−'}${fmtPct(Math.abs(pct))}`,
    }),
    cartao(7, {
      x: 17.6, y: 12.8, w: 14.6, h: 3.8, algn: 'l',
      rotulo: 'Unidades orçamentárias', valor: fmtInt(d.uos.length),
      nota: 'UO com dotação no recorte',
    }),
    forma({
      id: 8, nome: 'Fonte', x: 1.6, y: 17.1, w: 30.6, h: 1,
      paragrafos: [{ runs: [{ t: `${d.escopo} · extraído em ${d.geradoEm}`, sz: 900, cor: FRACA }] }],
    }),
  ].join('')
  return { corpo }
}

// Cartões de abertura do Histórico PLOA: um por exercício, com PL, autógrafo e
// o saldo do rito. Com cinco exercícios cabem numa fileira só.
function slideAnosPLOA(d) {
  const n = d.resumoAnos.length || 1
  const larg = Math.min(9.5, (30.6 - (n - 1) * 0.8) / n)
  const apertado = larg < 7
  const cartoes = d.resumoAnos.map((a, i) => {
    const c = fmtCompacto(a.autografo)
    const varia = a.variacao === null || !Number.isFinite(a.variacao)
      ? 'primeiro da série'
      : `${a.variacao >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(a.variacao))} vs. anterior`
    return cartao(10 + i, {
      x: 1.6 + i * (larg + 0.8), y: 5.2, w: larg, h: 9.6, algn: 'l',
      rotulo: a.ano, sz: apertado ? 1700 : 2200,
      valor: `R$ ${c.valor} ${c.unidade}`.trim(),
      nota: `${varia}\nPL ${fmtBiTxt(a.pl)}\nsaldo ${a.delta >= 0 ? '+' : '−'} ${fmtBiTxt(Math.abs(a.delta))}`,
    })
  })
  const corpo = [
    forma({
      id: 2, nome: 'Título', x: 1.6, y: 1.2, w: 30.6, h: 1.6,
      paragrafos: [{ runs: [{ t: 'Comparativo por exercício', sz: 2400, b: true, cor: TINTA }] }],
    }),
    forma({
      id: 3, nome: 'Recorte', x: 1.6, y: 2.5, w: 30.6, h: 1.4,
      paragrafos: [{ runs: [{ t: d.recorte, sz: 1100, cor: FRACA }] }],
    }),
    ...cartoes,
    forma({
      id: 40, nome: 'Fonte', x: 1.6, y: 17.1, w: 30.6, h: 1,
      paragrafos: [{ runs: [{ t: `${d.escopo} · extraído em ${d.geradoEm}`, sz: 900, cor: FRACA }] }],
    }),
  ].join('')
  return { corpo }
}

function montarSlides(d) {
  return [slideCapa(d), slideCards(d), ...paineisDashboard(d).flatMap((o) => slideGrafico(d, o))]
}

function montarSlidesHistorico(d) {
  return [slideCapa(d), slideAnos(d), ...paineisHistorico(d).flatMap((o) => slideGrafico(d, o))]
}

function montarSlidesPLOA(d) {
  return [slideCapa(d), slideCardsPLOA(d), ...paineisPLOA(d).flatMap((o) => slideGrafico(d, o))]
}

function montarSlidesHistoricoPLOA(d) {
  return [slideCapa(d), slideAnosPLOA(d), ...paineisHistoricoPLOA(d).flatMap((o) => slideGrafico(d, o))]
}

// ------------------------------------------------------------- montagem ---
// Monta o .pptx a partir de uma lista de slides já construídos. Serve aos três
// usos: o baralho do Dashboard, o do Histórico e o slide avulso de um gráfico.
function baixarPacote(d, slides, nomeBase) {
  const arquivos = []
  const tiposOverride = []
  const relsApresentacao = [
    { id: 'rId1', tipo: TIPO.master, alvo: 'slideMasters/slideMaster1.xml' },
    { id: 'rId2', tipo: TIPO.tema, alvo: 'theme/theme1.xml' },
  ]
  const idsSlide = []
  let nGrafico = 0

  slides.forEach((s, i) => {
    const n = i + 1
    const relSlide = [{ id: 'rId1', tipo: TIPO.layout, alvo: '../slideLayouts/slideLayout1.xml' }]

    if (s.grafico) {
      nGrafico += 1
      relSlide.push({ id: 'rId2', tipo: TIPO.chart, alvo: `../charts/chart${nGrafico}.xml` })
      arquivos.push({ nome: `ppt/charts/chart${nGrafico}.xml`, dados: s.grafico })
      arquivos.push({
        nome: `ppt/charts/_rels/chart${nGrafico}.xml.rels`,
        dados: rels([{ id: 'rId1', tipo: TIPO.pacote, alvo: `../embeddings/dados${nGrafico}.xlsx` }]),
      })
      arquivos.push({ nome: `ppt/embeddings/dados${nGrafico}.xlsx`, dados: s.planilha })
      tiposOverride.push(
        `<Override PartName="/ppt/charts/chart${nGrafico}.xml" ` +
        'ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>'
      )
    }

    arquivos.push({ nome: `ppt/slides/slide${n}.xml`, dados: slideXML(s.corpo) })
    arquivos.push({ nome: `ppt/slides/_rels/slide${n}.xml.rels`, dados: rels(relSlide) })
    tiposOverride.push(
      `<Override PartName="/ppt/slides/slide${n}.xml" ` +
      'ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
    )
    const rid = `rId${n + 2}`
    relsApresentacao.push({ id: rid, tipo: TIPO.slide, alvo: `slides/slide${n}.xml` })
    idsSlide.push(`<p:sldId id="${255 + n}" r:id="${rid}"/>`)
  })

  const apresentacao =
    XML +
    `<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1">` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    `<p:sldIdLst>${idsSlide.join('')}</p:sldIdLst>` +
    `<p:sldSz cx="${cm(LARG)}" cy="${cm(ALT)}"/><p:notesSz cx="${cm(ALT)}" cy="${cm(LARG)}"/>` +
    '</p:presentation>'

  const core =
    XML +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${esc(d.titulo)}</dc:title><dc:subject>${esc(d.escopo)}</dc:subject>` +
    '<cp:revision>1</cp:revision></cp:coreProperties>'

  const contentTypes =
    XML +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>' +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    tiposOverride.join('') +
    '</Types>'

  const pacote = [
    { nome: '[Content_Types].xml', dados: contentTypes },
    {
      nome: '_rels/.rels',
      dados: rels([
        { id: 'rId1', tipo: TIPO.doc, alvo: 'ppt/presentation.xml' },
        { id: 'rId2', tipo: TIPO.core, alvo: 'docProps/core.xml' },
      ]),
    },
    { nome: 'docProps/core.xml', dados: core },
    { nome: 'ppt/presentation.xml', dados: apresentacao },
    { nome: 'ppt/_rels/presentation.xml.rels', dados: rels(relsApresentacao) },
    { nome: 'ppt/theme/theme1.xml', dados: TEMA },
    { nome: 'ppt/slideMasters/slideMaster1.xml', dados: MASTER },
    {
      nome: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      dados: rels([
        { id: 'rId1', tipo: TIPO.layout, alvo: '../slideLayouts/slideLayout1.xml' },
        { id: 'rId2', tipo: TIPO.tema, alvo: '../theme/theme1.xml' },
      ]),
    },
    { nome: 'ppt/slideLayouts/slideLayout1.xml', dados: LAYOUT },
    {
      nome: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      dados: rels([{ id: 'rId1', tipo: TIPO.master, alvo: '../slideMasters/slideMaster1.xml' }]),
    },
    ...arquivos,
  ]

  const bytes = zipar(pacote)
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
  baixar(blob, nomeArquivo(nomeBase, 'pptx'))
}

// Baralho completo do Dashboard: capa, cards e um slide por gráfico.
export function exportarPPTX(d) {
  baixarPacote(d, montarSlides(d), 'emendas apresentadas ao ploa')
}

// Baralho completo da aba Histórico: capa, cartões por exercício e um slide
// por painel (gráficos nativos e tabelas editáveis).
export function exportarPPTXHistorico(d) {
  baixarPacote(d, montarSlidesHistorico(d), 'historico das emendas ao ploa')
}

// Baralho completo do Dashboard PLOA e do Histórico PLOA.
export function exportarPPTXPLOA(d) {
  baixarPacote(d, montarSlidesPLOA(d), 'ploa despesas por fase de elaboracao')
}

export function exportarPPTXHistoricoPLOA(d) {
  baixarPacote(d, montarSlidesHistoricoPLOA(d), 'historico do ploa por exercicio')
}

// Um gráfico, um slide. `id` é o mesmo identificador usado na lista de painéis,
// então o slide avulso sai idêntico ao do baralho. O prefixo do id diz de qual
// das quatro listas ele vem — é o que mantém as duas bases separadas sem
// precisar de um parâmetro extra em cada botão da tela.
const LISTAS_DE_PAINEIS = [
  ['hploa-', paineisHistoricoPLOA],
  ['ploa-', paineisPLOA],
  ['hist-', paineisHistorico],
]

export function exportarSlidePPTX(d, id) {
  const entrada = LISTAS_DE_PAINEIS.find(([prefixo]) => id.startsWith(prefixo))
  const paineis = entrada ? entrada[1](d) : paineisDashboard(d)
  const painel = paineis.find((p) => p.id === id)
  if (!painel) throw new Error(`painel desconhecido: ${id}`)
  // slideGrafico já pagina: um painel longo vira mais de um slide também no
  // avulso, então o botão de um gráfico grande baixa um .pptx com N páginas.
  baixarPacote(d, slideGrafico(d, painel), painel.titulo)
}
