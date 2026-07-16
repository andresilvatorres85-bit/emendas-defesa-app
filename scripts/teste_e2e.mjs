// Teste de ponta a ponta contra o build servido em http://localhost:4173
// Valida os critérios de aceite automatizáveis.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = 'http://localhost:4173'
const dados = JSON.parse(readFileSync('public/dados.json', 'utf8'))
const regs = dados.registros

const fmtBRL = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
let falhas = 0
const ok = (cond, msg) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg); if (!cond) falhas++ }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true })

// ---------- contexto A: dashboard, valores esperados ----------
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const pgA = await ctxA.newPage()
const errosConsole = []
pgA.on('pageerror', (e) => errosConsole.push(String(e)))
await pgA.goto(BASE, { waitUntil: 'networkidle' })

const esperadoTotal = regs.reduce((s, r) => s + r.valor, 0)
const esperadoEmendas = new Set(regs.map((r) => r.emenda)).size
const esperadoAutores = new Set(regs.map((r) => r.autor)).size

const cards = await pgA.locator('.card-valor').allTextContents()
ok(cards[0] === fmtBRL(esperadoTotal), `VALOR TOTAL = ${cards[0]} (esperado ${fmtBRL(esperadoTotal)})`)
ok(cards[1] === esperadoEmendas.toLocaleString('pt-BR'), `QNT EMENDAS = ${cards[1]} (esperado ${esperadoEmendas})`)
ok(cards[2] === esperadoAutores.toLocaleString('pt-BR'), `QNT PARLAMENTARES = ${cards[2]} (esperado ${esperadoAutores})`)

const titulo = await pgA.locator('.painel-grafico h2').textContent()
ok(titulo === 'EMENDAS PARLAMENTARES AO PLOA', `título do gráfico: "${titulo}"`)
const legendas = await pgA.locator('.legenda-nome').allTextContents()
ok(legendas.every((l) => /^RP\d$/.test(l)), `legendas RPx: ${legendas.join(', ')}`)
const rotuloFatia = await pgA.locator('.pizza-rotulo text').first().textContent()
ok(/\(\d+.*%\)/.test(rotuloFatia), `rótulo de fatia com % entre parênteses: "${rotuloFatia}"`)
const legValores = await pgA.locator('.legenda-valor').allTextContents()
ok(legValores.every((l) => l.includes('mi (')), `valores da legenda em milhões: ${legValores[0]}`)

// 10 filtros na ordem
const filtros = await pgA.locator('.ms-botao').allTextContents()
const ordemEsperada = ['UO', 'UO (Cod)', 'RP', 'Emenda (Modalidade)', 'Autor (Tipo)', 'Autor (UF)', 'Autor', 'Partido', 'GND (Cod)', 'C Mil A']
ok(
  filtros.length === 10 && ordemEsperada.every((r, i) => filtros[i].startsWith(r)),
  `10 filtros na ordem correta: ${filtros.map((f) => f.replace('▾', '').trim()).join(' | ')}`
)

// ---------- filtro em tempo real ----------
await pgA.locator('.ms-botao', { hasText: 'Autor (UF)' }).click()
await pgA.locator('.ms-busca').fill('MG')
await pgA.locator('.ms-opcao', { hasText: 'MG' }).locator('input').check()
await pgA.keyboard.press('Escape')
const regsMG = regs.filter((r) => r.autorUF === 'MG')
const totalMG = regsMG.reduce((s, r) => s + r.valor, 0)
await pgA.waitForTimeout(200)
const cardMG = await pgA.locator('.card-valor').first().textContent()
ok(cardMG === fmtBRL(totalMG), `filtro UF=MG atualiza VALOR TOTAL: ${cardMG} (esperado ${fmtBRL(totalMG)})`)
ok(pgA.url().includes('autoruf=MG'), `filtro refletido na URL: ${pgA.url()}`)

// C Mil A de MG: Uberlândia -> CMP
await pgA.locator('.ms-botao', { hasText: 'C Mil A' }).click()
const opcoesCmila = await pgA.locator('.ms-opcao').allTextContents()
ok(opcoesCmila.some((o) => o.includes('CMP')) && opcoesCmila.some((o) => o.includes('CML')),
  `com UF=MG, C Mil A oferece CMP e CML: ${opcoesCmila.join(' | ')}`)
