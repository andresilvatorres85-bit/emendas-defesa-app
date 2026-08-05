import { useEffect, useState } from 'react'

// Alternador de tema. "auto" segue o sistema (o CSS usa light-dark(), então
// basta não fixar nada em :root); "claro"/"escuro" gravam data-tema em
// <html>, que o CSS lê para forçar o color-scheme.
// A preferência é local ao navegador (localStorage) — nunca compartilhada
// entre usuários, coerente com o isolamento do resto do aplicativo.
export const CHAVE_TEMA = 'emendas-md-tema'

const OPCOES = [
  { id: 'auto', rotulo: 'Auto', icone: '◐', titulo: 'Seguir o tema do dispositivo' },
  { id: 'claro', rotulo: 'Claro', icone: '☀', titulo: 'Sempre claro' },
  { id: 'escuro', rotulo: 'Escuro', icone: '☾', titulo: 'Sempre escuro' },
]

function lerTema() {
  try {
    const v = localStorage.getItem(CHAVE_TEMA)
    return v === 'claro' || v === 'escuro' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export default function TemaBotao() {
  const [tema, setTema] = useState(lerTema)

  useEffect(() => {
    const raiz = document.documentElement
    if (tema === 'auto') delete raiz.dataset.tema
    else raiz.dataset.tema = tema
    try {
      if (tema === 'auto') localStorage.removeItem(CHAVE_TEMA)
      else localStorage.setItem(CHAVE_TEMA, tema)
    } catch {
      /* modo privado: a escolha vale só para esta sessão */
    }
  }, [tema])

  return (
    <div className="tema" role="group" aria-label="Tema de cores">
      {OPCOES.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.titulo}
          aria-pressed={tema === o.id}
          className={`tema-op${tema === o.id ? ' ativa' : ''}`}
          onClick={() => setTema(o.id)}
        >
          <span aria-hidden>{o.icone}</span>
          <span className="tema-txt">{o.rotulo}</span>
        </button>
      ))}
    </div>
  )
}
