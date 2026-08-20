# Entrega v5 — seção PLOA, nome "Análise PLOA" e ícone novo

20 arquivos, 10 deles novos. Sem dependência npm nova: o `package-lock.json`
**não muda** e o `npm ci` do workflow continua válido.

## Arquivos

### Novos (10)
| Arquivo | O que é |
|---|---|
| `src/ploa.js` | Camada de dados da nova base: filtros, fases, agregações e a junção emenda × autógrafo |
| `src/components/AbaPLOA.jsx` | Subaba "Dashboard PLOA" (7 gráficos) |
| `src/components/AbaHistoricoPLOA.jsx` | Subaba "Histórico PLOA" (8 painéis) |
| `src/components/AbaEmendasAutografo.jsx` | Subaba "Emendas Autógrafo" |
| `src/components/GraficoBarrasPLOA.jsx` | Barras horizontais com comparação PL × autógrafo |
| `scripts/teste_ploa.mjs` | Teste de aceite em navegador da seção PLOA |
| `public/icons/favicon-32.png` | Favicon |
| `public/icons/icon-180.png` | apple-touch-icon (tela inicial do iOS) |
| `public/icons/icon-maskable-512.png` | Ícone maskable do Android (arte a 80%, safe zone) |
| — | (`icon-192.png` e `icon-512.png` são substituições, não novos) |

### Substituídos (9)
`index.html` · `public/manifest.webmanifest` · `public/sw.js` ·
`public/icons/icon-192.png` · `public/icons/icon-512.png` ·
`scripts/processar_dados.py` · `src/App.jsx` · `src/pptx.js` ·
`src/styles.css` · `src/components/CartaoEmenda.jsx`

## Como publicar (interface web do GitHub)

**Em UM único commit.** Cada push dispara o workflow, e subir tudo de uma vez
significa um build só, sem estado intermediário publicado.

1. Repositório **`emendas-defesa-app`** → **Add file** → **Upload files**.
2. Arraste o **conteúdo** da pasta `analise-ploa-v5` — as pastas
   `.github/`, `public/`, `scripts/`, `src/` e o `index.html`. **Não arraste a
   pasta `analise-ploa-v5` inteira**, senão tudo entra dentro de um diretório
   novo e o build não acha nada. (`PUBLICAR.md` não precisa ir.)
3. O arrasto preserva a estrutura de pastas; confira na lista antes de commitar
   que aparece `src/components/AbaPLOA.jsx`, e não `AbaPLOA.jsx` solto.
4. Escreva a mensagem de commit e confirme. **Commit directly to the `main`
   branch.**
5. Acompanhe em **Actions**. O workflow baixa as duas planilhas, regenera o
   `dados.json` e publica. Leva alguns minutos.

### Se precisar dividir em dois envios
Se o navegador engasgar com o lote, divida assim — a ordem importa:

- **1º envio: tudo, MENOS o `src/App.jsx`.** Nenhum desses arquivos é
  referenciado pelo `App.jsx` antigo, então o app continua compilando e
  funcionando como antes.
- **2º envio: só o `src/App.jsx`.** É ele que liga a seção PLOA — a chave que
  acende a luz depois de a fiação estar toda no lugar.

Na ordem inversa o build **falha** (o `App.jsx` novo importaria arquivos que
ainda não existem). Não é grave — build que falha não publica, e o site no ar
continua na versão anterior —, mas é um susto evitável.

## Depois de publicar

- **Ctrl+Shift+R uma vez** em quem já usava o app pelo navegador.
- Quem tem o app **instalado no celular** pode precisar removê-lo e adicioná-lo
  de novo à tela inicial para o nome e o ícone novos aparecerem: o sistema
  operacional só relê o manifest no momento da instalação.

## Pontos de atenção

- **`deploy.yml` entrou na entrega por um motivo específico.** O passo que
  versiona o cache procurava a string literal `emendas-md-v1`; com o nome novo
  ele deixaria de casar **sem dar erro**, congelando o nome do cache em todo
  deploy. Agora o padrão casa qualquer valor de `VERSAO` e há um `grep` que
  **falha o build** se o formato da linha mudar — o modo de falha passa a ser
  barulhento, em vez de silencioso.
- **A aba 2025 do `PLOA_Despesas_Elaboracao.xlsx` é cópia idêntica da 2024**
  (mesmas 669 linhas, mesmos cinco valores). O app sinaliza isso em tela e não
  a remove. Se a planilha for corrigida na origem, o aviso some sozinho — a
  detecção é por comparação de conteúdo, não por lista fixa.
- **Fase sem valor herda a anterior**: 2022 não tem Autógrafo e 2023 não tem
  Ciclo Plenário. A ausência é detectada por coluna dentro do ano, então um
  zero numa linha isolada continua sendo um zero de verdade.
- **A triagem das planilhas é pelo cabeçalho, não pelo nome do arquivo.**
  Renomear a planilha na origem não quebra o pipeline; uma planilha nova com o
  mesmo formato é absorvida sozinha.
