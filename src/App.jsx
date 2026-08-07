import { useEffect, useMemo, useState } from 'react'
import {
  carregarDados, filtrarRegistros, opcoesDoFiltro, agruparPorEmenda,
  resumo, valorPorRP, valorImpositivas, impositivasPorCMilA, topAutores, valorPorPartido,
  FILTROS, fmtBRL, fmtInt, fmtMilhoes, fmtPct, fmtCompacto,
} from './dados.js'
import { useUrlState } from './useUrlState.js'
import { exportarPPTX } from './pptx.js'
import MultiSelect from './components/MultiSelect.jsx'
import TemaBotao from './components/TemaBotao.jsx'
import BotaoPNG from './components/BotaoPNG.jsx'
import GraficoPizza from './components/GraficoPizza.jsx'
import GraficoBarras from './components/GraficoBarras.jsx'
import GraficoBarrasSimples from './components/GraficoBarrasSimples.jsx'
import GraficoPartidos from './components/GraficoPartidos.jsx'
import CartaoEmenda from './components/CartaoEmenda.jsx'
import AbaInconsistencias from './components/AbaInconsistencias.jsx'
import AbaHistorico from './components/AbaHistorico.jsx'

const ABAS = [
  { id: 'dashboard', rotulo: 'Dashboard' },
  { id: 'emendas', rotulo: 'Emendas' },
  { id: 'historico', rotulo: 'Histórico' },
  { id: 'inconsistencias', rotulo: 'Inconsistências' },
]

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

  // O app abre no exercício mais recente da planilha: sem esse padrão, o
  // Dashboard somaria todos os anos de uma vez, o que não é a pergunta que
  // alguém faz ao abrir um painel do PLOA. O ano vem do próprio dado, então
  // acrescentar 2027 à planilha basta para o app abrir em 2027.
  useEffect(() => {
    if (dados?.anoCorrente) definirPadrao('ano', [dados.anoCorrente])
  }, [dados, definirPadrao])

  const registros = dados?.registros ?? []
  const filtrados = useMemo(() => filtrarRegistros(registros, filtros), [registros, filtros])
  // A aba Histórico compara exercícios — ela é a única que ignora o filtro de Ano.
  const semAno = useMemo(() => filtrarRegistros(registros, filtros, 'ano'), [registros, filtros])
  const grupos = useMemo(() => agruparPorEmenda(filtrados), [filtrados])
  const gruposIncons = useMemo(() => grupos.filter((g) => g.inconsistencias.length > 0), [grupos])
  const stats = useMemo(() => resumo(filtrados), [filtrados])
  const porRP = useMemo(() => valorPorRP(filtrados), [filtrados])
  const impositivas = useMemo(() => valorImpositivas(filtrados), [filtrados])
  const totalImpositivas = useMemo(() => impositivas.reduce((s, d) => s + d.valor, 0), [impositivas])
  const impCMilA = useMemo(() => impositivasPorCMilA(filtrados), [filtrados])
  const autoresTop = useMemo(() => topAutores(filtrados, 10), [filtrados])
  const partidos = useMemo(() => valorPorPartido(filtrados), [filtrados])
  // "Limpar filtros" só faz sentido se algum filtro estiver fora do padrão —
  // o Ano começa preenchido e sozinho não conta como filtro do usuário.
  const temFiltro = FILTROS.some((f) => !noPadrao(f.id, filtros[f.id]))

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
  const baixarPPTX = () =>
    exportarPPTX({
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

  return (
    <div className="app">
      <header className="cabecalho">
        <div className="cabecalho-topo">
          <div className="cabecalho-texto">
            <h1>Emendas ao PLOA — Ministério da Defesa</h1>
          </div>
          <TemaBotao />
        </div>
        <nav className="abas" role="tablist" aria-label="Seções">
          {ABAS.map((a) => (
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
        {FILTROS.map((f) => (
          <MultiSelect
            key={f.id}
            rotulo={f.rotulo}
            opcoes={opcoesDoFiltro(registros, filtros, f)}
            selecionados={filtros[f.id]}
            onChange={(v) => setFiltro(f.id, v)}
          />
        ))}
        {temFiltro && (
          <button type="button" className="limpar-tudo" onClick={limparFiltros}>
            Limpar filtros
          </button>
        )}
        {aba === 'dashboard' && (
          <button
            type="button"
            className="btn-pptx"
            onClick={baixarPPTX}
            title="Baixar o Dashboard em PowerPoint editável com os filtros atuais"
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
            <AbaHistorico registros={semAno} contexto={contextoHistorico} />
          </section>
        )}

        {aba === 'inconsistencias' && (
          <AbaInconsistencias
            registros={filtrados}
            detalhe={detalhe}
            abrirDetalhe={abrirDetalhe}
          />
        )}
      </main>

      <footer className="rodape">
        <p>
          Dados processados em {new Date(dados.geradoEm).toLocaleString('pt-BR')} ·
          C Mil A deduzido de Autor (UF); em MG, Uberlândia/Araguari → CMP, demais → CML.
        </p>
      </footer>
    </div>
  )
}
