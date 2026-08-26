import { useMemo, useState } from 'react'
import { fmtPct } from '../dados.js'

// Matriz linha = categoria, coluna = exercício. Usada onde as categorias são
// muitas para uma paleta categórica honesta (Força, C Mil A, partidos,
// autores): o ano é lido pela POSIÇÃO da coluna, não por uma cor.
//
// A cor da célula é DIVERGENTE e carrega a MUDANÇA em relação ao ano anterior
// da mesma linha — azul para aumento, laranja para queda, transparente no meio
// (variação nula e primeiro ano da série). É o que faz a trajetória saltar aos
// olhos ao correr o olho pela linha. A direção nunca é só cor: cada célula leva
// a seta ▲/▼ junto do valor.
//
// A coluna "Total" mantém a barra de magnitude num tom só: ela responde outra
// pergunta — quem é grande —, e é o que ordena as linhas.

// Intensidade do tom: cresce com o módulo da variação e satura em 60%, senão
// uma linha que saiu de R$ 0,4 mi para R$ 4,0 mi (+900%) apagaria todas as
// outras. 60% de variação já é uma mudança grande em orçamento.
const VARIACAO_SATURA = 60
const TINTA_MAX = 26 // % de mistura da cor da série com a superfície

function tomDaVariacao(pct) {
  if (pct === null || !Number.isFinite(pct) || pct === 0) return undefined
  const intensidade = Math.min(Math.abs(pct), VARIACAO_SATURA) / VARIACAO_SATURA
  // piso de 6% para que uma variação pequena ainda se distinga do zero
  const mistura = (6 + (TINTA_MAX - 6) * intensidade).toFixed(1)
  const cor = pct > 0 ? 'var(--serie-azul)' : 'var(--serie-laranja)'
  return `color-mix(in oklab, ${cor} ${mistura}%, transparent)`
}

export default function MatrizAnos({
  anos,
  linhas,
  formatar,
  rotuloColuna = 'Categoria',
  totalRotulo = 'Total',
  vazio = 'Sem valores para os filtros aplicados.',
  // Paginação opcional: mostra só as `limite` primeiras linhas e revela o resto
  // em blocos de `passoExpansao`, com botão "Mostrar +/−". As linhas já chegam
  // ordenadas por total, então as primeiras são as maiores.
  limite = null,
  passoExpansao = 15,
  // Quando true, destaca o código no início do rótulo da linha (ex.: a ação
  // orçamentária) para leitura rápida.
  destaqueCodigo = false,
}) {
  const [mostrar, setMostrar] = useState(limite ?? linhas.length)
  const max = useMemo(() => Math.max(1, ...linhas.map((l) => l.total)), [linhas])

  const visiveis = limite === null ? linhas : linhas.slice(0, mostrar)
  const restam = linhas.length - visiveis.length
  const proximo = Math.min(passoExpansao, restam)

  // Variação de cada célula sobre a célula anterior da mesma linha. Um ano que
  // parte do zero não tem variação percentual definida — entra como "novo".
  const variacoes = useMemo(
    () =>
      visiveis.map((l) =>
        l.valores.map((v, i) => {
          if (i === 0) return null
          const anterior = l.valores[i - 1] || 0
          if (!anterior) return v > 0 ? Infinity : null
          return ((v - anterior) / anterior) * 100
        })
      ),
    [visiveis]
  )

  if (!linhas.length || !anos.length) {
    return <p className="grafico-vazio">{vazio}</p>
  }

  return (
    <>
      {/* em tela estreita a tabela rola na horizontal; sem o aviso o corte
          parece defeito em vez de rolagem */}
      <p className="matriz-dica">Arraste a tabela para o lado para ver todos os anos.</p>
      <div className="matriz-rolagem">
        <table className="matriz">
          <thead>
            <tr>
              <th scope="col" className="matriz-cat">{rotuloColuna}</th>
              {anos.map((a) => (
                <th scope="col" key={a}>{a}</th>
              ))}
              <th scope="col" className="matriz-total">{totalRotulo}</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l, iLinha) => {
              // Com destaqueCodigo, separa "codigo — resto" para realçar o
              // código; se o rótulo não tiver o separador, cai no rótulo inteiro.
              let codigo = null
              let nome = l.rotulo
              if (destaqueCodigo) {
                const m = /^(\S+)\s+—\s+(.*)$/.exec(l.rotulo)
                if (m) { codigo = m[1]; nome = m[2] }
              }
              return (
              <tr key={l.chave}>
                <th scope="row" className="matriz-cat">
                  <span className="matriz-nome">
                    {codigo && <span className="matriz-codigo">{codigo}</span>}
                    {nome}
                  </span>
                  {l.sub && <span className="matriz-sub">{l.sub}</span>}
                </th>
                {anos.map((a, i) => {
                  const v = l.valores[i] || 0
                  const pct = variacoes[iLinha][i]
                  const subiu = pct !== null && pct > 0
                  const desceu = pct !== null && Number.isFinite(pct) && pct < 0
                  const titulo =
                    pct === null
                      ? `${l.rotulo} · ${a}`
                      : Number.isFinite(pct)
                        ? `${l.rotulo} · ${a}: ${subiu ? '+' : '−'}${fmtPct(Math.abs(pct))} sobre ${anos[i - 1]}`
                        : `${l.rotulo} · ${a}: sem valor em ${anos[i - 1]}`
                  return (
                    <td
                      key={a}
                      className={v > 0 ? 'matriz-celula' : 'matriz-celula vazia'}
                      style={{ background: tomDaVariacao(Number.isFinite(pct) ? pct : pct === Infinity ? VARIACAO_SATURA : null) }}
                      title={titulo}
                    >
                      <span className="matriz-valor">
                        {(subiu || desceu) && (
                          <span className={subiu ? 'matriz-seta sobe' : 'matriz-seta desce'} aria-hidden>
                            {subiu ? '▲' : '▼'}
                          </span>
                        )}
                        {v > 0 ? formatar(v) : '—'}
                      </span>
                    </td>
                  )
                })}
                <td className="matriz-celula matriz-total">
                  <span className="matriz-valor">{formatar(l.total)}</span>
                  <span className="matriz-trilho" aria-hidden>
                    <span className="matriz-fill" style={{ width: `${(l.total / max) * 100}%` }} />
                  </span>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
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
      <p className="matriz-legenda">
        <span className="matriz-chave sobe" aria-hidden />
        Aumento
        <span className="matriz-chave desce" aria-hidden />
        Queda sobre o ano anterior — o tom acompanha o tamanho da variação
      </p>
    </>
  )
}
