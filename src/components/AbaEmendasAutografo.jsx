import { useMemo, useState } from 'react'
import { fmtBRL, fmtInt, fmtPct } from '../dados.js'
import { casarComAutografo, variacao, fmtVar } from '../ploa.js'
import CartaoEmenda from './CartaoEmenda.jsx'

// Subaba "Emendas Autógrafo": a mesma lista de cartões da subaba Emendas, com
// o destino de cada emenda no autógrafo do PLOA anexado.
//
// As duas bases se encontram aqui, e vale registrar o limite dessa junção: a
// emenda apresentada é uma linha da planilha de emendas, e a dotação que a
// acolheu é uma linha da planilha de elaboração. Elas se ligam por
// (ano, UO, ação, GND, RP) — ver `casarComAutografo` —, e essa chave é grossa:
// várias emendas caem na mesma dotação. Por isso esta subaba fala em "dotação
// que recebeu" e trata o valor por emenda como rateio estimado, nunca como
// valor aprovado.

const SITUACOES = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'atendidas', rotulo: 'Com dotação no autógrafo' },
  { id: 'sem', rotulo: 'Sem dotação no autógrafo' },
]

export default function AbaEmendasAutografo({
  grupos, registrosEmendas, registrosPLOA, anosPLOA, detalhe, abrirDetalhe,
}) {
  const [situacao, setSituacao] = useState('todas')

  const comAutografo = useMemo(
    () => casarComAutografo(grupos, registrosEmendas, registrosPLOA),
    [grupos, registrosEmendas, registrosPLOA]
  )

  const visiveis = useMemo(() => {
    if (situacao === 'atendidas') return comAutografo.filter((g) => g.atendida)
    if (situacao === 'sem') return comAutografo.filter((g) => !g.atendida)
    return comAutografo
  }, [comAutografo, situacao])

  const solicitado = comAutografo.reduce((s, g) => s + g.valor, 0)
  const rateado = comAutografo.reduce((s, g) => s + g.autografoRateado, 0)
  const atendidas = comAutografo.filter((g) => g.atendida).length
  const pctAtendidas = comAutografo.length ? (atendidas / comAutografo.length) * 100 : 0
  const pctValor = variacao(solicitado, rateado)

  if (!registrosPLOA.length) {
    return (
      <p className="vazio">
        A base do PLOA cobre os exercícios {anosPLOA.join(', ')}. Não há dotações do PLOA
        no recorte atual — ajuste o filtro de Ano para um exercício dessa faixa.
      </p>
    )
  }

  return (
    <section aria-label="Emendas no autógrafo">
      <div className="destaque" role="region" aria-label="Emendas apresentadas e autógrafo">
        <section className="heroi">
          <p className="heroi-rotulo">Solicitado nas emendas do recorte</p>
          <p className="heroi-valor heroi-valor-menor">{fmtBRL(solicitado)}</p>
          <p className="heroi-nota">
            {fmtInt(comAutografo.length)} emendas · {fmtInt(atendidas)} com dotação
            correspondente no autógrafo ({fmtPct(pctAtendidas)})
          </p>
        </section>
        <div className="tiras">
          <section className="tira">
            <p className="tira-rotulo">Rateio no autógrafo</p>
            <p className="tira-valor tira-valor-menor">{fmtBRL(rateado)}</p>
            <p className="tira-nota">
              Estimado · {pctValor === null ? '—' : fmtVar(pctValor)} sobre o solicitado
            </p>
          </section>
          <section className="tira">
            <p className="tira-rotulo">Sem correspondência</p>
            <p className="tira-valor">{fmtInt(comAutografo.length - atendidas)}</p>
            <p className="tira-nota">Emendas sem dotação de RP6/RP7 compatível</p>
          </section>
        </div>
      </div>

      <p className="ploa-nota" role="note">
        O valor por emenda é um <strong>rateio proporcional</strong>, não um valor aprovado:
        a planilha de elaboração consolida várias emendas na mesma dotação e não as separa
        lá dentro. O número firme é o da dotação, exibido em cada cartão aberto.
      </p>

      <div className="situacao-barra" role="group" aria-label="Filtrar por situação no autógrafo">
        {SITUACOES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`situacao-btn${situacao === s.id ? ' ativa' : ''}`}
            aria-pressed={situacao === s.id}
            onClick={() => setSituacao(s.id)}
          >
            {s.rotulo}
          </button>
        ))}
      </div>

      <p className="contagem">{fmtInt(visiveis.length)} emenda(s)</p>
      <div className="grade">
        {visiveis.map((g) => (
          <CartaoEmenda
            key={g.emenda}
            grupo={g}
            autografo
            aberto={detalhe === g.emenda}
            onToggle={() => abrirDetalhe(g.emenda)}
          />
        ))}
      </div>
      {visiveis.length === 0 && (
        <p className="vazio">Nenhuma emenda para os filtros aplicados nesta situação.</p>
      )}
    </section>
  )
}
