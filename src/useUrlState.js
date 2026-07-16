// ---------------------------------------------------------------------------
// Estado sincronizado com a URL (query params), garantindo:
//  - botão "voltar" do navegador funcional para troca de aba e abertura de
//    detalhe de cartão (pushState);
//  - filtros refletidos na URL para compartilhamento de links (replaceState,
//    para não poluir o histórico a cada clique em checkbox);
//  - isolamento total entre abas/usuários (a URL e o estado são locais à aba).
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useState } from 'react'
import { FILTROS } from './dados.js'

const SEP = '|' // separador de múltiplos valores num mesmo parâmetro

function lerUrl() {
  const p = new URLSearchParams(window.location.search)
  const filtros = {}
  for (const f of FILTROS) {
    const bruto = p.get(f.id)
    filtros[f.id] = new Set(bruto ? bruto.split(SEP).filter(Boolean) : [])
  }
  return {
    aba: p.get('aba') || 'dashboard',
    detalhe: p.get('det') || null,
    filtros,
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

  const limparFiltros = useCallback(() => {
    setEstado((e) => {
      const vazio = {}
      for (const f of FILTROS) vazio[f.id] = new Set()
      const novo = { ...e, filtros: vazio }
      window.history.replaceState(null, '', montarUrl(novo))
      return novo
    })
  }, [])

  return { ...estado, irParaAba, abrirDetalhe, setFiltro, limparFiltros }
}
