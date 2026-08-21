// ---------------------------------------------------------------------------
// Camada de dados da aba PLOA — despesas por fase de elaboração.
//
// Base separada da das emendas: outro arquivo na origem
// (`PLOA_Despesas_Elaboracao.xlsx`), outro escopo (o órgão 52000 INTEIRO, todos
// os setores — parte das UO responde pelo setor de Ciência & Tecnologia) e
// outra unidade de análise (a dotação orçamentária, não a emenda).
//
// A unidade monetária destes painéis é o BILHÃO: o Ministério da Defesa
// aparece aqui com o orçamento completo (R$ 145 bi em 2026), três ordens de
// grandeza acima do volume das emendas. Usar "R$ milhões" como no Dashboard
// das emendas produziria rótulos de seis dígitos em toda parte.
// ---------------------------------------------------------------------------
import { FILTROS, corDoRP, RP_LABEL, fmtPct } from './dados.js'

// Ordem canônica das fases de tramitação. Índice = posição no ciclo, e é essa
// posição que a REGRA 3.A do pipeline usa para herdar a fase anterior.
export const FASES = [
  { id: 'pl', rotulo: 'PL', descricao: 'Projeto de lei enviado pelo Executivo' },
  { id: 'setorial', rotulo: 'Ciclo Setorial', descricao: 'Relatorias setoriais na CMO' },
  { id: 'geral', rotulo: 'Ciclo Geral', descricao: 'Relatoria-geral na CMO' },
  { id: 'plenario', rotulo: 'Ciclo Plenário', descricao: 'Votação no Plenário do Congresso' },
  { id: 'autografo', rotulo: 'Autógrafo', descricao: 'Texto final encaminhado à sanção' },
]
export const FASE_ROTULOS = FASES.map((f) => f.rotulo)
export const IDX_PL = 0
export const IDX_AUTOGRAFO = FASES.length - 1

// Os quatro agregados do comparativo por Força. A ordem é fixa (e não por
// valor) porque estes quatro painéis são lidos lado a lado: a posição de cada
// Força precisa ser a mesma em todos eles. Os rótulos coincidem com os valores
// do filtro "Órgão", então filtrar por Exército numa aba vale na outra.
export const AGREGADOS = [
  { id: 'MINISTÉRIO DA DEFESA', rotulo: 'MD — Adm. Direta', cor: 'var(--forca-md)' },
  { id: 'EXÉRCITO', rotulo: 'Exército', cor: 'var(--forca-exercito)' },
  { id: 'MARINHA', rotulo: 'Marinha', cor: 'var(--forca-marinha)' },
  { id: 'AERONÁUTICA', rotulo: 'Aeronáutica', cor: 'var(--forca-aeronautica)' },
]

// Filtros da barra superior que fazem sentido nesta base. Os demais
// (modalidade, autor, partido, C Mil A…) descrevem uma emenda parlamentar e
// não existem numa dotação: aplicá-los aqui zeraria a aba inteira assim que
// alguém selecionasse um partido na aba das emendas e viesse para cá.
export const FILTROS_PLOA_IDS = ['ano', 'orgao', 'uo', 'uocod', 'rp', 'gnd']
export const FILTROS_PLOA = FILTROS.filter((f) => FILTROS_PLOA_IDS.includes(f.id))

// Filtra dotações. Mesma assinatura de `filtrarRegistros`, inclusive o
// `ignorar` — os painéis que comparam Forças entre si precisam ignorar o
// filtro de Órgão, e os do Histórico precisam ignorar o de Ano.
export function filtrarPLOA(registros, filtros, ignorar = null) {
  const fora = new Set(ignorar === null ? [] : [].concat(ignorar))
  return registros.filter((r) =>
    FILTROS_PLOA.every((f) => {
      if (fora.has(f.id)) return true
      const sel = filtros[f.id]
      if (!sel || sel.size === 0) return true
      return sel.has(String(r[f.campo]))
    })
  )
}

// Opções de um filtro dentro da base do PLOA, com facetamento — as opções de
// um filtro são calculadas sobre os registros que passam em todos os OUTROS.
// É o que faz uma UO nova (ou um RP novo) aparecer sozinho na lista assim que
// entra na planilha, sem tocar no código.
export function opcoesPLOA(registros, filtros, filtro) {
  const base = filtrarPLOA(registros, filtros, filtro.id)
  const cont = new Map()
  for (const r of base) {
    const v = String(r[filtro.campo] ?? '')
    if (v === '') continue
    cont.set(v, (cont.get(v) || 0) + 1)
  }
  for (const v of filtros[filtro.id] ?? []) if (!cont.has(v)) cont.set(v, 0)
  return [...cont.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }))
    .map(([valor, n]) => ({ valor, n, rotulo: filtro.formatar ? filtro.formatar(valor) : valor }))
}

