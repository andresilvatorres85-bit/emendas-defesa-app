// ---------------------------------------------------------------------------
// Camada de dados: carga do JSON, filtros e agregações.
// Todo o estado de filtros vive no client (React state + URL da própria aba),
// garantindo isolamento total entre usuários/abas simultâneas (site estático,
// nenhum estado compartilhado em servidor).
// ---------------------------------------------------------------------------

export const RP_LABEL = (cod) => (cod ? `RP${cod}` : '—')

// Definição dos 10 filtros, na ordem exigida pela especificação.
// `campo` é a chave do registro no dados.json; `rotulo` é o texto exibido.
export const FILTROS = [
  { id: 'uo',        campo: 'uo',         rotulo: 'UO' },
  { id: 'uocod',     campo: 'uoCod',      rotulo: 'UO (Cod)' },
  { id: 'rp',        campo: 'rp',         rotulo: 'RP', formatar: RP_LABEL },
  { id: 'modalidade',campo: 'modalidade', rotulo: 'Emenda (Modalidade)' },
  { id: 'autortipo', campo: 'autorTipo',  rotulo: 'Autor (Tipo)' },
  { id: 'autoruf',   campo: 'autorUF',    rotulo: 'Autor (UF)' },
  { id: 'autor',     campo: 'autor',      rotulo: 'Autor' },
  { id: 'partido',   campo: 'partido',    rotulo: 'Partido' },
  { id: 'gnd',       campo: 'gnd',        rotulo: 'GND (Cod)' },
  { id: 'cmila',     campo: 'cmila',      rotulo: 'C Mil A' },
]

export async function carregarDados() {
  const resp = await fetch('./dados.json')
  if (!resp.ok) throw new Error(`Falha ao carregar dados (${resp.status})`)
  return resp.json()
}

// Aplica todos os filtros a um conjunto de registros.
// `filtros` = { idDoFiltro: Set(valores selecionados) } — Set vazio = sem filtro.
export function filtrarRegistros(registros, filtros, ignorar = null) {
  return registros.filter((r) =>
    FILTROS.every((f) => {
      if (f.id === ignorar) return true
      const sel = filtros[f.id]
      if (!sel || sel.size === 0) return true
      return sel.has(String(r[f.campo]))
    })
  )
}

// Opções de um filtro, calculadas sobre os registros que passam em TODOS os
// OUTROS filtros (facetamento), com contagem de registros por opção.
export function opcoesDoFiltro(registros, filtros, filtro) {
  const base = filtrarRegistros(registros, filtros, filtro.id)
  const cont = new Map()
  for (const r of base) {
    const v = String(r[filtro.campo] ?? '')
    cont.set(v, (cont.get(v) || 0) + 1)
  }
  // Mantém opções selecionadas mesmo que zerem com os demais filtros
  for (const v of filtros[filtro.id] ?? []) if (!cont.has(v)) cont.set(v, 0)
  return [...cont.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }))
    .map(([valor, n]) => ({ valor, n, rotulo: filtro.formatar ? filtro.formatar(valor) : valor }))
}

// Agrupa registros filtrados por número de emenda (um cartão por emenda).
export function agruparPorEmenda(registros) {
  const grupos = new Map()
  for (const r of registros) {
    if (!grupos.has(r.emenda)) grupos.set(r.emenda, [])
    grupos.get(r.emenda).push(r)
  }
  return [...grupos.entries()].map(([emenda, itens]) => {
    const r0 = itens[0]
    return {
      emenda,
      autor: r0.autor,
      partido: r0.partido,
      autorUF: r0.autorUF,
      rps: [...new Set(itens.map((i) => i.rp))].sort(),
      valor: itens.reduce((s, i) => s + i.valor, 0),
      inconsistencias: itens.flatMap((i) => i.inconsistencias || []),
      itens,
    }
  })
}

// Agregações do dashboard.
export function resumo(registros) {
  return {
    valorTotal: registros.reduce((s, r) => s + r.valor, 0),
    qtdEmendas: new Set(registros.map((r) => r.emenda)).size,
    qtdParlamentares: new Set(registros.map((r) => r.autor)).size,
  }
}

export function valorPorRP(registros) {
  const m = new Map()
  for (const r of registros) m.set(r.rp, (m.get(r.rp) || 0) + r.valor)
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }))
    .map(([rp, valor]) => ({ rp, chave: `rp${rp}`, rotulo: RP_LABEL(rp), valor }))
}

// Gráfico "EMENDAS IMPOSITIVAS": apenas RP6 e RP7.
//  - RP6 é segmentado por Autor (Tipo): DEPUTADO FEDERAL e SENADOR (cores fixas);
//  - RP7 é segmentado por Autor (nome da bancada), de forma dinâmica — uma
//    fatia por autor presente nos registros filtrados.
export const COR_RP6_DEP = 'light-dark(#e87ba4, #d55181)'
export const COR_RP6_SEN = 'light-dark(#4a3aa7, #9085e9)'
// Paleta para os autores de RP7 (evita as cores de RP6). Atribuída por ordem
// alfabética do autor, garantindo cores estáveis para o mesmo conjunto.
const PALETA_RP7 = [
  'light-dark(#eda100, #c98500)', // âmbar
  'light-dark(#1baf7a, #199e70)', // verde-azulado
  'light-dark(#eb6834, #d95926)', // laranja
  'light-dark(#2a78d6, #3987e5)', // azul
  'light-dark(#e34948, #e66767)', // vermelho
  'light-dark(#008300, #009a00)', // verde
]

