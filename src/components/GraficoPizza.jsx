import { useMemo, useState } from 'react'
import { fmtMilhoes, fmtPct } from '../dados.js'

// Cores por identidade (RP fixo -> cor fixa; nunca reatribuídas quando o
// filtro muda o nº de fatias). Paleta categórica validada (CVD-safe) em
// modo claro e escuro.
const COR_RP = {
  2: { claro: '#2a78d6', escuro: '#3987e5' },
  3: { claro: '#008300', escuro: '#008300' },
  6: { claro: '#e87ba4', escuro: '#d55181' },
  7: { claro: '#eda100', escuro: '#c98500' },
  8: { claro: '#1baf7a', escuro: '#199e70' },
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

const RAIO = 105
const RAIO_INT = 58 // rosca: centro carrega o total
const CX = 160
const CY = 150

function arco(a0, a1) {
  // a0/a1 em radianos, sentido horário a partir do topo
  const p = (a, r) => [CX + r * Math.sin(a), CY - r * Math.cos(a)]
  // Fatia completa (círculo inteiro): um arco SVG com início == fim não
  // desenha nada; renderiza a rosca como dois semicírculos.
  if (a1 - a0 >= 2 * Math.PI - 1e-4) {
    const anel = (r) =>
      `M${CX},${CY - r} A${r},${r} 0 1 1 ${CX},${CY + r} A${r},${r} 0 1 1 ${CX},${CY - r}`
    return `${anel(RAIO)} ${anel(RAIO_INT)}`
  }
  const [x0, y0] = p(a0, RAIO)
  const [x1, y1] = p(a1, RAIO)
  const [x2, y2] = p(a1, RAIO_INT)
  const [x3, y3] = p(a0, RAIO_INT)
  const grande = a1 - a0 > Math.PI ? 1 : 0
  return `M${x0},${y0} A${RAIO},${RAIO} 0 ${grande} 1 ${x1},${y1} L${x2},${y2} A${RAIO_INT},${RAIO_INT} 0 ${grande} 0 ${x3},${y3} Z`
}

export default function GraficoPizza({ dados, total }) {
  const [hover, setHover] = useState(null)

  const fatias = useMemo(() => {
    let acc = 0
    const soma = dados.reduce((s, d) => s + d.valor, 0) || 1
    return dados
      .filter((d) => d.valor > 0)
      .map((d) => {
        const a0 = (acc / soma) * 2 * Math.PI
        acc += d.valor
        const a1 = (acc / soma) * 2 * Math.PI
        const meio = (a0 + a1) / 2
        return { ...d, a0, a1, meio, pct: (d.valor / soma) * 100 }
      })
  }, [dados])

  // Rótulos externos com linha-guia; anticolisão simples por lado.
  const rotulos = useMemo(() => {
    const r = fatias.map((f) => {
      const lado = Math.sin(f.meio) >= 0 ? 1 : -1
      return {
        ...f,
        lado,
        ax: CX + (RAIO + 6) * Math.sin(f.meio),
        ay: CY - (RAIO + 6) * Math.cos(f.meio),
        y: CY - (RAIO + 24) * Math.cos(f.meio),
      }
    })
    for (const lado of [1, -1]) {
      const doLado = r.filter((x) => x.lado === lado).sort((a, b) => a.y - b.y)
      for (let i = 1; i < doLado.length; i++) {
        if (doLado[i].y - doLado[i - 1].y < 18) doLado[i].y = doLado[i - 1].y + 18
      }
    }
    return r
  }, [fatias])

  if (!fatias.length) {
    return <p className="grafico-vazio">Sem valores para os filtros aplicados.</p>
  }

  return (
    <figure className="pizza" aria-label="Gráfico de pizza: valor solicitado por identificador de resultado primário (RP)">
      <svg viewBox="-55 0 430 300" role="img">
        {fatias.map((f) => (
          <path
            key={f.rp}
            d={arco(f.a0, f.a1)}
            fillRule="evenodd"
            fill={corDoRP(f.rp)}
            stroke="var(--superficie)"
            strokeWidth="2"
            opacity={hover === null || hover === f.rp ? 1 : 0.35}
            onMouseEnter={() => setHover(f.rp)}
            onMouseLeave={() => setHover(null)}
          >
            <title>{`${f.rotulo}: ${fmtMilhoes(f.valor)} (${fmtPct(f.pct)})`}</title>
          </path>
        ))}
        {rotulos.map((f) => {
          const tx = f.lado === 1 ? f.ax + 14 : f.ax - 14
          return (
            <g key={f.rp} className="pizza-rotulo" opacity={hover === null || hover === f.rp ? 1 : 0.35}>
              <polyline
                points={`${f.ax},${f.ay} ${tx - f.lado * 4},${f.y} ${tx},${f.y}`}
                fill="none"
                stroke="var(--tinta-fraca)"
                strokeWidth="1"
              />
              <text x={tx + f.lado * 3} y={f.y + 4} textAnchor={f.lado === 1 ? 'start' : 'end'}>
                {f.rotulo} ({fmtPct(f.pct)})
              </text>
            </g>
          )
        })}
        <text className="pizza-centro-valor" x={CX} y={CY - 2} textAnchor="middle">
          {fmtMilhoes(total).replace(' mi', '')}
        </text>
        <text className="pizza-centro-sub" x={CX} y={CY + 16} textAnchor="middle">
          milhões · total
        </text>
      </svg>
      <figcaption className="pizza-legenda">
        {fatias.map((f) => (
          <div
            key={f.rp}
            className="legenda-item"
            onMouseEnter={() => setHover(f.rp)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="legenda-cor" style={{ background: corDoRP(f.rp) }} aria-hidden />
            <span className="legenda-nome">{f.rotulo}</span>
            <span className="legenda-valor">
              {fmtMilhoes(f.valor)} ({fmtPct(f.pct)})
            </span>
          </div>
        ))}
      </figcaption>
    </figure>
  )
}