// Valores por fase de um registro, já com a herança da REGRA 3.A aplicada.
// O pipeline só emite `fases` (cru) quando difere de `fasesEf` — nos anos em
// que nenhuma fase foi herdada os dois são o mesmo vetor.
export const fasesDe = (r) => r.fasesEf ?? r.fases ?? []
export const valorPL = (r) => fasesDe(r)[IDX_PL] ?? 0
export const valorAutografo = (r) => fasesDe(r)[IDX_AUTOGRAFO] ?? 0

export const somaPL = (regs) => regs.reduce((s, r) => s + valorPL(r), 0)
export const somaAutografo = (regs) => regs.reduce((s, r) => s + valorAutografo(r), 0)

// Soma o vetor de fases de um conjunto de dotações — devolve 5 totais.
export function somaFases(registros) {
  const tot = FASES.map(() => 0)
  for (const r of registros) {
    const f = fasesDe(r)
    for (let i = 0; i < tot.length; i++) tot[i] += f[i] || 0
  }
  return tot
}

// Variação percentual protegida contra denominador zero. Uma dotação que não
// existia no PL (criada no Ciclo Geral) não tem variação percentual definida —
// devolve null, e a tela escreve "novo" em vez de "∞%".
export function variacao(de, para) {
  if (!de) return null
  return ((para - de) / de) * 100
}

export const fmtVar = (pct) =>
  pct === null || !Number.isFinite(pct) ? 'novo' : `${pct >= 0 ? '+' : '−'}${fmtPct(Math.abs(pct))}`

// ------------------------------------------------------------- agregações ---
// Todas devolvem listas prontas para os gráficos, já ordenadas.

// 1) Os quatro agregados (MD, Exército, Marinha, Aeronáutica), na ordem fixa.
//    Agregados sem nenhuma dotação no recorte saem da lista — uma barra zerada
//    permanente só ocuparia espaço.
export function porAgregado(registros, fase = IDX_AUTOGRAFO) {
  const porId = new Map(AGREGADOS.map((a) => [a.id, { ...a, valor: 0, pl: 0, fases: FASES.map(() => 0) }]))
  for (const r of registros) {
    const alvo = porId.get(r.orgao)
    if (!alvo) continue
    const f = fasesDe(r)
    alvo.valor += f[fase] || 0
    alvo.pl += f[IDX_PL] || 0
    for (let i = 0; i < alvo.fases.length; i++) alvo.fases[i] += f[i] || 0
  }
  return [...porId.values()].filter((a) => a.fases.some((v) => v !== 0))
}

// 2) Por UO. Ordenada por valor: aqui a pergunta é "quem é maior", e a lista
//    tem uma dúzia de itens de grandezas muito diferentes.
export function porUO(registros, fase = IDX_AUTOGRAFO) {
  const mapa = new Map()
  for (const r of registros) {
    const chave = r.uoCod
    if (!mapa.has(chave)) {
      mapa.set(chave, { uoCod: r.uoCod, uo: r.uo, orgao: r.orgao, valor: 0, pl: 0 })
    }
    const alvo = mapa.get(chave)
    alvo.valor += fasesDe(r)[fase] || 0
    alvo.pl += valorPL(r)
  }
  return [...mapa.values()].filter((u) => u.valor || u.pl).sort((a, b) => b.valor - a.valor)
}

// 3) Por RP. Ordem NUMÉRICA do código, não por valor: o RP é uma escala
//    conhecida, e a cor de cada RP é fixa em todo o app (`corDoRP`), o que só
//    funciona se a ordem também for estável.
export function porRP(registros, fase = IDX_AUTOGRAFO) {
  const mapa = new Map()
  for (const r of registros) {
    const chave = r.rp || '—'
    if (!mapa.has(chave)) mapa.set(chave, { rp: chave, valor: 0, pl: 0 })
    const alvo = mapa.get(chave)
    alvo.valor += fasesDe(r)[fase] || 0
    alvo.pl += valorPL(r)
  }
  return [...mapa.values()]
    .filter((d) => d.valor || d.pl)
    .sort((a, b) => String(a.rp).localeCompare(String(b.rp), 'pt-BR', { numeric: true }))
    .map((d) => ({ ...d, rotulo: RP_LABEL(d.rp), cor: corDoRP(d.rp) }))
}

// 4) Ciclo: uma série por agregado, um ponto por fase, com a variação de cada
//    fase sobre a anterior. É o painel que mostra ONDE, no rito, o valor mudou.
export function ciclos(registros) {
  return porAgregado(registros).map((a) => ({
    ...a,
    variacoes: a.fases.map((v, i) => (i === 0 ? null : variacao(a.fases[i - 1], v))),
  }))
}

