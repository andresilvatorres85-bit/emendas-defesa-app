import { useMemo, useState } from 'react'

// Colunas verticais, uma por exercício. O ano é uma dimensão ordenada, então
// ele vai no EIXO (posição), nunca na cor — a cor fica livre para carregar a
// categoria (RP, modalidade…). Três modos:
//
//   empilhado   : segmentos somados dentro da mesma coluna (composição)
//   proporcao   : idem, mas cada coluna vale 100% (perfil, não volume)
//   (padrão)    : séries lado a lado dentro do ano (comparação de grandezas)
//
// Uma única série não ganha legenda — o título do painel já a nomeia.
// Segmentos empilhados são separados por 2px na cor da superfície (folga, não
// borda), e o valor total de cada ano é rotulado direto acima da coluna.
export default function GraficoColunasAno({
  anos,
  series,
  empilhado = false,
  proporcao = false,
  formatar,
  formatarTotal,
  rotuloEixo,
  vazio = 'Sem valores para os filtros aplicados.',
}) {
  const [hover, setHover] = useState(null)

  const { totais, max } = useMemo(() => {
    const t = anos.map((_, i) => series.reduce((s, serie) => s + (serie.valores[i] || 0), 0))
    if (proporcao) return { totais: t, max: 1 }
    const alturas = empilhado ? t : series.flatMap((s) => s.valores)
    return { totais: t, max: Math.max(1, ...alturas) }
  }, [anos, series, empilhado, proporcao])

  if (!anos.length || !series.length || totais.every((t) => t === 0)) {
    return <p className="grafico-vazio">{vazio}</p>
  }

  const fmt = formatar || ((v) => v)
  const fmtTotal = formatarTotal || fmt
  const empilha = empilhado || proporcao

  return (
    <figure className="colunas" aria-label={rotuloEixo || 'Comparativo por exercício'}>
      <div className="colunas-plot" style={{ '--n-anos': anos.length }}>
        {anos.map((ano, i) => {
          const total = totais[i]
          // No modo proporção a coluna sempre ocupa a altura toda; nos demais,
          // a altura é proporcional ao maior valor do gráfico.
          const alturaCol = proporcao ? 100 : (total / max) * 100
          return (
            <div className="colunas-ano" key={ano}>
              <span className="colunas-total">{total > 0 ? fmtTotal(total, i) : ''}</span>
              <div className="colunas-trilho">
                {empilha ? (
                  <div className="colunas-pilha" style={{ height: `${alturaCol}%` }}>
                    {series.map((s) => {
                      const v = s.valores[i] || 0
                      if (v <= 0) return null
                      const parte = total ? (v / total) * 100 : 0
                      return (
                        <span
                          key={s.chave}
                          className="colunas-seg"
                          style={{
                            height: `${parte}%`,
                            background: s.cor,
                            opacity: hover === null || hover === s.chave ? 1 : 0.3,
                          }}
                          title={`${ano} · ${s.rotulo}: ${fmt(v)}`}
                          onMouseEnter={() => setHover(s.chave)}
                          onMouseLeave={() => setHover(null)}
                        />
                      )
                    })}
                  </div>
                ) : (
                  <div className="colunas-grupo">
                    {series.map((s) => {
                      const v = s.valores[i] || 0
                      return (
                        <span
                          key={s.chave}
                          className="colunas-barra"
                          style={{
                            height: `${(v / max) * 100}%`,
                            background: s.cor,
                            opacity: hover === null || hover === s.chave ? 1 : 0.3,
                          }}
                          title={`${ano} · ${s.rotulo}: ${fmt(v)}`}
                          onMouseEnter={() => setHover(s.chave)}
                          onMouseLeave={() => setHover(null)}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
              <span className="colunas-rotulo">{ano}</span>
            </div>
          )
        })}
      </div>

      {series.length > 1 && (
        <figcaption className="barras-legenda">
          {series.map((s) => (
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
      )}
    </figure>
  )
}
