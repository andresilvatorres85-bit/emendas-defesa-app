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

// título do cabeçalho (item 2) e rodapé (item 3)
ok((await pg.$eval('.cabecalho h1', (n) => n.textContent.trim())) === 'ANÁLISE LOA — MINISTÉRIO DA DEFESA',
  'título do cabeçalho é "ANÁLISE LOA — MINISTÉRIO DA DEFESA"')
const rodape = await pg.$eval('.rodape', (n) => n.textContent.trim())
ok(rodape.startsWith('Desenvolvido por Maj Torres · Fonte: SIGA Brasil · Dados processados'),
  'rodapé traz autoria e fonte antes de "Dados processados"')
ok(!rodape.includes('C Mil A deduzido'), 'rodapé não contém mais a explicação do C Mil A')

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
  JSON.stringify(subPloa) === JSON.stringify(['Dashboard PLOA', 'Histórico PLOA']),
  `duas subabas do PLOA, sem Emendas Autógrafo (${subPloa})`
)

// Ordem dos painéis conforme o pedido (RP → GND → UO → Ação → Força → PL/Aut → Ciclo).
const paineis = await pg.$$eval('.paineis .painel-grafico h2', (n) => n.map((x) => x.textContent.trim()))
ok(paineis.length === 7, `Dashboard PLOA tem 7 painéis (achou ${paineis.length})`)
console.log('        ordem:', paineis.join(' | '))
const ordemEsperada = ['Resultado Primário', 'Natureza da Despesa', 'Unidade Orçamentária',
  'Ação orçamentária', 'Total por Força', 'PL ao Autógrafo', 'ciclo de aprovação']
ordemEsperada.forEach((e, i) => {
  ok((paineis[i] || '').includes(e), `painel ${i + 1} é "${e}" (achou "${paineis[i]}")`)
})

// RP em cascata (item 4.5.1)
ok((await pg.$('.paineis .painel-grafico .cascata-svg')) !== null, 'painel de RP usa gráfico de cascata')

// RP e GND lado a lado (p-6); os demais em largura cheia (p-12)
const larguras = await pg.$$eval('.paineis .painel-grafico', (ns) =>
  ns.map((n) => (n.className.includes('p-12') ? 12 : 6)))
ok(larguras[0] === 6 && larguras[1] === 6, 'RP e GND ocupam meia largura (lado a lado)')
ok(larguras.slice(2).every((l) => l === 12), 'UO, Ação, Força, PL→Aut e Ciclo ocupam largura cheia')

const nPNG = await pg.$$eval('.painel-grafico .btn-png:not(.btn-slide)', (n) => n.length)
const nPPTX = await pg.$$eval('.painel-grafico .btn-slide', (n) => n.length)
ok(nPNG === 7 && nPPTX === 7, `7 botões PNG e 7 PPTX por gráfico (achou ${nPNG}/${nPPTX})`)
ok((await pg.$('.btn-pptx')) !== null, 'botão "Exportar PPTX" do baralho no Dashboard PLOA')

// --- cards superiores (itens 4.1 a 4.4) -------------------------------------
ok((await pg.$eval('.heroi-rotulo', (n) => n.textContent.trim())) === 'PL do Executivo',
  'card maior intitulado "PL do Executivo"')
ok((await pg.$('.heroi-exato')) === null, 'card maior sem o valor exato duplicado')
const notaSaldo = await pg.$$eval('.tira-nota', (n) => n.map((x) => x.textContent.trim()))
ok(notaSaldo.some((t) => t.includes('PL → Autógrafo =')), 'saldo do rito usa "PL → Autógrafo ="')
ok((await pg.$$eval('.destaque-ploa .tira-rotulo', (n) =>
  n.map((x) => x.textContent.trim()))).includes('Valor final aprovado'),
  'tira "Valor final aprovado" presente (conteúdo trocado com o card maior)')

// --- barra de filtros sensível ao contexto ----------------------------------
const rotulos = await rotulosFiltro()
const proibidos = ['Partido', 'Autor', 'C Mil A', 'Emenda (Modalidade)']
ok(
  !proibidos.some((p) => rotulos.some((r) => r.startsWith(p))),
  'barra do PLOA esconde os filtros que só existem numa emenda'
)
ok(rotulos.some((r) => r.startsWith('UO')), 'barra do PLOA mostra o filtro de UO')

const totalAntes = await pg.$eval('.heroi-valor', (n) => n.textContent.trim())
await pg.goto(`${BASE}?aba=ploa-dashboard&orgao=MARINHA`, { waitUntil: 'networkidle' })
await pg.waitForSelector('.heroi-valor', { timeout: 15000 })
const totalMarinha = await pg.$eval('.heroi-valor', (n) => n.textContent.trim())
ok(totalAntes !== totalMarinha, `filtro de Órgão altera o painel (${totalAntes} → ${totalMarinha})`)

// --- expansão Mostrar +/− (itens 4.5.3 e 4.5.4) -----------------------------
// Marinha tem 8 UO: o botão aparece e revela o restante em bloco.
const uo = pg.locator('.painel-grafico').filter({ has: pg.locator('h2', { hasText: 'Unidade Orçamentária' }) })
const uoIni = await uo.locator('.pbar-item').count()
ok(uoIni === 4, `UO começa mostrando 4 itens (achou ${uoIni})`)
await uo.locator('.pbar-btn').first().click()
await pg.waitForTimeout(150)
ok((await uo.locator('.pbar-item').count()) > uoIni, 'botão Mostrar + revela mais UO')
ok((await uo.locator('.pbar-btn', { hasText: '−' }).count()) > 0, 'aparece o botão Mostrar −')

