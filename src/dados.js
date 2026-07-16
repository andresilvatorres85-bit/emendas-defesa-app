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
    .map(([rp, valor]) => ({ rp, rotulo: RP_LABEL(rp), valor }))
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
