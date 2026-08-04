import { fmtBRL, RP_LABEL, GRAVIDADE_ROTULO } from '../dados.js'

// ---------------------------------------------------------------------------
// Destaque da evidência dentro da justificativa
// ---------------------------------------------------------------------------
// A evidência gravada pelo pipeline vem como `menção a "BASE AEREA"` ou
// `CNPJ 00.394.429/0001-00` — sem acentos, porque a varredura normaliza o
// texto. Para realçar o trecho no texto ORIGINAL (acentuado), monta-se um
// regex em que cada vogal/consoante acentuável aceita suas variantes.
const VARIANTES = {
  A: '[AÁÀÂÃÄ]', E: '[EÉÈÊË]', I: '[IÍÌÎÏ]', O: '[OÓÒÔÕÖ]', U: '[UÚÙÛÜ]', C: '[CÇ]', N: '[NÑ]',
}

function termoDaEvidencia(evidencia = '') {
  const aspas = evidencia.match(/"([^"]+)"/)
  if (aspas) return aspas[1]
  const cnpj = evidencia.match(/(\d{2}[.\s]?\d{3}[.\s]?\d{3}\s*\/\s*\d{4}\s*-?\s*\d{2})/)
  if (cnpj) return cnpj[1]
  return null
}

function regexDoTermo(termo) {
  const corpo = termo
    .toUpperCase()
    .split('')
    .map((ch) => {
      if (VARIANTES[ch]) return VARIANTES[ch]
      if (/[A-Z0-9]/.test(ch)) return ch
      if (ch === ' ') return '[\\s-]+'
      return `\\${ch}`
    })
    .join('')
  try {
    return new RegExp(`(${corpo})`, 'gi')
  } catch {
    return null
  }
}

function TextoDestacado({ texto, termos }) {
  if (!texto) return <>—</>
  const validos = termos.map(regexDoTermo).filter(Boolean)
  if (!validos.length) return <>{texto}</>
  // Aplica um termo por vez sobre os pedaços ainda não destacados.
  let partes = [texto]
  for (const re of validos) {
    partes = partes.flatMap((p) =>
      typeof p === 'string' ? p.split(re).map((s, i) => (i % 2 === 1 ? { marca: s } : s)) : [p]
    )
  }
  return (
    <>
      {partes.map((p, i) =>
        typeof p === 'string' ? p : <mark key={i} className="marca-evidencia">{p.marca}</mark>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Cartão da aba "Inconsistências"
// ---------------------------------------------------------------------------
export default function CartaoInconsistencia({ grupo, aberto, onToggle }) {
  const chips = []
  for (const a of grupo.alertas) {
    if (!chips.some((c) => c.rotulo === a.rotulo)) chips.push(a)
  }
  // Linha curta abaixo dos chips: só acrescenta o que os chips ainda não dizem,
  // ou seja, a UO para onde o achado aponta. Sem isso, seria repetição.
  const frase = grupo.alertas
    .map((a) => a.uoSugerida)
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(' · ')

  return (
    <article className={`cartao cartao-alerta grav-${grupo.gravidade}${aberto ? ' aberto' : ''}`}>
      <button type="button" className="cartao-cab" onClick={onToggle} aria-expanded={aberto}>
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
        <p className="cartao-uo">{grupo.uoCod} — {grupo.uo}</p>
        <div className="chips-alerta">
          {chips.map((a) => (
            <span key={a.rotulo} className={`chip chip-${a.gravidade}`}>{a.rotulo}</span>
          ))}
          <span className={`chip chip-grav chip-${grupo.gravidade}`}>
            {GRAVIDADE_ROTULO[grupo.gravidade]}
          </span>
        </div>
        {frase && <p className="cartao-frase-alerta">→ UO indicada: {frase}</p>}
      </button>

      {aberto && (
        <div className="cartao-detalhe">
          {grupo.itens.map((r, i) => (
            <div key={r.id} className="detalhe-item">
              {grupo.itens.length > 1 && (
                <p className="detalhe-item-titulo">
                  Item {i + 1} de {grupo.itens.length} — {fmtBRL(r.valor)}
                </p>
              )}

              <div className="detalhe-incons">
                <p className="detalhe-incons-titulo">Inconsistências identificadas</p>
                {r.alertas.map((a, j) => (
                  <div key={j} className={`alerta-bloco alerta-${a.gravidade}`}>
                    <p className="alerta-titulo">
                      {a.rotulo}
                      <span className={`chip chip-grav chip-${a.gravidade}`}>
                        {GRAVIDADE_ROTULO[a.gravidade]}
                      </span>
                    </p>
                    <p className="alerta-desc">{a.descricao}</p>
                    <dl className="alerta-meta">
                      {a.evidencia && (
                        <div><dt>Evidência</dt><dd>{a.evidencia}</dd></div>
                      )}
                      {a.forcaUO && (
                        <div>
                          <dt>Força da UO × citada</dt>
                          <dd>{a.forcaUO} → {a.forcaCitada}</dd>
                        </div>
                      )}
                      {a.uoSugerida && (
                        <div><dt>UO indicada</dt><dd>{a.uoSugerida}</dd></div>
                      )}
                      <div>
                        <dt>Origem do achado</dt>
                        <dd>
                          {a.tipo === 'modalidade'
                            ? 'Regra automática sobre a coluna Mod. Aplic. (Cod)'
                            : a.revisado
                              ? 'Varredura automática + revisão qualitativa do texto'
                              : 'Varredura automática do texto (não revisada)'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>

              <dl>
                <div><dt>UO</dt><dd>{r.uoCod} — {r.uo}</dd></div>
                <div><dt>Ação</dt><dd>{r.acao || '—'}</dd></div>
                <div><dt>Funcional</dt><dd>{r.funcional}</dd></div>
                <div><dt>Autor (UF)</dt><dd>{r.autorUF}</dd></div>
                <div><dt>Localidade</dt><dd>{r.localidade}</dd></div>
                <div><dt>GND (Cod)</dt><dd>{r.gnd}</dd></div>
                <div><dt>Mod. Aplic. (Cod)</dt><dd>{r.modAplic || '—'}</dd></div>
                <div><dt>C Mil A</dt><dd>{r.cmila}</dd></div>
              </dl>

              <p className="detalhe-just-titulo">Emenda (Justificativa)</p>
              <p className="detalhe-just">
                <TextoDestacado
                  texto={r.justificativa}
                  termos={r.alertas.map((a) => termoDaEvidencia(a.evidencia)).filter(Boolean)}
                />
              </p>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
