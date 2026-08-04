// ---------------------------------------------------------------------------
// Camada de dados: carga do JSON, filtros e agregações.
// Todo o estado de filtros vive no client (React state + URL da própria aba),
// garantindo isolamento total entre usuários/abas simultâneas (site estático,
// nenhum estado compartilhado em servidor).
// ---------------------------------------------------------------------------

export const RP_LABEL = (cod) => (cod ? `RP${cod}` : '—')

// Órgão consolidado por UO (Cod): agrupa todas as UO de cada Força/MD.
// Permite filtrar os dados consolidados por Exército, Aeronáutica, Marinha e
// Ministério da Defesa (órgãos conjuntos: Adm. Direta e Fundo do HFA).
export const UO_ORGAO = {
  '52121': 'EXÉRCITO',
  '52221': 'EXÉRCITO',
  '52111': 'AERONÁUTICA',
  '52911': 'AERONÁUTICA',
  '52131': 'MARINHA',
  '52931': 'MARINHA',
  '52932': 'MARINHA',
  '52133': 'MARINHA',
  '52101': 'MINISTÉRIO DA DEFESA',
  '52902': 'MINISTÉRIO DA DEFESA',
}
export const orgaoDeUO = (uoCod) => UO_ORGAO[String(uoCod)] || 'MINISTÉRIO DA DEFESA'

