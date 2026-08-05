import { useEffect, useMemo, useState } from 'react'
import {
  carregarDados, filtrarRegistros, opcoesDoFiltro, agruparPorEmenda,
  resumo, valorPorRP, valorImpositivas, impositivasPorCMilA, topAutores, valorPorPartido,
  FILTROS, fmtBRL, fmtInt, fmtMilhoes, fmtPct, fmtCompacto,
} from './dados.js'
import { useUrlState } from './useUrlState.js'
import MultiSelect from './components/MultiSelect.jsx'
import TemaBotao from './components/TemaBotao.jsx'
import GraficoPizza from './components/GraficoPizza.jsx'
import GraficoBarras from './components/GraficoBarras.jsx'
import GraficoBarrasSimples from './components/GraficoBarrasSimples.jsx'
import GraficoPartidos from './components/GraficoPartidos.jsx'
import CartaoEmenda from './components/CartaoEmenda.jsx'
import AbaInconsistencias from './components/AbaInconsistencias.jsx'

const ABAS = [
  { id: 'dashboard', rotulo: 'Dashboard' },
  { id: 'emendas', rotulo: 'Emendas' },
  { id: 'inconsistencias', rotulo: 'Inconsistências' },
]

export default function App() {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const { aba, detalhe, filtros, irParaAba, abrirDetalhe, setFiltro, limparFiltros } = useUrlState()

  useEffect(() => {
    carregarDados().then(setDados).catch((e) => setErro(e.message))
  }, [])

  const registros = dados?.registros ?? []
  const filtrados = useMemo(() => filtrarRegistros(registros, filtros), [registros, filtros])
  const grupos = useMemo(() => agruparPorEmenda(filtrados), [filtrados])
  const gruposIncons = useMemo(() => grupos.filter((g) => g.inconsistencias.length > 0), [grupos])
  const stats = useMemo(() => resumo(filtrados), [filtrados])
  const porRP = useMemo(() => valorPorRP(filtrados), [filtrados])
  const impositivas = useMemo(() => valorImpositivas(filtrados), [filtrados])
  const totalImpositivas = useMemo(() => impositivas.reduce((s, d) => s + d.valor, 0), [impositivas])
  const impCMilA = useMemo(() => impositivasPorCMilA(filtrados), [filtrados])
  const autoresTop = useMemo(() => topAutores(filtrados, 10), [filtrados])
  const partidos = useMemo(() => valorPorPartido(filtrados), [filtrados])
  const temFiltro = FILTROS.some((f) => filtros[f.id]?.size > 0)

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

  return (
    <div className="app">
      <header className="cabecalho">
        <div className="cabecalho-topo">
          <span className="marca" aria-hidden>MD</span>
          <div className="cabecalho-texto">
            <h1>Emendas ao PLOA — Ministério da Defesa</h1>
            <p className="cabecalho-meta">
              <span>Órgão 52000</span>
              <span>Setor 13</span>
              <span>{fmtInt(registros.length)} registros</span>
              <span>fonte: {dados.fonte}</span>
            </p>
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
      </section>

      <main className="conteudo">
        {aba === 'dashboard' && (
          <>
            <div className="destaque" role="region" aria-label="Indicadores">
              <section className="heroi">
                <p className="heroi-rotulo">Valor total solicitado</p>
                <p className="heroi-valor">
                  R$ {heroi.valor}
                  {heroi.unidade && <span className="heroi-unidade">{heroi.unidade}</span>}
                </p>
                <p className="heroi-exato">{fmtBRL(stats.valorTotal)}</p>
                <p className="heroi-nota">
                  {temFiltro ? 'Recorte filtrado' : 'Todas as emendas apresentadas'} ·
                  {' '}{fmtInt(stats.qtdEmendas)} emendas em {fmtInt(registros.length)} registros
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
                </div>
                <GraficoPizza dados={impositivas} total={totalImpositivas} />
              </section>

              <section className="painel-grafico p-6">
                <div className="painel-cab">
                  <div className="painel-cab-txt">
                    <h2>Impositivas por C Mil A</h2>
                    <p className="painel-sub">Somente UO do Exército (Comando do Exército e IMBEL)</p>
                  </div>
                  <span className="painel-total">{fmtMilhoes(totalCMilA)}</span>
                </div>
                <GraficoBarras dados={impCMilA} />
              </section>

              <section className="painel-grafico p-6">
                <div className="painel-cab">
                  <div className="painel-cab-txt">
                    <h2>10 maiores autores</h2>
                    <p className="painel-sub">Deputados Federais e Senadores, por valor total</p>
                  </div>
                  <span className="painel-total">{fmtMilhoes(totalAutores)}</span>
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
