import { useMemo, useState } from 'react'
import { fmtBi } from '../ploa.js'

// Gráfico de cascata (waterfall): cada categoria é uma barra que começa onde a
// anterior terminou, então a altura de cada degrau mostra quanto aquele RP
// acrescenta ao acumulado, e a última barra ("Total") fecha no valor cheio. É
// a leitura que o RP pede — "quanto cada um representa no todo" — melhor que a
// rosca, porque a comparação de tamanhos vira comparação de alturas alinhadas
// a uma mesma base, e não de fatias de ângulo.
//
// SVG com viewBox e preserveAspectRatio: escala sozinho dentro do contêiner, e
// no celular o contêiner rola na horizontal (classe .rolagem-x no pai) quando
// há muitos degraus.
export default function GraficoCascata({
  dados,
  formatar = fmtBi,
  rotuloGrafico = 'Composição em cascata',
}) {
  const [hover, setHover] = useState(null)

  const { passos, max } = useMemo(() => {
    let acc = 0
    const ps = dados.map((d) => {
      const base = acc
      acc += d.valor
      return { ...d, base, topo: acc }
    })
    // A barra de fechamento parte do zero e vai ao total: é o "todo" contra o
    // qual cada degrau é lido.
    ps.push({ chave: '__total', rotulo: 'Total', valor: acc, base: 0, topo: acc, total: true })
    return { passos: ps, max: acc }
  }, [dados])

  if (!dados.length) return <p className="grafico-vazio">Sem dotações para os filtros aplicados.</p>

  // Geometria em unidades de viewBox. Largura cresce com o nº de passos, o que
  // no mobile aciona a rolagem horizontal do contêiner em vez de espremer tudo.
  const N = passos.length
  const LARG_BARRA = 64
  const GAP = 34
  const MARG_X = 16
  const ALT = 360
  const TOPO = 20
  const BASE_Y = 300 // linha do zero; abaixo ficam os rótulos
  const larguraTotal = MARG_X * 2 + N * LARG_BARRA + (N - 1) * GAP
  const y = (v) => BASE_Y - (v / max) * (BASE_Y - TOPO)

  return (
    <figure className="cascata" aria-label={rotuloGrafico}>
      <div className="cascata-viewport">
        <svg
          viewBox={`0 0 ${larguraTotal} ${ALT}`}
          preserveAspectRatio="xMinYMid meet"
          className="cascata-svg"
          style={{ minWidth: `${larguraTotal / 1.7}px` }}
          role="img"
        >
          {/* linha de base */}
          <line x1={MARG_X} y1={BASE_Y} x2={larguraTotal - MARG_X} y2={BASE_Y}
            className="cascata-base" />
          {passos.map((p, i) => {
            const x = MARG_X + i * (LARG_BARRA + GAP)
            const yTopo = y(p.topo)
            const yBase = y(p.base)
            const altura = Math.max(1, yBase - yTopo)
            const cor = p.total ? 'var(--acento)' : (p.cor || 'var(--acento)')
            const ativo = hover === null || hover === p.chave
            return (
              <g
                key={p.chave ?? i}
                opacity={ativo ? 1 : 0.4}
                onMouseEnter={() => setHover(p.chave)}
                onMouseLeave={() => setHover(null)}
              >
                {/* conector do topo do degrau anterior até este */}
                {i > 0 && !p.total && (
                  <line
                    x1={x - GAP} y1={y(p.base)} x2={x} y2={y(p.base)}
                    className="cascata-conector"
                  />
                )}
                <rect
                  x={x} y={yTopo} width={LARG_BARRA} height={altura}
                  fill={cor} rx="2"
                  className={p.total ? 'cascata-barra cascata-barra-total' : 'cascata-barra'}
                />
                <text x={x + LARG_BARRA / 2} y={yTopo - 6} className="cascata-valor" textAnchor="middle">
                  {formatar(p.valor)}
                </text>
                <text x={x + LARG_BARRA / 2} y={BASE_Y + 18} className="cascata-rotulo" textAnchor="middle">
                  {p.rotulo}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <figcaption className="cascata-dica">
        Cada degrau soma ao acumulado; a barra final fecha no total.
      </figcaption>
    </figure>
  )
}
