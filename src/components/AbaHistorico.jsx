import { useMemo } from 'react'
import {
  resumoPorAno, rpPorAno, modalidadePorAno, impositivasPorAno,
  forcaPorAno, cmilaPorAno, partidosPorAno, autoresRecorrentes,
  fmtBRL, fmtCompacto, fmtInt, fmtMilhoes, fmtPct,
} from '../dados.js'
import BotaoPNG from './BotaoPNG.jsx'
import BotaoPPTX from './BotaoPPTX.jsx'
import GraficoColunasAno from './GraficoColunasAno.jsx'
import MatrizAnos from './MatrizAnos.jsx'

// Aba "Histórico": compara os exercícios presentes na planilha.
//
// Recebe os registros filtrados por TUDO MENOS o Ano — filtrar por ano aqui
// esvaziaria a comparação, mas manter os demais filtros é o que permite
// perguntar "como evoluiu o Exército?" sem sair da aba.

// Variação percentual: sinal explícito e cor semântica (subiu/desceu), nunca
// cor sozinha — o sinal e a seta carregam a mesma informação.
function Variacao({ pct }) {
  if (pct === null || !Number.isFinite(pct)) {
    return <span className="var-nula">primeiro ano da série</span>
  }
  const subiu = pct >= 0
  return (
    <span className={subiu ? 'var-sobe' : 'var-desce'}>
      {subiu ? '▲' : '▼'} {fmtPct(Math.abs(pct))} vs. ano anterior
    </span>
  )
}

