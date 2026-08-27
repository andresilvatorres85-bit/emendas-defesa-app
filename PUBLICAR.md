# Entrega v8 — paginação do PPTX, percentuais e cores por ano

7 arquivos, todos **atualizações** de arquivos que já existem no repositório —
nenhum arquivo novo, nada em `.github/`, nada na raiz. Sem dependência npm nova:
o `package-lock.json` não muda e o `npm ci` do workflow continua válido.

Verificado: aplicado sobre o estado atual publicado do repositório, o pacote
compila limpo e passa em toda a suíte de testes (`scripts/teste_ploa.mjs`).

## O que mudou nesta rodada

**Exportações PPTX (item 1):**
- Cards com muitas linhas agora **geram vários slides** em vez de amontoar tudo
  num só. Tabelas acima de 16 linhas e gráficos de barras acima de 22 categorias
  se dividem automaticamente, com o sufixo "(k/total)" no título — por exemplo,
  o painel de Ação (65 ações) sai como "Valor por Ação orçamentária (1/7)" …
  "(7/7)". Vale tanto para o baralho inteiro quanto para o slide avulso de um
  gráfico.

**Dashboard PLOA (item 2):**
- Ao lado do valor de cada categoria, entre parênteses, o **percentual sobre o
  total**, nos gráficos: Valor por Grupo de Natureza da Despesa, Valor por
  Unidade Orçamentária, Valor por Ação orçamentária e Total por Força.

**Histórico PLOA (item 3):**
- "Projeto de Lei por exercício": **cada barra de ano com uma cor diferente**.
- "Por Força, ao longo dos exercícios": **rótulo de percentual** da Força no
  total, em cada barra e por ano.

## Como publicar (interface web do GitHub)

Só atualizações, sem pastas novas nem arquivos ocultos — um único upload:

1. Repositório **`emendas-defesa-app`** → **Add file** → **Upload files**.
2. Arraste as pastas `src/` e `scripts/` do pacote (ou os 7 arquivos, mantendo a
   estrutura de pastas). O `PUBLICAR.md` não precisa ir.
3. Confira na lista que aparece, por exemplo, `src/components/AbaPLOA.jsx` com o
   caminho completo — e não o arquivo solto na raiz.
4. Mensagem de commit + **Commit directly to the `main` branch**.
5. Acompanhe em **Actions**: o workflow baixa as planilhas, regenera o
   `dados.json` e publica. Leva alguns minutos.

Não há arquivos a apagar nesta entrega.

## Depois de publicar

- **Ctrl+Shift+R uma vez** em quem já usava o app pelo navegador.

## Arquivos do pacote (7, todos substituições)

`src/pptx.js` · `src/styles.css` ·
`src/components/AbaPLOA.jsx` · `src/components/AbaHistoricoPLOA.jsx` ·
`src/components/GraficoBarrasPLOA.jsx` · `src/components/GraficoColunasAno.jsx` ·
`scripts/teste_ploa.mjs`
