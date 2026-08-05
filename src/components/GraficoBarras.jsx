import { useMemo, useState } from 'react'
import { fmtMilhoes } from '../dados.js'

// Comparativo por C Mil A. Uma barra empilhada por comando: RP6 + RP7, com o
// total rotulado na ponta (o total é a própria barra — não precisa de uma
// terceira barra repetindo a soma). Segmentos separados por uma folga de 2px
// na cor da superfície (nunca por borda). Cores validadas (CVD) nos dois modos.
const SERIES = [
  { chave: 'rp6', rotulo: 'RP6', cor: 'var(--serie-magenta)' },
  { chave: 'rp7', rotulo: 'RP7', cor: 'var(--serie-amarelo)' },
]

export default function GraficoBarras({ dados }) {
  const [hover, setHover] = useState(null)

  const max = useMemo(() => Math.max(1, ...dados.map((d) => d.total)), [dados])

  if (!dados.length) {
    return <p className="grafico-vazio">Sem valores impositivos para os filtros aplicados.</p>
  }

  return (
    <figure
      className="cmila"
      aria-label="Gráfico de barras empilhadas: valor impositivo RP6 e RP7 por Comando Militar de Área"
    >
      <ol className="cmila-lista">
        {dados.map((d) => {
          const larguraTotal = (d.total / max) * 100
          return (
            <li className="cmila-item" key={d.cmila}>
              <div className="cmila-topo">
                <span className="cmila-sigla">{d.cmila}</span>
                <span className="cmila-nome">{d.nome}</span>
                <span className="cmila-total">{fmtMilhoes(d.total)}</span>
              </div>
              <div className="cmila-barra" style={{ width: `${larguraTotal}%` }}>
                {SERIES.map((s) =>
                  d[s.chave] > 0 ? (
                    <span
                      key={s.chave}
                      className="cmila-seg"
                      title={`${d.cmila} · ${s.rotulo}: ${fmtMilhoes(d[s.chave])}`}
                      style={{
                        width: `${(d[s.chave] / d.total) * 100}%`,
                        background: s.cor,
                        opacity: hover === null || hover === s.chave ? 1 : 0.35,
                      }}
                      onMouseEnter={() => setHover(s.chave)}
                      onMouseLeave={() => setHover(null)}
                    />
                  ) : null
                )}
              </div>
              <div className="cmila-quebra">
                {/* só as séries com valor: repetir "RP7 R$ 0,0 mi" é ruído */}
                {SERIES.filter((s) => d[s.chave] > 0).map((s) => (
                  <span key={s.chave} className="cmila-quebra-item">
                    <span className="cmila-ponto" style={{ background: s.cor }} aria-hidden />
                    {s.rotulo} {fmtMilhoes(d[s.chave])}
                  </span>
                ))}
              </div>
            </li>
          )
        })}
      </ol>

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
