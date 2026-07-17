#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pipeline de carga: lê o(s) .xlsx do repositório de dados
(andresilvatorres85-bit/emendas.apresentadas.ploa), filtra o Órgão 52000
(Ministério da Defesa) / Setor 13, calcula colunas derivadas e gera o JSON
consumido pelo front-end (public/dados.json).

Uso:
    python3 scripts/processar_dados.py [pasta_com_xlsx]

Se nenhuma pasta for informada, o script baixa os .xlsx direto do GitHub
(listando o conteúdo do repositório via API pública).

Colunas derivadas:
  - cmila  : Comando Militar de Área, deduzido de "Autor (UF)" (ver regra abaixo)
  - inconsistencias : lista de descrições de inconsistência OM x UO (ver regra abaixo)

============================================================================
REGRA 1 — Comando Militar de Área (C Mil A)
============================================================================
Mapeamento UF -> C Mil A. Caso especial de MINAS GERAIS: os municípios de
Uberlândia e Araguari pertencem ao CMP; o restante do estado ao CML.
Para registros com Autor (UF) = MG, o município é procurado (nesta ordem)
nas colunas "Localidade", "Subtítulo" e "Emenda (Justificativa)".

FALLBACK documentado: se não for possível identificar o município de um
registro de MG, o registro é atribuído ao CML, pois o CML cobre a quase
totalidade do território mineiro (todos os municípios exceto Uberlândia e
Araguari). O registro recebe a flag "cmilaFallback": true para transparência.

Autores sem UF (comissões, Autor (UF) = "NA") recebem "NÃO SE APLICA".

============================================================================
REGRA 2 — Detecção de inconsistência OM x UO
============================================================================
Uma emenda é inconsistente quando:
  (a) a Organização Militar citada em "Emenda (Justificativa)" NÃO pertence
      à UO da emenda;  E
  (b) "Mod. Aplic. (Cod)" != "90".

Como "pertencer à UO" é deduzido (conforme especificação, a partir das
combinações UO x OM válidas já existentes na própria base):

  1. As UOs do MD são agrupadas em FAMÍLIAS por Força:
       MARINHA     : 52131 (Com. Marinha), 52931 (Fundo Naval),
                     52932 (Fundo Ens. Prof. Marítimo), 52133 (SECIRM)
       EXERCITO    : 52121 (Com. Exército), 52221 (IMBEL)
       AERONAUTICA : 52111 (Com. Aeronáutica), 52911 (Fundo Aeronáutico)
       (neutras)   : 52101 (Adm. Direta), 52902 (Fundo HFA) — compatíveis
                     com qualquer OM, pois são órgãos conjuntos do MD.
     A análise das combinações mod. 90 da própria base confirma que a mesma
     OM (mesmo CNPJ) aparece validamente tanto no Comando quanto no Fundo
     da respectiva Força — por isso o "pertencimento" é aferido no nível
     da família, e não da UO isolada.

  2. A Força da OM citada na justificativa é identificada por evidências,
     em ordem de prioridade:
       (i)  radical do CNPJ citado no texto (evidência forte e determinística):
              00.394.502 -> MARINHA | 00.394.452 -> EXERCITO | 00.394.429 -> AERONAUTICA
       (ii) padrões de nome de OM no texto (ex.: "BASE AÉREA", "CAPITANIA",
            "BATALHÃO DE INFANTARIA", "COLÉGIO MILITAR", ...).
     Quando há CNPJ no texto, ele PREVALECE sobre os padrões de nome (o nome
     de uma OM pode ser ambíguo entre Forças; o CNPJ não é).

  3. Se o conjunto de Forças citadas contém alguma Força diferente da
     família da UO (e a UO não é neutra), e Mod. Aplic. != 90, o registro
     é marcado como inconsistente, com descrição do motivo.

