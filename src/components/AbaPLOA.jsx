import { useMemo } from 'react'
import { fmtCompacto, fmtInt, fmtPct } from '../dados.js'
import {
  AGREGADOS, FASES, FASE_ROTULOS, IDX_PL, IDX_AUTOGRAFO,
  porAgregado, porUO, porRP, ciclos, plVsAutografo, acoesOrdenadas, porGND,
  somaFases, fmtBi, fmtVar, variacao,
} from '../ploa.js'
import BotaoPNG from './BotaoPNG.jsx'
import BotaoPPTX from './BotaoPPTX.jsx'
import GraficoCascata from './GraficoCascata.jsx'
import GraficoBarrasPLOA from './GraficoBarrasPLOA.jsx'
import GraficoColunasAno from './GraficoColunasAno.jsx'
import { FolhaDashboardPLOA } from './FolhaPDF.jsx'

// Subaba "Dashboard PLOA": o retrato de UM exercício, do projeto de lei ao
// autógrafo. Recebe as dotações já filtradas; `registrosTodasForcas` é o mesmo
// recorte SEM o filtro de Órgão, porque os painéis que comparam as Forças
// entre si ficariam com uma linha só sob o padrão do app (Órgão = Exército).

// Aviso de aba duplicada (REGRA 3.B do pipeline). Aparece só quando o
// exercício em tela é um dos que a planilha repete — esconder isso faria o
// painel afirmar, com toda a autoridade de um gráfico, um dado que não existe.
function AvisoDuplicado({ duplicados, anosEmTela }) {
  const atingidos = duplicados.filter((d) => anosEmTela.includes(d.ano))
  if (!atingidos.length) return null
  return (
    <p className="ploa-aviso" role="status">
      ⚠ Na planilha de origem, {atingidos.map((d) => (
        <strong key={d.ano}>a aba {d.ano} é uma cópia idêntica da aba {d.igualA}</strong>
      )).reduce((a, b) => [a, ' e ', b])} ({atingidos[0].linhas} linhas com os mesmos
      valores em todas as fases). Os números deste exercício repetem os do anterior e não
      devem ser lidos como resultado próprio.
    </p>
  )
}

