// ---------------------------------------------------------------------------
// Camada de dados: carga do JSON, filtros e agregações.
// Todo o estado de filtros vive no client (React state + URL da própria aba),
// garantindo isolamento total entre usuários/abas simultâneas (site estático,
// nenhum estado compartilhado em servidor).
// ---------------------------------------------------------------------------

export const RP_LABEL = (cod) => (cod ? `RP${cod}` : '—')

// Cores por identidade do RP (RP fixo -> cor fixa; nunca reatribuídas quando o
// filtro muda o nº de fatias). Paleta categórica validada (CVD-safe) em modo
// claro e escuro. Vive aqui — e não no gráfico — porque a rosca do Dashboard,
// o comparativo do Histórico e a exportação PPTX precisam da MESMA cor para o
// mesmo RP: é a identidade do dado, não uma escolha de um gráfico.
// A ordem de RP na composição é a numérica (0,1,2,3,6,7,8,9), então é essa a
// sequência que precisa passar no validador de paleta — e passa, com o pior par
// adjacente em ΔE 9,1 (claro) e 8,4 (escuro), acima do piso de 8.
const COR_RP = {
  0: { claro: '#4a3aa7', escuro: '#9085e9' }, // violeta — financeiro
  1: { claro: '#e34948', escuro: '#e66767' }, // vermelho — primário obrigatório
  2: { claro: '#2a78d6', escuro: '#3987e5' }, // azul
  3: { claro: '#008300', escuro: '#008300' }, // verde — PAC
  6: { claro: '#e87ba4', escuro: '#d55181' }, // magenta — individual impositiva
  7: { claro: '#eda100', escuro: '#c98500' }, // amarelo — bancada impositiva
  8: { claro: '#1baf7a', escuro: '#199e70' }, // aqua — relator
  9: { claro: '#eb6834', escuro: '#d95926' }, // laranja — comissão impositiva
}
const COR_EXTRA = [
  { claro: '#eb6834', escuro: '#d95926' },
  { claro: '#4a3aa7', escuro: '#9085e9' },
  { claro: '#e34948', escuro: '#e66767' },
]

export function corDoRP(rp) {
  const c = COR_RP[rp] || COR_EXTRA[Math.abs(String(rp).charCodeAt(0)) % COR_EXTRA.length]
  return `light-dark(${c.claro}, ${c.escuro})`
}

// Órgão consolidado por UO (Cod): agrupa todas as UO de cada Força/MD.
// Permite filtrar os dados consolidados por Exército, Aeronáutica, Marinha e
// Ministério da Defesa (órgãos conjuntos: Adm. Direta e Fundo do HFA).
export const UO_ORGAO = {
  '52121': 'EXÉRCITO',
  '52221': 'EXÉRCITO',
  '52921': 'EXÉRCITO', // Fundo do Exército
  '52111': 'AERONÁUTICA',
  '52911': 'AERONÁUTICA',
  '52131': 'MARINHA',
  '52931': 'MARINHA',
  '52932': 'MARINHA',
  '52133': 'MARINHA',
  '52232': 'MARINHA', // CCCPM
  '52101': 'MINISTÉRIO DA DEFESA',
  '52902': 'MINISTÉRIO DA DEFESA',
}

// Reserva para UO que ainda não estão no catálogo acima. Espelha a regra do
// pipeline (`familia_da_uo` em processar_dados.py): nome primeiro, depois a
// estrutura do código — dentro do órgão 52000 o 4º dígito identifica o Comando
// (1=Aeronáutica, 2=Exército, 3=Marinha, 0=órgão conjunto do MD). Sem isso uma
// UO nova viraria "Ministério da Defesa" no silêncio e sumiria do comparativo
// por Força. Normalmente não roda: o dados.json já traz o campo `orgao`; isto
// cobre o caso de app novo com JSON antigo.
const NOME_ORGAO = [
  [/MARINHA|\bNAVAL\b|MARITIMO|RECURSOS DO MAR|FUZILEIROS|\bCCCPM\b|\bSECIRM\b/, 'MARINHA'],
  [/EXERCITO|\bIMBEL\b|BELICO/, 'EXÉRCITO'],
  [/AERONAUTICA|AEROESPACIAL|FORCA AEREA|\bAEREA\b/, 'AERONÁUTICA'],
]
const DIGITO_ORGAO = { 1: 'AERONÁUTICA', 2: 'EXÉRCITO', 3: 'MARINHA' }

