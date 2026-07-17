import { useMemo, useState } from 'react'
import { fmtMilhoes } from '../dados.js'

// Cor por tipo de autor (reforça a leitura, além do prefixo Dep/Sen).
const COR_TIPO = {
  Dep: 'light-dark(#2a78d6, #3987e5)', // azul
  Sen: 'light-dark(#0e7c86, #2bb7c4)', // verde-azulado
}

export default function GraficoBarrasSimples({ dados }) {
  const [hover, setHover] = useState(null)

  const max = useMemo(() => Math.max(1, ...dados.map((d) => d.valor)), [dados])

  if (!dados.length) {
    return <p className="grafico-vazio">Sem autores (Deputado/Senador) para os filtros aplicados.</p>
  }

  return (
    <figure className="ranking" aria-label="Ranking dos autores por valor total de emendas (Deputados Federais e Senadores)">
      <ol className="ranking-lista">
        {dados.map((d, i) => {
          const cor = COR_TIPO[d.sigla] || 'var(--acento)'
          return (
            <li
              className="ranking-item"
              key={d.autor}
              onMouseEnter={() => setHover(d.sigla)}
              onMouseLeave={() => setHover(null)}
              style={{ opacity: hover === null || hover === d.sigla ? 1 : 0.45 }}
            >
              <div className="ranking-topo">
                <span className="ranking-nome">
                  <span className="ranking-pos">{i + 1}.</span>
                  <span className="ranking-sigla" style={{ color: cor }}>{d.sigla}</span>
                  <span className="ranking-autor">{d.nome}</span>
                  {d.uf && d.uf !== 'NA' && <span className="ranking-uf">· {d.uf}</span>}
                </span>
                <span className="ranking-valor">{fmtMilhoes(d.valor)}</span>
              </div>
              <span className="ranking-trilho">
                <span
                  className="ranking-fill"
                  style={{ width: `${(d.valor / max) * 100}%`, background: cor }}
                />
              </span>
            </li>
          )
        })}
      </ol>

      <figcaption className="barras-legenda">
        <span
          className="barras-legenda-item"
          onMouseEnter={() => setHover('Dep')}
          onMouseLeave={() => setHover(null)}
        >
          <span className="legenda-cor" style={{ background: COR_TIPO.Dep }} aria-hidden />
          Dep · Deputado Federal
        </span>
        <span
          className="barras-legenda-item"
          onMouseEnter={() => setHover('Sen')}
          onMouseLeave={() => setHover(null)}
        >
          <span className="legenda-cor" style={{ background: COR_TIPO.Sen }} aria-hidden />
          Sen · Senador
        </span>
      </figcaption>
    </figure>
  )
}