const acao = pg.locator('.painel-grafico').filter({ has: pg.locator('h2', { hasText: 'Valor por Ação' }) })
const acaoIni = await acao.locator('.pbar-item').count()
ok(acaoIni === 15, `Ação começa mostrando 15 itens (achou ${acaoIni})`)
await acao.locator('.pbar-btn').first().click()
await pg.waitForTimeout(150)
ok((await acao.locator('.pbar-item').count()) === 30, 'Ação expande de 15 em 15')
const corCod = await acao.locator('.pbar-codigo').first().evaluate((n) => getComputedStyle(n).color)
ok(corCod === 'rgb(235, 104, 52)', `código da ação destacado em laranja (${corCod})`)

// filtro de ano fora da faixa do PLOA não pode derrubar a aba
await pg.goto(`${BASE}?aba=ploa-dashboard&ano=2019`, { waitUntil: 'networkidle' })
await pg.waitForTimeout(600)
ok((await pg.$('.vazio')) !== null, 'ano fora da faixa do PLOA mostra aviso, não tela quebrada')

// --- rolagem horizontal dos gráficos no celular (item 4.5.8) ----------------
await pg.setViewportSize({ width: 390, height: 800 })
await pg.goto(`${BASE}?aba=ploa-dashboard`, { waitUntil: 'networkidle' })
await pg.waitForSelector('.rolagem-x')
const algumRola = await pg.$$eval('.rolagem-x', (ns) =>
  ns.some((n) => n.scrollWidth > n.clientWidth + 2))
ok(algumRola, 'no celular, ao menos um gráfico rola na horizontal')
await pg.setViewportSize({ width: 1440, height: 1000 })
// --- Histórico PLOA ---------------------------------------------------------
await pg.goto(`${BASE}?aba=ploa-historico`, { waitUntil: 'networkidle' })
await pg.waitForSelector('.painel-grafico', { timeout: 15000 })
const anos = await pg.$$eval('.ano-card-ano', (n) => n.map((x) => x.textContent.trim()))
ok(anos.length === 5, `Histórico PLOA compara os 5 exercícios (${anos})`)
ok((await pg.$('.ploa-aviso')) !== null, 'aviso da aba 2025 duplicada aparece')
const paineisH = await pg.$$eval('.painel-grafico h2', (n) => n.map((x) => x.textContent.trim()))
ok(paineisH.length === 8, `Histórico PLOA tem 8 painéis (achou ${paineisH.length})`)
ok((await pg.$('.btn-pptx')) !== null, 'botão "Exportar PPTX" do baralho no Histórico PLOA')

// card por ano destaca o PL; o autógrafo desce para a linha detalhada (item 2.1)
const dtsAno = await pg.$$eval('.ano-card:first-child .ano-card-linhas dt', (n) => n.map((x) => x.textContent.trim()))
ok(dtsAno[0] === 'Autógrafo', `linha detalhada do card começa por "Autógrafo" (achou "${dtsAno[0]}")`)

// gráfico principal renomeado para PL (item 2.2)
ok(paineisH[0] === 'Projeto de Lei por exercício',
  `1º painel é "Projeto de Lei por exercício" (achou "${paineisH[0]}")`)
ok(paineisH.includes('Ações orçamentárias por exercício'),
  'painel de ações renomeado para "Ações orçamentárias por exercício"')

// matriz de UO: com todas as UO (sem filtro de Órgão) mostra 5 e expande (item 2.3)
await pg.goto(`${BASE}?aba=ploa-historico&orgao=`, { waitUntil: 'networkidle' })
await pg.waitForSelector('.painel-grafico', { timeout: 15000 })
const uoH = pg.locator('.painel-grafico').filter({ has: pg.locator('h2', { hasText: 'Unidades orçamentárias' }) })
ok((await uoH.locator('tbody tr').count()) === 5, 'matriz de UO começa com 5 linhas')
await uoH.locator('.pbar-btn').first().click()
await pg.waitForTimeout(150)
ok((await uoH.locator('tbody tr').count()) > 5, 'botão Mostrar + revela mais UO na matriz')

// matriz de ações: 15 linhas, expande de 15 em 15, código destacado (item 2.4)
const acH = pg.locator('.painel-grafico').filter({ has: pg.locator('h2', { hasText: 'Ações orçamentárias' }) })
ok((await acH.locator('tbody tr').count()) === 15, 'matriz de ações começa com 15 linhas')
const corCodMatH = await acH.locator('.matriz-codigo').first().evaluate((n) => getComputedStyle(n).color)
ok(corCodMatH === 'rgb(235, 104, 52)', `código da ação destacado em laranja na matriz (${corCodMatH})`)
await acH.locator('.pbar-btn').first().click()
await pg.waitForTimeout(150)
ok((await acH.locator('tbody tr').count()) === 30, 'matriz de ações expande de 15 em 15')
await pg.goto(`${BASE}?aba=ploa-historico`, { waitUntil: 'networkidle' })

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
  for (const a of ['ploa-dashboard', 'ploa-historico']) {
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
