// Teste de aceite da seção PLOA, em navegador de verdade.
// Sobe o build (`npm run build && npx vite preview --port 4173`) e rode:
//   node scripts/teste_ploa.mjs
import { chromium } from 'playwright'

const BASE = 'http://127.0.0.1:4173/'
const falhas = []
const ok = (cond, msg) => {
  if (!cond) falhas.push(msg)
  console.log(`${cond ? '  ok  ' : ' FALHA'} ${msg}`)
}

// O runner traz uma build de Chromium anterior à que este Playwright baixaria
// sozinho; CHROME_BIN aponta para ela e evita depender de rede.
const navegador = await chromium.launch({ executablePath: process.env.CHROME_BIN || undefined })
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } })
const pg = await ctx.newPage()
const erros = []
pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()) })
pg.on('pageerror', (e) => erros.push(String(e)))

const rotulosFiltro = () =>
  pg.$$eval('.filtros button', (n) => n.map((x) => x.textContent.trim()))

await pg.goto(BASE, { waitUntil: 'networkidle' })
await pg.waitForSelector('.secoes', { timeout: 20000 })

// --- nível 1: as duas seções -----------------------------------------------
const secoes = await pg.$$eval('.secao', (n) => n.map((x) => x.textContent.trim()))
ok(secoes.length === 2, `duas seções no nível 1 (achou ${secoes.length}: ${secoes})`)
ok(secoes[0] === 'Resultado LEXOR' && secoes[1] === 'PLOA', 'rótulos: Resultado LEXOR e PLOA')

const subLexor = await pg.$$eval('.aba', (n) => n.map((x) => x.textContent.replace(/\d+$/, '').trim()))
ok(
  ['Dashboard', 'Emendas', 'Histórico', 'Inconsistências'].every((r) => subLexor.some((s) => s.startsWith(r))),
  `subabas da LEXOR preservadas (${subLexor})`
)

// --- link já compartilhado continua abrindo o mesmo lugar -------------------
await pg.goto(`${BASE}?aba=historico`, { waitUntil: 'networkidle' })
await pg.waitForSelector('.historico-intro', { timeout: 15000 })
ok(
  (await pg.$eval('.secao.ativa', (n) => n.textContent.trim())) === 'Resultado LEXOR',
  'link antigo ?aba=historico abre dentro de Resultado LEXOR'
)

// --- Dashboard PLOA ---------------------------------------------------------
await pg.goto(BASE, { waitUntil: 'networkidle' })
await pg.click('.secao:has-text("PLOA")')
await pg.waitForSelector('.painel-grafico', { timeout: 15000 })
const subPloa = await pg.$$eval('.aba', (n) => n.map((x) => x.textContent.trim()))
ok(
  JSON.stringify(subPloa) === JSON.stringify(['Dashboard PLOA', 'Emendas Autógrafo', 'Histórico PLOA']),
  `três subabas do PLOA (${subPloa})`
)

const paineis = await pg.$$eval('.painel-grafico h2', (n) => n.map((x) => x.textContent.trim()))
ok(paineis.length === 7, `Dashboard PLOA tem 7 painéis (achou ${paineis.length})`)
console.log('        painéis:', paineis.join(' | '))
for (const e of ['Total por Força', 'Unidade Orçamentária', 'Resultado Primário',
  'ciclo de aprovação', 'PL ao Autógrafo', 'Ação orçamentária', 'Natureza da Despesa']) {
  ok(paineis.some((p) => p.includes(e)), `painel presente: ${e}`)
}

const nPNG = await pg.$$eval('.painel-grafico .btn-png:not(.btn-slide)', (n) => n.length)
const nPPTX = await pg.$$eval('.painel-grafico .btn-slide', (n) => n.length)
ok(nPNG === 7 && nPPTX === 7, `7 botões PNG e 7 PPTX por gráfico (achou ${nPNG}/${nPPTX})`)
ok((await pg.$('.btn-pptx')) !== null, 'botão "Exportar PPTX" do baralho no Dashboard PLOA')

// --- barra de filtros sensível ao contexto ----------------------------------
const rotulos = await rotulosFiltro()
const proibidos = ['Partido', 'Autor', 'C Mil A', 'Emenda (Modalidade)']
ok(
  !proibidos.some((p) => rotulos.some((r) => r.startsWith(p))),
  'barra do PLOA esconde os filtros que só existem numa emenda'
)
ok(rotulos.some((r) => r.startsWith('UO')), 'barra do PLOA mostra o filtro de UO')

