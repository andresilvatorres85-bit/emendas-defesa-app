import { useMemo } from 'react'

// Matriz linha = categoria, coluna = exercício. Usada onde as categorias são
// muitas para uma paleta categórica honesta (Força, C Mil A, partidos,
// autores): o ano é lido pela POSIÇÃO da coluna e a magnitude pelo
// comprimento da barra, num único tom. Nenhuma cor precisa ser decodificada.
//
// A barra de cada célula é proporcional ao MAIOR valor da matriz inteira (e
// não ao maior da linha), para que a comparação valha nos dois sentidos:
// a trajetória de uma linha ao longo dos anos e o peso relativo entre linhas.
export default function MatrizAnos({
  anos,
  linhas,
  formatar,
  rotuloColuna = 'Categoria',
  totalRotulo = 'Total',
  vazio = 'Sem valores para os filtros aplicados.',
}) {
  const max = useMemo(
    () => Math.max(1, ...linhas.flatMap((l) => l.valores)),
    [linhas]
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
          {linhas.map((l) => (
            <tr key={l.chave}>
              <th scope="row" className="matriz-cat">
                <span className="matriz-nome">{l.rotulo}</span>
                {l.sub && <span className="matriz-sub">{l.sub}</span>}
              </th>
              {anos.map((a, i) => {
                const v = l.valores[i] || 0
                return (
                  <td key={a} className={v > 0 ? 'matriz-celula' : 'matriz-celula vazia'}>
                    <span className="matriz-valor">{v > 0 ? formatar(v) : '—'}</span>
                    <span className="matriz-trilho" aria-hidden>
                      <span className="matriz-fill" style={{ width: `${(v / max) * 100}%` }} />
                    </span>
                  </td>
                )
              })}
              <td className="matriz-celula matriz-total">
                <span className="matriz-valor">{formatar(l.total)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  )
}
