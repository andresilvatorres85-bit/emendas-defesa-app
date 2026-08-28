import { fmtCompacto, fmtInt, fmtPct } from '../dados.js'
import {
  AGREGADOS, FASE_ROTULOS, fmtBi, fmtBiSeco, fmtVar, variacao,
} from '../ploa.js'
import GraficoCascata from './GraficoCascata.jsx'
import GraficoBarrasPLOA from './GraficoBarrasPLOA.jsx'
import GraficoColunasAno from './GraficoColunasAno.jsx'
import MatrizAnos from './MatrizAnos.jsx'

// ==========================================================================
// Folhas A4 (retrato) para o botão "Exportar PDF" das subabas do PLOA.
//
// Estas folhas só existem no papel: ficam com `display:none` na tela e são
// reveladas apenas dentro de @media print, quando o botão marca
// `:root[data-imprimindo]` (ver styles.css). Reaproveitam os MESMOS componentes
// de gráfico da tela — daí o "retrato fiel" — só que remontados numa paginação
// controlada (título, cards, gráficos agrupados por página) e sem os botões de
// exportação, avisos, rodapés ou notas de recorte.
//
// A ordem e o agrupamento por página seguem o pedido do usuário. Onde um gráfico
// é longo (as barras de "Ação" no Dashboard e a matriz de ações no Histórico),
// a página quebra sozinha: cada item/linha é `break-inside: avoid`, então o
// papel abre quantas folhas forem necessárias sem cortar uma barra no meio.
// ==========================================================================

// Cabeça de cada folha: o título e a linha de recorte pedidos, nada mais.
function Cabeca({ titulo, etiqueta, valor, exercicio }) {
  return (
    <header className="pdf-cabeca">
      <h1 className="pdf-titulo">{titulo}</h1>
      <p className="pdf-recorte">
        <span className="pdf-recorte-rot">— {etiqueta}:</span> {valor}
      </p>
      {exercicio && <p className="pdf-recorte pdf-recorte-sec">{exercicio}</p>}
    </header>
  )
}

// Card de gráfico no papel: mesma moldura da tela, mas montado à mão para não
// arrastar os botões de exportação nem as notas de rodapé. `fluido` libera a
// quebra de página dentro do card (usado só no gráfico de ações, que é longo).
function CardPDF({ titulo, sub, total, fluido = false, children }) {
  return (
    <section className={`pdf-card${fluido ? ' pdf-card-fluido' : ''}`}>
      <div className="pdf-card-cab">
        <div className="pdf-card-txt">
          <h2>{titulo}</h2>
          {sub && <p className="pdf-card-sub">{sub}</p>}
        </div>
        {total != null && <span className="pdf-card-total">{total}</span>}
      </div>
      {children}
    </section>
  )
}