const esperadoCMP = regsMG.filter((r) => r.cmila === 'CMP').length
const nCMP = opcoesCmila.find((o) => o.includes('CMP'))
ok(nCMP.includes(String(esperadoCMP)), `contagem CMP p/ MG = ${esperadoCMP} (Uberlândia/Araguari)`)
await pgA.keyboard.press('Escape')

// ---------- aba Emendas + detalhe + navegação voltar ----------
await pgA.locator('.aba', { hasText: 'Emendas' }).click()
const nCartoes = await pgA.locator('.cartao').count()
const esperadoGruposMG = new Set(regsMG.map((r) => r.emenda)).size
ok(nCartoes === esperadoGruposMG, `aba Emendas respeita filtro: ${nCartoes} cartões (esperado ${esperadoGruposMG})`)
await pgA.locator('.cartao-cab').first().click()
await pgA.waitForSelector('.cartao-detalhe')
const dts = await pgA.locator('.cartao-detalhe dt').allTextContents()
ok(['UO', 'Funcional', 'Autor (UF)', 'Localidade', 'GND (Cod)'].every((c) => dts.includes(c)),
  `detalhe exibe UO/Funcional/Autor (UF)/Localidade/GND: ${dts.join(', ')}`)
ok((await pgA.locator('.detalhe-just').count()) > 0, 'detalhe exibe justificativa')
ok(pgA.url().includes('det='), 'detalhe refletido na URL')

// botão voltar: fecha detalhe; voltar de novo: retorna ao dashboard
await pgA.goBack()
await pgA.waitForTimeout(150)
ok((await pgA.locator('.cartao-detalhe').count()) === 0, 'voltar fecha o detalhe do cartão')
await pgA.goBack()
await pgA.waitForTimeout(150)
ok((await pgA.locator('.card-titulo').first().textContent()) === 'VALOR TOTAL', 'voltar retorna à aba Dashboard')

// ---------- aba Inconsistências ----------
await pgA.locator('.aba', { hasText: 'Inconsistências' }).click()
const nIncons = regs.filter((r) => r.inconsistencias?.length).length
if (nIncons === 0) {
  ok((await pgA.locator('.vazio').count()) === 1, 'aba Inconsistências mostra estado vazio explicativo (base atual sem inconsistências)')
} else {
  ok((await pgA.locator('.cartao-alerta').count()) > 0, 'aba Inconsistências mostra cartões de alerta')
}

// ---------- isolamento entre "usuários" (contexto B com filtro diferente) ----------
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } }) // mobile
const pgB = await ctxB.newPage()
await pgB.goto(BASE, { waitUntil: 'networkidle' })
await pgB.locator('.ms-botao', { hasText: 'Partido' }).click()
await pgB.locator('.ms-opcao', { hasText: 'PL' }).first().locator('input').check()
await pgB.keyboard.press('Escape')
await pgB.waitForTimeout(200)
const totalA = await pgA.evaluate(() => new URLSearchParams(location.search).get('autoruf'))
const totalB = await pgB.evaluate(() => new URLSearchParams(location.search).get('partido'))
ok(totalA === 'MG' && totalB !== null && !pgB.url().includes('autoruf'),
  `isolamento: aba A mantém UF=MG, aba B tem só partido=${totalB}`)

// ---------- PWA ----------
const manifest = await pgA.evaluate(async () => (await fetch('./manifest.webmanifest')).json())
ok(manifest.display === 'standalone' && manifest.icons.length >= 3, 'manifest PWA válido (standalone + ícones)')
const sw = await pgA.evaluate(async () => (await fetch('./sw.js')).status)
ok(sw === 200, 'service worker acessível')

ok(errosConsole.length === 0, `sem erros de página${errosConsole.length ? ': ' + errosConsole[0] : ''}`)

// screenshots
await pgA.locator('.aba', { hasText: 'Dashboard' }).click()
await pgA.waitForTimeout(300)
await pgA.screenshot({ path: '/tmp/shot-desktop-dashboard.png' })
await pgB.locator('.aba', { hasText: 'Emendas' }).click()
await pgB.waitForTimeout(300)
await pgB.locator('.cartao-cab').first().click()
await pgB.waitForTimeout(200)
await pgB.screenshot({ path: '/tmp/shot-mobile-emendas.png', fullPage: false })

await browser.close()
console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${falhas} FALHA(S)`)
process.exit(falhas ? 1 : 0)