// Título em pt-BR: capitaliza palavras, mantém conectores minúsculos.
const CONECTORES_BR = new Set(['de', 'do', 'da', 'dos', 'das', 'e'])
function tituloBR(s) {
  return String(s)
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .map((w, i) => (i > 0 && CONECTORES_BR.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

// Nomes por extenso dos Comandos Militares de Área.
export const C_MIL_A_NOME = {
  CMA: 'Comando Militar da Amazônia',
  CMAO: 'Comando Militar da Amazônia Oriental',
  CMNE: 'Comando Militar do Nordeste',
  CMO: 'Comando Militar do Oeste',
  CMP: 'Comando Militar do Planalto',
  CML: 'Comando Militar do Leste',
  CMSE: 'Comando Militar do Sudeste',
  CMS: 'Comando Militar do Sul',
}

// UO do Exército (o C Mil A é uma estrutura do Exército, portanto o comparativo
// por comando considera apenas estas UO): Comando do Exército e IMBEL.
export const UO_EXERCITO = new Set(['52121', '52221'])

// Comparativo por C Mil A: total impositivo RP6, RP7 e a soma (RP6+RP7) de
// cada comando, considerando SOMENTE as UO do Exército. Só entram comandos com
// algum valor impositivo (> 0). Ordenado pela soma RP6+RP7 (maior -> menor); o
// grid do gráfico preenche da esquerda p/ a direita e de cima p/ baixo, então
// a ordem visual segue exatamente essa classificação.
export function impositivasPorCMilA(registros) {
  const m = new Map()
  for (const r of registros) {
    const rp = String(r.rp)
    if (rp !== '6' && rp !== '7') continue
    if (!UO_EXERCITO.has(String(r.uoCod))) continue
    const c = r.cmila || '—'
    if (!m.has(c)) m.set(c, { cmila: c, rp6: 0, rp7: 0 })
    const o = m.get(c)
    if (rp === '6') o.rp6 += r.valor
    else o.rp7 += r.valor
  }
  return [...m.values()]
    .map((o) => ({ ...o, total: o.rp6 + o.rp7, nome: C_MIL_A_NOME[o.cmila] || o.cmila }))
    .filter((o) => o.total > 0)
    .sort((a, b) => b.total - a.total)
}

// Ranking dos autores por valor total de emendas. Considera SOMENTE
// Autor (Tipo) DEPUTADO FEDERAL e SENADOR (exclui comissões e bancadas);
// prefixa o nome com "Dep"/"Sen". Devolve os `n` maiores (padrão 10).
const AUTOR_TIPO_SIGLA = { 'DEPUTADO FEDERAL': 'Dep', SENADOR: 'Sen' }

export function topAutores(registros, n = 10) {
  const m = new Map()
  for (const r of registros) {
    const sigla = AUTOR_TIPO_SIGLA[r.autorTipo]
    if (!sigla) continue
    if (!m.has(r.autor)) {
      m.set(r.autor, { autor: r.autor, sigla, tipo: r.autorTipo, uf: r.autorUF, valor: 0 })
    }
    m.get(r.autor).valor += r.valor
  }
  return [...m.values()]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, n)
    .map((o) => ({ ...o, nome: tituloBR(o.autor) }))
}

export function valorImpositivas(registros) {
  const soma = (pred) => registros.filter(pred).reduce((acc, r) => acc + r.valor, 0)

  // RP6 — segmentos fixos por Autor (Tipo).
  const fatias = [
    { chave: 'rp6-dep', rotulo: 'RP6 · Deputado Federal', rotuloCurto: 'Dep. Federal', cor: COR_RP6_DEP,
      valor: soma((r) => String(r.rp) === '6' && r.autorTipo === 'DEPUTADO FEDERAL') },
    { chave: 'rp6-sen', rotulo: 'RP6 · Senador', rotuloCurto: 'Senador', cor: COR_RP6_SEN,
      valor: soma((r) => String(r.rp) === '6' && r.autorTipo === 'SENADOR') },
  ]

  // RP7 — segmentos dinâmicos por Autor (nome da bancada).
  const porAutor = new Map()
  for (const r of registros) {
    if (String(r.rp) !== '7') continue
    porAutor.set(r.autor, (porAutor.get(r.autor) || 0) + r.valor)
  }
  const autores = [...porAutor.keys()].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'))
  autores.forEach((autor, i) => {
    const nome = tituloBR(autor)
    // Rótulo externo enxuto: remove o prefixo "Bancada de/do/da ..." (a legenda
    // mantém o nome completo). Ex.: "Bancada de Pernambuco" -> "Pernambuco".
    const curto = nome.replace(/^Bancada\s+(?:de|do|da|dos|das)\s+/i, '') || nome
    fatias.push({
      chave: `rp7-${autor}`,
      rotulo: `RP7 · ${nome}`,
      rotuloCurto: curto,
      cor: PALETA_RP7[i % PALETA_RP7.length],
      valor: porAutor.get(autor),
    })
  })

  return fatias
}

// ---------------------------------------------------------------------------
// Formatação pt-BR
// ---------------------------------------------------------------------------
export const fmtBRL = (v) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })

export const fmtMilhoes = (v) =>
  `R$ ${(v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`

export const fmtInt = (v) => v.toLocaleString('pt-BR')

export const fmtPct = (v) =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
