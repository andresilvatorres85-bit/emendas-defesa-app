import { Component } from 'react'

// Rede de segurança: qualquer erro de renderização deixaria a página em branco
// e sem caminho de volta (o app não tem router). Aqui o erro vira uma tela
// explicativa com duas saídas: voltar ao estado inicial ou limpar o cache do
// PWA — este último resolve o caso em que o navegador guardou uma versão
// antiga do app e recebeu um dados.json novo (formatos incompatíveis).
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null }
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  componentDidCatch(erro, info) {
    console.error('Erro de renderização:', erro, info)
  }

  voltar = () => {
    // Descarta o estado da URL (aba/detalhe/filtros) e tenta renderizar de novo.
    window.history.replaceState({}, '', window.location.pathname)
    this.setState({ erro: null })
  }

  limparCache = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
      if (window.caches) {
        const chaves = await caches.keys()
        await Promise.all(chaves.map((k) => caches.delete(k)))
      }
    } finally {
      window.location.replace(window.location.pathname)
    }
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <main className="tela-erro">
        <h1>Algo deu errado ao montar esta tela</h1>
        <p>
          O aplicativo continua instalado — nada foi perdido. Na maioria das vezes isso
          acontece quando o navegador guardou uma versão antiga do app e recebeu dados
          novos. Limpar o cache resolve.
        </p>
        <div className="tela-erro-acoes">
          <button type="button" className="botao-primario" onClick={this.limparCache}>
            Limpar cache e recarregar
          </button>
          <button type="button" className="botao-secundario" onClick={this.voltar}>
            Voltar ao início
          </button>
        </div>
        <details>
          <summary>Detalhes técnicos</summary>
          <pre>{String(this.state.erro?.stack || this.state.erro)}</pre>
        </details>
      </main>
    )
  }
}
