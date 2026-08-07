// ---------------------------------------------------------------------------
// Estado sincronizado com a URL (query params), garantindo:
//  - botão "voltar" do navegador funcional para troca de aba e abertura de
//    detalhe de cartão (pushState);
//  - filtros refletidos na URL para compartilhamento de links (replaceState,
//    para não poluir o histórico a cada clique em checkbox);
//  - isolamento total entre abas/usuários (a URL e o estado são locais à aba).
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useRef, useState } from 'react'
import { FILTROS } from './dados.js'

const SEP = '|' // separador de múltiplos valores num mesmo parâmetro

function lerUrl() {
  const p = new URLSearchParams(window.location.search)
  const filtros = {}
  const naUrl = new Set()
  for (const f of FILTROS) {
    const bruto = p.get(f.id)
    if (bruto !== null) naUrl.add(f.id)
    filtros[f.id] = new Set(bruto ? bruto.split(SEP).filter(Boolean) : [])
  }
  return {
    aba: p.get('aba') || 'dashboard',
    detalhe: p.get('det') || null,
    filtros,
    // quais filtros vieram escritos na URL — um link compartilhado sempre
    // vence o padrão (ver `definirPadrao`)
    naUrl,
  }
}

function montarUrl({ aba, detalhe, filtros }) {
  const p = new URLSearchParams()
  if (aba && aba !== 'dashboard') p.set('aba', aba)
  for (const f of FILTROS) {
    const sel = filtros[f.id]
    if (sel && sel.size) p.set(f.id, [...sel].join(SEP))
  }
  if (detalhe) p.set('det', detalhe)
  const q = p.toString()
  return window.location.pathname + (q ? `?${q}` : '')
}

export function useUrlState() {
  const [estado, setEstado] = useState(lerUrl)
  // Valores padrão de filtro (hoje só o Ano, que só é conhecido depois que o
  // dados.json chega). Guardados fora do state para que "Limpar filtros"
  // volte ao padrão em vez de esvaziar tudo.
  const padroes = useRef({})

  // Botão voltar/avançar do navegador
  useEffect(() => {
    const onPop = () => setEstado(lerUrl())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const irParaAba = useCallback((aba) => {
    setEstado((e) => {
      const novo = { ...e, aba, detalhe: null }
      window.history.pushState(null, '', montarUrl(novo))
      return novo
    })
  }, [])

  const abrirDetalhe = useCallback((emenda) => {
    setEstado((e) => {
      const novo = { ...e, detalhe: e.detalhe === emenda ? null : emenda }
      window.history.pushState(null, '', montarUrl(novo))
      return novo
    })
  }, [])

  const setFiltro = useCallback((id, valores) => {
    setEstado((e) => {
      const novo = { ...e, filtros: { ...e.filtros, [id]: valores } }
      window.history.replaceState(null, '', montarUrl(novo))
      return novo
    })
  }, [])

  // Define o valor inicial de um filtro. Só vale para quem abriu o app sem
  // aquele parâmetro na URL: um link compartilhado (inclusive um que
  // deliberadamente traga o filtro vazio) manda mais que o padrão. Aplicado
  // com replaceState — o padrão não é um passo do histórico de navegação.
  const definirPadrao = useCallback((id, valores) => {
    if (padroes.current[id]) return
    padroes.current[id] = new Set(valores)
    setEstado((e) => {
      if (e.naUrl.has(id)) return e
      const novo = { ...e, filtros: { ...e.filtros, [id]: new Set(valores) } }
      window.history.replaceState(null, '', montarUrl(novo))
      return novo
    })
  }, [])

  const limparFiltros = useCallback(() => {
    setEstado((e) => {
      const base = {}
      for (const f of FILTROS) base[f.id] = new Set(padroes.current[f.id] ?? [])
      const novo = { ...e, filtros: base }
      window.history.replaceState(null, '', montarUrl(novo))
      return novo
    })
  }, [])

  // `padrao` deixa o App perguntar se um filtro está no valor padrão — é o que
  // decide se o botão "Limpar filtros" aparece e se o recorte é o de sempre.
  const noPadrao = useCallback((id, sel) => {
    const p = padroes.current[id] ?? new Set()
    if (p.size !== (sel?.size ?? 0)) return false
    for (const v of p) if (!sel.has(v)) return false
    return true
  }, [])

  return { ...estado, irParaAba, abrirDetalhe, setFiltro, limparFiltros, definirPadrao, noPadrao }
}
