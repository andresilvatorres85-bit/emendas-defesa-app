import { useState } from 'react'
import { exportarPNG } from '../exportar.js'

// Botão pequeno no canto superior direito de cada card de gráfico. Exporta o
// próprio card em PNG de alta definição, no tema em uso e com os filtros
// aplicados no instante do clique (o clone sai do DOM vivo).
export default function BotaoPNG({ titulo, contexto }) {
  const [estado, setEstado] = useState('pronto')

  async function exportar(e) {
    const card = e.currentTarget.closest('.painel-grafico')
    if (!card) return
    setEstado('trabalhando')
    try {
      await exportarPNG(card, titulo, contexto)
      setEstado('pronto')
    } catch (erro) {
      console.error(erro)
      setEstado('erro')
      setTimeout(() => setEstado('pronto'), 2500)
    }
  }

  return (
    <button
      type="button"
      className="btn-png"
      data-sem-exportar
      disabled={estado === 'trabalhando'}
      onClick={exportar}
      title={`Exportar "${titulo}" em PNG de alta definição`}
      aria-label={`Exportar o gráfico ${titulo} em PNG`}
    >
      {estado === 'trabalhando' ? '…' : estado === 'erro' ? 'erro' : 'PNG'}
    </button>
  )
}
