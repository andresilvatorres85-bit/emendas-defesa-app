import { useEffect, useMemo, useState } from 'react'
import {
  carregarDados, filtrarRegistros, opcoesDoFiltro, agruparPorEmenda,
  resumo, valorPorRP, valorImpositivas, impositivasPorCMilA, topAutores, valorPorPartido,
  resumoPorAno, rpPorAno, modalidadePorAno, impositivasPorAno,
  forcaPorAno, cmilaPorAno, partidosPorAno, autoresRecorrentes,
  FILTROS, fmtBRL, fmtInt, fmtMilhoes, fmtPct, fmtCompacto,
} from './dados.js'
// As agregações do PLOA entram com prefixo `ploa`: vários nomes coincidem com
// os das emendas (`porRP`, `resumoPorAno`) porque respondem à mesma pergunta em
// bases diferentes — e é justamente por isso que precisam ficar distinguíveis
// à leitura, dentro de um arquivo que usa os dois conjuntos lado a lado.
import {
  FILTROS_PLOA, filtrarPLOA, opcoesPLOA,
  somaFases as ploaSomaFases,
  porAgregado as ploaPorAgregado,
  porUO as ploaPorUO,
  porRP as ploaPorRPFase,
  ciclos as ploaCiclos,
  plVsAutografo as ploaPlVsAutografo,
  acoesOrdenadas as ploaAcoesOrdenadas,
  porGND as ploaPorGND,
  resumoPorAno as ploaResumoPorAno,
  agregadoPorAno as ploaAgregadoPorAno,
  uoPorAno as ploaUoPorAno,
  rpPorAno as ploaRpPorAno,
  gndPorAno as ploaGndPorAno,
  acaoPorAno as ploaAcaoPorAno,
  ciclosPorAno as ploaCiclosPorAno,
  IDX_PL, IDX_AUTOGRAFO, fmtBi, FASE_ROTULOS,
} from './ploa.js'
import { useUrlState } from './useUrlState.js'
import {
  exportarPPTX, exportarPPTXHistorico, exportarSlidePPTX,
  exportarPPTXPLOA, exportarPPTXHistoricoPLOA,
} from './pptx.js'
import MultiSelect from './components/MultiSelect.jsx'
import TemaBotao from './components/TemaBotao.jsx'
import BotaoPNG from './components/BotaoPNG.jsx'
import BotaoPPTX from './components/BotaoPPTX.jsx'
import GraficoPizza from './components/GraficoPizza.jsx'
import GraficoBarras from './components/GraficoBarras.jsx'
import GraficoBarrasSimples from './components/GraficoBarrasSimples.jsx'
import GraficoPartidos from './components/GraficoPartidos.jsx'
import CartaoEmenda from './components/CartaoEmenda.jsx'
import AbaInconsistencias from './components/AbaInconsistencias.jsx'
import AbaHistorico from './components/AbaHistorico.jsx'
import AbaPLOA from './components/AbaPLOA.jsx'
import AbaHistoricoPLOA from './components/AbaHistoricoPLOA.jsx'

// Navegação em dois níveis. Cada seção responde por UMA base de dados:
// "Resultado LEXOR" pelas emendas apresentadas (`Historico_emendas_apresentadas
// .xlsx`) e "PLOA" pelas despesas por fase de elaboração
// (`PLOA_Despesas_Elaboracao.xlsx`).
//
// O id da SUBABA continua sendo o único valor escrito na URL (`?aba=…`), e a
// seção é deduzida dele. Isso preserva todos os links já compartilhados —
// `?aba=historico` continua abrindo o Histórico das emendas — sem precisar de
// um parâmetro novo nem de migração.
const SECOES = [
  {
    id: 'lexor',
    rotulo: 'Resultado LEXOR',
    descricao: 'Emendas parlamentares apresentadas ao PLOA',
    subabas: [
      { id: 'dashboard', rotulo: 'Dashboard' },
      { id: 'emendas', rotulo: 'Emendas' },
      { id: 'historico', rotulo: 'Histórico' },
      { id: 'inconsistencias', rotulo: 'Inconsistências' },
    ],
  },
  {
    id: 'ploa',
    rotulo: 'PLOA',
    descricao: 'Despesas do órgão 52000 por fase de elaboração',
    subabas: [
      { id: 'ploa-dashboard', rotulo: 'Dashboard PLOA' },
      { id: 'ploa-historico', rotulo: 'Histórico PLOA' },
    ],
  },
]
const SECAO_DA_ABA = Object.fromEntries(
  SECOES.flatMap((s) => s.subabas.map((sub) => [sub.id, s.id]))
)
const PRIMEIRA_SUBABA = Object.fromEntries(SECOES.map((s) => [s.id, s.subabas[0].id]))