ATENÇÃO: esta regra interpreta texto livre e é a parte mais sensível do
pipeline. Toda alteração deve ser validada contra a base real.
============================================================================
"""
import json
import os
import re
import shutil
import sys
import time
import unicodedata
import urllib.error
import urllib.request

import openpyxl

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
REPO_DADOS = "andresilvatorres85-bit/emendas.apresentadas.ploa"
ORGAO_COD = "52000"
SETOR_COD = "13"
ABA_PREFERIDA = "Todos os Setores"  # tem as colunas extras "UF" e "Localidade"
SAIDA = os.path.join(os.path.dirname(__file__), "..", "public", "dados.json")

COLUNAS = [
    "Setor (Cod)", "Setor", "Emenda", "Emenda (Modalidade)", "Emenda (Tipo)",
    "Autor (Cod)", "Autor", "Autor (Tipo)", "Autor (UF)", "Partido",
    "Órgão (Cod)", "Órgão", "UO (Cod)", "UO", "Funcional", "Função",
    "Subfunção", "Programa", "Ação", "Subtítulo", "UF", "Localidade",
    "Esfera (Cod)", "GND (Cod)", "Mod. Aplic. (Cod)", "ID Uso (Cod)",
    "Identificador Primário (Cod)", "Fonte (Cod)", "Valor Solicitado",
    "Emenda (Justificativa)",
]

# ---------------------------------------------------------------------------
# REGRA 1 — C Mil A
# ---------------------------------------------------------------------------
UF_CMILA = {
    # CMA — Comando Militar da Amazônia
    "AC": "CMA", "AM": "CMA", "RO": "CMA", "RR": "CMA",
    # CMAO — Comando Militar da Amazônia Oriental
    "AP": "CMAO", "MA": "CMAO", "PA": "CMAO",
    # CMNE — Comando Militar do Nordeste
    "AL": "CMNE", "BA": "CMNE", "CE": "CMNE", "PB": "CMNE",
    "PE": "CMNE", "PI": "CMNE", "RN": "CMNE", "SE": "CMNE",
    # CMO — Comando Militar do Oeste
    "MT": "CMO", "MS": "CMO",
    # CMP — Comando Militar do Planalto (+ Uberlândia/Araguari-MG)
    "DF": "CMP", "GO": "CMP", "TO": "CMP",
    # CML — Comando Militar do Leste (+ MG exceto Uberlândia/Araguari)
    "ES": "CML", "RJ": "CML",
    # CMSE — Comando Militar do Sudeste
    "SP": "CMSE",
    # CMS — Comando Militar do Sul
    "PR": "CMS", "RS": "CMS", "SC": "CMS",
}
CMILA_NOMES = {
    "CMA": "Comando Militar da Amazônia",
    "CMAO": "Comando Militar da Amazônia Oriental",
    "CMNE": "Comando Militar do Nordeste",
    "CMO": "Comando Militar do Oeste",
    "CMP": "Comando Militar do Planalto",
    "CML": "Comando Militar do Leste",
    "CMSE": "Comando Militar do Sudeste",
    "CMS": "Comando Militar do Sul",
    "NÃO SE APLICA": "Sem UF de autor (comissões)",
}


def _sem_acento(txt):
    return unicodedata.normalize("NFKD", txt or "").encode("ascii", "ignore").decode()


def deduzir_cmila(registro):
    """Retorna (sigla_cmila, usou_fallback_mg)."""
    uf = (registro.get("Autor (UF)") or "").strip().upper()
    if uf == "MG":
        # Procura o município nas colunas Localidade, Subtítulo e Justificativa.
        texto = " | ".join(
            _sem_acento(str(registro.get(c) or "")).upper()
            for c in ("Localidade", "Subtítulo", "Emenda (Justificativa)")
        )
        if re.search(r"UBERLANDIA|ARAGUARI", texto):
            return "CMP", False
        # Município de MG identificado explicitamente e não é Uberlândia/Araguari?
        # Ex.: Localidade = 'SETE LAGOAS' (município) ou 'MINAS GERAIS' (estado).
        loc = _sem_acento(str(registro.get("Localidade") or "")).upper()
        municipio_identificado = loc not in ("", "MINAS GERAIS", "NACIONAL", "NA")
        # FALLBACK: sem município identificável -> CML (cobre MG exceto
        # Uberlândia e Araguari). Flag de fallback para transparência.
        return "CML", (not municipio_identificado)
    if uf in UF_CMILA:
        return UF_CMILA[uf], False
    return "NÃO SE APLICA", False


# ---------------------------------------------------------------------------
# REGRA 2 — Inconsistência OM x UO
# ---------------------------------------------------------------------------
UO_FAMILIA = {
    "52131": "MARINHA", "52931": "MARINHA", "52932": "MARINHA", "52133": "MARINHA",
    "52121": "EXERCITO", "52221": "EXERCITO",
    "52111": "AERONAUTICA", "52911": "AERONAUTICA",
    "52101": None, "52902": None,  # neutras (órgãos conjuntos do MD)
}
FAMILIA_LABEL = {"MARINHA": "Marinha", "EXERCITO": "Exército", "AERONAUTICA": "Aeronáutica"}

CNPJ_FORCA = {"00394502": "MARINHA", "00394452": "EXERCITO", "00394429": "AERONAUTICA"}
CNPJ_RE = re.compile(r"(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})\s*/\s*\d{4}\s*-?\s*\d{2}")

# Padrões de nome de OM por Força (aplicados sobre texto sem acentos, maiúsculo)
PADROES_OM = {
    "MARINHA": [
        r"MARINHA DO BRASIL", r"\bMARINHA\b", r"CAPITANIA", r"DELEGACIA FLUVIAL",
        r"FUZILEIROS NAVAIS", r"HOSPITAL NAVAL", r"\bSECIRM\b", r"AMAZONIA AZUL",
        r"\bSISGAAZ\b", r"ESCOLA DE APRENDIZES", r"COMANDO DO \dO? DISTRITO NAVAL",
        r"DISTRITO NAVAL", r"BASE NAVAL", r"ESQUADRAO NAVAL",
    ],
    "EXERCITO": [
        r"EXERCITO BRASILEIRO", r"\bEXERCITO\b",
        r"BATALHAO DE INFANTARIA(?! DE FUZILEIROS)",
        r"GRUPO DE ARTILHARIA", r"COLEGIO MILITAR\b", r"\bREGIAO MILITAR",
        r"COMANDO MILITAR D[AOE]", r"BATALHAO DE ENGENHARIA",
        r"BATALHAO LOGISTICO", r"REGIMENTO DE CAVALARIA", r"HOSPITAL MILITAR",
        r"\bBI\s?MEC\b", r"\bBIL\s?MTH\b",
    ],
    "AERONAUTICA": [
        r"AERONAUTICA", r"\bFAB\b", r"FORCA AEREA", r"BASE AEREA",
        r"CADETES DO AR", r"\bALA \d+\b", r"DESTACAMENTO DE CONTROLE DO ESPACO AEREO",
    ],
}


def forcas_citadas(justificativa):
    """Identifica as Forças das OMs citadas no texto.

    Retorna dict {familia: evidencia}. CNPJ prevalece: se houver ao menos um
    CNPJ de Força no texto, apenas os CNPJs são considerados (o nome de uma
    OM pode ser ambíguo entre Forças; o radical do CNPJ não é).
    """
    texto = _sem_acento(justificativa or "").upper().replace("_X000D_", " ")
    por_cnpj = {}
    for m in CNPJ_RE.finditer(texto):
        radical = "".join(m.groups())
        if radical in CNPJ_FORCA:
            por_cnpj.setdefault(CNPJ_FORCA[radical], f"CNPJ {m.group(0).strip()}")
    if por_cnpj:
        return por_cnpj
    por_nome = {}
    for familia, padroes in PADROES_OM.items():
        for padrao in padroes:
            m = re.search(padrao, texto)
            if m:
                por_nome.setdefault(familia, f'menção a "{m.group(0).strip()}"')
                break
    return por_nome


def detectar_inconsistencias(registro):
    """Aplica a REGRA 2. Retorna lista de descrições (vazia = consistente)."""
    mod = str(registro.get("Mod. Aplic. (Cod)") or "").strip()
    if mod == "90":
        return []  # condição (b): mod. 90 nunca é inconsistente
    familia_uo = UO_FAMILIA.get(str(registro.get("UO (Cod)") or "").strip())
    if familia_uo is None:
        return []  # UO neutra (órgão conjunto) é compatível com qualquer OM
    problemas = []
    for familia, evidencia in forcas_citadas(registro.get("Emenda (Justificativa)")).items():
        if familia != familia_uo:
            problemas.append(
                f"A justificativa cita OM da {FAMILIA_LABEL[familia]} ({evidencia}), "
                f"mas a UO da emenda é \"{registro.get('UO')}\" "
                f"({FAMILIA_LABEL[familia_uo]}), com Mod. Aplic. = {mod} (≠ 90)."
            )
    return problemas


# ---------------------------------------------------------------------------
# Leitura dos .xlsx
# ---------------------------------------------------------------------------
# Token do GitHub (fornecido automaticamente pelo Actions como GITHUB_TOKEN).
# Autenticar eleva o limite de requisições da API de 60/h (anônimo, por IP —
# facilmente estourado nos runners compartilhados) para 5.000/h.
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or ""


def _abrir(url, tentativas=4):
    """urlopen com User-Agent, token (quando houver) e retry com backoff em
    caso de 403 (rate limit) ou erros transitórios."""
    req = urllib.request.Request(url, headers={"User-Agent": "emendas-defesa-app-build"})
    host = url.split("/")[2] if "//" in url else ""
    if GITHUB_TOKEN and host.endswith(("github.com", "githubusercontent.com")):
        req.add_header("Authorization", f"Bearer {GITHUB_TOKEN}")
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
    ultimo_erro = None
    for i in range(tentativas):
        try:
            return urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            ultimo_erro = e
            # 403/429 = rate limit/abuso; 5xx = transitório. Aguarda e tenta de novo.
            if e.code in (403, 429) or 500 <= e.code < 600:
                espera = 2 ** i * 5
                print(f"  {e.code} em {url} — nova tentativa em {espera}s ({i+1}/{tentativas})")
                time.sleep(espera)
                continue
            raise
    raise ultimo_erro


def listar_xlsx_github():
    url = f"https://api.github.com/repos/{REPO_DADOS}/contents/"
    with _abrir(url) as r:
        itens = json.load(r)
    return [i["download_url"] for i in itens if i["name"].lower().endswith(".xlsx")]


def baixar(url, destino):
    print(f"Baixando {url}")
    with _abrir(url) as r, open(destino, "wb") as f:
        shutil.copyfileobj(r, f)
    return destino


def ler_registros(caminho_xlsx):
    """Lê um .xlsx e devolve os registros do Órgão 52000 / Setor 13."""
    wb = openpyxl.load_workbook(caminho_xlsx, read_only=True, data_only=True)
    # Prefere a aba consolidada (tem "UF" e "Localidade"); senão, "Setor 13".
    if ABA_PREFERIDA in wb.sheetnames:
        ws = wb[ABA_PREFERIDA]
    elif "Setor 13" in wb.sheetnames:
        ws = wb["Setor 13"]
    else:
        ws = wb[wb.sheetnames[0]]
    print(f"  aba utilizada: {ws.title}")
    linhas = ws.iter_rows(values_only=True)
    cabecalho = [str(c).strip() if c is not None else "" for c in next(linhas)]
    registros = []
    for linha in linhas:
        d = dict(zip(cabecalho, linha))
        # Filtro de escopo + descarte de linhas vazias/parciais
        if str(d.get("Órgão (Cod)") or "").strip() != ORGAO_COD:
            continue
        if str(d.get("Setor (Cod)") or "").strip() != SETOR_COD:
            continue
        registros.append(d)
    return registros


def normalizar(registro, idx):
    """Converte um registro bruto no formato compacto consumido pelo app."""
    def s(col):
        v = registro.get(col)
        return "" if v is None else str(v).strip()

    valor = registro.get("Valor Solicitado")
    if isinstance(valor, str):
        valor = float(re.sub(r"[^\d,.-]", "", valor).replace(".", "").replace(",", ".") or 0)
    valor = float(valor or 0)

    cmila, fallback_mg = deduzir_cmila(registro)
    inconsistencias = detectar_inconsistencias(registro)
    justificativa = s("Emenda (Justificativa)").replace("_x000D_", "\n").strip()

    out = {
        "id": idx,
        "emenda": s("Emenda"),
        "modalidade": s("Emenda (Modalidade)"),
        "tipo": s("Emenda (Tipo)"),
        "autor": s("Autor"),
        "autorTipo": s("Autor (Tipo)"),
        "autorUF": s("Autor (UF)"),
        "partido": s("Partido"),
        "uoCod": s("UO (Cod)"),
        "uo": s("UO"),
        "funcional": s("Funcional"),
        "acao": s("Ação"),
        "subtitulo": s("Subtítulo"),
        "localidade": s("Localidade") or s("Subtítulo"),
        "gnd": s("GND (Cod)"),
        "modAplic": s("Mod. Aplic. (Cod)"),
        "rp": s("Identificador Primário (Cod)"),
        "valor": valor,
        "justificativa": justificativa,
        "cmila": cmila,
    }
    if fallback_mg:
        out["cmilaFallback"] = True
    if inconsistencias:
        out["inconsistencias"] = inconsistencias
    return out


def main():
    if len(sys.argv) > 1:
        pasta = sys.argv[1]
        arquivos = [
            os.path.join(pasta, f) for f in sorted(os.listdir(pasta))
            if f.lower().endswith(".xlsx") and not f.startswith("~$")
        ]
    else:
        os.makedirs("/tmp/xlsx_dados", exist_ok=True)
        arquivos = [
            baixar(u, os.path.join("/tmp/xlsx_dados", os.path.basename(u)))
            for u in listar_xlsx_github()
        ]
    if not arquivos:
        sys.exit("Nenhum arquivo .xlsx encontrado.")

    registros, vistos = [], set()
    for arq in arquivos:
        print(f"Lendo {arq}")
        for r in ler_registros(arq):
            # Deduplicação entre arquivos: chave = todos os campos relevantes
            chave = tuple(str(r.get(c) or "") for c in COLUNAS if c in r)
            if chave in vistos:
                continue
            vistos.add(chave)
            registros.append(normalizar(r, len(registros)))

    n_incons = sum(1 for r in registros if r.get("inconsistencias"))
    saida = {
        "geradoEm": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "fonte": f"github.com/{REPO_DADOS}",
        "escopo": {"orgaoCod": ORGAO_COD, "orgao": "MINISTÉRIO DA DEFESA", "setorCod": SETOR_COD},
        "cmilaNomes": CMILA_NOMES,
        "registros": registros,
    }
    os.makedirs(os.path.dirname(os.path.abspath(SAIDA)), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, separators=(",", ":"))
    total = sum(r["valor"] for r in registros)
    print(f"\nOK: {len(registros)} registros | {len(set(r['emenda'] for r in registros))} emendas distintas")
    print(f"Valor total: R$ {total:,.2f} | Inconsistências: {n_incons}")
    print(f"JSON gravado em {os.path.abspath(SAIDA)}")


if __name__ == "__main__":
    main()
