# Entrega v6 — ajustes da aba PLOA + nome "Análise LOA"

20 arquivos. Sem dependência npm nova: o `package-lock.json` **não muda** e o
`npm ci` do workflow continua válido.

## O que mudou nesta rodada

**Aba PLOA (Dashboard):**
- Subaba "Emendas Autógrafo" removida.
- Nova ordem dos gráficos: RP (agora em **cascata**) e GND lado a lado; UO,
  Ação, Total por Força, PL→Autógrafo e Ciclo em largura cheia.
- Cards superiores: "Valor final aprovado" no card grande (sem valor duplicado),
  PL na tira, "Saldo do rito" com texto "PL → Autógrafo = <variação>", títulos
  maiores e centralizados.
- UO mostra 4 itens com "Mostrar +/−"; Ação mostra 15, expande de 15 em 15, com
  o código destacado em laranja. Nesses dois, a barra é o PL e o traço o autógrafo.
- Cores institucionais das Forças (MD cinza, Exército verde, Marinha branco,
  Aeronáutica azul), aplicadas também em PL→Autógrafo (por tonalidade) e Ciclo.
- Total por Força consolida o PL, em largura cheia.
- Rolagem horizontal dos gráficos no celular.

**Globais:**
- Cabeçalho: "ANÁLISE LOA — MINISTÉRIO DA DEFESA".
- Rodapé: "Desenvolvido por Maj Torres · Fonte: SIGA Brasil · Dados processados…".
- **Nome do app na tela inicial do celular: "Análise LOA"** (manifest + iOS).

## Como publicar (interface web do GitHub)

**Em UM único commit.** Cada push dispara o workflow; subir tudo de uma vez dá
um build só, sem estado intermediário publicado.

1. Repositório **`emendas-defesa-app`** → **Add file** → **Upload files**.
2. Arraste o **conteúdo** da pasta `analise-loa-v6` (as pastas `.github/`,
   `public/`, `scripts/`, `src/` e o `index.html`). **Não arraste a pasta
   `analise-loa-v6` inteira**, senão tudo entra num diretório novo e o build não
   acha nada. (O `PUBLICAR.md` não precisa ir.)
3. Confira na lista que aparece `src/components/AbaPLOA.jsx` com o caminho
   completo, e não `AbaPLOA.jsx` solto na raiz.
4. Mensagem de commit + **Commit directly to the `main` branch**.
5. Acompanhe em **Actions**: o workflow baixa as duas planilhas, regenera o
   `dados.json` e publica. Leva alguns minutos.

## ⚠ Um arquivo a APAGAR pela interface (o upload não apaga sozinho)

A subaba "Emendas Autógrafo" foi removida, mas o upload de arquivos pela web do
GitHub só adiciona/atualiza — nunca apaga. O arquivo abaixo ficará órfão no
repositório. Ele **não quebra nada** (ninguém mais o importa), mas convém
removê-lo para não deixar código morto:

- `src/components/AbaEmendasAutografo.jsx` → abra o arquivo no GitHub, clique na
  lixeira ("Delete this file") e confirme com um commit em `main`.

## Depois de publicar

- **Ctrl+Shift+R uma vez** em quem já usava o app pelo navegador.
- Quem tem o app **instalado no celular** precisa removê-lo e adicioná-lo de
  novo à tela inicial para o nome "Análise LOA" e o ícone aparecerem: o sistema
  só relê o manifest na instalação.

## Pontos de atenção que continuam valendo

- **Cache do service worker versionado** (`analise-ploa-v2` → `analise-loa-v3`).
  É o que faz o nome novo chegar a quem já tinha o app — o manifest é
  cache-first. O passo de build no workflow ainda reescreve essa linha com o SHA
  do commit; conferido que o padrão do `sed` casa o novo valor.
- **A aba 2025 do `PLOA_Despesas_Elaboracao.xlsx` é cópia idêntica da 2024** —
  defeito na origem. O app sinaliza em tela; não há o que consertar em código.
- **A triagem das planilhas é pelo cabeçalho, não pelo nome do arquivo.**