const totalAntes = await pg.$eval('.heroi-exato', (n) => n.textContent.trim())
await pg.goto(`${BASE}?aba=ploa-dashboard&orgao=MARINHA`, { waitUntil: 'networkidle' })
await pg.waitForSelector('.heroi-exato', { timeout: 15000 })
const totalMarinha = await pg.$eval('.heroi-exato', (n) => n.textContent.trim())
ok(totalAntes !== totalMarinha, `filtro de Órgão altera o painel (${totalAntes} → ${totalMarinha})`)

// filtro de ano fora da faixa do PLOA não pode derrubar a aba
await pg.goto(`${BASE}?aba=ploa-dashboard&ano=2019`, { waitUntil: 'networkidle' })
await pg.waitForTimeout(600)
ok((await pg.$('.vazio')) !== null, 'ano fora da faixa do PLOA mostra aviso, não tela quebrada')

// --- Emendas Autógrafo ------------------------------------------------------
await pg.goto(`${BASE}?aba=ploa-emendas`, { waitUntil: 'networkidle' })
await pg.waitForSelector('.cartao', { timeout: 15000 })
ok((await pg.$$eval('.cartao', (n) => n.length)) > 0, 'Emendas Autógrafo lista cartões')
ok(
  (await pg.$$eval('.tag-atendida, .tag-nao-atendida', (n) => n.length)) > 0,
  'cartões trazem o selo de situação no autógrafo'
)
await pg.click('.cartao .cartao-cab')
await pg.waitForTimeout(500)
ok((await pg.$('.autografo-bloco, .autografo-vazio')) !== null,
  'cartão aberto mostra o destino no autógrafo')
ok((await rotulosFiltro()).some((r) => r.startsWith('Partido')),
  'Emendas Autógrafo mantém a barra de filtros completa (os cartões são emendas)')

// --- Histórico PLOA ---------------------------------------------------------
await pg.goto(`${BASE}?aba=ploa-historico`, { waitUntil: 'networkidle' })
await pg.waitForSelector('.painel-grafico', { timeout: 15000 })
const anos = await pg.$$eval('.ano-card-ano', (n) => n.map((x) => x.textContent.trim()))
ok(anos.length === 5, `Histórico PLOA compara os 5 exercícios (${anos})`)
ok((await pg.$('.ploa-aviso')) !== null, 'aviso da aba 2025 duplicada aparece')
const paineisH = await pg.$$eval('.painel-grafico h2', (n) => n.map((x) => x.textContent.trim()))
ok(paineisH.length === 8, `Histórico PLOA tem 8 painéis (achou ${paineisH.length})`)
ok((await pg.$('.btn-pptx')) !== null, 'botão "Exportar PPTX" do baralho no Histórico PLOA')

// --- exportações de verdade -------------------------------------------------
const baixar = async (seletor, nome) => {
  const dl = pg.waitForEvent('download', { timeout: 30000 })
  await pg.click(seletor)
  const d = await dl
  await d.saveAs(`/tmp/pptx/${d.suggestedFilename()}`)
  ok(true, `${nome} → ${d.suggestedFilename()}`)
  return d.suggestedFilename()
}
await pg.goto(`${BASE}?aba=ploa-dashboard`, { waitUntil: 'networkidle' })
await pg.waitForSelector('.btn-pptx')
await baixar('.btn-pptx', 'baralho do Dashboard PLOA')
await baixar('.painel-grafico:first-of-type .btn-slide', 'slide avulso de gráfico do PLOA')
const png = await baixar('.painel-grafico:first-of-type .btn-png:not(.btn-slide)', 'PNG de gráfico do PLOA')
ok(png.endsWith('.png'), 'exportação PNG gera arquivo .png')

await pg.goto(`${BASE}?aba=ploa-historico`, { waitUntil: 'networkidle' })
await pg.waitForSelector('.btn-pptx')
await baixar('.btn-pptx', 'baralho do Histórico PLOA')
await baixar('.painel-grafico:first-of-type .btn-slide', 'slide avulso do Histórico PLOA')

// --- responsivo + console ---------------------------------------------------
for (const largura of [1920, 1440, 390]) {
  await pg.setViewportSize({ width: largura, height: 900 })
  for (const a of ['ploa-dashboard', 'ploa-emendas', 'ploa-historico']) {
    await pg.goto(`${BASE}?aba=${a}`, { waitUntil: 'networkidle' })
    await pg.waitForTimeout(500)
    const over = await pg.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth)
    ok(over <= 1, `sem overflow horizontal em ${largura}px na aba ${a} (sobra ${over}px)`)
  }
}

ok(erros.length === 0, `sem erros de console (${erros.length}${erros.length ? ': ' + erros[0] : ''})`)

await navegador.close()
console.log(`\n${falhas.length ? `${falhas.length} FALHA(S)` : 'TUDO OK'}`)
if (falhas.length) { falhas.forEach((f) => console.log(' - ' + f)); process.exit(1) }