export default function AbaPLOA({
  registros, registrosTodasForcas, anos, fasesVazias = {}, duplicados = [],
  contexto, onExportarSlide, filtrosTexto = '',
}) {
  const todasForcas = registrosTodasForcas ?? registros
  const agregados = useMemo(() => porAgregado(todasForcas), [todasForcas])
  const uos = useMemo(() => porUO(registros), [registros])
  const rps = useMemo(() => porRP(registros), [registros])
  const cicloDados = useMemo(() => ciclos(todasForcas), [todasForcas])
  const plAut = useMemo(() => plVsAutografo(todasForcas), [todasForcas])
  const acoesTodas = useMemo(() => acoesOrdenadas(registros), [registros])
  const gnds = useMemo(() => porGND(registros), [registros])
  const totais = useMemo(() => somaFases(registros), [registros])

  if (!registros.length) {
    return (
      <p className="vazio">
        Nenhuma dotação do PLOA para os filtros aplicados. A base do PLOA cobre os
        exercícios {anos.join(', ')} — se o filtro de Ano estiver num exercício fora
        dessa faixa, ajuste-o para voltar a ver os painéis.
      </p>
    )
  }

  const anosEmTela = [...new Set(registros.map((r) => r.ano))].sort()
  // Os painéis que ignoram o filtro de Órgão têm um total PRÓPRIO: exibir ali o
  // total do recorte filtrado (só o Exército, no padrão do app) contradiria o
  // gráfico logo abaixo, que mostra as quatro Forças.
  const totalTodasForcas = agregados.reduce((s, a) => s + a.valor, 0)
  const plTodasForcas = agregados.reduce((s, a) => s + a.pl, 0)
  const deltaTodasForcas = totalTodasForcas - plTodasForcas
  const totalPL = totais[IDX_PL]
  const totalAutografo = totais[IDX_AUTOGRAFO]
  const heroi = fmtCompacto(totalPL)
  const deltaRito = totalAutografo - totalPL
  const pctRito = variacao(totalPL, totalAutografo)
  const compacto = fmtCompacto(Math.abs(deltaRito))
  // Fases que a planilha não preencheu no(s) exercício(s) em tela: o valor
  // exibido nelas foi herdado da fase anterior (REGRA 3.A).
  const herdadas = [...new Set(anosEmTela.flatMap((a) => fasesVazias[a] || []))]
  const herdadasRotulo = herdadas
    .map((id) => FASES.find((f) => f.id === id)?.rotulo)
    .filter(Boolean)

  // Ciclo: as fases viram o EIXO e cada Força é uma série. É o inverso do
  // Histórico (onde o eixo é o ano) e pela mesma razão — no eixo vai a
  // dimensão ordenada, e a ordem do rito é tão ordenada quanto a do tempo.
  const serieCiclo = cicloDados.map((a) => ({
    chave: a.id, rotulo: a.rotulo, cor: a.cor, valores: a.fases,
  }))
  // PL × Autógrafo: o eixo são as Forças e as duas séries são as pontas do
  // rito. As barras herdam a COR DA FORÇA (item 4.5.6): a série é distinguida
  // pela tonalidade, via `corPorColuna`, não por uma cor fixa de série.
  const catsForca = plAut.map((a) => a.rotulo)
  const coresForca = plAut.map((a) => a.cor)
  const seriePLAut = [
    { chave: 'pl', rotulo: 'PL', cor: 'var(--tinta-3)', valores: plAut.map((a) => a.pl) },
    { chave: 'aut', rotulo: 'Autógrafo', cor: 'var(--tinta-3)', valores: plAut.map((a) => a.autografo) },
  ]
  // Total por Força consolidando o PL (item 4.5.5), não o autógrafo.
  const totalPLForcas = agregados.reduce((s, a) => s + a.pl, 0)

  return (
    <>
      <div className="ploa-tela">
      <header className="folha-cab">
        <h2>PLOA — DESPESAS POR FASE DE ELABORAÇÃO</h2>
        <p>Ministério da Defesa · Órgão 52000 · todos os setores</p>
        <p>{contexto}</p>
      </header>

      <AvisoDuplicado duplicados={duplicados} anosEmTela={anosEmTela} />
      {herdadasRotulo.length > 0 && (
        <p className="ploa-nota" role="status">
          Neste recorte, {herdadasRotulo.join(' e ')} não {herdadasRotulo.length > 1 ? 'têm' : 'tem'}{' '}
          valor próprio na planilha: exibe-se o valor da fase anterior, conforme a regra de herança.
        </p>
      )}

      <div className="destaque destaque-ploa" role="region" aria-label="Indicadores do PLOA">
        {/* Card maior: PL do Executivo — é o valor de partida do rito e a
            referência primária desta análise. O autógrafo passou para a tira. */}
        <section className="heroi">
          <p className="heroi-rotulo">PL do Executivo</p>
          <p className="heroi-valor">
            R$ {heroi.valor}
            {heroi.unidade && <span className="heroi-unidade">{heroi.unidade}</span>}
          </p>
          <p className="heroi-nota">
            Projeto de lei · exercício {anosEmTela.join(', ')} · {fmtInt(registros.length)} dotações
          </p>
        </section>

        <div className="tiras">
          {/* Antes o card maior trazia o autógrafo; agora ele é o PL, e o
              autógrafo (valor final aprovado) vem aqui na tira. */}
          <section className="tira">
            <p className="tira-rotulo">Valor final aprovado</p>
            <p className="tira-valor">
              R$ {fmtCompacto(totalAutografo).valor}
              <span className="tira-unidade">{fmtCompacto(totalAutografo).unidade}</span>
            </p>
            <p className="tira-nota">Autógrafo — fim do rito</p>
          </section>
          <section className="tira">
            <p className="tira-rotulo">Saldo do rito</p>
            <p className={`tira-valor ${deltaRito >= 0 ? 'var-sobe' : 'var-desce'}`}>
              {deltaRito >= 0 ? '+' : '−'} R$ {compacto.valor}
              <span className="tira-unidade">{compacto.unidade}</span>
            </p>
            {/* item 4.2: "PL → Autógrafo = <variação>" */}
            <p className="tira-nota">
              PL → Autógrafo = {pctRito === null ? '—' : fmtVar(pctRito)}
            </p>
          </section>
          <section className="tira">
            <p className="tira-rotulo">Unidades orçamentárias</p>
            <p className="tira-valor">{fmtInt(uos.length)}</p>
            <p className="tira-nota">UO com dotação no recorte</p>
          </section>
        </div>
      </div>

      <div className="paineis">
        {/* 4.5.1 — RP em cascata + 4.5.2 — GND, lado a lado (dois p-6) */}
        <section className="painel-grafico p-6">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Por Identificador de Resultado Primário</h2>
              <p className="painel-sub">
                Composição do autógrafo por RP, em cascata · RP6 e RP7 são as emendas impositivas
              </p>
            </div>
            <span className="painel-total">{fmtBi(totalAutografo)}</span>
            <BotaoPPTX titulo="Por Identificador de Resultado Primário" onExportar={() => onExportarSlide('ploa-rp')} />
            <BotaoPNG titulo="Por Identificador de Resultado Primário" contexto={contexto} />
          </div>
          <div className="rolagem-x">
            <GraficoCascata
              dados={rps.map((d) => ({ chave: d.rp, rotulo: d.rotulo, valor: d.valor, cor: d.cor }))}
              rotuloGrafico="Composição do autógrafo por RP, em cascata"
            />
          </div>
        </section>

        <section className="painel-grafico p-6">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Valor por Grupo de Natureza da Despesa</h2>
              <p className="painel-sub">Composição do autógrafo por GND · barra = autógrafo, traço = PL</p>
            </div>
            <span className="painel-total">{fmtBi(gnds.reduce((s, g) => s + g.valor, 0))}</span>
            <BotaoPPTX titulo="Valor por Grupo de Natureza da Despesa" onExportar={() => onExportarSlide('ploa-gnd')} />
            <BotaoPNG titulo="Valor por Grupo de Natureza da Despesa" contexto={contexto} />
          </div>
          <GraficoBarrasPLOA
            dados={gnds.map((g) => ({
              chave: g.gnd, rotulo: g.nome || g.rotulo, sublinha: g.rotulo,
              valor: g.valor, pl: g.pl, cor: g.cor,
            }))}
            comparar
            mostrarPercentual
            rotuloGrafico="Valor por grupo de natureza da despesa, do PL ao autógrafo"
          />
        </section>

        {/* 4.5.3 — UO em largura cheia, 4 itens + Mostrar +/−, barra = PL */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Valor por Unidade Orçamentária</h2>
              <p className="painel-sub">Todas as UO do órgão 52000 · barra = PL, traço = autógrafo</p>
            </div>
            <span className="painel-total">{fmtBi(uos.reduce((s, u) => s + u.valor, 0))}</span>
            <BotaoPPTX titulo="Valor por Unidade Orçamentária" onExportar={() => onExportarSlide('ploa-uo')} />
            <BotaoPNG titulo="Valor por Unidade Orçamentária" contexto={contexto} />
          </div>
          <GraficoBarrasPLOA
            dados={uos.map((u) => ({
              chave: u.uoCod, rotulo: u.uo, sublinha: `UO ${u.uoCod}`,
              valor: u.valor, pl: u.pl, cor: AGREGADOS.find((a) => a.id === u.orgao)?.cor,
            }))}
            comparar
            barra="pl"
            limite={4}
            passoExpansao={4}
            mostrarPercentual
            rotuloGrafico="Valor por unidade orçamentária, do PL ao autógrafo"
          />
        </section>

        {/* 4.5.4 — Ação: 15 itens, expansão de 15 em 15, código destacado, barra = PL */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Valor por Ação orçamentária</h2>
              <p className="painel-sub">
                {fmtInt(acoesTodas.length)} ações do recorte · barra = PL, traço = autógrafo
              </p>
            </div>
            <span className="painel-total">{fmtBi(totalAutografo)}</span>
            <BotaoPPTX titulo="Valor por Ação orçamentária" onExportar={() => onExportarSlide('ploa-acao')} />
            <BotaoPNG titulo="Valor por Ação orçamentária" contexto={contexto} />
          </div>
          <GraficoBarrasPLOA
            dados={acoesTodas.map((a) => ({
              chave: a.acaoCod, rotulo: a.acao || a.acaoCod,
              codigo: a.acaoCod !== '—' ? a.acaoCod : null,
              valor: a.valor, pl: a.pl,
            }))}
            comparar
            barra="pl"
            corNumero="var(--serie-laranja)"
            limite={15}
            passoExpansao={15}
            mostrarPercentual
            rotuloGrafico="Valor por ação orçamentária, do PL ao autógrafo"
          />
        </section>

        {/* 4.5.5 — Total por Força em largura cheia, cores institucionais, valor do PL */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Total por Força</h2>
              <p className="painel-sub">
                Soma de todas as UO de cada Força e da Administração Direta do MD · valor no PL
              </p>
            </div>
            <span className="painel-total">{fmtBi(totalPLForcas)}</span>
            <BotaoPPTX titulo="Total por Força" onExportar={() => onExportarSlide('ploa-forcas')} />
            <BotaoPNG titulo="Total por Força" contexto={contexto} />
          </div>
          <GraficoBarrasPLOA
            dados={agregados.map((a) => ({ chave: a.id, rotulo: a.rotulo, valor: a.pl, cor: a.cor }))}
            mostrarPercentual
            rotuloGrafico="Valor total por Força no PL"
          />
          <p className="painel-rodape">
            Painel comparativo entre Forças — ignora o filtro de Órgão da barra superior.
          </p>
        </section>

        {/* 4.5.6 — PL → Autógrafo, barras na tonalidade da Força */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Do PL ao Autógrafo</h2>
              <p className="painel-sub">
                Saldo líquido do rito legislativo por Força · tom cheio = PL, tom claro = autógrafo
              </p>
            </div>
            <span className="painel-total">
              {deltaTodasForcas >= 0 ? '+' : '−'} {fmtBi(Math.abs(deltaTodasForcas))}
            </span>
            <BotaoPPTX titulo="Do PL ao Autógrafo" onExportar={() => onExportarSlide('ploa-pl-autografo')} />
            <BotaoPNG titulo="Do PL ao Autógrafo" contexto={contexto} />
          </div>
          <div className="rolagem-x">
            <GraficoColunasAno
              anos={catsForca}
              series={seriePLAut}
              corPorColuna={coresForca}
              formatar={fmtBi}
              formatarTotal={() => ''}
              rotuloEixo="Comparativo do valor no PL e no autógrafo, por Força"
            />
          </div>
          <div className="ciclo-tabela" role="table" aria-label="Variação do PL para o autógrafo">
            <div className="ciclo-linha ciclo-cab" role="row">
              <span role="columnheader">Força</span>
              <span role="columnheader">PL</span>
              <span role="columnheader">Autógrafo</span>
              <span role="columnheader">Variação</span>
            </div>
            {plAut.map((a) => (
              <div className="ciclo-linha" role="row" key={a.id}>
                <span role="cell" className="ciclo-nome">
                  <span className="pbar-chave" style={{ background: a.cor }} aria-hidden />
                  {a.rotulo}
                </span>
                <span role="cell" className="ciclo-cel"><span className="ciclo-val">{fmtBi(a.pl)}</span></span>
                <span role="cell" className="ciclo-cel"><span className="ciclo-val">{fmtBi(a.autografo)}</span></span>
                <span role="cell" className="ciclo-cel">
                  <span className="ciclo-val">{a.delta >= 0 ? '+' : '−'} {fmtBi(Math.abs(a.delta))}</span>
                  <span className={a.pct === null || a.pct === 0 ? 'var-nula' : a.pct > 0 ? 'var-sobe' : 'var-desce'}>
                    {a.pct === null ? '—' : a.pct === 0 ? 'sem alteração'
                      : `${a.pct > 0 ? '▲' : '▼'} ${fmtPct(Math.abs(a.pct))}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="painel-rodape">
            Painel comparativo entre Forças — ignora o filtro de Órgão.
          </p>
        </section>

        {/* 4.5.7 — Evolução no ciclo, cores das Forças */}
        <section className="painel-grafico p-12">
          <div className="painel-cab">
            <div className="painel-cab-txt">
              <h2>Evolução no ciclo de aprovação</h2>
              <p className="painel-sub">
                Valor de cada Força em cada fase — {FASE_ROTULOS.join(' · ')}
              </p>
            </div>
            <span className="painel-total">{fmtBi(totalTodasForcas)}</span>
            <BotaoPPTX titulo="Evolução no ciclo de aprovação" onExportar={() => onExportarSlide('ploa-ciclo')} />
            <BotaoPNG titulo="Evolução no ciclo de aprovação" contexto={contexto} />
          </div>
          <div className="rolagem-x">
            <GraficoColunasAno
              anos={FASE_ROTULOS}
              series={serieCiclo}
              formatar={fmtBi}
              formatarTotal={(v) => fmtBi(v)}
              rotuloEixo="Valor por Força em cada fase do ciclo de aprovação do PLOA"
              vazio="Sem dotações para os filtros aplicados."
            />
          </div>
          <div className="ciclo-tabela" role="table" aria-label="Variação percentual por fase">
            <div className="ciclo-linha ciclo-cab" role="row">
              <span role="columnheader">Força</span>
              {FASE_ROTULOS.map((r) => <span key={r} role="columnheader">{r}</span>)}
            </div>
            {cicloDados.map((a) => (
              <div className="ciclo-linha" role="row" key={a.id}>
                <span role="cell" className="ciclo-nome">
                  <span className="pbar-chave" style={{ background: a.cor }} aria-hidden />
                  {a.rotulo}
                </span>
                {a.fases.map((v, i) => {
                  const pct = a.variacoes[i]
                  return (
                    <span role="cell" key={i} className="ciclo-cel">
                      <span className="ciclo-val">{fmtBi(v)}</span>
                      <span className={pct === null || pct === 0 ? 'var-nula' : pct > 0 ? 'var-sobe' : 'var-desce'}>
                        {i === 0 ? 'partida' : pct === null ? '—' : pct === 0
                          ? 'sem alteração'
                          : `${pct > 0 ? '▲' : '▼'} ${fmtPct(Math.abs(pct))}`}
                      </span>
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
          <p className="painel-rodape">
            Variação de cada fase sobre a anterior. Painel comparativo entre Forças — ignora o
            filtro de Órgão.
          </p>
        </section>
      </div>
      </div>

      {/* Só aparece na impressão via botão "Exportar PDF" (ver styles.css). */}
      <div className="folha-pdf" aria-hidden>
        <FolhaDashboardPLOA
          filtrosTexto={filtrosTexto}
          rps={rps}
          gnds={gnds}
          uos={uos}
          acoes={acoesTodas}
          agregados={agregados}
          plAut={plAut}
          ciclo={cicloDados}
          totalPL={totalPL}
          totalAutografo={totalAutografo}
          dotacoes={registros.length}
          anosEmTela={anosEmTela}
        />
      </div>
    </>
  )
}
