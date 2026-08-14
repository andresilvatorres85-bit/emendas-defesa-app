import { useState } from 'react'

// Irmão do BotaoPNG, no mesmo canto do card: exporta ESTE gráfico como um
// slide de PowerPoint. Diferente do PNG, que rasteriza o card da tela, aqui o
// gráfico é remontado como objeto nativo do PowerPoint, com a planilha de dados
// embutida — o slide sai editável, e idêntico ao que o baralho completo gera
// (os dois saem da mesma lista de painéis em pptx.js).
export default function BotaoPPTX({ titulo, onExportar }) {
  const [estado, setEstado] = useState('pronto')

  async function exportar() {
    setEstado('trabalhando')
    try {
      await onExportar()
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
      className="btn-png btn-slide"
      data-sem-exportar
      disabled={estado === 'trabalhando'}
      onClick={exportar}
      title={`Exportar "${titulo}" como um slide de PowerPoint editável`}
      aria-label={`Exportar o gráfico ${titulo} como slide de PowerPoint`}
    >
      {estado === 'trabalhando' ? '…' : estado === 'erro' ? 'erro' : 'PPTX'}
    </button>
  )
}
