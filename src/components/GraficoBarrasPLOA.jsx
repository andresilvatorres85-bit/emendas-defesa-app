import { useMemo, useState } from 'react'
import { fmtPct } from '../dados.js'
import { fmtBi, fmtVar, variacao } from '../ploa.js'

// Barras horizontais para as categorias do PLOA (agregado por Força, UO, ação,
// GND). Horizontal, e não coluna, porque os rótulos aqui são longos — nome de
// UO e de ação orçamentária não cabem sob uma coluna sem girar o texto.
//
// Com `comparar`, cada item mostra o par PL × autógrafo. Qual dos dois é a
// BARRA cheia e qual é o TRAÇO é escolha de quem chama, via `barra`:
//   barra="pl"        → barra = PL, traço = autógrafo   (pedido em UO e Ação)
//   barra="autografo" → barra = autógrafo, traço = PL   (padrão histórico)
// A escala é comum a todos os itens (o mesmo `max`), senão barras de tamanho
// parecido representariam valores de ordens de grandeza diferentes.
//
// `limite` mostra só os N primeiros itens e revela o resto em blocos de
// `passoExpansao` com um botão "Mostrar +/−" — a lista de ações tem ~150 itens
// e a de UO uma dúzia; expor tudo de uma vez afogaria o card.
export default function GraficoBarrasPLOA({
  dados,
  comparar = false,
  barra = 'autografo',
  corPadrao = 'var(--acento)',
  formatar = fmtBi,
  vazio = 'Sem dotações para os filtros aplicados.',
  rotuloGrafico = 'Valor por categoria',
  corNumero = null, // cor do código destacado no rótulo (item Ação)
  limite = null,
  passoExpansao = 15,
  mostrarPercentual = false, // exibe, ao lado do valor, a fatia da categoria no total
  // Autógrafo ainda não disponível na planilha (início do rito): a barra mostra
  // só o PL, o traço do autógrafo some e a linha de comparação de cada item sai
  // em branco em vez de fingir uma variação de −100% contra um valor que não
  // existe. Só faz sentido com `barra="pl"`.
  semAutografo = false,
}) {
  const [hover, setHover] = useState(null)
  const [mostrar, setMostrar] = useState(limite ?? dados.length)

  // O maior valor entre as duas pontas define a escala, seja qual for a barra.
  const max = useMemo(
    () => Math.max(1, ...dados.map((d) => Math.max(d.valor || 0, comparar ? d.pl || 0 : 0))),
    [dados, comparar]
  )
  // Total do conjunto INTEIRO (não só os itens visíveis) para o percentual —
  // senão a fatia de cada categoria mudaria ao expandir a lista. Usa a mesma
  // ponta que a barra exibe (PL quando barra="pl", autógrafo caso contrário).
  const totalPct = useMemo(
    () => dados.reduce((s, d) => s + (comparar && barra === 'pl' ? d.pl || 0 : d.valor || 0), 0),
    [dados, comparar, barra]
  )

  if (!dados.length) return <p className="grafico-vazio">{vazio}</p>

  const barraEhPL = barra === 'pl'
  const visiveis = limite === null ? dados : dados.slice(0, mostrar)
  const restam = dados.length - visiveis.length
  const proximo = Math.min(passoExpansao, restam)

  const rotuloBarra = barraEhPL ? 'PL enviado pelo Executivo' : 'valor no autógrafo'
  const rotuloTraco = barraEhPL ? 'valor no autógrafo' : 'PL enviado pelo Executivo'

  return (
    <figure className="pbar" aria-label={rotuloGrafico}>
      <ol className="pbar-lista">
        {visiveis.map((d, i) => {
          const autografo = d.valor || 0
          const pl = d.pl || 0
          // valor da BARRA e valor do TRAÇO conforme a escolha de `barra`.
          const vBarra = comparar && barraEhPL ? pl : autografo
          const vTraco = comparar ? (barraEhPL ? autografo : pl) : null
          const pct = comparar ? variacao(pl, autografo) : null
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
                  {d.codigo && (
                    <span className="pbar-codigo" style={corNumero ? { color: corNumero } : undefined}>
                      {d.codigo}
                    </span>
                  )}
                  <span className="pbar-nome">{d.rotulo}</span>
                  {d.sublinha && !d.codigo && <span className="pbar-sub">{d.sublinha}</span>}
                </span>
                <span className="pbar-valor">
                  {formatar(vBarra)}
                  {mostrarPercentual && totalPct > 0 && (
                    <span className="pbar-pct"> ({fmtPct((vBarra / totalPct) * 100)})</span>
                  )}
                </span>
              </div>

              <div className="pbar-trilho">
                <span
                  className="pbar-barra"
                  style={{ width: `${(vBarra / max) * 100}%`, background: d.cor || corPadrao }}
                  title={`${rotuloBarra}: ${formatar(vBarra)}`}
                />
                {comparar && !semAutografo && vTraco > 0 && (
                  <span
                    className="pbar-marca-pl"
                    style={{ left: `${(vTraco / max) * 100}%` }}
                    title={`${rotuloTraco}: ${formatar(vTraco)}`}
                    aria-hidden
                  />
                )}
              </div>

              {comparar && (
                <p className="pbar-nota">
                  {semAutografo ? (
                    <span className="pbar-nota-pl var-nula">Autógrafo — (ainda não na planilha)</span>
                  ) : (
                    <>
                      <span className="pbar-nota-pl">
                        {barraEhPL ? `Autógrafo ${formatar(autografo)}` : `PL ${formatar(pl)}`}
                      </span>
                      <span className={pct === null ? 'var-nula' : pct >= 0 ? 'var-sobe' : 'var-desce'}>
                        {pct === null ? 'sem valor no PL' : `${pct >= 0 ? '▲' : '▼'} ${fmtVar(pct)}`}
                      </span>
                    </>
                  )}
                </p>
              )}
            </li>
          )
        })}
      </ol>

      {limite !== null && (restam > 0 || mostrar > limite) && (
        <div className="pbar-expansao no-print">
          {restam > 0 && (
            <button type="button" className="pbar-btn" onClick={() => setMostrar((m) => m + proximo)}>
              Mostrar + <span className="pbar-btn-nota">({proximo} de {restam} restantes)</span>
            </button>
          )}
          {mostrar > limite && (
            <button type="button" className="pbar-btn" onClick={() => setMostrar(limite)}>
              Mostrar −
            </button>
          )}
        </div>
      )}

      {comparar && (
        <figcaption className="barras-legenda">
          <span className="barras-legenda-item">
            <span className="legenda-cor" style={{ background: corPadrao }} aria-hidden />
            Barra: {rotuloBarra}
          </span>
          {!semAutografo && (
            <span className="barras-legenda-item">
              <span className="legenda-marca-pl" aria-hidden />
              Traço: {rotuloTraco}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  )
}
