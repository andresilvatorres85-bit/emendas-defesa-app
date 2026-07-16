# Instruções de deploy — GitHub Pages

O app é 100% estático e foi preparado para publicação gratuita no GitHub Pages,
com atualização automática dos dados via GitHub Actions. Siga os passos abaixo
na sua conta do GitHub (a mesma do repositório de dados,
`andresilvatorres85-bit`).

## 1. Criar o repositório do app

1. Acesse <https://github.com/new>.
2. Nome sugerido: `emendas-defesa-app` (qualquer nome funciona).
3. Visibilidade: **Public** (Pages gratuito exige repositório público).
4. Crie o repositório **vazio** (sem README).

## 2. Enviar o código

Descompacte o arquivo `emendas-defesa-app.zip` e, dentro da pasta, execute:

```bash
git init
git add .
git commit -m "App de análise de emendas ao PLOA - Ministério da Defesa"
git branch -M main
git remote add origin https://github.com/andresilvatorres85-bit/emendas-defesa-app.git
git push -u origin main
```

(Se preferir não usar linha de comando: crie o repositório e use
"uploading an existing file" para arrastar todo o conteúdo da pasta —
inclusive as pastas ocultas `.github` e os arquivos na raiz.)

## 3. Ativar o GitHub Pages via Actions

1. No repositório, abra **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Abra a aba **Actions** e autorize a execução de workflows, se solicitado.
4. O workflow `Build e deploy no GitHub Pages` roda automaticamente no push.
   Ao terminar, o app estará em:
   `https://andresilvatorres85-bit.github.io/emendas-defesa-app/`

## 4. Como os dados são atualizados

O workflow (`.github/workflows/deploy.yml`):

1. Baixa todos os `.xlsx` do repositório
   `andresilvatorres85-bit/emendas.apresentadas.ploa` (via API pública);
2. Executa `scripts/processar_dados.py` (filtra Órgão 52000/Setor 13, calcula
   C Mil A e as inconsistências, gera `public/dados.json`);
3. Faz o build do front-end e publica no Pages.

Ele roda: a cada push neste repositório, **diariamente às 06:00 (Brasília)**
e manualmente (aba **Actions → Build e deploy no GitHub Pages → Run
workflow**). Ou seja: ao adicionar um novo `.xlsx` no repositório de dados,
basta esperar a execução diária ou disparar o workflow manualmente.

## 5. (Opcional) Atualização imediata a cada push no repositório de dados

Para o app se republicar no instante em que o repositório de dados recebe um
push:

1. Crie um token: <https://github.com/settings/personal-access-tokens/new>
   — escopo apenas no repositório `emendas-defesa-app`, permissão
   **Contents: Read and write**.
2. No repositório **de dados** (`emendas.apresentadas.ploa`), em
   **Settings → Secrets and variables → Actions**, crie o secret
   `TOKEN_DISPARO` com o token.
3. Ainda no repositório de dados, crie o arquivo
   `.github/workflows/notificar-app.yml`:

```yaml
name: Notificar app de análise
on:
  push:
    branches: [main]
jobs:
  disparar:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.TOKEN_DISPARO }}" \
            -H "Accept: application/vnd.github+json" \
            https://api.github.com/repos/andresilvatorres85-bit/emendas-defesa-app/dispatches \
            -d '{"event_type":"dados-atualizados"}'
```

## 6. Instalação como PWA

Com o site publicado (HTTPS do GitHub Pages), o navegador oferece a
instalação: no Chrome desktop, ícone "Instalar" na barra de endereço; no
Android, "Adicionar à tela inicial"; no iOS/Safari, **Compartilhar →
Adicionar à Tela de Início**. O app funciona offline com os últimos dados
carregados (service worker: rede primeiro para dados, cache para o shell).

## 7. Desenvolvimento local (opcional)

```bash
npm install
python3 -m pip install openpyxl
npm run dados      # gera public/dados.json a partir do repositório de dados
npm run dev        # servidor local em http://localhost:5173
npm run build      # build de produção em dist/
node scripts/teste_e2e.mjs   # testes (exige `npx serve -l 4173 dist` ativo)
```
