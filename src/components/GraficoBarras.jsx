import { useMemo, useState } from 'react'
import { fmtMilhoes } from '../dados.js'

// Séries do comparativo por C Mil A. Cores fixas e coerentes com o resto do
// dashboard: RP6 rosa, RP7 âmbar, e o total (RP6+RP7) no verde institucional.
const SERIES = [
  { chave: 'rp6', rotulo: 'RP6', cor: 'light-dark(#e87ba4, #d55181)' },
  { chave: 'rp7', rotulo: 'RP7', cor: 'light-dark(#eda100, #c98500)' },
  { chave: 'total', rotulo: 'RP6+RP7', cor: 'light-dark(#14532d, #2f9e56)' },
]

export default function GraficoBarras({ dados }) {
  const [hover, setHover] = useState(null)

  const max = useMemo(() => Math.max(1, ...dados.map((d) => d.total)), [dados])

  if (!dados.length) {
    return <p className="grafico-vazio">Sem valores impositivos para os filtros aplicados.</p>
  }

  return (
    <figure
      className="barras"
      aria-label="Gráfico de barras: total impositivo (RP6, RP7 e RP6+RP7) por Comando Militar de Área"
    >
      <div className="barras-grupos">
        {dados.map((d) => (
          <div className="barras-grupo" key={d.cmila}>
            <div className="barras-grupo-cab">
              <span className="barras-sigla">{d.cmila}</span>
              <span className="barras-nome">{d.nome}</span>
            </div>
            {SERIES.map((s) => (
              <div
                className="barras-linha"
                key={s.chave}
                onMouseEnter={() => setHover(s.chave)}
                onMouseLeave={() => setHover(null)}
                style={{ opacity: hover === null || hover === s.chave ? 1 : 0.4 }}
              >
                <span className="barras-rotulo">{s.rotulo}</span>
                <span className="barras-trilho">
                  <span
                    className="barras-fill"
                    style={{ width: `${(d[s.chave] / max) * 100}%`, background: s.cor }}
                  />
                </span>
                <span className="barras-valor">{fmtMilhoes(d[s.chave])}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <figcaption className="barras-legenda">
        {SERIES.map((s) => (
          <span
            className="barras-legenda-item"
            key={s.chave}
            onMouseEnter={() => setHover(s.chave)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="legenda-cor" style={{ background: s.cor }} aria-hidden />
            {s.rotulo}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
