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

import { corDoRP } from './components/GraficoPizza.jsx'
import { fmtBRL, fmtInt, fmtMilhoes, fmtPct, fmtCompacto } from './dados.js'
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
function graficoRosca(itens) {
  const cats = itens.map((d) => d.rotulo)
  const vals = itens.map((d) => d.valor / 1e6)
  const cores = itens.map((d) => d.cor)
  const dLbls =
    '<c:dLbls>' + SEM_PINTURA + txPr(1200, TINTA, true) +
    '<c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/>' +
    '<c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/></c:dLbls>'
  const ser =
    '<c:ser><c:idx val="0"/><c:order val="0"/>' + refNome('Valor (R$ milhões)', 'B') +
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

// Barras horizontais. `series` = [{ nome, valores, cor }]; `cores` opcional
// pinta ponto a ponto (usado no ranking de autores).
function graficoBarras({ cats, series, empilhado, cores, legenda }) {
  const ax1 = 111111111
  const ax2 = 222222222
  const posRotulo = empilhado ? 'ctr' : 'outEnd'
  // `apagados` são os <c:dLbl> individuais (idx + delete) e, pelo schema,
  // precisam vir ANTES das propriedades comuns dentro de <c:dLbls>.
  const dLbls = (apagados = '') =>
    '<c:dLbls>' + apagados +
    `<c:numFmt formatCode="${FMT_MI}" sourceLinked="0"/>` + SEM_PINTURA +
    txPr(1050, TINTA_2, true) + `<c:dLblPos val="${posRotulo}"/>` +
    '<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/>' +
    '<c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>'

  const sers = series
    .map((s, i) => {
      const col = String.fromCharCode(66 + i) // B, C, …
      const pinta = cores
        ? pontos(cores)
        : ''
      // Segmento zerado não ganha rótulo: no empilhado o "0,0 mi" ficava
      // solto ao lado da barra e colidia com o rótulo do segmento vizinho.
      const apagados = s.valores
        .map((v, j) => (v > 0 ? '' : `<c:dLbl><c:idx val="${j}"/><c:delete val="1"/></c:dLbl>`))
        .join('')
      return (
        `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>` + refNome(s.nome, col) +
        `<c:spPr><a:solidFill><a:srgbClr val="${s.cor}"/></a:solidFill>` +
        '<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr>' +
        '<c:invertIfNegative val="0"/>' + pinta + dLbls(apagados) +
        refCat(cats) + refVal(s.valores, col) + '</c:ser>'
      )
    })
    .join('')

  const grafico =
    '<c:barChart><c:barDir val="bar"/>' +
    `<c:grouping val="${empilhado ? 'stacked' : 'clustered'}"/>` +
    `<c:varyColors val="0"/>${sers}${dLbls()}` +
    `<c:gapWidth val="${empilhado ? 50 : 45}"/><c:overlap val="${empilhado ? 100 : -27}"/>` +
    `<c:axId val="${ax1}"/><c:axId val="${ax2}"/></c:barChart>`

  const catAx =
    `<c:catAx><c:axId val="${ax1}"/><c:scaling><c:orientation val="maxMin"/></c:scaling>` +
    '<c:delete val="0"/><c:axPos val="l"/><c:numFmt formatCode="General" sourceLinked="1"/>' +
    '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
    `<c:spPr><a:noFill/><a:ln w="9525"><a:solidFill><a:srgbClr val="${BORDA}"/></a:solidFill></a:ln></c:spPr>` +
    txPr(1100, TINTA) +
    `<c:crossAx val="${ax2}"/><c:crosses val="autoZero"/><c:auto val="1"/>` +
    '<c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>'

  const valAx =
    `<c:valAx><c:axId val="${ax2}"/><c:scaling><c:orientation val="minMax"/></c:scaling>` +
    '<c:delete val="1"/><c:axPos val="b"/>' +
    `<c:numFmt formatCode="${FMT_MI}" sourceLinked="0"/>` +
    '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="none"/>' +
    txPr(1000, FRACA) +
    `<c:crossAx val="${ax1}"/><c:crosses val="max"/><c:crossBetween val="between"/></c:valAx>`

  return envelope(
    '<c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>' + grafico + catAx + valAx +
    SEM_PINTURA + '</c:plotArea>' +
    (legenda
      ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txPr(1200, TINTA_2)}</c:legend>`
      : '') +
    '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>'
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
            t: `${fmtInt(d.stats.qtdEmendas)} emendas · ${fmtBRL(d.stats.valorTotal)}`,
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

function slideGrafico(d, o) {
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
      paragrafos: [{ algn: 'r', runs: [{ t: o.total, sz: 2000, b: true, cor: TINTA }] }],
    }),
    quadroGrafico({ id: 5, nome: o.titulo, x: 1.4, y: 3.5, w: 31, h: 13.5, rel: 'rId2' }),
    forma({
      id: 6, nome: 'Rodapé', x: 1.6, y: 17.2, w: 30.6, h: 1.1,
      paragrafos: [{ runs: [{ t: `${d.recorte} · extraído em ${d.geradoEm}`, sz: 900, cor: FRACA }] }],
    }),
  ].join('')
  return { corpo, grafico: o.grafico, planilha: o.planilha }
}

function montarSlides(d) {
  const s = []
  s.push(slideCapa(d))
  s.push(slideCards(d))

  // 3 — rosca por RP
  const rp = d.porRP.filter((x) => x.valor > 0).map((x) => ({ ...x, cor: corSolida(corDoRP(x.rp)) }))
  s.push(slideGrafico(d, {
    titulo: 'Emendas parlamentares ao PLOA',
    sub: 'Valor solicitado por identificador de resultado primário (RP)',
    total: fmtMilhoes(d.stats.valorTotal),
    grafico: graficoRosca(rp),
    planilha: planilha(rp.map((x) => x.rotulo), [
      { nome: 'Valor (R$ milhões)', valores: rp.map((x) => x.valor / 1e6) },
    ]),
  }))

  // 4 — rosca das impositivas
  const imp = d.impositivas.filter((x) => x.valor > 0).map((x) => ({ ...x, cor: corSolida(x.cor) }))
  s.push(slideGrafico(d, {
    titulo: 'Emendas impositivas',
    sub: 'RP6 por tipo de autor · RP7 por bancada',
    total: fmtMilhoes(d.totalImpositivas),
    grafico: graficoRosca(imp),
    planilha: planilha(imp.map((x) => x.rotulo), [
      { nome: 'Valor (R$ milhões)', valores: imp.map((x) => x.valor / 1e6) },
    ]),
  }))

  // 5 — 10 maiores autores
  const catsA = d.autores.map((a) => (a.uf && a.uf !== 'NA' ? `${a.nome} · ${a.uf}` : a.nome))
  const serieA = [{ nome: 'Valor (R$ milhões)', cor: VERDE, valores: d.autores.map((a) => a.valor / 1e6) }]
  s.push(slideGrafico(d, {
    titulo: '10 maiores autores',
    sub: 'Deputados Federais e Senadores, por valor total · verde = Câmara, azul = Senado',
    total: `${fmtMilhoes(d.totalAutores)} (${fmtPct(d.pctAutoresRP6)} do RP6)`,
    grafico: graficoBarras({
      cats: catsA,
      series: serieA,
      cores: d.autores.map((a) => (a.sigla === 'Sen' ? AZUL : VERDE)),
    }),
    planilha: planilha(catsA, serieA),
  }))

  // 6 — impositivas por C Mil A (empilhado RP6 + RP7)
  const catsC = d.cmila.map((c) => c.nome)
  const serieC = [
    { nome: 'RP6', cor: MAGENTA, valores: d.cmila.map((c) => c.rp6 / 1e6) },
    { nome: 'RP7', cor: AMARELO, valores: d.cmila.map((c) => c.rp7 / 1e6) },
  ]
  s.push(slideGrafico(d, {
    titulo: 'Impositivas por C Mil A',
    sub: 'Somente UO do Exército (Comando do Exército e IMBEL)',
    total: fmtMilhoes(d.totalCMilA),
    grafico: graficoBarras({ cats: catsC, series: serieC, empilhado: true, legenda: true }),
    planilha: planilha(catsC, serieC),
  }))

  // 7 — emendas por partido
  const catsP = d.partidos.map((p) => p.partido)
  const serieP = [{ nome: 'Valor (R$ milhões)', cor: VIOLETA, valores: d.partidos.map((p) => p.valor / 1e6) }]
  s.push(slideGrafico(d, {
    titulo: 'Emendas por partido',
    sub: 'Exclui comissões e bancadas (sem partido)',
    total: fmtMilhoes(d.totalPartidos),
    grafico: graficoBarras({ cats: catsP, series: serieP }),
    planilha: planilha(catsP, serieP),
  }))

  return s
}

// ------------------------------------------------------------- montagem ---
export function exportarPPTX(d) {
  const slides = montarSlides(d)
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
  baixar(blob, nomeArquivo('emendas apresentadas ao ploa', 'pptx'))
}
