import { fmtBRL, RP_LABEL } from '../dados.js'

// Cartão de emenda, usado nas abas "Emendas" e "Inconsistências".
// `alerta` = true muda a aparência (tom de alerta) e mostra a frase curta.
export default function CartaoEmenda({ grupo, aberto, onToggle, alerta = false }) {
  const fraseAlerta = alerta && grupo.inconsistencias.length > 0
    ? 'OM citada na justificativa não pertence à UO da emenda (Mod. Aplic. ≠ 90).'
    : null

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
          <span className="cartao-num">Nº {grupo.emenda}</span>
        </div>
        {fraseAlerta && <p className="cartao-frase-alerta" role="alert">⚠ {fraseAlerta}</p>}
      </button>

      {aberto && (
        <div className="cartao-detalhe">
          {grupo.itens.map((r, i) => (
            <div key={r.id} className="detalhe-item">
              {grupo.itens.length > 1 && (
                <p className="detalhe-item-titulo">Item {i + 1} de {grupo.itens.length} — {fmtBRL(r.valor)}</p>
              )}
              <dl>
                <div><dt>UO</dt><dd>{r.uoCod} — {r.uo}</dd></div>
                <div><dt>Funcional</dt><dd>{r.funcional}</dd></div>
                <div><dt>Autor (UF)</dt><dd>{r.autorUF}</dd></div>
                <div><dt>Localidade</dt><dd>{r.localidade}</dd></div>
                <div><dt>GND (Cod)</dt><dd>{r.gnd}</dd></div>
                <div><dt>C Mil A</dt><dd>{r.cmila}{r.cmilaFallback ? ' (município de MG não identificado — regra de fallback)' : ''}</dd></div>
              </dl>
              <p className="detalhe-just-titulo">Emenda (Justificativa)</p>
              <p className="detalhe-just">{r.justificativa || '—'}</p>
              {alerta && (r.inconsistencias || []).length > 0 && (
                <div className="detalhe-incons">
                  <p className="detalhe-incons-titulo">Inconsistências</p>
                  <ul>
                    {r.inconsistencias.map((desc, j) => <li key={j}>{desc}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
