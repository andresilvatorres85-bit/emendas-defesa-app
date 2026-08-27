import { useMemo } from 'react'
import { fmtCompacto, fmtInt, fmtPct } from '../dados.js'
import {
  FASES, FASE_ROTULOS, IDX_PL, IDX_AUTOGRAFO,
  resumoPorAno, agregadoPorAno, uoPorAno, rpPorAno, gndPorAno, acaoPorAno, ciclosPorAno,
  fmtBi, fmtBiSeco, fmtVar,
} from '../ploa.js'
import BotaoPNG from './BotaoPNG.jsx'
import BotaoPPTX from './BotaoPPTX.jsx'
import GraficoColunasAno from './GraficoColunasAno.jsx'
import MatrizAnos from './MatrizAnos.jsx'

// Subaba "Histórico PLOA": as mesmas perguntas do Dashboard PLOA, mas ao longo
// dos exercícios. Como a aba Histórico das emendas, esta IGNORA o filtro de Ano
// — é o que ela compara — e respeita todos os demais.
//
// A escolha de forma segue a mesma regra do resto do app: o ano é uma dimensão
// ORDENADA, então vai na posição (eixo das colunas, coluna da matriz) e nunca
// na cor. Onde as categorias são poucas e a paleta dá conta (Força, fase, GND),
// há colunas; onde são muitas (UO, ação), há matriz.

function Variacao({ pct }) {
  if (pct === null || !Number.isFinite(pct)) {
    return <span className="var-nula">primeiro exercício da série</span>
  }
  const subiu = pct >= 0
  return (
    <span className={subiu ? 'var-sobe' : 'var-desce'}>
      {subiu ? '▲' : '▼'} {fmtPct(Math.abs(pct))} vs. exercício anterior
    </span>
  )
}