// Definição dos filtros, na ordem de exibição.
// `campo` é a chave do registro no dados.json; `rotulo` é o texto exibido.
export const FILTROS = [
  { id: 'orgao',     campo: 'orgao',      rotulo: 'Órgão' },
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
  const dados = await resp.json()
  // Deriva o campo "orgao" (consolidação por Força/MD) a partir da UO (Cod).
  for (const r of dados.registros) r.orgao = orgaoDeUO(r.uoCod)
  return dados
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

// ---------------------------------------------------------------------------
// Aba "Inconsistências"
// ---------------------------------------------------------------------------
// Cada registro pode trazer `inconsistencias`: lista de objetos gerados pelo
// pipeline (scripts/processar_dados.py, Regra 2), no formato
//   { tipo, gravidade, rotulo, descricao, evidencia, uoSugerida, revisado }
// Duas regras independentes — um registro pode acumular as duas:
//   modalidade        : "Mod. Aplic. (Cod)" != 90 (dado objetivo)
//   uo_justificativa  : a Força citada no texto não corresponde à UO da emenda
export const INCONS_TIPOS = [
  {
    id: 'modalidade',
    rotulo: 'Mod. Aplic. ≠ 90',
    descricao:
      'As emendas do Ministério da Defesa são executadas em Aplicação Direta (código 90). '
      + 'Qualquer outro código — 99 (a definir), 91 (operação entre órgãos) etc. — é sinalizado.',
  },
  {
    id: 'uo_justificativa',
    rotulo: 'UO × Justificativa',
    descricao:
      'Cruzamento do texto da emenda (Ação, Subtítulo e Justificativa) com a UO de destino: '
      + 'sinaliza quando a organização militar descrita pertence a uma Força diferente da UO.',
  },
]

export const INCONS_TIPO_ROTULO = Object.fromEntries(INCONS_TIPOS.map((t) => [t.id, t.rotulo]))

export const GRAVIDADES = [
  { id: 'alta', rotulo: 'Confirmada', descricao: 'Divergência objetiva ou já revisada caso a caso.' },
  { id: 'media', rotulo: 'A verificar', descricao: 'Indício que depende de confirmação junto à UO.' },
]
export const GRAVIDADE_ROTULO = Object.fromEntries(GRAVIDADES.map((g) => [g.id, g.rotulo]))

// Registros com pelo menos uma inconsistência, opcionalmente restritos a um
// tipo e/ou a uma gravidade (sub-filtros da aba, estado local do componente).
export function registrosInconsistentes(registros, { tipo = null, gravidade = null } = {}) {
  return registros
    .map((r) => {
      const alertas = (r.inconsistencias || []).filter(
        (i) => (!tipo || i.tipo === tipo) && (!gravidade || i.gravidade === gravidade)
      )
      return alertas.length ? { ...r, alertas } : null
    })
    .filter(Boolean)
}

// Agrupa por emenda para a listagem em cartões. Só entram os itens (linhas)
// que apresentam inconsistência — uma emenda pode ter linhas corretas e
// linhas problemáticas, e a aba trata do que está errado.
export function agruparInconsistencias(registros) {
  const grupos = new Map()
  for (const r of registros) {
    if (!grupos.has(r.emenda)) grupos.set(r.emenda, [])
    grupos.get(r.emenda).push(r)
  }
  return [...grupos.entries()]
    .map(([emenda, itens]) => {
      const r0 = itens[0]
      const alertas = itens.flatMap((i) => i.alertas)
      const tipos = [...new Set(alertas.map((a) => a.tipo))]
      return {
        emenda,
        autor: r0.autor,
        partido: r0.partido,
        autorUF: r0.autorUF,
        uo: r0.uo,
        uoCod: r0.uoCod,
        orgao: r0.orgao,
        rps: [...new Set(itens.map((i) => i.rp))].sort(),
        valor: itens.reduce((s, i) => s + i.valor, 0),
        gravidade: alertas.some((a) => a.gravidade === 'alta') ? 'alta' : 'media',
        tipos,
        alertas,
        itens,
      }
    })
    .sort((a, b) => (a.gravidade === b.gravidade ? b.valor - a.valor : a.gravidade === 'alta' ? -1 : 1))
}

// Números do painel da aba: totais, quebra por tipo, por gravidade e por UO.
export function resumoInconsistencias(registros) {
  const comAlerta = registrosInconsistentes(registros)
  const porTipo = INCONS_TIPOS.map((t) => {
    const itens = comAlerta.filter((r) => r.alertas.some((a) => a.tipo === t.id))
    return { ...t, qtd: itens.length, valor: itens.reduce((s, r) => s + r.valor, 0) }
  })
  const porGravidade = GRAVIDADES.map((g) => {
    const itens = comAlerta.filter((r) => r.alertas.some((a) => a.gravidade === g.id))
    return { ...g, qtd: itens.length, valor: itens.reduce((s, r) => s + r.valor, 0) }
  })
  const uos = new Map()
  for (const r of comAlerta) {
    const k = `${r.uoCod} — ${r.uo}`
    if (!uos.has(k)) uos.set(k, { chave: k, uoCod: r.uoCod, uo: r.uo, qtd: 0, valor: 0 })
    const o = uos.get(k)
    o.qtd += 1
    o.valor += r.valor
  }
  return {
    qtdRegistros: comAlerta.length,
    qtdEmendas: new Set(comAlerta.map((r) => r.emenda)).size,
    valor: comAlerta.reduce((s, r) => s + r.valor, 0),
    baseRegistros: registros.length,
    porTipo,
    porGravidade,
    porUO: [...uos.values()].sort((a, b) => b.qtd - a.qtd || b.valor - a.valor),
  }
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

// Valor total e quantidade de emendas (distintas) por Partido. Exclui os
// registros sem partido (comissões e bancadas — "S/PARTIDO"/vazio), que não
// representam um partido e distorceriam a escala. Ordenado por valor (desc).
export function valorPorPartido(registros) {
  const m = new Map()
  for (const r of registros) {
    const p = (r.partido || '').trim()
    if (!p || p === 'S/PARTIDO') continue
    if (!m.has(p)) m.set(p, { partido: p, valor: 0, emendas: new Set() })
    const o = m.get(p)
    o.valor += r.valor
    o.emendas.add(r.emenda)
  }
  return [...m.values()]
    .map((o) => ({ partido: o.partido, valor: o.valor, qtd: o.emendas.size }))
    .sort((a, b) => b.valor - a.valor)
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