// -------------------------------------------------------- Dashboard PLOA ----
export function FolhaDashboardPLOA({
  filtrosTexto,
  rps, gnds, uos, acoes, agregados, plAut, ciclo,
  totalPL, totalAutografo, dotacoes, anosEmTela,
}) {
  const heroi = fmtCompacto(totalPL)
  const autografo = fmtCompacto(totalAutografo)
  const deltaRito = totalAutografo - totalPL
  const pctRito = variacao(totalPL, totalAutografo)
  const compacto = fmtCompacto(Math.abs(deltaRito))

  const totalGND = gnds.reduce((s, g) => s + g.valor, 0)
  const totalUO = uos.reduce((s, u) => s + u.valor, 0)
  const totalPLForcas = agregados.reduce((s, a) => s + a.pl, 0)
  const totalTodasForcas = agregados.reduce((s, a) => s + a.valor, 0)
  const plTodasForcas = agregados.reduce((s, a) => s + a.pl, 0)
  const deltaTodasForcas = totalTodasForcas - plTodasForcas

  const catsForca = plAut.map((a) => a.rotulo)
  const coresForca = plAut.map((a) => a.cor)
  const seriePLAut = [
    { chave: 'pl', rotulo: 'PL', cor: 'var(--tinta-3)', valores: plAut.map((a) => a.pl) },
    { chave: 'aut', rotulo: 'Autógrafo', cor: 'var(--tinta-3)', valores: plAut.map((a) => a.autografo) },
  ]
  const serieCiclo = ciclo.map((a) => ({
    chave: a.id, rotulo: a.rotulo, cor: a.cor, valores: a.fases,
  }))

  return (
    <>
      {/* ---------- página 1: título, 4 cards, RP+GND lado a lado, UO ------- */}
      <div className="pdf-pagina">
        <Cabeca
          titulo="Análise PLOA"
          etiqueta="FILTROS"
          valor={filtrosTexto}
        />

        <div className="pdf-topo">
          <section className="pdf-mini pdf-mini-heroi">
            <p className="pdf-mini-rot">PL do Executivo</p>
            <p className="pdf-mini-val">
              R$ {heroi.valor}
              {heroi.unidade && <span className="pdf-mini-un">{heroi.unidade}</span>}
            </p>
            <p className="pdf-mini-nota">
              Projeto de lei · {fmtInt(dotacoes)} dotações
            </p>
          </section>
          <section className="pdf-mini">
            <p className="pdf-mini-rot">Valor final aprovado</p>
            <p className="pdf-mini-val">
              R$ {autografo.valor}
              {autografo.unidade && <span className="pdf-mini-un">{autografo.unidade}</span>}
            </p>
            <p className="pdf-mini-nota">Autógrafo — fim do rito</p>
          </section>
          <section className="pdf-mini">
            <p className="pdf-mini-rot">Saldo do rito</p>
            <p className={`pdf-mini-val ${deltaRito >= 0 ? 'var-sobe' : 'var-desce'}`}>
              {deltaRito >= 0 ? '+' : '−'} R$ {compacto.valor}
              {compacto.unidade && <span className="pdf-mini-un">{compacto.unidade}</span>}
            </p>
            <p className="pdf-mini-nota">
              PL → Autógrafo = {pctRito === null ? '—' : fmtVar(pctRito)}
            </p>
          </section>
          <section className="pdf-mini">
            <p className="pdf-mini-rot">Unidades orçamentárias</p>
            <p className="pdf-mini-val">{fmtInt(uos.length)}</p>
            <p className="pdf-mini-nota">UO com dotação no recorte</p>
          </section>
        </div>

        <div className="pdf-linha-2">
          <CardPDF
            titulo="Por Identificador de Resultado Primário"
            sub="Composição do autógrafo por RP, em cascata"
            total={fmtBi(totalAutografo)}
          >
            <GraficoCascata
              dados={rps.map((d) => ({ chave: d.rp, rotulo: d.rotulo, valor: d.valor, cor: d.cor }))}
              rotuloGrafico="Composição do autógrafo por RP, em cascata"
            />
          </CardPDF>

          <CardPDF
            titulo="Valor por Grupo de Natureza da Despesa"
            sub="barra = autógrafo, traço = PL"
            total={fmtBi(totalGND)}
          >
            <GraficoBarrasPLOA
              dados={gnds.map((g) => ({
                chave: g.gnd, rotulo: g.nome || g.rotulo, sublinha: g.rotulo,
                valor: g.valor, pl: g.pl, cor: g.cor,
              }))}
              comparar
              mostrarPercentual
              rotuloGrafico="Valor por grupo de natureza da despesa, do PL ao autógrafo"
            />
          </CardPDF>
        </div>

        <CardPDF
          titulo="Valor por Unidade Orçamentária"
          sub="Todas as UO do órgão 52000 · barra = PL, traço = autógrafo"
          total={fmtBi(totalUO)}
        >
          <GraficoBarrasPLOA
            dados={uos.map((u) => ({
              chave: u.uoCod, rotulo: u.uo, sublinha: `UO ${u.uoCod}`,
              valor: u.valor, pl: u.pl, cor: AGREGADOS.find((a) => a.id === u.orgao)?.cor,
            }))}
            comparar
            barra="pl"
            mostrarPercentual
            rotuloGrafico="Valor por unidade orçamentária, do PL ao autógrafo"
          />
        </CardPDF>
      </div>

      {/* ---------- página 2+: ação (abre quantas folhas precisar) ---------- */}
      <div className="pdf-pagina pdf-pagina-nova pdf-pagina-fluida">
        <CardPDF
          titulo="Valor por Ação orçamentária"
          sub={`${fmtInt(acoes.length)} ações do recorte · barra = PL, traço = autógrafo`}
          total={fmtBi(totalAutografo)}
          fluido
        >
          <GraficoBarrasPLOA
            dados={acoes.map((a) => ({
              chave: a.acaoCod, rotulo: a.acao || a.acaoCod,
              codigo: a.acaoCod !== '—' ? a.acaoCod : null,
              valor: a.valor, pl: a.pl,
            }))}
            comparar
            barra="pl"
            corNumero="var(--serie-laranja)"
            mostrarPercentual
            rotuloGrafico="Valor por ação orçamentária, do PL ao autógrafo"
          />
        </CardPDF>
      </div>

      {/* ---------- página final: Força, PL→Autógrafo e ciclo -------------- */}
      <div className="pdf-pagina pdf-pagina-nova">
        <CardPDF
          titulo="Total por Força"
          sub="Soma de todas as UO de cada Força e da Adm. Direta do MD · valor no PL"
          total={fmtBi(totalPLForcas)}
        >
          <GraficoBarrasPLOA
            dados={agregados.map((a) => ({ chave: a.id, rotulo: a.rotulo, valor: a.pl, cor: a.cor }))}
            mostrarPercentual
            rotuloGrafico="Valor total por Força no PL"
          />
        </CardPDF>

        <CardPDF
          titulo="Do PL ao Autógrafo"
          sub="Saldo líquido do rito por Força · tom cheio = PL, tom claro = autógrafo"
          total={`${deltaTodasForcas >= 0 ? '+' : '−'} ${fmtBi(Math.abs(deltaTodasForcas))}`}
        >
          <GraficoColunasAno
            anos={catsForca}
            series={seriePLAut}
            corPorColuna={coresForca}
            formatar={fmtBi}
            formatarTotal={() => ''}
            rotuloEixo="Comparativo do valor no PL e no autógrafo, por Força"
          />
        </CardPDF>

        <CardPDF
          titulo="Evolução no ciclo de aprovação"
          sub={`Valor de cada Força em cada fase — ${FASE_ROTULOS.join(' · ')}`}
          total={fmtBi(totalTodasForcas)}
        >
          <GraficoColunasAno
            anos={FASE_ROTULOS}
            series={serieCiclo}
            formatar={fmtBi}
            formatarTotal={(v) => fmtBi(v)}
            rotuloEixo="Valor por Força em cada fase do ciclo de aprovação do PLOA"
          />
        </CardPDF>
      </div>
    </>
  )
}

