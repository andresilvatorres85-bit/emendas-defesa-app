import { fmtBRL, RP_LABEL, fmtInt, fmtPct } from '../dados.js'
import { fmtVar, variacao } from '../ploa.js'

// Bloco "no autógrafo", exclusivo da subaba Emendas Autógrafo. Só é montado
// quando o grupo traz `destinos` (ver `casarComAutografo` em ploa.js).
//
// O ponto delicado deste bloco é NÃO inventar um valor aprovado por emenda.
// Várias emendas caem na mesma dotação e o dado não as distingue lá dentro:
// o que existe de verdade é o valor da DOTAÇÃO. Então é o valor da dotação que
// aparece em destaque, com a informação de quantas emendas a disputam, e o
// rateio proporcional vem depois, sempre nomeado como estimativa.
function BlocoAutografo({ grupo }) {
  const destinos = grupo.destinos || []
  if (!destinos.length) {
    return (
      <p className="autografo-vazio">
        Sem dotação correspondente no autógrafo deste exercício — nenhuma dotação de RP6/RP7
        com a mesma UO, ação e GND foi localizada na planilha de elaboração.
      </p>
    )
  }
  return (
    <div className="autografo-bloco">
      <p className="autografo-titulo">Destino no autógrafo</p>
      {destinos.map((d) => {
        const pct = variacao(d.pl, d.autografo)
        return (
          <div className="autografo-dest" key={d.chave}>
            <p className="autografo-dest-cab">
              <span className="autografo-dest-acao">{d.acaoCod} — {d.acao}</span>
              <span className="tag">UO {d.uoCod}</span>
              <span className="tag">GND {d.gnd}</span>
              <span className="tag tag-rp">{RP_LABEL(d.rp)}</span>
            </p>
            <dl className="autografo-linhas">
              <div>
                <dt>Dotação no PL</dt>
                <dd>{fmtBRL(d.pl)}</dd>
              </div>
              <div>
                <dt>Dotação no autógrafo</dt>
                <dd>
                  {fmtBRL(d.autografo)}{' '}
                  <span className={pct === null || pct === 0 ? 'var-nula' : pct > 0 ? 'var-sobe' : 'var-desce'}>
                    {pct === null ? '(criada no rito)' : pct === 0 ? '(sem alteração)' : `(${fmtVar(pct)})`}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Emendas na mesma dotação</dt>
                <dd>
                  {fmtInt(d.qtdEmendas)} · solicitado ao todo {fmtBRL(d.solicitadoNoBalde)}
                </dd>
              </div>
              <div>
                <dt>Rateio estimado desta emenda</dt>
                <dd>
                  {fmtBRL(d.rateio)}
                  <span className="autografo-nota">
                    {' '}— proporcional ao valor solicitado ({fmtPct(
                      d.solicitadoNoBalde ? (d.solicitadoDesta / d.solicitadoNoBalde) * 100 : 0
                    )} da dotação). Estimativa: a planilha não separa as emendas dentro da dotação.
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        )
      })}
    </div>
  )
}

