import { useMemo, useState } from 'react'
import { fmtBi, fmtVar, variacao } from '../ploa.js'

// Barras horizontais para as categorias do PLOA (agregado por Força, UO, ação,
// GND). Horizontal, e não coluna, porque os rótulos aqui são longos — nome de
// UO e de ação orçamentária não cabem sob uma coluna sem girar o texto.
//
// Com `comparar`, cada item mostra DUAS barras: o valor do PL (traço fino,
// atrás) e o do autógrafo (barra cheia). É a leitura que interessa nesta base
// — não "quanto tem", mas "quanto mudou no rito" —, e a variação percentual
// sai escrita ao lado, com seta: a direção nunca é dada só pela cor.
//
// A escala é comum a todos os itens (o mesmo `max`), senão barras de tamanho
// parecido representariam valores de ordens de grandeza diferentes.
export default function GraficoBarrasPLOA({
  dados,
  comparar = false,
  corPadrao = 'var(--acento)',
  formatar = fmtBi,
  vazio = 'Sem dotações para os filtros aplicados.',
  rotuloGrafico = 'Valor por categoria',
}) {
  const [hover, setHover] = useState(null)

  const max = useMemo(
    () => Math.max(1, ...dados.map((d) => Math.max(d.valor || 0, comparar ? d.pl || 0 : 0))),
    [dados, comparar]
  )

  if (!dados.length) return <p className="grafico-vazio">{vazio}</p>

  return (
    <figure className="pbar" aria-label={rotuloGrafico}>
      <ol className="pbar-lista">
        {dados.map((d, i) => {
          const valor = d.valor || 0
          const pl = d.pl || 0
          const pct = comparar ? variacao(pl, valor) : null
          const ativo = hover === null || hover === d.chave
          return (
            <li
              className="pbar-item"
              key={d.chave ?? `${d.rotulo}-${i}`}
              style={{ opacity: ativo ? 1 : 0.45 }}
              onMouseEnter={() => setHover(d.chave)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="pbar-topo">
                <span className="pbar-rotulo" title={d.sublinha || d.rotulo}>
                  <span className="pbar-chave" style={{ background: d.cor || corPadrao }} aria-hidden />
                  <span className="pbar-nome">{d.rotulo}</span>
                  {d.sublinha && <span className="pbar-sub">{d.sublinha}</span>}
                </span>
                <span className="pbar-valor">{formatar(valor)}</span>
              </div>

              <div className="pbar-trilho">
                <span
                  className="pbar-barra"
                  style={{ width: `${(valor / max) * 100}%`, background: d.cor || corPadrao }}
                  title={`${d.rotulo}: ${formatar(valor)}`}
                />
                {comparar && pl > 0 && (
                  <span
                    className="pbar-marca-pl"
                    style={{ left: `${(pl / max) * 100}%` }}
                    title={`PL: ${formatar(pl)}`}
                    aria-hidden
                  />
                )}
              </div>

              {comparar && (
                <p className="pbar-nota">
                  <span className="pbar-nota-pl">PL {formatar(pl)}</span>
                  <span className={pct === null ? 'var-nula' : pct >= 0 ? 'var-sobe' : 'var-desce'}>
                    {pct === null ? 'sem valor no PL' : `${pct >= 0 ? '▲' : '▼'} ${fmtVar(pct)}`}
                  </span>
                </p>
              )}
            </li>
          )
        })}
      </ol>

      {comparar && (
        <figcaption className="barras-legenda">
          <span className="barras-legenda-item">
            <span className="legenda-cor" style={{ background: corPadrao }} aria-hidden />
            Barra: valor no autógrafo
          </span>
          <span className="barras-legenda-item">
            <span className="legenda-marca-pl" aria-hidden />
            Traço: valor no PL enviado pelo Executivo
          </span>
        </figcaption>
      )}
    </figure>
  )
}
