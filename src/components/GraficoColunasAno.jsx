import { useMemo, useState } from 'react'
import { fmtPct } from '../dados.js'

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
//
// `rotularBarras` põe o valor sobre cada barra do modo agrupado e `tendencia`
// desenha, por série, a reta de mínimos quadrados sobre as colunas.

// Reta de tendência por mínimos quadrados sobre (índice do ano, valor).
// Devolve os valores previstos no primeiro e no último ano — dois pontos
// bastam, a reta é reta.
function tendenciaLinear(valores) {
  const n = valores.length
  if (n < 2) return null
  const mediaX = (n - 1) / 2
  const mediaY = valores.reduce((s, v) => s + v, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (i - mediaX) * (valores[i] - mediaY)
    den += (i - mediaX) ** 2
  }
  if (!den) return null
  const a = num / den
  const b = mediaY - a * mediaX
  return { inicio: b, fim: a * (n - 1) + b, inclinacao: a }
}

export default function GraficoColunasAno({
  anos,
  series,
  empilhado = false,
  proporcao = false,
  formatar,
  formatarTotal,
  rotularBarras = false,
  // Rótulo de percentual em cada barra do modo agrupado: a fatia daquela série
  // (Força) no total do ANO. Independente de `rotularBarras` (que mostra o
  // valor absoluto) — este mostra o percentual.
  rotularPercentual = false,
  tendencia = false,
  // Uma cor por POSIÇÃO do eixo (não por série), aplicada sobre cada barra
  // agrupada daquela categoria. Usada quando o eixo é a Força e cada série
  // (PL, Autógrafo) deve herdar a tonalidade da Força, distinguindo-se só pela
  // opacidade. `corPorColuna[i]` corresponde ao rótulo `anos[i]`.
  corPorColuna = null,
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

  // As retas são desenhadas num SVG esticado sobre a área de plotagem. Como as
  // colunas ficam num grid sem gap, o centro do ano `i` é exatamente
  // (i + 0,5) / n da largura — não há folga a descontar.
  const retas = useMemo(() => {
    if (!tendencia) return []
    const n = anos.length
    return series
      .map((s) => {
        const t = tendenciaLinear(s.valores)
        if (!t) return null
        const y = (v) => 100 - (Math.min(Math.max(v, 0), max) / max) * 100
        return {
          chave: s.chave, rotulo: s.rotulo, cor: s.cor, inclinacao: t.inclinacao,
          x1: (0.5 / n) * 100, y1: y(t.inicio),
          x2: ((n - 0.5) / n) * 100, y2: y(t.fim),
        }
      })
      .filter(Boolean)
  }, [tendencia, series, anos.length, max])

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
              <div className={`colunas-trilho${(rotularBarras || rotularPercentual) ? ' rotulado' : ''}`}>
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
                    {series.map((s, si) => {
                      const v = s.valores[i] || 0
                      // Cor da barra: se `corPorColuna` está ativo, a barra herda
                      // a cor da categoria (Força) do eixo, e as séries se
                      // separam por uma leve variação de tom — a 2ª série (e
                      // seguintes) é misturada com a superfície, ficando mais
                      // clara sem perder o matiz da Força.
                      const corBase = corPorColuna ? corPorColuna[i] : s.cor
                      const cor = corPorColuna && si > 0
                        ? `color-mix(in oklab, ${corBase} ${Math.max(30, 70 - si * 25)}%, var(--superficie))`
                        : corBase
                      return (
                        <span
                          key={s.chave}
                          className="colunas-barra"
                          style={{
                            height: `${(v / max) * 100}%`,
                            background: cor,
                            opacity: hover === null || hover === s.chave ? 1 : 0.3,
                          }}
                          title={`${ano} · ${s.rotulo}: ${fmt(v)}`}
                          onMouseEnter={() => setHover(s.chave)}
                          onMouseLeave={() => setHover(null)}
                        >
                          {rotularBarras && v > 0 && (
                            <span className="colunas-barra-rotulo">{fmt(v)}</span>
                          )}
                          {rotularPercentual && v > 0 && totais[i] > 0 && (
                            <span className="colunas-barra-rotulo">
                              {fmtPct((v / totais[i]) * 100)}
                            </span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
              <span className="colunas-rotulo">{ano}</span>
            </div>
          )
        })}

        {retas.length > 0 && (
          <svg
            className="colunas-tendencias"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {retas.map((r) => (
              <line
                key={r.chave}
                x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
                stroke={r.cor}
                strokeWidth="2"
                strokeDasharray="7 5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                opacity={hover === null || hover === r.chave ? 0.95 : 0.2}
              />
            ))}
          </svg>
        )}
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
          {retas.length > 0 && (
            <span className="barras-legenda-item">
              <span className="legenda-tracejo" aria-hidden />
              Linha tracejada: tendência do período
            </span>
          )}
        </figcaption>
      )}
    </figure>
  )
}
