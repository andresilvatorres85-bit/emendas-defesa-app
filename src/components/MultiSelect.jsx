import { useEffect, useRef, useState } from 'react'

// Dropdown de múltipla seleção com busca, usado pelos 10 filtros.
export default function MultiSelect({ rotulo, opcoes, selecionados, onChange }) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!aberto) return
    const fechar = (ev) => {
      if (ref.current && !ref.current.contains(ev.target)) setAberto(false)
    }
    const esc = (ev) => ev.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fechar)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fechar)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  const alternar = (valor) => {
    const novo = new Set(selecionados)
    novo.has(valor) ? novo.delete(valor) : novo.add(valor)
    onChange(novo)
  }

  const visiveis = busca
    ? opcoes.filter((o) => o.rotulo.toLowerCase().includes(busca.toLowerCase()))
    : opcoes

  return (
    <div className="ms" ref={ref}>
      <button
        type="button"
        className={`ms-botao${selecionados.size ? ' ativo' : ''}`}
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        aria-haspopup="listbox"
      >
        {rotulo}
        {selecionados.size > 0 && <span className="ms-badge">{selecionados.size}</span>}
        <span className="ms-seta" aria-hidden>▾</span>
      </button>
      {aberto && (
        <div className="ms-painel" role="listbox" aria-multiselectable="true">
          {opcoes.length > 6 && (
            <input
              className="ms-busca"
              type="search"
              placeholder="Buscar…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              autoFocus
            />
          )}
          <div className="ms-opcoes">
            {visiveis.map((o) => (
              <label key={o.valor} className="ms-opcao">
                <input
                  type="checkbox"
                  checked={selecionados.has(o.valor)}
                  onChange={() => alternar(o.valor)}
                />
                <span className="ms-rotulo">{o.rotulo || '(vazio)'}</span>
                <span className="ms-n">{o.n}</span>
              </label>
            ))}
            {visiveis.length === 0 && <div className="ms-vazio">Nenhuma opção</div>}
          </div>
          {selecionados.size > 0 && (
            <button type="button" className="ms-limpar" onClick={() => onChange(new Set())}>
              Limpar seleção
            </button>
          )}
        </div>
      )}
    </div>
  )
}
