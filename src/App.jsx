import { useEffect, useMemo, useState } from 'react'
import {
  carregarDados, filtrarRegistros, opcoesDoFiltro, agruparPorEmenda,
  resumo, valorPorRP, valorImpositivas, impositivasPorCMilA, FILTROS, fmtBRL, fmtInt,
} from './dados.js'
import { useUrlState } from './useUrlState.js'
import MultiSelect from './components/MultiSelect.jsx'
import GraficoPizza from './components/GraficoPizza.jsx'
import GraficoBarras from './components/GraficoBarras.jsx'
import CartaoEmenda from './components/CartaoEmenda.jsx'

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
  const temFiltro = FILTROS.some((f) => filtros[f.id]?.size > 0)

  if (erro) {
    return <main className="carregando">Erro ao carregar os dados: {erro}</main>
  }
  if (!dados) {
    return <main className="carregando">Carregando dados…</main>
  }

  return (
    <div className="app">
      <header className="cabecalho">
        <div className="cabecalho-texto">
          <h1>Emendas ao PLOA — Ministério da Defesa</h1>
          <p>Órgão 52000 · Setor 13 · {fmtInt(registros.length)} registros · fonte: {dados.fonte}</p>
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
            <div className="cards" role="region" aria-label="Indicadores">
              <div className="card">
                <p className="card-titulo">VALOR TOTAL</p>
                <p className="card-valor">{fmtBRL(stats.valorTotal)}</p>
              </div>
              <div className="card">
                <p className="card-titulo">QNT EMENDAS</p>
                <p className="card-valor">{fmtInt(stats.qtdEmendas)}</p>
              </div>
              <div className="card">
                <p className="card-titulo">QNT PARLAMENTARES</p>
                <p className="card-valor">{fmtInt(stats.qtdParlamentares)}</p>
              </div>
            </div>
            <div className="paineis-graficos">
              <section className="painel-grafico">
                <h2>EMENDAS PARLAMENTARES AO PLOA</h2>
                <GraficoPizza dados={porRP} total={stats.valorTotal} />
              </section>
              <section className="painel-grafico">
                <h2>EMENDAS IMPOSITIVAS</h2>
                <GraficoPizza dados={impositivas} total={totalImpositivas} />
              </section>
            </div>
            <section className="painel-grafico">
              <h2>EMENDAS IMPOSITIVAS POR COMANDO MILITAR DE ÁREA</h2>
              <p className="painel-sub">Considera apenas as UO do Exército (Comando do Exército e IMBEL)</p>
              <GraficoBarras dados={impCMilA} />
            </section>
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
          <section aria-label="Inconsistências">
            <p className="contagem">{fmtInt(gruposIncons.length)} emenda(s) com inconsistência</p>
            <div className="grade">
              {gruposIncons.map((g) => (
                <CartaoEmenda
                  key={g.emenda}
                  grupo={g}
                  aberto={detalhe === g.emenda}
                  onToggle={() => abrirDetalhe(g.emenda)}
                  alerta
                />
              ))}
            </div>
            {gruposIncons.length === 0 && (
              <div className="vazio">
                <p><strong>Nenhuma inconsistência detectada</strong> para os filtros aplicados.</p>
                <p>
                  Regra: uma emenda é marcada como inconsistente quando a Organização Militar
                  citada na justificativa não pertence à UO da emenda <em>e</em> a Modalidade de
                  Aplicação é diferente de 90. A checagem usa o CNPJ e padrões de nome de OM
                  citados no texto, comparados à família (Força) da UO.
                </p>
              </div>
            )}
          </section>
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