// -------------------------------------------------------- Histórico PLOA ----
export function FolhaHistoricoPLOA({
  filtrosTexto,
  anosResumo, anos, coresPorAno, seriePL, serieRito, serieCiclo,
  forcas, uos, rps, gnds, acoes, totalPeriodo,
}) {
  return (
    <>
      {/* ---- página 1: título, cards de exercício, PL, GND, UO ------------ */}
      <div className="pdf-pagina">
        <Cabeca titulo="Análise Histórico PLOA" etiqueta="FILTROS" valor={filtrosTexto} />

        <div className="pdf-anos">
          {anosResumo.map((a) => {
            const c = fmtCompacto(a.pl)
            const d = fmtCompacto(Math.abs(a.delta))
            return (
              <section className="pdf-ano" key={a.ano}>
                <p className="pdf-ano-ano">{a.ano}</p>
                <p className="pdf-ano-val">
                  R$ {c.valor}{c.unidade && <span className="pdf-ano-un">{c.unidade}</span>}
                </p>
                <dl className="pdf-ano-linhas">
                  <div><dt>Autógrafo</dt><dd>{fmtBi(a.autografo)}</dd></div>
                  <div>
                    <dt>Saldo</dt>
                    <dd className={a.delta >= 0 ? 'var-sobe' : 'var-desce'}>
                      {a.delta >= 0 ? '+' : '−'} {d.valor} {d.unidade}
                    </dd>
                  </div>
                </dl>
              </section>
            )
          })}
        </div>

        <CardPDF
          titulo="Projeto de Lei por exercício"
          sub="Somatório do PL enviado pelo Executivo em cada exercício"
          total={fmtBi(totalPeriodo)}
        >
          <GraficoColunasAno
            anos={anos} series={seriePL} corPorColuna={coresPorAno}
            formatar={fmtBi} formatarTotal={(v) => fmtBi(v)} tendencia
            rotuloEixo="Valor do PL em cada exercício"
          />
        </CardPDF>

        <CardPDF
          titulo="Composição por GND"
          sub="Participação de cada grupo de natureza da despesa no autógrafo"
          total={fmtBi(totalPeriodo)}
        >
          <GraficoColunasAno
            anos={gnds.anos} series={gnds.series} empilhado className="colunas-fina"
            formatar={fmtBi} formatarTotal={(v) => fmtBi(v)}
            rotuloEixo="Valor por grupo de natureza da despesa, por exercício"
          />
        </CardPDF>

        <CardPDF
          titulo="Unidades orçamentárias por exercício"
          sub={`${uos.series.length} UO · valor no autógrafo · R$ bilhões`}
          total={fmtBi(uos.series.reduce((s, l) => s + l.total, 0))}
        >
          <MatrizAnos
            anos={uos.anos} linhas={uos.series} formatar={fmtBiSeco}
            rotuloColuna="Unidade orçamentária"
          />
        </CardPDF>
      </div>

      {/* ---- página 2: RP, PL × Autógrafo, ciclo -------------------------- */}
      <div className="pdf-pagina pdf-pagina-nova">
        <CardPDF
          titulo="Composição por RP"
          sub="Participação de cada resultado primário no autógrafo de cada ano"
          total={fmtBi(totalPeriodo)}
        >
          <GraficoColunasAno
            anos={rps.anos} series={rps.series} proporcao className="colunas-fina"
            formatar={fmtBi} formatarTotal={(_, i) => rps.anos[i]}
            rotuloEixo="Participação de cada RP no autógrafo, por exercício"
          />
        </CardPDF>

        <CardPDF
          titulo="PL × Autógrafo por exercício"
          sub="Quanto o rito legislativo alterou o projeto em cada ano"
          total={`${(() => {
            const d = anosResumo.reduce((s, a) => s + a.delta, 0)
            return `${d >= 0 ? '+' : '−'} ${fmtBi(Math.abs(d))}`
          })()}`}
        >
          <GraficoColunasAno
            anos={anos} series={serieRito}
            formatar={fmtBi} formatarTotal={() => ''}
            rotuloEixo="Valor no PL e no autógrafo em cada exercício"
          />
        </CardPDF>

        <CardPDF
          titulo="Fases do ciclo por exercício"
          sub={`As cinco fases lado a lado em cada ano — ${FASE_ROTULOS.join(' · ')}`}
          total={fmtBi(totalPeriodo)}
        >
          <GraficoColunasAno
            anos={anos} series={serieCiclo} className="colunas-fina"
            formatar={fmtBi} formatarTotal={() => ''}
            rotuloEixo="Valor em cada fase do ciclo, por exercício"
          />
        </CardPDF>
      </div>

      {/* ---- página 3+: matriz de ações (abre quantas folhas precisar) ---- */}
      <div className="pdf-pagina pdf-pagina-nova pdf-pagina-fluida">
        <CardPDF
          titulo="Ações orçamentárias por exercício"
          sub={`${fmtInt(acoes.total)} ações · valor no autógrafo · R$ bilhões`}
          total={fmtBi(acoes.series.reduce((s, l) => s + l.total, 0))}
          fluido
        >
          <MatrizAnos
            anos={acoes.anos} linhas={acoes.series} formatar={fmtBiSeco}
            rotuloColuna="Ação orçamentária" destaqueCodigo
          />
        </CardPDF>
      </div>

      {/* ---- página final: por Força -------------------------------------- */}
      <div className="pdf-pagina pdf-pagina-nova">
        <CardPDF
          titulo="Por Força, ao longo dos exercícios"
          sub="Valor no autógrafo de cada Força em cada ano"
          total={fmtBi(forcas.series.reduce((s, x) => s + x.total, 0))}
        >
          <GraficoColunasAno
            anos={forcas.anos} series={forcas.series} rotularPercentual
            formatar={fmtBi} formatarTotal={(v) => fmtBi(v)}
            rotuloEixo="Valor por Força em cada exercício"
          />
        </CardPDF>
      </div>
    </>
  )
}
