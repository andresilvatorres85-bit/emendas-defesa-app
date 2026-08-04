import { useMemo, useState } from 'react'
import {
  registrosInconsistentes, agruparInconsistencias, resumoInconsistencias,
  INCONS_TIPOS, GRAVIDADES, fmtBRL, fmtMilhoes, fmtInt, fmtPct,
} from '../dados.js'
import CartaoInconsistencia from './CartaoInconsistencia.jsx'

// Aba "Inconsistências": painel de auditoria do cruzamento de dados.
//  1) cartões-resumo (quanto, quantas emendas, quebra por regra);
//  2) distribuição por UO — onde os achados se concentram;
//  3) sub-filtros por regra e por gravidade (estado local: nenhum estado
//     compartilhado entre usuários/abas);
//  4) lista de cartões, cada um explicando o achado e destacando a evidência
//     dentro da justificativa.
export default function AbaInconsistencias({ registros, detalhe, abrirDetalhe }) {
  const [tipo, setTipo] = useState(null)
  const [gravidade, setGravidade] = useState(null)

  const resumo = useMemo(() => resumoInconsistencias(registros), [registros])
  const grupos = useMemo(
    () => agruparInconsistencias(registrosInconsistentes(registros, { tipo, gravidade })),
    [registros, tipo, gravidade]
  )

  const maxUO = Math.max(1, ...resumo.porUO.map((u) => u.qtd))
  const pctBase = resumo.baseRegistros ? (resumo.qtdRegistros / resumo.baseRegistros) * 100 : 0

  if (resumo.qtdRegistros === 0) {
    return (
      <section aria-label="Inconsistências">
        <div className="vazio">
          <p><strong>Nenhuma inconsistência detectada</strong> para os filtros aplicados.</p>
          <p>
            São verificadas duas regras: <strong>Mod. Aplic. ≠ 90</strong> (as emendas do
            Ministério da Defesa são de Aplicação Direta) e <strong>UO × Justificativa</strong>
            {' '}(a organização militar descrita no texto da emenda pertence a uma Força
            diferente da unidade orçamentária de destino).
          </p>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Inconsistências" className="aba-incons">
      <div className="cards cards-incons" role="region" aria-label="Resumo das inconsistências">
        <div className="card card-alerta">
          <p className="card-titulo">REGISTROS INCONSISTENTES</p>
          <p className="card-valor">{fmtInt(resumo.qtdRegistros)}</p>
          <p className="card-rodape">
            {fmtInt(resumo.qtdEmendas)} emenda(s) · {fmtPct(pctBase)} da base filtrada
          </p>
        </div>
        <div className="card card-alerta">
          <p className="card-titulo">VALOR ENVOLVIDO</p>
          <p className="card-valor">{fmtMilhoes(resumo.valor)}</p>
          <p className="card-rodape">{fmtBRL(resumo.valor)}</p>
        </div>
        {resumo.porTipo.map((t) => (
          <div className="card card-alerta" key={t.id}>
            <p className="card-titulo">{t.rotulo.toUpperCase()}</p>
            <p className="card-valor">{fmtInt(t.qtd)}</p>
            <p className="card-rodape">{fmtMilhoes(t.valor)}</p>
          </div>
        ))}
      </div>

      <section className="painel-grafico">
        <h2>INCONSISTÊNCIAS POR UNIDADE ORÇAMENTÁRIA</h2>
        <p className="painel-sub">Quantidade de registros sinalizados e valor correspondente</p>
        <figure className="ranking" aria-label="Inconsistências por unidade orçamentária">
          <ol className="ranking-lista">
            {resumo.porUO.map((u) => (
              <li className="ranking-item" key={u.chave}>
                <div className="ranking-topo">
                  <span className="ranking-nome">
                    <span className="ranking-autor">{u.uoCod} — {u.uo}</span>
                    <span className="ranking-qtd">
                      {fmtInt(u.qtd)} registro{u.qtd === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="ranking-valor">{fmtMilhoes(u.valor)}</span>
                </div>
                <span className="ranking-trilho">
                  <span
                    className="ranking-fill ranking-fill-alerta"
                    style={{ width: `${(u.qtd / maxUO) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ol>
        </figure>
      </section>

      <div className="subfiltros" role="group" aria-label="Filtrar inconsistências">
        <span className="subfiltros-rotulo">Regra</span>
        <button
          type="button"
          className={`pilula${tipo === null ? ' ativa' : ''}`}
          onClick={() => setTipo(null)}
        >
          Todas
        </button>
        {INCONS_TIPOS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.descricao}
            className={`pilula${tipo === t.id ? ' ativa' : ''}`}
            onClick={() => setTipo(tipo === t.id ? null : t.id)}
          >
            {t.rotulo}
          </button>
        ))}
        <span className="subfiltros-rotulo">Gravidade</span>
        <button
          type="button"
          className={`pilula${gravidade === null ? ' ativa' : ''}`}
          onClick={() => setGravidade(null)}
        >
          Todas
        </button>
        {GRAVIDADES.map((g) => (
          <button
            key={g.id}
            type="button"
            title={g.descricao}
            className={`pilula${gravidade === g.id ? ' ativa' : ''}`}
            onClick={() => setGravidade(gravidade === g.id ? null : g.id)}
          >
            {g.rotulo}
          </button>
        ))}
      </div>

      <p className="contagem">
        {fmtInt(grupos.length)} emenda(s) listada(s) ·{' '}
        {fmtInt(grupos.reduce((s, g) => s + g.itens.length, 0))} registro(s)
      </p>

      <div className="grade">
        {grupos.map((g) => (
          <CartaoInconsistencia
            key={g.emenda}
            grupo={g}
            aberto={detalhe === g.emenda}
            onToggle={() => abrirDetalhe(g.emenda)}
          />
        ))}
      </div>
      {grupos.length === 0 && (
        <p className="vazio">Nenhuma inconsistência com os sub-filtros selecionados.</p>
      )}

      <details className="metodologia">
        <summary>Como as inconsistências são apuradas</summary>
        {INCONS_TIPOS.map((t) => (
          <p key={t.id}><strong>{t.rotulo}:</strong> {t.descricao}</p>
        ))}
        <p>
          <strong>Gravidade —</strong> “Confirmada” reúne os achados objetivos (Mod. Aplic.) e
          os casos de UO × Justificativa lidos um a um; “A verificar” reúne indícios que
          dependem de confirmação junto à unidade orçamentária.
        </p>
        <p>
          A varredura de texto descarta termos ambíguos entre Forças (“batalhão”,
          “infantaria”, “artilharia”, “companhia” — presentes tanto no Exército quanto no
          Corpo de Fuzileiros Navais) e programas conduzidos pelo próprio Ministério da
          Defesa (PROFESP, Soldado Cidadão), que produziam falsos positivos. Quando o texto
          traz CNPJ de uma Força, ele prevalece sobre o nome da organização militar.
        </p>
      </details>
    </section>
  )
}