export default function App() {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const {
    aba, detalhe, filtros,
    irParaAba, abrirDetalhe, setFiltro, limparFiltros, definirPadrao, noPadrao,
  } = useUrlState()

  useEffect(() => {
    carregarDados().then(setDados).catch((e) => setErro(e.message))
  }, [])

  // Filtros com que o app abre. O ano vem do próprio dado — acrescentar 2027 à
  // planilha basta para o app abrir em 2027 — e o Órgão abre no Exército, que é
  // o recorte de trabalho do dia a dia. Sem padrão de ano o Dashboard somaria
  // todos os exercícios de uma vez, que não é a pergunta que alguém faz ao
  // abrir um painel do PLOA. Os dois voltam nesses valores no "Limpar filtros"
  // e são sobrepostos por qualquer link compartilhado.
  useEffect(() => {
    if (!dados?.anoCorrente) return
    definirPadrao('ano', [dados.anoCorrente])
    definirPadrao('orgao', ['EXÉRCITO'])
  }, [dados, definirPadrao])

  const registros = dados?.registros ?? []
  // Seção ativa, deduzida da subaba — a URL guarda só a subaba (ver SECOES).
  const secaoId = SECAO_DA_ABA[aba] ?? 'lexor'
  const secao = SECOES.find((s) => s.id === secaoId)

  // ------------------------------------------------------------ base PLOA ---
  // Base independente da das emendas: outro arquivo, outro escopo (o órgão
  // 52000 inteiro) e outra unidade (a dotação). Um `dados.json` gerado antes
  // desta versão não traz o bloco — daí o objeto vazio de reserva, que faz a
  // seção PLOA aparecer vazia em vez de derrubar o app.
  const ploa = dados?.ploa ?? { anos: [], registros: [], fasesVazias: {}, anosDuplicados: [] }
  const ploaRegistros = ploa.registros ?? []
  const ploaFiltrados = useMemo(
    () => filtrarPLOA(ploaRegistros, filtros), [ploaRegistros, filtros]
  )
  // Os painéis que comparam as Forças entre si ignoram o filtro de Órgão —
  // com o padrão do app (Exército) sobrariam uma barra e nenhuma comparação.
  const ploaSemOrgao = useMemo(
    () => filtrarPLOA(ploaRegistros, filtros, 'orgao'), [ploaRegistros, filtros]
  )
  // O Histórico PLOA ignora o Ano (é o que ele compara)…
  const ploaSemAno = useMemo(
    () => filtrarPLOA(ploaRegistros, filtros, 'ano'), [ploaRegistros, filtros]
  )
  // …e o painel por Força dele ignora os dois. Encadear duas chamadas não
  // substitui a lista: a primeira já teria removido o que a segunda precisa ver.
  const ploaSemAnoNemOrgao = useMemo(
    () => filtrarPLOA(ploaRegistros, filtros, ['ano', 'orgao']), [ploaRegistros, filtros]
  )

  const filtrados = useMemo(() => filtrarRegistros(registros, filtros), [registros, filtros])
  // A aba Histórico compara exercícios — ela é a única que ignora o filtro de Ano.
  const semAno = useMemo(() => filtrarRegistros(registros, filtros, 'ano'), [registros, filtros])
  // …e o painel "Por Força" dela ignora também o Órgão, pelo mesmo motivo: é o
  // que ele compara.
  const semAnoNemOrgao = useMemo(
    () => filtrarRegistros(registros, filtros, ['ano', 'orgao']),
    [registros, filtros]
  )
  const grupos = useMemo(() => agruparPorEmenda(filtrados), [filtrados])
  const gruposIncons = useMemo(() => grupos.filter((g) => g.inconsistencias.length > 0), [grupos])
  const stats = useMemo(() => resumo(filtrados), [filtrados])
  const porRP = useMemo(() => valorPorRP(filtrados), [filtrados])
  const impositivas = useMemo(() => valorImpositivas(filtrados), [filtrados])
  const totalImpositivas = useMemo(() => impositivas.reduce((s, d) => s + d.valor, 0), [impositivas])
  const impCMilA = useMemo(() => impositivasPorCMilA(filtrados), [filtrados])
  const autoresTop = useMemo(() => topAutores(filtrados, 10), [filtrados])
  const partidos = useMemo(() => valorPorPartido(filtrados), [filtrados])
  // Filtros aplicáveis à subaba em tela. Numa dotação orçamentária não existe
  // partido, autor nem C Mil A — esses descrevem uma emenda parlamentar. Se a
  // barra mantivesse todos, bastaria alguém selecionar um partido na seção das
  // emendas e passar para o PLOA para a aba inteira zerar sem explicação.
  //
  // "Emendas Autógrafo" é a exceção dentro da seção PLOA: os cartões dela SÃO
  // emendas, e os filtros de emenda continuam valendo. Esconder a barra cheia
  // ali faria o partido selecionado na outra seção seguir filtrando a lista sem
  // aparecer em lugar nenhum.
  const filtrosVisiveis =
    secaoId === 'ploa' && aba !== 'ploa-emendas' ? FILTROS_PLOA : FILTROS
  // "Limpar filtros" só aparece se algo estiver fora do padrão — e olha apenas
  // os filtros da tela, senão o botão surgiria no PLOA por causa de um filtro
  // de partido que ali nem está sendo aplicado.
  const temFiltro = filtrosVisiveis.some((f) => !noPadrao(f.id, filtros[f.id]))

  if (erro) {
    return <main className="carregando">Erro ao carregar os dados: {erro}</main>
  }
  if (!dados) {
    return <main className="carregando">Carregando dados…</main>
  }

  const heroi = fmtCompacto(stats.valorTotal)
  const impositivo = fmtCompacto(totalImpositivas)
  const pctImpositivas = stats.valorTotal ? (totalImpositivas / stats.valorTotal) * 100 : 0
  const totalCMilA = impCMilA.reduce((s, d) => s + d.total, 0)
  const totalAutores = autoresTop.reduce((s, d) => s + d.valor, 0)
  const totalPartidos = partidos.reduce((s, d) => s + d.valor, 0)
  // Os 10 maiores autores são parlamentares individuais, e emenda individual é
  // RP6 — por isso a base de comparação do percentual é o total de RP6.
  const totalRP6 = porRP.find((d) => String(d.rp) === '6')?.valor ?? 0
  const pctAutoresRP6 = totalRP6 ? (totalAutores / totalRP6) * 100 : 0

  // Texto do recorte: vai no rodapé de cada PNG e no cabeçalho da folha A4,
  // para que a imagem/página exportada diga sozinha o que está mostrando.
  // O Ano sai na frente e sempre — é o recorte que muda mais e o que faz uma
  // imagem solta ser interpretável meses depois.
  const anosSel = [...(filtros.ano ?? [])].sort()
  const anoTexto = anosSel.length
    ? `Exercício ${anosSel.join(', ')}`
    : `Todos os exercícios (${(dados.anos ?? []).join(', ')})`
  const filtrosAtivos = FILTROS
    .filter((f) => f.id !== 'ano' && filtros[f.id]?.size > 0)
    .map((f) => `${f.rotulo}: ${[...filtros[f.id]].join(', ')}`)
  const recorte = filtrosAtivos.length
    ? `${anoTexto} · filtros — ${filtrosAtivos.join(' · ')}`
    : `${anoTexto} · sem outros filtros`
  const escopo = 'Ministério da Defesa · Órgão 52000 · Setor Defesa'
  const contextoExport =
    `Emendas ao PLOA — ${escopo}. ${recorte}. ` +
    `${fmtInt(stats.qtdEmendas)} emendas · ${fmtBRL(stats.valorTotal)}. ` +
    `Extraído em ${new Date().toLocaleString('pt-BR')}.`
  // A aba Histórico ignora o filtro de Ano, então o rodapé dos PNG dela
  // precisa dizer isso — senão a imagem sai carimbada com um ano só.
  const recorteHistorico = filtrosAtivos.length
    ? `Todos os exercícios (${(dados.anos ?? []).join(', ')}) · filtros — ${filtrosAtivos.join(' · ')}`
    : `Todos os exercícios (${(dados.anos ?? []).join(', ')}) · sem outros filtros`
  const contextoHistorico =
    `Emendas ao PLOA — ${escopo}. ${recorteHistorico}. ` +
    `${fmtInt(new Set(semAno.map((r) => r.emenda)).size)} emendas · ` +
    `${fmtBRL(semAno.reduce((s, r) => s + r.valor, 0))}. ` +
    `Extraído em ${new Date().toLocaleString('pt-BR')}.`

  // Carga do PPTX: os mesmos números que estão na tela, já filtrados. Montada
  // no clique (e não a cada render) para não custar nada enquanto ninguém
  // exporta — e para carimbar a hora da exportação, não a do render.
  const cargaPPTX = () => ({
      titulo: 'EMENDAS PARLAMENTARES APRESENTADAS AO PLOA',
      escopo,
      recorte,
      geradoEm: new Date().toLocaleString('pt-BR'),
      fonte: dados.fonte,
      stats,
      qtdRegistros: filtrados.length,
      totalImpositivas,
      pctImpositivas,
      porRP,
      impositivas,
      autores: autoresTop,
      totalAutores,
      pctAutoresRP6,
      cmila: impCMilA,
      totalCMilA,
      partidos,
      totalPartidos,
  })
  const baixarPPTX = () => exportarPPTX(cargaPPTX())
  const baixarSlide = (id) => exportarSlidePPTX(cargaPPTX(), id)

  // Carga do PPTX da aba Histórico. Montada no clique, como a do Dashboard —
  // as agregações só rodam quando alguém exporta de fato. As séries saem na
  // mesma ordem de `anos`, que é a ordem dos eixos e das colunas das tabelas.
  const cargaHistorico = () => {
    const porAno = resumoPorAno(semAno)
    const serie = (campo) => porAno.map((a) => a[campo])
    return {
      titulo: 'EMENDAS PARLAMENTARES APRESENTADAS AO PLOA',
      escopo,
      recorte: recorteHistorico,
      recorteForca: `${recorteHistorico} · painel sem o filtro de Órgão`,
      geradoEm: new Date().toLocaleString('pt-BR'),
      fonte: dados.fonte,
      stats: resumo(semAno),
      anos: porAno.map((a) => a.ano),
      serieValor: serie('valor'),
      serieEmendas: serie('qtdEmendas'),
      serieParlamentares: serie('qtdParlamentares'),
      serieImpositivo: serie('impositivo'),
      totalPeriodo: porAno.reduce((s, a) => s + a.valor, 0),
      impositivasPorAno: impositivasPorAno(semAno).series,
      rpPorAno: rpPorAno(semAno).series,
      modalidadePorAno: modalidadePorAno(semAno).series,
      forcaPorAno: forcaPorAno(semAnoNemOrgao),
      cmilaPorAno: cmilaPorAno(semAno),
      partidosPorAno: partidosPorAno(semAno, 12),
      autoresPorAno: autoresRecorrentes(semAno, 12),
    }
  }
  const baixarPPTXHistorico = () => exportarPPTXHistorico(cargaHistorico())
  const baixarSlideHistorico = (id) => exportarSlidePPTX(cargaHistorico(), id)

  // ------------------------------------------------ exportações da seção PLOA
  // O recorte impresso no rodapé só cita os filtros que a seção PLOA aplica de
  // fato — carimbar "Partido: PL" num painel que ignora o partido tornaria a
  // imagem, sozinha, enganosa.
  const filtrosAtivosPLOA = FILTROS_PLOA
    .filter((f) => f.id !== 'ano' && filtros[f.id]?.size > 0)
    .map((f) => `${f.rotulo}: ${[...filtros[f.id]].join(', ')}`)
  const anosPloaEmTela = [...new Set(ploaFiltrados.map((r) => r.ano))].sort()
  const anoTextoPLOA = anosPloaEmTela.length
    ? `Exercício ${anosPloaEmTela.join(', ')}`
    : `Todos os exercícios (${(ploa.anos ?? []).join(', ')})`
  const recortePLOA = filtrosAtivosPLOA.length
    ? `${anoTextoPLOA} · filtros — ${filtrosAtivosPLOA.join(' · ')}`
    : `${anoTextoPLOA} · sem outros filtros`
  const recorteHistPLOA = filtrosAtivosPLOA.length
    ? `Todos os exercícios (${(ploa.anos ?? []).join(', ')}) · filtros — ${filtrosAtivosPLOA.join(' · ')}`
    : `Todos os exercícios (${(ploa.anos ?? []).join(', ')}) · sem outros filtros`
  const escopoPLOA = 'Ministério da Defesa · Órgão 52000 · todos os setores'
  const totaisPLOA = ploaSomaFases(ploaFiltrados)
  const contextoPLOA =
    `PLOA — despesas por fase de elaboração — ${escopoPLOA}. ${recortePLOA}. ` +
    `${fmtInt(ploaFiltrados.length)} dotações · autógrafo ${fmtBi(totaisPLOA[IDX_AUTOGRAFO])}. ` +
    `Extraído em ${new Date().toLocaleString('pt-BR')}.`
  const contextoHistPLOA =
    `PLOA — despesas por fase de elaboração — ${escopoPLOA}. ${recorteHistPLOA}. ` +
    `${fmtInt(ploaSemAno.length)} dotações. ` +
    `Extraído em ${new Date().toLocaleString('pt-BR')}.`

  // Montadas no clique, como as demais: as agregações só rodam quando alguém
  // exporta de fato, e a hora carimbada é a da exportação.
  const cargaPLOA = () => ({
    titulo: 'PLOA — DESPESAS POR FASE DE ELABORAÇÃO',
    escopo: escopoPLOA,
    recorte: recortePLOA,
    recorteForca: `${recortePLOA} · painel sem o filtro de Órgão`,
    geradoEm: new Date().toLocaleString('pt-BR'),
    fonte: dados.fonte,
    // A capa e os cartões servem às duas bases: quem monta a carga escreve a
    // linha-resumo, porque só aqui se sabe se a unidade é "emendas" ou "dotações".
    linhaResumo:
      `${fmtInt(ploaFiltrados.length)} dotações · autógrafo ${fmtBi(totaisPLOA[IDX_AUTOGRAFO])}`,
    fases: FASE_ROTULOS,
    qtdDotacoes: ploaFiltrados.length,
    totalPL: totaisPLOA[IDX_PL],
    totalAutografo: totaisPLOA[IDX_AUTOGRAFO],
    agregados: ploaPorAgregado(ploaSemOrgao),
    uos: ploaPorUO(ploaFiltrados),
    rps: ploaPorRPFase(ploaFiltrados),
    ciclos: ploaCiclos(ploaSemOrgao),
    plAutografo: ploaPlVsAutografo(ploaSemOrgao),
    acoes: ploaAcoesOrdenadas(ploaFiltrados),
    gnds: ploaPorGND(ploaFiltrados),
  })
  const cargaHistPLOA = () => {
    const porAno = ploaResumoPorAno(ploaSemAno)
    return {
      titulo: 'PLOA — HISTÓRICO DOS EXERCÍCIOS',
      escopo: escopoPLOA,
      recorte: recorteHistPLOA,
      recorteForca: `${recorteHistPLOA} · painel sem o filtro de Órgão`,
      geradoEm: new Date().toLocaleString('pt-BR'),
      fonte: dados.fonte,
      linhaResumo:
        `${fmtInt(ploaSemAno.length)} dotações em ${porAno.length} exercícios · ` +
        `autógrafo somado ${fmtBi(porAno.reduce((s2, a) => s2 + a.autografo, 0))}`,
      anos: porAno.map((a) => a.ano),
      resumoAnos: porAno,
      totalPeriodo: porAno.reduce((s, a) => s + a.autografo, 0),
      forcasPorAno: ploaAgregadoPorAno(ploaSemAnoNemOrgao),
      uoPorAno: ploaUoPorAno(ploaSemAno),
      rpPorAno: ploaRpPorAno(ploaSemAno),
      gndPorAno: ploaGndPorAno(ploaSemAno),
      acaoPorAno: ploaAcaoPorAno(ploaSemAno, 15),
      ciclosPorAno: ploaCiclosPorAno(ploaSemAno),
    }
  }
  const baixarPPTXPLOA = () => exportarPPTXPLOA(cargaPLOA())
  const baixarSlidePLOA = (id) => exportarSlidePPTX(cargaPLOA(), id)
  const baixarPPTXHistPLOA = () => exportarPPTXHistoricoPLOA(cargaHistPLOA())
  const baixarSlideHistPLOA = (id) => exportarSlidePPTX(cargaHistPLOA(), id)

  // Abas que exportam o baralho inteiro (as demais exportam só por gráfico).
  const ABAS_COM_BARALHO = {
    dashboard: { acao: baixarPPTX, dica: 'Baixar o Dashboard em PowerPoint editável com os filtros atuais' },
    historico: { acao: baixarPPTXHistorico, dica: 'Baixar a aba Histórico em PowerPoint editável com os filtros atuais' },
    'ploa-dashboard': { acao: baixarPPTXPLOA, dica: 'Baixar o Dashboard PLOA em PowerPoint editável com os filtros atuais' },
    'ploa-historico': { acao: baixarPPTXHistPLOA, dica: 'Baixar o Histórico PLOA em PowerPoint editável com os filtros atuais' },
  }

  // Filtros exibidos na barra: só os que existem na base da seção ativa (ver
  // `filtrosVisiveis`, definido junto com `temFiltro`). As opções vêm da base
  // correspondente e são facetadas, então uma UO ou um RP novo na planilha
  // aparece sozinho na lista, sem tocar no código.
  const opcoesDe = (f) =>
    secaoId === 'ploa' && aba !== 'ploa-emendas'
      ? opcoesPLOA(ploaRegistros, filtros, f)
      : opcoesDoFiltro(registros, filtros, f)
  return (
    <div className="app">
      <header className="cabecalho">
        <div className="cabecalho-topo">
          <div className="cabecalho-texto">
            <h1>ANÁLISE LOA — MINISTÉRIO DA DEFESA</h1>
          </div>
          <TemaBotao />
        </div>

        {/* Nível 1: a base de dados. Cada seção responde por uma planilha. */}
        <nav className="secoes" role="tablist" aria-label="Seções">
          {SECOES.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={secaoId === s.id}
              className={`secao${secaoId === s.id ? ' ativa' : ''}`}
              onClick={() => irParaAba(PRIMEIRA_SUBABA[s.id])}
              title={s.descricao}
            >
              {s.rotulo}
            </button>
          ))}
        </nav>

        {/* Nível 2: as subabas da seção ativa. */}
        <nav className="abas" role="tablist" aria-label={`Subseções de ${secao.rotulo}`}>
          {secao.subabas.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={aba === a.id}
              className={`aba${aba === a.id ? ' ativa' : ''}`}
              onClick={() => irParaAba(a.id)}
            >
              {a.rotulo}
              {a.id === 'inconsistencias' && gruposIncons.length > 0 && (
                <span className="aba-badge">{gruposIncons.length}</span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <section className="filtros" aria-label="Filtros">
        <span className="filtros-rotulo">Filtros</span>
        {filtrosVisiveis.map((f) => (
          <MultiSelect
            key={f.id}
            rotulo={f.rotulo}
            opcoes={opcoesDe(f)}
            selecionados={filtros[f.id]}
            onChange={(v) => setFiltro(f.id, v)}
          />
        ))}
        {temFiltro && (
          <button type="button" className="limpar-tudo" onClick={limparFiltros}>
            Limpar filtros
          </button>
        )}
        {ABAS_COM_BARALHO[aba] && (
          <button
            type="button"
            className="btn-pptx"
            onClick={ABAS_COM_BARALHO[aba].acao}
            title={ABAS_COM_BARALHO[aba].dica}
          >
            Exportar PPTX
          </button>
        )}
      </section>

      <main className="conteudo">
        {aba === 'dashboard' && (
          <>
            {/* só aparece na impressão / PDF */}
            <header className="folha-cab">
              <h2>EMENDAS APRESENTADAS AO PLOA</h2>
              <p>{escopo}</p>
              <p>{recorte}</p>
              <p>Extraído em {new Date().toLocaleString('pt-BR')} · fonte: {dados.fonte}</p>
            </header>

            <div className="destaque" role="region" aria-label="Indicadores">
              <section className="heroi">
                <p className="heroi-rotulo">Valor total solicitado</p>
                <p className="heroi-valor">
                  R$ {heroi.valor}
                  {heroi.unidade && <span className="heroi-unidade">{heroi.unidade}</span>}
                </p>
                <p className="heroi-exato">{fmtBRL(stats.valorTotal)}</p>
                {/* o denominador é o do RECORTE (não o da base inteira): com
                    vários exercícios carregados, "em 1.636 registros" ao lado
                    de "370 emendas" comparava anos diferentes */}
                <p className="heroi-nota">
                  {anoTexto} · {fmtInt(stats.qtdEmendas)} emendas em {fmtInt(filtrados.length)} registros
                </p>
              </section>

              <div className="tiras">
                <section className="tira">
                  <p className="tira-rotulo">Emendas</p>
                  <p className="tira-valor">{fmtInt(stats.qtdEmendas)}</p>
                  <p className="tira-nota">Emendas distintas no recorte</p>
                </section>
                <section className="tira">
                  <p className="tira-rotulo">Parlamentares</p>
                  <p className="tira-valor">{fmtInt(stats.qtdParlamentares)}</p>
                  <p className="tira-nota">Autores distintos das emendas</p>
                </section>
                <section className="tira">
                  <p className="tira-rotulo">Impositivas</p>
                  <p className="tira-valor">
                    R$ {impositivo.valor}
                    {impositivo.unidade && <span className="tira-unidade">{impositivo.unidade}</span>}
                  </p>
                  <p className="tira-nota">RP6 + RP7 · {fmtPct(pctImpositivas)} do total</p>
                </section>
              </div>
            </div>

            <div className="paineis">
              <section className="painel-grafico p-6">
                <div className="painel-cab">
                  <div className="painel-cab-txt">
                    <h2>Emendas parlamentares ao PLOA</h2>
                    <p className="painel-sub">Valor solicitado por identificador de resultado primário (RP)</p>
                  </div>
                  <span className="painel-total">{fmtMilhoes(stats.valorTotal)}</span>
                  <BotaoPPTX titulo="Emendas parlamentares ao PLOA" onExportar={() => baixarSlide('rp')} />
                  <BotaoPNG titulo="Emendas parlamentares ao PLOA" contexto={contextoExport} />
                </div>
                <GraficoPizza dados={porRP} total={stats.valorTotal} />
              </section>

              <section className="painel-grafico p-6">
                <div className="painel-cab">
                  <div className="painel-cab-txt">
                    <h2>Emendas impositivas</h2>
                    <p className="painel-sub">RP6 por tipo de autor · RP7 por bancada</p>
                  </div>
                  <span className="painel-total">{fmtMilhoes(totalImpositivas)}</span>
                  <BotaoPPTX titulo="Emendas impositivas" onExportar={() => baixarSlide('impositivas')} />
                  <BotaoPNG titulo="Emendas impositivas" contexto={contextoExport} />
                </div>
                <GraficoPizza dados={impositivas} total={totalImpositivas} />
              </section>

              <section className="painel-grafico p-6">
                <div className="painel-cab">
                  <div className="painel-cab-txt">
                    <h2>Impositivas por C Mil A</h2>
                    <p className="painel-sub">Somente UO do Exército (Comando do Exército, IMBEL e Fundo do Exército)</p>
                  </div>
                  <span className="painel-total">{fmtMilhoes(totalCMilA)}</span>
                  <BotaoPPTX titulo="Impositivas por C Mil A" onExportar={() => baixarSlide('cmila')} />
                  <BotaoPNG titulo="Impositivas por C Mil A" contexto={contextoExport} />
                </div>
                <GraficoBarras dados={impCMilA} />
              </section>

              <section className="painel-grafico p-6">
                <div className="painel-cab">
                  <div className="painel-cab-txt">
                    <h2>10 maiores autores</h2>
                    <p className="painel-sub">Deputados Federais e Senadores, por valor total</p>
                  </div>
                  <span className="painel-total">
                    {fmtMilhoes(totalAutores)}
                    <span className="painel-total-nota"> ({fmtPct(pctAutoresRP6)} do RP6)</span>
                  </span>
                  <BotaoPPTX titulo="10 maiores autores" onExportar={() => baixarSlide('autores')} />
                  <BotaoPNG titulo="10 maiores autores" contexto={contextoExport} />
                </div>
                <GraficoBarrasSimples dados={autoresTop} />
              </section>

              <section className="painel-grafico p-12">
                <div className="painel-cab">
                  <div className="painel-cab-txt">
                    <h2>Emendas por partido</h2>
                    <p className="painel-sub">Exclui comissões e bancadas (sem partido)</p>
                  </div>
                  <span className="painel-total">{fmtMilhoes(totalPartidos)}</span>
                  <BotaoPPTX titulo="Emendas por partido" onExportar={() => baixarSlide('partidos')} />
                  <BotaoPNG titulo="Emendas por partido" contexto={contextoExport} />
                </div>
                <GraficoPartidos dados={partidos} />
              </section>
            </div>
          </>
        )}

        {aba === 'emendas' && (
          <section aria-label="Emendas">
            <p className="contagem">{fmtInt(grupos.length)} emenda(s)</p>
            <div className="grade">
              {grupos.map((g) => (
                <CartaoEmenda
                  key={g.emenda}
                  grupo={g}
                  aberto={detalhe === g.emenda}
                  onToggle={() => abrirDetalhe(g.emenda)}
                />
              ))}
            </div>
            {grupos.length === 0 && <p className="vazio">Nenhuma emenda para os filtros aplicados.</p>}
          </section>
        )}

        {aba === 'historico' && (
          <section aria-label="Histórico">
            <AbaHistorico
              registros={semAno}
              registrosTodasForcas={semAnoNemOrgao}
              contexto={contextoHistorico}
              onExportarSlide={baixarSlideHistorico}
            />
          </section>
        )}

        {aba === 'inconsistencias' && (
          <AbaInconsistencias
            registros={filtrados}
            detalhe={detalhe}
            abrirDetalhe={abrirDetalhe}
          />
        )}

        {aba === 'ploa-dashboard' && (
          <AbaPLOA
            registros={ploaFiltrados}
            registrosTodasForcas={ploaSemOrgao}
            anos={ploa.anos ?? []}
            fasesVazias={ploa.fasesVazias ?? {}}
            duplicados={ploa.anosDuplicados ?? []}
            contexto={contextoPLOA}
            onExportarSlide={baixarSlidePLOA}
          />
        )}

        {aba === 'ploa-historico' && (
          <AbaHistoricoPLOA
            registros={ploaSemAno}
            registrosTodasForcas={ploaSemAnoNemOrgao}
            duplicados={ploa.anosDuplicados ?? []}
            contexto={contextoHistPLOA}
            onExportarSlide={baixarSlideHistPLOA}
          />
        )}
      </main>

      <footer className="rodape">
        <p>
          Desenvolvido por Maj Torres · Fonte: SIGA Brasil · Dados processados em{' '}
          {new Date(dados.geradoEm).toLocaleString('pt-BR')}.
        </p>
      </footer>
    </div>
  )
}
