# Emendas ao PLOA — Ministério da Defesa

PWA de análise das emendas parlamentares apresentadas ao PLOA, restrito ao
Órgão 52000 (Ministério da Defesa), Setor 13, todas as Unidades Orçamentárias.

Dados: [andresilvatorres85-bit/emendas.apresentadas.ploa](https://github.com/andresilvatorres85-bit/emendas.apresentadas.ploa)
(arquivos `.xlsx` convertidos para JSON em build/CI — app 100% estático,
hospedável no GitHub Pages). Deploy: ver **INSTRUCOES_DEPLOY.md**.

## Estrutura

| Caminho | Função |
|---|---|
| `scripts/processar_dados.py` | Carga: lê os `.xlsx`, filtra 52000/13, calcula **C Mil A** e **inconsistências**, gera `public/dados.json`. As duas regras estão documentadas no cabeçalho do arquivo. |
| `src/App.jsx` | 3 abas (Dashboard, Emendas, Inconsistências) + 10 filtros de múltipla seleção reativos. |
| `src/useUrlState.js` | Aba, filtros e cartão aberto refletidos na URL (voltar do navegador + links compartilháveis). Estado 100% client-side: isolamento entre abas/usuários. |
| `src/components/GraficoPizza.jsx` | Gráfico de pizza (SVG puro) por RP, valores em milhões, rótulos com percentual. |
| `public/sw.js`, `public/manifest.webmanifest` | PWA: instalável e funcional offline. |
| `.github/workflows/deploy.yml` | Reprocessa os `.xlsx` e publica no GitHub Pages (push, diário e sob demanda). |
| `scripts/teste_e2e.mjs` | Testes de ponta a ponta (Playwright) dos critérios de aceite. |

## Regras de negócio principais

**C Mil A** — deduzido de "Autor (UF)". Minas Gerais é dividido: Uberlândia e
Araguari → CMP; demais municípios → CML. O município é procurado em
Localidade, Subtítulo e Justificativa; sem identificação, aplica-se o
fallback CML (flag `cmilaFallback` no JSON). Autores sem UF (comissões) →
"NÃO SE APLICA".

**Inconsistência** — emenda cuja justificativa cita Organização Militar que
não pertence à UO da emenda **e** com Mod. Aplic. ≠ 90. O pertencimento é
aferido pela família da Força da UO (Comando + fundos correspondentes),
conforme as combinações UO × OM válidas observadas na própria base; a OM
citada é identificada pelo radical do CNPJ (prioritário) e por padrões de
nome. Detalhes em `scripts/processar_dados.py`.
