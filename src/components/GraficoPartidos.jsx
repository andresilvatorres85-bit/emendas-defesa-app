import { useMemo } from 'react'
import { fmtMilhoes, fmtInt } from '../dados.js'

const COR = 'light-dark(#5b4bc4, #9085e9)' // roxo institucional neutro

export default function GraficoPartidos({ dados }) {
  const max = useMemo(() => Math.max(1, ...dados.map((d) => d.valor)), [dados])

  if (!dados.length) {
    return <p className="grafico-vazio">Nenhum partido para os filtros aplicados.</p>
  }

  return (
    <figure className="ranking" aria-label="Valor total de emendas por partido, com a quantidade de emendas">
      <ol className="ranking-lista">
        {dados.map((d, i) => (
          <li className="ranking-item" key={d.partido}>
            <div className="ranking-topo">
              <span className="ranking-nome">
                <span className="ranking-pos">{i + 1}.</span>
                <span className="ranking-autor">{d.partido}</span>
                <span className="ranking-qtd">{fmtInt(d.qtd)} emenda{d.qtd === 1 ? '' : 's'}</span>
              </span>
              <span className="ranking-valor">{fmtMilhoes(d.valor)}</span>
            </div>
            <span className="ranking-trilho">
              <span className="ranking-fill" style={{ width: `${(d.valor / max) * 100}%`, background: COR }} />
            </span>
          </li>
        ))}
      </ol>
    </figure>
  )
}