export function orgaoDeUO(uoCod, uoNome) {
  const cod = String(uoCod ?? '').trim()
  if (UO_ORGAO[cod]) return UO_ORGAO[cod]
  const nome = String(uoNome ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  for (const [padrao, orgao] of NOME_ORGAO) if (padrao.test(nome)) return orgao
  if (/^52\d{3}$/.test(cod)) return DIGITO_ORGAO[cod[3]] || 'MINISTÉRIO DA DEFESA'
  return 'MINISTÉRIO DA DEFESA'
}

// Definição dos filtros, na ordem de exibição.
// `campo` é a chave do registro no dados.json; `rotulo` é o texto exibido.
// "Ano" vem primeiro por ser o recorte mais amplo: ele decide o exercício
// sobre o qual todos os outros filtros operam.
export const FILTROS = [
  { id: 'ano',       campo: 'ano',        rotulo: 'Ano' },
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

// O service worker serve o app pelo cache e o dados.json pela rede, então as
// duas metades podem ficar em versões diferentes por alguns minutos após um
// deploy. Antes da Regra 2 reescrita, `inconsistencias` era uma lista de
// STRINGS; hoje é uma lista de objetos. Normalizar aqui evita que uma
// combinação app-novo/dados-antigos derrube a renderização.
function normalizarInconsistencia(item) {
  if (typeof item === 'string') {
    return {
      tipo: 'uo_justificativa',
      gravidade: 'media',
      rotulo: 'Inconsistência',
      descricao: item,
      evidencia: '',
      uoSugerida: '',
      revisado: false,
    }
  }
  if (!item || typeof item !== 'object') return null
  return {
    tipo: item.tipo || 'uo_justificativa',
    gravidade: item.gravidade === 'alta' ? 'alta' : 'media',
    rotulo: item.rotulo || 'Inconsistência',
    descricao: item.descricao || '',
    evidencia: item.evidencia || '',
    uoSugerida: item.uoSugerida || '',
    forcaUO: item.forcaUO || '',
    forcaCitada: item.forcaCitada || '',
    revisado: Boolean(item.revisado),
  }
}

export async function carregarDados() {
  const resp = await fetch('./dados.json')
  if (!resp.ok) throw new Error(`Falha ao carregar dados (${resp.status})`)
  const dados = await resp.json()
  for (const r of dados.registros) {
    // A Força vem calculada do pipeline; o cálculo local é só reserva para
    // um dados.json anterior a esse campo.
    r.orgao = r.orgao || orgaoDeUO(r.uoCod, r.uo)
    r.inconsistencias = (r.inconsistencias || []).map(normalizarInconsistencia).filter(Boolean)
  }
  return dados
}

// Aplica todos os filtros a um conjunto de registros.
// `filtros` = { idDoFiltro: Set(valores selecionados) } — Set vazio = sem filtro.
// `ignorar` = id de filtro, ou lista de ids, a deixar de fora deste recorte.
// (Encadear duas chamadas não substitui a lista: a primeira já teria removido
// os registros que a segunda precisa enxergar.)
export function filtrarRegistros(registros, filtros, ignorar = null) {
  const fora = new Set(ignorar === null ? [] : [].concat(ignorar))
  return registros.filter((r) =>
    FILTROS.every((f) => {
      if (fora.has(f.id)) return true
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
      // OM beneficiada e objeto (quando identificados na planilha). Uma emenda
      // pode ter mais de um item com OM diferente, por isso são listas.
      oms: [...new Set(itens.map((i) => i.om).filter(Boolean))],
      objetos: [...new Set(itens.map((i) => i.objeto).filter(Boolean))],
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
  'light-dark(#008300, #008300)', // verde
  'light-dark(#2a78d6, #3987e5)', // azul
  'light-dark(#1baf7a, #199e70)', // verde-azulado
  'light-dark(#eb6834, #d95926)', // laranja
  'light-dark(#e34948, #e66767)', // vermelho
]
// RP6 de autoria que não é Deputado nem Senador (comissões). Tons distintos
// dos de RP6-Dep (magenta) e RP6-Sen (violeta) para não confundir a leitura.
const PALETA_OUTROS_RP6 = [
  'light-dark(#e34948, #e66767)', // vermelho
  'light-dark(#eb6834, #d95926)', // laranja
  'light-dark(#1baf7a, #199e70)', // verde-azulado
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

// O C Mil A é uma estrutura do Exército, portanto o comparativo por comando
// considera apenas registros de UO do Exército. O teste é feito pelo campo
// `orgao` (calculado no pipeline) e não por uma lista fixa de códigos: assim
// uma UO nova do Exército entra no gráfico sozinha.
export const ehExercito = (r) => r.orgao === 'EXÉRCITO'

// "NÃO SE APLICA" é o C Mil A dos autores sem UF (comissões). Não é um comando
// militar de área, então fica fora dos gráficos por C Mil A — apareceria como
// uma barra sem par possível de comparação.
export const CMILA_SEM_COMANDO = 'NÃO SE APLICA'
const ehComando = (c) => Boolean(c) && c !== CMILA_SEM_COMANDO && c !== '—'

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
    if (!ehExercito(r)) continue
    const c = r.cmila
    if (!ehComando(c)) continue
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

// Em 2020 a planilha deixou 71 linhas sem "Autor (Tipo)" — são parlamentares de
// verdade (emenda INDIVIDUAL, com UF), e o pipeline os rotula "NÃO INFORMADO"
// em vez de adivinhar a Casa. Eles entram no ranking, com sigla neutra: deixá-los
// de fora faria o ranking de 2020 mentir por omissão.
const ehParlamentar = (r) => AUTOR_TIPO_SIGLA[r.autorTipo] || r.modalidade === 'INDIVIDUAL'

export function topAutores(registros, n = 10) {
  const m = new Map()
  for (const r of registros) {
    if (!ehParlamentar(r)) continue
    const sigla = AUTOR_TIPO_SIGLA[r.autorTipo] || '—'
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

// Impositivas = TODO o RP6 + TODO o RP7. Os segmentos são só a maneira de
// mostrar essa soma; nenhum registro de RP6/RP7 pode ficar de fora, ou o card
// "Impositivas" do Dashboard passa a divergir do card do Histórico.
// (Era o que acontecia: RP6 só era fatiado em Deputado Federal e Senador, e o
// RP6 de autoria de comissão — presente em 2022, 2023 e 2024 — sumia da conta.)
export function valorImpositivas(registros) {
  const soma = (pred) => registros.filter(pred).reduce((acc, r) => acc + r.valor, 0)

  // RP6 — segmentos fixos por Autor (Tipo).
  const fatias = [
    { chave: 'rp6-dep', rotulo: 'RP6 · Deputado Federal', rotuloCurto: 'Dep. Federal', cor: COR_RP6_DEP,
      valor: soma((r) => String(r.rp) === '6' && r.autorTipo === 'DEPUTADO FEDERAL') },
    { chave: 'rp6-sen', rotulo: 'RP6 · Senador', rotuloCurto: 'Senador', cor: COR_RP6_SEN,
      valor: soma((r) => String(r.rp) === '6' && r.autorTipo === 'SENADOR') },
  ]

  // RP6 de qualquer outro tipo de autor (comissões). Uma fatia por tipo, e só
  // quando existe — na maioria dos exercícios a lista sai vazia.
  const outrosRP6 = new Map()
  for (const r of registros) {
    if (String(r.rp) !== '6') continue
    if (r.autorTipo === 'DEPUTADO FEDERAL' || r.autorTipo === 'SENADOR') continue
    const t = r.autorTipo || 'Sem tipo de autor'
    outrosRP6.set(t, (outrosRP6.get(t) || 0) + r.valor)
  }
  ;[...outrosRP6.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach((tipo, i) => {
    fatias.push({
      chave: `rp6-outro-${tipo}`,
      rotulo: `RP6 · ${tituloBR(tipo)}`,
      rotuloCurto: tituloBR(tipo).replace(/^Comissão\s+/i, 'Com. '),
      cor: PALETA_OUTROS_RP6[i % PALETA_OUTROS_RP6.length],
      valor: outrosRP6.get(tipo),
    })
  })

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
// Aba "Histórico" — comparativos entre exercícios
// ---------------------------------------------------------------------------
// Todas as funções desta seção recebem os registros JÁ filtrados por tudo
// MENOS o Ano (ver `filtrarRegistros(registros, filtros, 'ano')` no App): a
// aba compara anos, então filtrar por ano aqui esvaziaria a comparação — mas
// filtrar por UO, Força ou C Mil A é justamente o que permite perguntar
// "como evoluiu o Exército?" sem sair da aba.

export const anosPresentes = (registros) =>
  [...new Set(registros.map((r) => String(r.ano)))].filter(Boolean).sort()

// Um card por exercício: valor, emendas, parlamentares, impositivas e a
// variação em relação ao ano anterior da própria série.
export function resumoPorAno(registros) {
  const anos = anosPresentes(registros)
  const porAno = new Map(anos.map((a) => [a, []]))
  for (const r of registros) porAno.get(String(r.ano))?.push(r)

  return anos.map((ano, i, todos) => {
    const itens = porAno.get(ano)
    const impositivo = itens
      .filter((r) => String(r.rp) === '6' || String(r.rp) === '7')
      .reduce((s, r) => s + r.valor, 0)
    const valor = itens.reduce((s, r) => s + r.valor, 0)
    const anterior = i > 0 ? porAno.get(todos[i - 1]).reduce((s, r) => s + r.valor, 0) : null
    return {
      ano,
      valor,
      qtdRegistros: itens.length,
      qtdEmendas: new Set(itens.map((r) => r.emenda)).size,
      qtdParlamentares: new Set(itens.map((r) => r.autor)).size,
      impositivo,
      pctImpositivo: valor ? (impositivo / valor) * 100 : 0,
      // variação percentual sobre o ano anterior; null no primeiro ano
      variacao: anterior ? ((valor - anterior) / anterior) * 100 : null,
    }
  })
}

// Núcleo compartilhado: soma `valor` por (categoria, ano).
// `categoria(r)` devolve a chave da categoria ou null para descartar o registro.
function cruzarAnoCategoria(registros, categoria) {
  const anos = anosPresentes(registros)
  const idx = new Map(anos.map((a, i) => [a, i]))
  const linhas = new Map()
  for (const r of registros) {
    const c = categoria(r)
    if (c === null || c === undefined || c === '') continue
    const chave = typeof c === 'object' ? c.chave : String(c)
    if (!linhas.has(chave)) {
      linhas.set(chave, {
        chave,
        rotulo: typeof c === 'object' ? c.rotulo : String(c),
        sub: typeof c === 'object' ? c.sub || '' : '',
        cor: typeof c === 'object' ? c.cor : undefined,
        valores: anos.map(() => 0),
        emendas: anos.map(() => new Set()),
      })
    }
    const linha = linhas.get(chave)
    const i = idx.get(String(r.ano))
    if (i === undefined) continue
    linha.valores[i] += r.valor
    linha.emendas[i].add(r.emenda)
  }
  const series = [...linhas.values()].map((l) => ({
    ...l,
    qtds: l.emendas.map((s) => s.size),
    total: l.valores.reduce((s, v) => s + v, 0),
  }))
  series.forEach((l) => delete l.emendas)
  return { anos, series: series.sort((a, b) => b.total - a.total) }
}

// Composição por RP em cada ano (cores de identidade do RP, iguais às da rosca).
export function rpPorAno(registros) {
  const { anos, series } = cruzarAnoCategoria(registros, (r) => ({
    chave: String(r.rp),
    rotulo: RP_LABEL(r.rp),
    cor: corDoRP(r.rp),
  }))
  // ordem do RP (e não do valor): a leitura da composição fica estável entre anos
  return { anos, series: series.sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR', { numeric: true })) }
}

// Composição por modalidade da emenda (individual, bancada, comissão).
const COR_MODALIDADE = {
  INDIVIDUAL: 'light-dark(#2a78d6, #3987e5)',
  'BANCADA ESTADUAL': 'light-dark(#eb6834, #d95926)',
  COMISSÃO: 'light-dark(#1baf7a, #199e70)',
  RELATOR: 'light-dark(#4a3aa7, #9085e9)', // emenda de relator — só até 2021
}
const ORDEM_MODALIDADE = ['INDIVIDUAL', 'BANCADA ESTADUAL', 'COMISSÃO', 'RELATOR']

export function modalidadePorAno(registros) {
  const { anos, series } = cruzarAnoCategoria(registros, (r) => ({
    chave: r.modalidade,
    rotulo: tituloBR(r.modalidade),
    cor: COR_MODALIDADE[r.modalidade] || 'light-dark(#7c7a74, #918f88)',
  }))
  const pos = (c) => {
    const i = ORDEM_MODALIDADE.indexOf(c)
    return i === -1 ? ORDEM_MODALIDADE.length : i
  }
  return { anos, series: series.sort((a, b) => pos(a.chave) - pos(b.chave)) }
}

// Impositivas (RP6 + RP7) por ano, com o percentual que representam do total.
export function impositivasPorAno(registros) {
  const { anos, series } = cruzarAnoCategoria(registros, (r) =>
    String(r.rp) === '6' || String(r.rp) === '7'
      ? { chave: `rp${r.rp}`, rotulo: RP_LABEL(r.rp), cor: corDoRP(r.rp) }
      : null
  )
  const totalAno = anos.map((ano) =>
    registros.filter((r) => String(r.ano) === ano).reduce((s, r) => s + r.valor, 0)
  )
  const ordem = { rp6: 0, rp7: 1 }
  return {
    anos,
    totalAno,
    series: series.sort((a, b) => (ordem[a.chave] ?? 9) - (ordem[b.chave] ?? 9)),
  }
}

// Matrizes (linhas = categoria, colunas = ano) — usadas onde há categorias
// demais para caber numa paleta categórica honesta: Força, C Mil A, partidos e
// autores. O ano é lido pela COLUNA, não pela cor.
export function forcaPorAno(registros) {
  return cruzarAnoCategoria(registros, (r) => r.orgao)
}

export function cmilaPorAno(registros) {
  return cruzarAnoCategoria(registros, (r) =>
    ehExercito(r) && (String(r.rp) === '6' || String(r.rp) === '7') && ehComando(r.cmila)
      ? { chave: r.cmila, rotulo: C_MIL_A_NOME[r.cmila] || r.cmila, sub: r.cmila }
      : null
  )
}

export function partidosPorAno(registros, n = 12) {
  const m = cruzarAnoCategoria(registros, (r) => {
    const p = (r.partido || '').trim()
    return !p || p === 'S/PARTIDO' ? null : p
  })
  return { ...m, series: m.series.slice(0, n) }
}

// Autores recorrentes: parlamentares (exclui comissões e bancadas) ordenados
// primeiro pelo nº de exercícios em que apresentaram emenda e depois pelo valor
// — a pergunta é "quem está sempre presente", não "quem pediu mais uma vez".
const ROTULO_CASA = { 'DEPUTADO FEDERAL': 'Dep. Federal', SENADOR: 'Senador' }

export function autoresRecorrentes(registros, n = 12) {
  const m = cruzarAnoCategoria(registros, (r) =>
    ehParlamentar(r)
      ? {
          chave: r.autor,
          rotulo: tituloBR(r.autor),
          sub: [ROTULO_CASA[r.autorTipo] || 'Parlamentar', r.autorUF !== 'NA' ? r.autorUF : '']
            .filter(Boolean).join(' · '),
        }
      : null
  )
  const comAnos = m.series.map((s) => ({ ...s, nAnos: s.valores.filter((v) => v > 0).length }))
  return {
    ...m,
    series: comAnos.sort((a, b) => b.nAnos - a.nAnos || b.total - a.total).slice(0, n),
  }
}

// ---------------------------------------------------------------------------
// Formatação pt-BR
// ---------------------------------------------------------------------------
export const fmtBRL = (v) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })

export const fmtMilhoes = (v) =>
  `R$ ${(v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`

export const fmtInt = (v) => v.toLocaleString('pt-BR')

// Número-herói: compacto e legível a distância (bi / mi / mil).
// Devolve { valor, unidade } para que a unidade possa ser tipografada menor.
export function fmtCompacto(v) {
  const n = Math.abs(v)
  const dec = (x, d) => x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
  if (n >= 1e9) return { valor: dec(v / 1e9, 2), unidade: 'bi' }
  if (n >= 1e6) return { valor: dec(v / 1e6, 1), unidade: 'mi' }
  if (n >= 1e3) return { valor: dec(v / 1e3, 0), unidade: 'mil' }
  return { valor: dec(v, 0), unidade: '' }
}

export const fmtPct = (v) =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