// 5) PL → Autógrafo: o saldo líquido do rito para cada agregado.
export function plVsAutografo(registros) {
  return porAgregado(registros).map((a) => {
    const pl = a.fases[IDX_PL]
    const autografo = a.fases[IDX_AUTOGRAFO]
    return { ...a, pl, autografo, delta: autografo - pl, pct: variacao(pl, autografo) }
  })
}

// 6) Por Ação. São ~150 ações por exercício e a maioria é residual: o gráfico
//    mostra as `n` maiores e agrega o resto numa linha "demais ações", para
//    que a soma continue fechando com o total do recorte.
export function porAcao(registros, n = 15, fase = IDX_AUTOGRAFO) {
  const mapa = new Map()
  for (const r of registros) {
    const chave = r.acaoCod || '—'
    if (!mapa.has(chave)) mapa.set(chave, { acaoCod: chave, acao: r.acao || '', valor: 0, pl: 0 })
    const alvo = mapa.get(chave)
    alvo.valor += fasesDe(r)[fase] || 0
    alvo.pl += valorPL(r)
  }
  const todas = [...mapa.values()].filter((a) => a.valor || a.pl).sort((a, b) => b.valor - a.valor)
  if (todas.length <= n) return { itens: todas, resto: null, total: todas.length }
  const resto = todas.slice(n)
  return {
    itens: todas.slice(0, n),
    resto: {
      acaoCod: '—',
      acao: `demais ${resto.length} ações`,
      valor: resto.reduce((s, a) => s + a.valor, 0),
      pl: resto.reduce((s, a) => s + a.pl, 0),
    },
    total: todas.length,
  }
}

// Lista completa de ações, ordenada por valor decrescente e SEM agregação em
// "demais ações". A paginação (mostrar 15, expandir de 15 em 15) fica com o
// componente de gráfico, que precisa dos itens individuais para revelá-los.
export function acoesOrdenadas(registros, fase = IDX_AUTOGRAFO) {
  const mapa = new Map()
  for (const r of registros) {
    const chave = r.acaoCod || '—'
    if (!mapa.has(chave)) mapa.set(chave, { acaoCod: chave, acao: r.acao || '', valor: 0, pl: 0 })
    const alvo = mapa.get(chave)
    alvo.valor += fasesDe(r)[fase] || 0
    alvo.pl += valorPL(r)
  }
  return [...mapa.values()].filter((a) => a.valor || a.pl).sort((a, b) => b.valor - a.valor)
}

// 7) Por GND. Poucas categorias, escala conhecida — ordem numérica do código,
//    como no RP.
export const GND_NOMES = {
  1: 'Pessoal e encargos sociais',
  2: 'Juros e encargos da dívida',
  3: 'Outras despesas correntes',
  4: 'Investimentos',
  5: 'Inversões financeiras',
  6: 'Amortização da dívida',
  9: 'Reserva de contingência',
}
const COR_GND = {
  1: 'var(--serie-vermelho)',
  2: 'var(--serie-violeta)',
  3: 'var(--serie-azul)',
  4: 'var(--serie-verde)',
  5: 'var(--serie-aqua)',
  6: 'var(--serie-magenta)',
  9: 'var(--serie-laranja)',
}
export const corDoGND = (g) => COR_GND[g] || 'var(--acento)'

export function porGND(registros, fase = IDX_AUTOGRAFO) {
  const mapa = new Map()
  for (const r of registros) {
    const chave = r.gnd || '—'
    if (!mapa.has(chave)) mapa.set(chave, { gnd: chave, valor: 0, pl: 0 })
    const alvo = mapa.get(chave)
    alvo.valor += fasesDe(r)[fase] || 0
    alvo.pl += valorPL(r)
  }
  return [...mapa.values()]
    .filter((d) => d.valor || d.pl)
    .sort((a, b) => String(a.gnd).localeCompare(String(b.gnd), 'pt-BR', { numeric: true }))
    .map((d) => ({
      ...d,
      rotulo: `GND ${d.gnd}`,
      nome: GND_NOMES[d.gnd] || '',
      cor: corDoGND(d.gnd),
    }))
}

// ------------------------------------------------- séries por exercício -----
// Usadas pela subaba "Histórico PLOA", que ignora o filtro de Ano.

export const anosPLOA = (registros) =>
  [...new Set(registros.map((r) => r.ano))].sort()