// Cartão de emenda da aba "Emendas".
// `grupo.inconsistencias` é uma lista de OBJETOS ({tipo, gravidade, rotulo,
// descricao, evidencia, ...}) produzidos pelo pipeline. Aqui usamos apenas o
// suficiente para sinalizar a emenda e remeter à aba "Inconsistências", que
// tem a visualização completa (CartaoInconsistencia.jsx).
export default function CartaoEmenda({ grupo, aberto, onToggle, alerta = false, autografo = false }) {
  const incons = grupo.inconsistencias || []
  const rotulos = incons.map((i) => i.rotulo).filter((v, i, a) => a.indexOf(v) === i)
  const frase = rotulos.join(' · ')

  return (
    <article className={`cartao${alerta ? ' cartao-alerta' : ''}${aberto ? ' aberto' : ''}`}>
      <button
        type="button"
        className="cartao-cab"
        onClick={onToggle}
        aria-expanded={aberto}
      >
        <div className="cartao-linha1">
          <strong className="cartao-autor">{grupo.autor}</strong>
          <span className="cartao-valor">{fmtBRL(grupo.valor)}</span>
        </div>
        <div className="cartao-linha2">
          <span className="tag">{grupo.partido}</span>
          <span className="tag">{grupo.autorUF}</span>
          {grupo.rps.map((rp) => (
            <span key={rp} className="tag tag-rp">{RP_LABEL(rp)}</span>
          ))}
          {incons.length > 0 && <span className="tag tag-incons">⚠ inconsistência</span>}
          {/* Na subaba do autógrafo o selo responde, de cartão fechado, a
              pergunta que traz o usuário até aqui: a emenda chegou à lei? */}
          {autografo && (
            <span className={`tag ${grupo.atendida ? 'tag-atendida' : 'tag-nao-atendida'}`}>
              {grupo.atendida ? '✓ dotação no autógrafo' : '✕ sem dotação no autógrafo'}
            </span>
          )}
          <span className="cartao-num">Nº {grupo.emenda}</span>
        </div>
        {/* OM e objeto ficam visíveis com o cartão fechado: é o que responde
            "para onde vai e para quê" sem precisar abrir. Só existem onde a
            planilha traz a identificação — hoje, quase toda em emendas do
            Exército. */}
        {(grupo.oms.length > 0 || grupo.objetos.length > 0) && (
          <p className="cartao-om">
            {grupo.oms.length > 0 && (
              <span className="cartao-om-bloco">
                <span className="cartao-om-rot">OM</span>
                <span className="cartao-om-txt">{grupo.oms.join(' · ')}</span>
              </span>
            )}
            {grupo.objetos.length > 0 && (
              <span className="cartao-om-bloco">
                <span className="cartao-om-rot">Objeto</span>
                <span className="cartao-om-txt">{grupo.objetos.join(' · ')}</span>
              </span>
            )}
          </p>
        )}
        {alerta && frase && <p className="cartao-frase-alerta" role="alert">⚠ {frase}</p>}
      </button>

      {aberto && (
        <div className="cartao-detalhe">
          {autografo && <BlocoAutografo grupo={grupo} />}
          {grupo.itens.map((r, i) => (
            <div key={r.id} className="detalhe-item">
              {grupo.itens.length > 1 && (
                <p className="detalhe-item-titulo">Item {i + 1} de {grupo.itens.length} — {fmtBRL(r.valor)}</p>
              )}
              <dl>
                <div><dt>UO</dt><dd>{r.uoCod} — {r.uo}</dd></div>
                {r.om && <div><dt>OM</dt><dd>{r.om}</dd></div>}
                {r.objeto && <div><dt>Objeto</dt><dd>{r.objeto}</dd></div>}
                <div><dt>Funcional</dt><dd>{r.funcional}</dd></div>
                <div><dt>Autor (UF)</dt><dd>{r.autorUF}</dd></div>
                <div><dt>Localidade</dt><dd>{r.localidade}</dd></div>
                <div><dt>GND (Cod)</dt><dd>{r.gnd}</dd></div>
                <div><dt>Mod. Aplic. (Cod)</dt><dd>{r.modAplic || '—'}</dd></div>
                <div><dt>C Mil A</dt><dd>{r.cmila}{r.cmilaFallback ? ' (município de MG não identificado — regra de fallback)' : ''}</dd></div>
              </dl>
              <p className="detalhe-just-titulo">Emenda (Justificativa)</p>
              <p className="detalhe-just">{r.justificativa || '—'}</p>
              {(r.inconsistencias || []).length > 0 && (
                <div className="detalhe-incons">
                  <p className="detalhe-incons-titulo">Inconsistências identificadas</p>
                  <ul>
                    {r.inconsistencias.map((inc, j) => (
                      <li key={j}>
                        <strong>{inc.rotulo}:</strong> {inc.descricao}
                      </li>
                    ))}
                  </ul>
                  <p className="detalhe-incons-nota">
                    Detalhamento completo na aba <strong>Inconsistências</strong>.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
