import { useMemo, useState } from 'react'
// As cores por RP vivem em dados.js: são identidade do dado, compartilhada com
// o comparativo do Histórico e com a exportação PPTX.
import { corDoRP, fmtMilhoes, fmtPct } from '../dados.js'

const RAIO = 116
const RAIO_INT = 82 // rosca fina: o centro carrega o total (ou a fatia sob o cursor)
const CX = 160
const CY = 150
// Espaço vertical mínimo entre dois rótulos do mesmo lado. Acompanha o corpo
// da fonte do rótulo (.pizza-rotulo text): fonte maior exige respiro maior.
// Rótulo de uma linha só ("Nome (12,3%)") cabe num passo menor.
const GAP_ROTULO = 26
// A caixa útil do viewBox (y de 0 a 300) menos uma folga para ascendente e
// descendente do texto — o rótulo nunca é empurrado para fora do card.
const Y_MIN = 16
const Y_MAX = 286

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
    const positivos = dados.filter((d) => d.valor > 0)
    const soma = positivos.reduce((s, d) => s + d.valor, 0) || 1
    const cruas = positivos.map((d) => {
      const a0 = (acc / soma) * 2 * Math.PI
      acc += d.valor
      const a1 = (acc / soma) * 2 * Math.PI
      // `k` = identidade estável da fatia (chave própria ou o RP); `cor` fixa.
      return { ...d, k: d.chave ?? d.rp, cor: d.cor ?? corDoRP(d.rp), a0, a1, pct: (d.valor / soma) * 100 }
    })
    // Giro da rosca: a maior fatia vai para as 3 horas. Isso tira as fatias
    // pequenas do topo — onde há pouca altura e os rótulos se empilhavam — e
    // as distribui pela lateral esquerda, onde cada rótulo tem linha própria.
    const maior = cruas.reduce((m, d) => (d.valor > m.valor ? d : m), cruas[0] ?? { valor: 0 })
    const giro = maior.a0 === undefined ? 0 : Math.PI / 2 - (maior.a0 + maior.a1) / 2
    return cruas.map((f) => {
      const a0 = f.a0 + giro
      const a1 = f.a1 + giro
      return { ...f, a0, a1, meio: (a0 + a1) / 2 }
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
      // empurra para baixo o que colide…
      for (let i = 1; i < doLado.length; i++) {
        if (doLado[i].y - doLado[i - 1].y < GAP_ROTULO) doLado[i].y = doLado[i - 1].y + GAP_ROTULO
      }
      // …e, se a pilha estourou a base do card, devolve tudo para dentro.
      const excesso = doLado.length ? doLado[doLado.length - 1].y - Y_MAX : 0
      if (excesso > 0) for (const x of doLado) x.y -= excesso
      for (let i = 0; i < doLado.length; i++) {
        doLado[i].y = Math.max(Y_MIN + i * GAP_ROTULO, doLado[i].y)
      }
    }
    return r
  }, [fatias])

  // Fatia sob o cursor: o centro da rosca troca o total pelo valor focado.
  const foco = hover === null ? null : fatias.find((f) => f.k === hover) || null

  if (!fatias.length) {
    return <p className="grafico-vazio">Sem valores para os filtros aplicados.</p>
  }

  return (
    <figure className="pizza" aria-label="Gráfico de pizza: valor solicitado por identificador de resultado primário (RP)">
      <svg viewBox="-186 0 692 300" role="img">
        {fatias.map((f) => (
          <path
            key={f.k}
            d={arco(f.a0, f.a1)}
            fillRule="evenodd"
            fill={f.cor}
            stroke="var(--superficie)"
            strokeWidth="2"
            opacity={hover === null || hover === f.k ? 1 : 0.35}
            onMouseEnter={() => setHover(f.k)}
            onMouseLeave={() => setHover(null)}
          >
            <title>{`${f.rotulo}: ${fmtMilhoes(f.valor)} (${fmtPct(f.pct)})`}</title>
          </path>
        ))}
        {rotulos.map((f) => {
          const tx = f.lado === 1 ? f.ax + 14 : f.ax - 14
          return (
            <g key={f.k} className="pizza-rotulo" opacity={hover === null || hover === f.k ? 1 : 0.35}>
              <polyline
                points={`${f.ax},${f.ay} ${tx - f.lado * 4},${f.y} ${tx},${f.y}`}
                fill="none"
                stroke="var(--tinta-fraca)"
                strokeWidth="1"
              />
              {/* nome e percentual na mesma linha; o viewBox reserva a folga
                  lateral necessária para o rótulo mais longo */}
              <text
                textAnchor={f.lado === 1 ? 'start' : 'end'}
                x={tx + f.lado * 3}
                y={f.y + 5}
              >
                {f.rotuloCurto ?? f.rotulo}
                <tspan className="pizza-rotulo-pct"> ({fmtPct(f.pct)})</tspan>
              </text>
            </g>
          )
        })}
        <text className="pizza-centro-valor" x={CX} y={CY - 2} textAnchor="middle">
          {fmtMilhoes(foco ? foco.valor : total).replace(' mi', '')}
        </text>
        <text className="pizza-centro-sub" x={CX} y={CY + 17} textAnchor="middle">
          {foco ? `milhões · ${fmtPct(foco.pct)}` : 'milhões · total'}
        </text>
        {foco && (
          <text className="pizza-centro-nome" x={CX} y={CY + 33} textAnchor="middle">
            {foco.rotuloCurto ?? foco.rotulo}
          </text>
        )}
      </svg>
      <figcaption className="pizza-legenda">
        {fatias.map((f) => (
          <div
            key={f.k}
            className="legenda-item"
            onMouseEnter={() => setHover(f.k)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="legenda-cor" style={{ background: f.cor }} aria-hidden />
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
