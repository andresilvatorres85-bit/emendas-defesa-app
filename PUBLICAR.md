# Entrega v7 — ajustes nas subabas Dashboard PLOA e Histórico PLOA

8 arquivos, todos **atualizações** de arquivos que já existem no repositório —
nenhum arquivo novo, nada em `.github/`, nada na raiz. Sem dependência npm nova:
o `package-lock.json` não muda e o `npm ci` do workflow continua válido.

## O que mudou nesta rodada

**Dashboard PLOA:**
- Cards superiores: o "PL do Executivo" virou o card grande (primeiro), e o
  "Valor final aprovado" (autógrafo) passou para a tira ao lado.

**Histórico PLOA:**
- Cards por ano: o valor em destaque agora é o **PL** (com a variação % sobre o
  PL do ano anterior); o autógrafo desceu para a linha detalhada do card.
- Gráfico principal renomeado de "Autógrafo por exercício" para **"Projeto de
  Lei por exercício"**, somando o PL.
- Matriz "Unidades orçamentárias por exercício": mostra **5 UO** com botão
  "Mostrar +/−".
- Matriz de ações renomeada para **"Ações orçamentárias por exercício"**: mostra
  **15 ações**, expande de 15 em 15, com o código da ação destacado em laranja.

## Como publicar (interface web do GitHub)

Como são só atualizações (sem pastas novas nem arquivos ocultos), dá para subir
tudo num único upload:

1. Repositório **`emendas-defesa-app`** → **Add file** → **Upload files**.
2. Arraste as pastas `src/` e `scripts/` do pacote (ou os 8 arquivos, mantendo a
   estrutura de pastas). O `PUBLICAR.md` não precisa ir.
3. Confira na lista que aparece, por exemplo, `src/components/AbaHistoricoPLOA.jsx`
   com o caminho completo — e não o arquivo solto na raiz.
4. Mensagem de commit + **Commit directly to the `main` branch**.
5. Acompanhe em **Actions**: o workflow baixa as planilhas, regenera o
   `dados.json` e publica. Leva alguns minutos.

Não há arquivos a apagar nesta entrega.

## Depois de publicar

- **Ctrl+Shift+R uma vez** em quem já usava o app pelo navegador.

## Observação sobre a matriz de UO (comportamento esperado, não é bug)

O botão "Mostrar +" da matriz de UO só aparece quando há mais de 5 UO no
recorte. Com o filtro padrão (Órgão = Exército, que tem 4 UO), ele não aparece —
é o correto. Limpando o filtro de Órgão (todas as UO do MD), a matriz mostra 5 e
o botão surge.

## Arquivos do pacote (8, todos substituições)

`src/App.jsx` · `src/ploa.js` · `src/pptx.js` · `src/styles.css` ·
`src/components/AbaPLOA.jsx` · `src/components/AbaHistoricoPLOA.jsx` ·
`src/components/MatrizAnos.jsx` · `scripts/teste_ploa.mjs`