// Resumo por exercício, com a variação do total sobre o exercício anterior.
export function resumoPorAno(registros) {
  const anos = anosPLOA(registros)
  const linhas = anos.map((ano) => {
    const doAno = registros.filter((r) => r.ano === ano)
    const fases = somaFases(doAno)
    return {
      ano,
      pl: fases[IDX_PL],
      autografo: fases[IDX_AUTOGRAFO],
      fases,
      delta: fases[IDX_AUTOGRAFO] - fases[IDX_PL],
      pctRito: variacao(fases[IDX_PL], fases[IDX_AUTOGRAFO]),
      linhas: doAno.length,
    }
  })
  return linhas.map((l, i) => ({
    ...l,
    variacao: i === 0 ? null : variacao(linhas[i - 1].autografo, l.autografo),
  }))
}

// Série genérica "categoria × ano", no formato que `MatrizAnos` consome.
// `chave` extrai o identificador da categoria e `rotulo` o texto exibido.
function serieCategoriaPorAno(registros, anos, chave, rotulo, fase = IDX_AUTOGRAFO, extra = null) {
  const mapa = new Map()
  for (const r of registros) {
    const k = chave(r)
    if (k === '' || k == null) continue
    if (!mapa.has(k)) {
      mapa.set(k, {
        chave: k,
        rotulo: rotulo(r),
        valores: anos.map(() => 0),
        total: 0,
        ...(extra ? extra(r) : {}),
      })
    }
    const alvo = mapa.get(k)
    const i = anos.indexOf(r.ano)
    if (i < 0) continue
    const v = fasesDe(r)[fase] || 0
    alvo.valores[i] += v
    alvo.total += v
  }
  return [...mapa.values()].filter((l) => l.total !== 0).sort((a, b) => b.total - a.total)
}

export function agregadoPorAno(registros) {
  const anos = anosPLOA(registros)
  // Ordem fixa dos agregados, não por valor — mesma razão de `porAgregado`.
  const series = AGREGADOS.map((a) => {
    const valores = anos.map((ano) =>
      registros
        .filter((r) => r.ano === ano && r.orgao === a.id)
        .reduce((s, r) => s + valorAutografo(r), 0)
    )
    return { ...a, chave: a.id, valores, total: valores.reduce((s, v) => s + v, 0) }
  }).filter((s) => s.total !== 0)
  return { anos, series }
}

export function uoPorAno(registros) {
  const anos = anosPLOA(registros)
  return {
    anos,
    series: serieCategoriaPorAno(registros, anos, (r) => r.uoCod, (r) => `${r.uoCod} — ${r.uo}`),
  }
}

export function rpPorAno(registros) {
  const anos = anosPLOA(registros)
  const series = serieCategoriaPorAno(registros, anos, (r) => r.rp || '—', (r) => RP_LABEL(r.rp))
    .sort((a, b) => String(a.chave).localeCompare(String(b.chave), 'pt-BR', { numeric: true }))
    .map((s) => ({ ...s, cor: corDoRP(s.chave) }))
  return { anos, series }
}

export function gndPorAno(registros) {
  const anos = anosPLOA(registros)
  const series = serieCategoriaPorAno(registros, anos, (r) => r.gnd || '—', (r) => `GND ${r.gnd}`)
    .sort((a, b) => String(a.chave).localeCompare(String(b.chave), 'pt-BR', { numeric: true }))
    .map((s) => ({ ...s, cor: corDoGND(s.chave) }))
  return { anos, series }
}

export function acaoPorAno(registros, n = 15) {
  const anos = anosPLOA(registros)
  const todas = serieCategoriaPorAno(
    registros, anos, (r) => r.acaoCod || '—', (r) => `${r.acaoCod} — ${r.acao}`
  )
  return { anos, series: todas.slice(0, n), total: todas.length }
}

// Ciclo por ano: para cada exercício, o total em cada fase. Alimenta o painel
// que mostra se o rito de um exercício mexeu mais ou menos que o de outro.
export function ciclosPorAno(registros) {
  const anos = anosPLOA(registros)
  const series = FASES.map((f, i) => ({
    chave: f.id,
    rotulo: f.rotulo,
    valores: anos.map((ano) =>
      registros.filter((r) => r.ano === ano).reduce((s, r) => s + (fasesDe(r)[i] || 0), 0)
    ),
  }))
  return {
    anos,
    series: series.map((s) => ({ ...s, total: s.valores.reduce((a, b) => a + b, 0) })),
  }
}

// ------------------------------------------------------------ formatação ---
// Bilhão é a unidade natural desta base (ver cabeçalho).
export const fmtBi = (v) =>
  `R$ ${(v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bi`

// Nas matrizes o número sai sem "R$" e sem "bi" — a unidade é dita uma vez, no
// subtítulo, e a coluna fica estreita o bastante para caber cinco exercícios.
export const fmtBiSeco = (v) =>
  (v / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