export default function AbaHistoricoPLOA({
  registros, registrosTodasForcas, duplicados = [], contexto, onExportarSlide,
}) {
  const todasForcas = registrosTodasForcas ?? registros
  const anosResumo = useMemo(() => resumoPorAno(registros), [registros])
  const forcas = useMemo(() => agregadoPorAno(todasForcas), [todasForcas])
  const uos = useMemo(() => uoPorAno(registros), [registros])
  const rps = useMemo(() => rpPorAno(registros), [registros])
  const gnds = useMemo(() => gndPorAno(registros), [registros])
  const acoes = useMemo(() => acaoPorAno(registros, Infinity), [registros])
  const ciclo = useMemo(() => ciclosPorAno(registros), [registros])

  const anos = anosResumo.map((a) => a.ano)
  if (!anos.length) {
    return (
      <p className="vazio">
        Nenhuma dotação do PLOA para os filtros aplicados. Limpe algum filtro para voltar
        a comparar os exercícios.
      </p>
    )
  }

  const totalPeriodo = anosResumo.reduce((s, a) => s + a.pl, 0)

  // Uma cor por exercício, para o gráfico "Projeto de Lei por exercício" (item
  // 3.1). Como a série é única (só o PL), a cor não codifica outra dimensão —
  // serve só para distinguir as barras visualmente, então uma paleta rotativa
  // resolve. Vem da paleta validada do app, na ordem de exibição.
  const CORES_ANO = [
    'var(--serie-azul)', 'var(--serie-verde)', 'var(--serie-laranja)',
    'var(--serie-violeta)', 'var(--serie-aqua)', 'var(--serie-magenta)',
    'var(--serie-amarelo)', 'var(--serie-vermelho)',
  ]
  const coresPorAno = anosResumo.map((_, i) => CORES_ANO[i % CORES_ANO.length])

  // Série do total por exercício. A prioridade desta aba é o PL: o gráfico
  // principal soma o PL de cada exercício. O par PL × autógrafo permanece no
  // painel seguinte, para quem quiser ver o efeito do rito.
  const seriePL = [{
    chave: 'pl', rotulo: 'PL', cor: 'var(--serie-azul)',
    valores: anosResumo.map((a) => a.pl),
  }]
  const serieRito = [
    { chave: 'pl', rotulo: 'PL', cor: 'var(--serie-azul)', valores: anosResumo.map((a) => a.pl) },
    { chave: 'aut', rotulo: 'Autógrafo', cor: 'var(--serie-laranja)', valores: anosResumo.map((a) => a.autografo) },
  ]
  const serieCiclo = ciclo.series.map((s, i) => ({
    ...s,
    cor: ['var(--serie-violeta)', 'var(--serie-azul)', 'var(--serie-verde)',
      'var(--serie-aqua)', 'var(--serie-laranja)'][i],
  }))

  return (
    <>
      <header className="folha-cab">
        <h2>PLOA — HISTÓRICO DOS EXERCÍCIOS</h2>
        <p>Ministério da Defesa · Órgão 52000 · todos os setores</p>
        <p>{contexto}</p>
      </header>

      <p className="historico-intro">
        Comparativo dos {anos.length} exercícios presentes na planilha de elaboração
        ({anos.join(', ')}). Esta subaba <strong>ignora o filtro de Ano</strong> — é o que ela
        compara — mas respeita todos os demais filtros da barra acima. Os valores são os do
        <strong> autógrafo</strong>, salvo onde o painel diz o contrário.
      </p>

      {duplicados.length > 0 && (
        <p className="ploa-aviso" role="status">
          ⚠ Atenção ao ler a série: na planilha de origem,{' '}
          {duplicados.map((d) => `a aba ${d.ano} é cópia idêntica da aba ${d.igualA}`).join('; ')}.
          A coluna desse exercício repete a anterior e não representa um resultado próprio.
        </p>
      )}

      <div className="historico-anos" role="region" aria-label="Resumo por exercício">
        {anosResumo.map((a) => {
          // Destaque no PL (prioridade desta aba: o projeto de lei do Executivo);
          // o autógrafo desce para a linha detalhada.
          const c = fmtCompacto(a.pl)
          const d = fmtCompacto(Math.abs(a.delta))
          const copia = duplicados.find((x) => x.ano === a.ano)
          return (
            <section className={`ano-card${copia ? ' ano-card-copia' : ''}`} key={a.ano}>
              <p className="ano-card-ano">
                {a.ano}
                {copia && <span className="ano-card-flag" title={`Cópia da aba ${copia.igualA}`}>cópia</span>}
              </p>
              <p className="ano-card-valor">
                R$ {c.valor}
                {c.unidade && <span className="ano-card-unidade">{c.unidade}</span>}
              </p>
              <p className="ano-card-var"><Variacao pct={a.variacaoPL} /></p>
              <dl className="ano-card-linhas">
                <div><dt>Autógrafo</dt><dd>{fmtBi(a.autografo)}</dd></div>
                <div>
                  <dt>Saldo do rito</dt>
                  <dd className={a.delta >= 0 ? 'var-sobe' : 'var-desce'}>
                    {a.delta >= 0 ? '+' : '−'} R$ {d.valor} {d.unidade}
                  </dd>
                </div>
                <div><dt>Dotações</dt><dd>{fmtInt(a.linhas)}</dd></div>
              </dl>
            </section>
          )
        })}
      </div>

      <div className="paineis">
        {/* projeto de lei por exercício */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Projeto de Lei por exercício</h2>
              <p className="painel-sub">Somatório do PL enviado pelo Executivo em cada exercício</p>
            </div>
            <span className="painel-total">{fmtBi(totalPeriodo)}</span>
            <BotaoPPTX titulo="Projeto de Lei por exercício" onExportar={() => onExportarSlide('hploa-total')} />
            <BotaoPNG titulo="Projeto de Lei por exercício" contexto={contexto} />
          </div>
          <GraficoColunasAno
            anos={anos}
            series={seriePL}
            corPorColuna={coresPorAno}
            formatar={fmtBi}
            formatarTotal={(v) => fmtBi(v)}
            tendencia
            rotuloEixo="Valor do PL em cada exercício"
          />
        </section>

        {/* PL x autógrafo por exercício */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>PL × Autógrafo por exercício</h2>
              <p className="painel-sub">Quanto o rito legislativo alterou o projeto em cada ano</p>
            </div>
            <span className="painel-total">
              {(() => {
                const d = anosResumo.reduce((s, a) => s + a.delta, 0)
                return `${d >= 0 ? '+' : '−'} ${fmtBi(Math.abs(d))}`
              })()}
            </span>
            <BotaoPPTX titulo="PL × Autógrafo por exercício" onExportar={() => onExportarSlide('hploa-rito')} />
            <BotaoPNG titulo="PL × Autógrafo por exercício" contexto={contexto} />
          </div>
          <GraficoColunasAno
            anos={anos}
            series={serieRito}
            formatar={fmtBi}
            formatarTotal={() => ''}
            rotuloEixo="Valor no PL e no autógrafo em cada exercício"
          />
          <div className="ciclo-tabela" role="table" aria-label="Saldo do rito por exercício">
            <div className="ciclo-linha ciclo-cab" role="row">
              <span role="columnheader">Exercício</span>
              <span role="columnheader">PL</span>
              <span role="columnheader">Autógrafo</span>
              <span role="columnheader">Saldo do rito</span>
            </div>
            {anosResumo.map((a) => (
              <div className="ciclo-linha" role="row" key={a.ano}>
                <span role="cell" className="ciclo-nome">{a.ano}</span>
                <span role="cell" className="ciclo-cel"><span className="ciclo-val">{fmtBi(a.pl)}</span></span>
                <span role="cell" className="ciclo-cel"><span className="ciclo-val">{fmtBi(a.autografo)}</span></span>
                <span role="cell" className="ciclo-cel">
                  <span className="ciclo-val">{a.delta >= 0 ? '+' : '−'} {fmtBi(Math.abs(a.delta))}</span>
                  <span className={a.pctRito === null || a.pctRito === 0 ? 'var-nula' : a.pctRito > 0 ? 'var-sobe' : 'var-desce'}>
                    {a.pctRito === null ? '—' : a.pctRito === 0 ? 'sem alteração' : fmtVar(a.pctRito)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ciclo por exercício */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Fases do ciclo por exercício</h2>
              <p className="painel-sub">
                As cinco fases lado a lado em cada ano — {FASE_ROTULOS.join(' · ')}
              </p>
            </div>
            <span className="painel-total">{fmtBi(totalPeriodo)}</span>
            <BotaoPPTX titulo="Fases do ciclo por exercício" onExportar={() => onExportarSlide('hploa-ciclo')} />
            <BotaoPNG titulo="Fases do ciclo por exercício" contexto={contexto} />
          </div>
          <GraficoColunasAno
            anos={anos}
            series={serieCiclo}
            formatar={fmtBi}
            formatarTotal={() => ''}
            rotuloEixo="Valor em cada fase do ciclo, por exercício"
          />
          <p className="painel-rodape">
            Onde a planilha não traz a fase, o valor exibido é o da fase anterior (regra de herança).
          </p>
        </section>

        {/* por Força */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Por Força, ao longo dos exercícios</h2>
              <p className="painel-sub">Valor no autógrafo de cada Força em cada ano</p>
            </div>
            <span className="painel-total">{fmtBi(forcas.series.reduce((s, x) => s + x.total, 0))}</span>
            <BotaoPPTX titulo="Por Força, ao longo dos exercícios" onExportar={() => onExportarSlide('hploa-forcas')} />
            <BotaoPNG titulo="Por Força, ao longo dos exercícios" contexto={contexto} />
          </div>
          <GraficoColunasAno
            anos={forcas.anos}
            series={forcas.series}
            rotularPercentual
            formatar={fmtBi}
            formatarTotal={(v) => fmtBi(v)}
            rotuloEixo="Valor por Força em cada exercício"
          />
          <p className="painel-rodape">
            Rótulo em cada barra: participação da Força no total do exercício.
            Painel comparativo entre Forças — ignora também o filtro de Órgão.
          </p>
        </section>

        {/* composição por RP */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Composição por RP</h2>
              <p className="painel-sub">Participação de cada resultado primário no autógrafo de cada ano</p>
            </div>
            <span className="painel-total">{fmtBi(totalPeriodo)}</span>
            <BotaoPPTX titulo="Composição por RP" onExportar={() => onExportarSlide('hploa-rp')} />
            <BotaoPNG titulo="Composição por RP" contexto={contexto} />
          </div>
          <GraficoColunasAno
            anos={rps.anos}
            series={rps.series}
            proporcao
            formatar={fmtBi}
            formatarTotal={(_, i) => rps.anos[i]}
            rotuloEixo="Participação de cada RP no autógrafo, por exercício"
          />
        </section>

        {/* composição por GND */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Composição por GND</h2>
              <p className="painel-sub">Participação de cada grupo de natureza da despesa no autógrafo</p>
            </div>
            <span className="painel-total">{fmtBi(totalPeriodo)}</span>
            <BotaoPPTX titulo="Composição por GND" onExportar={() => onExportarSlide('hploa-gnd')} />
            <BotaoPNG titulo="Composição por GND" contexto={contexto} />
          </div>
          <GraficoColunasAno
            anos={gnds.anos}
            series={gnds.series}
            empilhado
            formatar={fmtBi}
            formatarTotal={(v) => fmtBi(v)}
            rotuloEixo="Valor por grupo de natureza da despesa, por exercício"
          />
        </section>

        {/* matriz de UO */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Unidades orçamentárias por exercício</h2>
              <p className="painel-sub">
                {uos.series.length} UO · valor no autógrafo · valores em R$ bilhões
              </p>
            </div>
            <span className="painel-total">{fmtBi(uos.series.reduce((s, l) => s + l.total, 0))}</span>
            <BotaoPPTX titulo="Unidades orçamentárias por exercício" onExportar={() => onExportarSlide('hploa-uo')} />
            <BotaoPNG titulo="Unidades orçamentárias por exercício" contexto={contexto} />
          </div>
          <MatrizAnos
            anos={uos.anos}
            linhas={uos.series}
            formatar={fmtBiSeco}
            rotuloColuna="Unidade orçamentária"
            limite={5}
            passoExpansao={5}
          />
        </section>

        {/* matriz de ações */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Ações orçamentárias por exercício</h2>
              <p className="painel-sub">
                {fmtInt(acoes.total)} ações · valor no autógrafo · valores em R$ bilhões
              </p>
            </div>
            <span className="painel-total">{fmtBi(acoes.series.reduce((s, l) => s + l.total, 0))}</span>
            <BotaoPPTX titulo="Ações orçamentárias por exercício" onExportar={() => onExportarSlide('hploa-acao')} />
            <BotaoPNG titulo="Ações orçamentárias por exercício" contexto={contexto} />
          </div>
          <MatrizAnos
            anos={acoes.anos}
            linhas={acoes.series}
            formatar={fmtBiSeco}
            rotuloColuna="Ação orçamentária"
            limite={15}
            passoExpansao={15}
            destaqueCodigo
          />
        </section>
      </div>
    </>
  )
}