export default function AbaHistorico({ registros, registrosTodasForcas, contexto, onExportarSlide }) {
  const anosResumo = useMemo(() => resumoPorAno(registros), [registros])
  const rp = useMemo(() => rpPorAno(registros), [registros])
  const modalidade = useMemo(() => modalidadePorAno(registros), [registros])
  const impositivas = useMemo(() => impositivasPorAno(registros), [registros])
  // O painel "Por Força" compara as Forças entre si, então ele ignora também o
  // filtro de Órgão — que, no padrão do app, o reduziria a uma linha só.
  const forca = useMemo(() => forcaPorAno(registrosTodasForcas ?? registros), [registrosTodasForcas, registros])
  const cmila = useMemo(() => cmilaPorAno(registros), [registros])
  const partidos = useMemo(() => partidosPorAno(registros, 12), [registros])
  const autores = useMemo(() => autoresRecorrentes(registros, 12), [registros])

  const anos = anosResumo.map((a) => a.ano)
  const totalPeriodo = anosResumo.reduce((s, a) => s + a.valor, 0)
  const emendasPeriodo = anosResumo.reduce((s, a) => s + a.qtdEmendas, 0)

  if (!anos.length) {
    return (
      <p className="vazio">
        Nenhum registro para os filtros aplicados. Limpe algum filtro para voltar a comparar os exercícios.
      </p>
    )
  }

  const serieValor = [{
    chave: 'valor', rotulo: 'Valor solicitado', cor: 'var(--serie-azul)',
    valores: anosResumo.map((a) => a.valor),
  }]
  const serieContagem = [
    { chave: 'emendas', rotulo: 'Emendas', cor: 'var(--serie-azul)',
      valores: anosResumo.map((a) => a.qtdEmendas) },
    { chave: 'parlamentares', rotulo: 'Parlamentares', cor: 'var(--serie-verde)',
      valores: anosResumo.map((a) => a.qtdParlamentares) },
  ]

  return (
    <>
      <p className="historico-intro">
        Comparativo dos {anos.length} exercícios presentes na planilha ({anos.join(', ')}).
        Esta aba <strong>ignora o filtro de Ano</strong> — é o que ela compara — mas respeita
        todos os demais filtros da barra acima.
      </p>

      <div className="historico-anos" role="region" aria-label="Resumo por exercício">
        {anosResumo.map((a) => {
          const c = fmtCompacto(a.valor)
          return (
            <section className="ano-card" key={a.ano}>
              <p className="ano-card-ano">{a.ano}</p>
              <p className="ano-card-valor">
                R$ {c.valor}
                {c.unidade && <span className="ano-card-unidade">{c.unidade}</span>}
              </p>
              <p className="ano-card-var"><Variacao pct={a.variacao} /></p>
              <dl className="ano-card-linhas">
                <div><dt>Emendas</dt><dd>{fmtInt(a.qtdEmendas)}</dd></div>
                <div><dt>Parlamentares</dt><dd>{fmtInt(a.qtdParlamentares)}</dd></div>
                <div>
                  <dt>Impositivas</dt>
                  <dd>{fmtMilhoes(a.impositivo)} <span className="ano-card-pct">({fmtPct(a.pctImpositivo)})</span></dd>
                </div>
              </dl>
            </section>
          )
        })}
      </div>

      <div className="paineis">
        {/* abre a aba em largura cheia: é o gráfico que responde à pergunta
            principal, e a série única sai em colunas finas e centradas */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Valor apresentado por ano</h2>
              <p className="painel-sub">Total solicitado em cada exercício</p>
            </div>
            <span className="painel-total">{fmtMilhoes(totalPeriodo)}</span>
            <BotaoPPTX titulo="Valor apresentado por ano" onExportar={() => onExportarSlide('hist-valor')} />
            <BotaoPNG titulo="Valor apresentado por ano" contexto={contexto} />
          </div>
          <GraficoColunasAno
            anos={anos}
            series={serieValor}
            formatar={fmtBRL}
            formatarTotal={fmtMilhoes}
            rotuloEixo="Valor solicitado em cada exercício"
          />
        </section>

        <section className="painel-grafico p-6">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Emendas e parlamentares por ano</h2>
              <p className="painel-sub">
                Quantidade de emendas distintas e de autores distintos · tracejado = tendência
              </p>
            </div>
            <span className="painel-total">{fmtInt(emendasPeriodo)} emendas</span>
            <BotaoPPTX titulo="Emendas e parlamentares por ano" onExportar={() => onExportarSlide('hist-contagem')} />
            <BotaoPNG titulo="Emendas e parlamentares por ano" contexto={contexto} />
          </div>
          <GraficoColunasAno
            anos={anos}
            series={serieContagem}
            formatar={fmtInt}
            formatarTotal={() => ''}
            rotularBarras
            tendencia
            rotuloEixo="Emendas e parlamentares por exercício"
          />
        </section>

        <section className="painel-grafico p-6">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Emendas impositivas por ano</h2>
              <p className="painel-sub">RP6 (individual) + RP7 (bancada) · o rótulo traz o % do total do ano</p>
            </div>
            <span className="painel-total">
              {fmtMilhoes(anosResumo.reduce((s, a) => s + a.impositivo, 0))}
            </span>
            <BotaoPPTX titulo="Emendas impositivas por ano" onExportar={() => onExportarSlide('hist-impositivas')} />
            <BotaoPNG titulo="Emendas impositivas por ano" contexto={contexto} />
          </div>
          <GraficoColunasAno
            anos={anos}
            series={impositivas.series}
            empilhado
            formatar={fmtBRL}
            formatarTotal={(v, i) => `${fmtMilhoes(v)} (${fmtPct(anosResumo[i].pctImpositivo)})`}
            rotuloEixo="Valor impositivo por exercício"
            vazio="Sem emendas impositivas para os filtros aplicados."
          />
        </section>

        <section className="painel-grafico p-6">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Composição por RP</h2>
              <p className="painel-sub">Participação de cada identificador de resultado primário no ano</p>
            </div>
            <BotaoPPTX titulo="Composição por RP" onExportar={() => onExportarSlide('hist-rp')} />
            <BotaoPNG titulo="Composição por RP" contexto={contexto} />
          </div>
          <GraficoColunasAno
            anos={anos}
            series={rp.series}
            proporcao
            formatar={fmtBRL}
            formatarTotal={fmtMilhoes}
            rotuloEixo="Composição por RP em cada exercício"
          />
        </section>

        <section className="painel-grafico p-6">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Composição por modalidade</h2>
              <p className="painel-sub">Individual, bancada estadual e comissão — participação no ano</p>
            </div>
            <BotaoPPTX titulo="Composição por modalidade" onExportar={() => onExportarSlide('hist-modalidade')} />
            <BotaoPNG titulo="Composição por modalidade" contexto={contexto} />
          </div>
          <GraficoColunasAno
            anos={anos}
            series={modalidade.series}
            proporcao
            formatar={fmtBRL}
            formatarTotal={fmtMilhoes}
            rotuloEixo="Composição por modalidade em cada exercício"
          />
        </section>

        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Por Força</h2>
              <p className="painel-sub">
                Valor solicitado por Força, consolidando as UO de cada uma · ignora o filtro de Órgão
              </p>
            </div>
            <BotaoPPTX titulo="Histórico por Força" onExportar={() => onExportarSlide('hist-forca')} />
            <BotaoPNG titulo="Histórico por Força" contexto={contexto} />
          </div>
          <MatrizAnos anos={forca.anos} linhas={forca.series} formatar={fmtMilhoes} rotuloColuna="Força" />
        </section>

        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Impositivas por C Mil A</h2>
              <p className="painel-sub">RP6 + RP7 nas UO do Exército, por Comando Militar de Área</p>
            </div>
            <BotaoPPTX titulo="Histórico das impositivas por C Mil A" onExportar={() => onExportarSlide('hist-cmila')} />
            <BotaoPNG titulo="Histórico das impositivas por C Mil A" contexto={contexto} />
          </div>
          <MatrizAnos
            anos={cmila.anos}
            linhas={cmila.series}
            formatar={fmtMilhoes}
            rotuloColuna="C Mil A"
            vazio="Sem valores impositivos nas UO do Exército para os filtros aplicados."
          />
        </section>

        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Partidos por ano</h2>
              <p className="painel-sub">12 maiores no período · exclui comissões e bancadas</p>
            </div>
            <BotaoPPTX titulo="Histórico por partido" onExportar={() => onExportarSlide('hist-partidos')} />
            <BotaoPNG titulo="Histórico por partido" contexto={contexto} />
          </div>
          <MatrizAnos anos={partidos.anos} linhas={partidos.series} formatar={fmtMilhoes} rotuloColuna="Partido" />
        </section>

        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Autores recorrentes</h2>
              <p className="painel-sub">
                Parlamentares ordenados por número de exercícios com emenda apresentada e, em seguida, por valor
              </p>
            </div>
            <BotaoPPTX titulo="Autores recorrentes" onExportar={() => onExportarSlide('hist-autores')} />
            <BotaoPNG titulo="Autores recorrentes" contexto={contexto} />
          </div>
          <MatrizAnos
            anos={autores.anos}
            linhas={autores.series}
            formatar={fmtMilhoes}
            rotuloColuna="Parlamentar"
            vazio="Sem parlamentares (Deputado/Senador) para os filtros aplicados."
          />
        </section>
      </div>
    </>
  )
}
