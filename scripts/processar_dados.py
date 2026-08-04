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
REGRA 2 — Inconsistências das emendas (aba "Inconsistências" do app)
============================================================================
São duas regras independentes; um mesmo registro pode acumular as duas.

--- Regra 2.A — Modalidade de Aplicação ---------------------------------
As emendas do Ministério da Defesa são executadas em Aplicação Direta,
portanto "Mod. Aplic. (Cod)" deve ser 90. Qualquer valor diferente de 90
(99 = "a definir", 91 = transferência a outro ente, etc.) é sinalizado como
inconsistência CONFIRMADA — é um dado objetivo, não interpretativo.

--- Regra 2.B — UO x Justificativa --------------------------------------
Cruza o texto de "Emenda (Justificativa)" (mais Ação e Subtítulo) com a UO
da emenda, para detectar emendas possivelmente destinadas a uma unidade
orçamentária que não corresponde à Força da OM descrita no texto.

  1. As UOs do MD são agrupadas em FAMÍLIAS por Força:
       MARINHA     : 52131 (Com. Marinha), 52931 (Fundo Naval),
                     52932 (Fundo Ens. Prof. Marítimo), 52133 (SECIRM)
       EXERCITO    : 52121 (Com. Exército), 52221 (IMBEL)
       AERONAUTICA : 52111 (Com. Aeronáutica), 52911 (Fundo Aeronáutico)
       (neutras)   : 52101 (Adm. Direta), 52902 (Fundo HFA) — órgãos
                     conjuntos do MD; só são sinalizadas quando o texto
                     aponta para UMA Força específica (o recurso deveria
                     então estar na UO daquela Força).

  2. A Força citada no texto é identificada por evidências, em ordem de
     prioridade:
       (i)  radical do CNPJ citado (evidência forte e determinística):
              00.394.502 -> MARINHA | 00.394.452 -> EXERCITO
              00.394.429 -> AERONAUTICA
       (ii) padrões de nome de OM (ex.: "BASE AÉREA", "CAPITANIA",
            "ESCOLA DE APRENDIZES MARINHEIROS", "BATALHÃO DE CAÇADORES").
     Quando há CNPJ no texto, ele PREVALECE sobre os padrões de nome.

  3. Se a Força citada difere da família da UO, o registro é sinalizado.

  4. REVISÃO QUALITATIVA (dicionário REVISAO_MANUAL): a varredura por
     palavras-chave produz falsos positivos conhecidos (p. ex. "batalhão",
     "infantaria" e "artilharia" em unidades de FUZILEIROS NAVAIS, que são
     da Marinha; PROFESP/Soldado Cidadão, conduzidos pelo próprio MD).
     Os casos revisados um a um recebem:
       - "confirmada" + diagnóstico redigido e UO sugerida; ou
       - "descartada" + motivo (não aparecem na aba, mas ficam contados).
     Casos automáticos ainda não revisados entram como "a verificar".

Cada inconsistência é gravada como um objeto estruturado
({tipo, gravidade, rotulo, descricao, evidencia, uoSugerida}), o que permite
à aba "Inconsistências" filtrar, agrupar e explicar cada achado.

ATENÇÃO: a Regra 2.B interpreta texto livre e é a parte mais sensível do
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
# REGRA 2 — Inconsistências (2.A Modalidade de Aplicação | 2.B UO x Justificativa)
# ---------------------------------------------------------------------------
MOD_APLIC_ESPERADA = "90"
MOD_APLIC_NOMES = {
    "90": "Aplicação Direta",
    "91": "Aplicação Direta decorrente de operação entre órgãos",
    "99": "A Definir",
    "31": "Transferência a Estados e ao DF",
    "41": "Transferência a Municípios",
    "50": "Transferência a Instituições Privadas sem Fins Lucrativos",
}

UO_FAMILIA = {
    "52131": "MARINHA", "52931": "MARINHA", "52932": "MARINHA", "52133": "MARINHA",
    "52121": "EXERCITO", "52221": "EXERCITO",
    "52111": "AERONAUTICA", "52911": "AERONAUTICA",
    "52101": None, "52902": None,  # neutras (órgãos conjuntos do MD)
}
FAMILIA_LABEL = {"MARINHA": "Marinha", "EXERCITO": "Exército", "AERONAUTICA": "Aeronáutica"}
FAMILIA_UO_SUGERIDA = {
    "MARINHA": "52131 (Comando da Marinha) ou 52931 (Fundo Naval)",
    "EXERCITO": "52121 (Comando do Exército)",
    "AERONAUTICA": "52111 (Comando da Aeronáutica) ou 52911 (Fundo Aeronáutico)",
}

CNPJ_FORCA = {"00394502": "MARINHA", "00394452": "EXERCITO", "00394429": "AERONAUTICA"}
CNPJ_RE = re.compile(r"(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})\s*/\s*\d{4}\s*-?\s*\d{2}")

# Padrões de nome de OM por Força (texto sem acentos, maiúsculo).
# NOTA: termos genéricos que geram falso positivo entre Forças foram
# deliberadamente EXCLUÍDOS — "batalhão", "infantaria", "artilharia" e
# "companhia" existem tanto no Exército quanto no Corpo de Fuzileiros Navais
# (Marinha); "ala" aparece em textos comuns ("sala", "palavra"); "esquadrão"
# existe na Aeronáutica e na Cavalaria do Exército.
PADROES_OM = {
    "MARINHA": [
        r"MARINHA DO BRASIL", r"\bMARINHA\b", r"CAPITANIA DOS PORTOS",
        r"DELEGACIA FLUVIAL", r"FUZILEIROS NAVAIS", r"HOSPITAL NAVAL",
        r"\bSECIRM\b", r"AMAZONIA AZUL", r"\bSISGAAZ\b",
        r"APRENDIZES[ -]?MARINHEIROS", r"DISTRITO NAVAL", r"BASE NAVAL",
        r"\bNAVAL\b",
    ],
    "EXERCITO": [
        r"EXERCITO BRASILEIRO", r"\bEXERCITO\b", r"BATALHAO DE CACADORES",
        r"\bREGIAO MILITAR", r"COMANDO MILITAR D[AOE]", r"COLEGIO MILITAR",
        r"AGULHAS NEGRAS", r"PELOTAO ESPECIAL DE FRONTEIRA", r"\bSISFRON\b",
    ],
    "AERONAUTICA": [
        r"AERONAUTICA", r"\bFAB\b", r"FORCA AEREA", r"BASE AEREA",
        r"AERODROMO", r"\bCINDACTA\b", r"\bALA \d+\b", r"CADETES DO AR",
    ],
}

# ---------------------------------------------------------------------------
# REVISÃO QUALITATIVA (item 4 da Regra 2.B)
# ---------------------------------------------------------------------------
# Cada alerta automático da Regra 2.B foi lido caso a caso sobre a base do
# PLOA 2026. A chave é (nº da emenda, UO (Cod)) — estável entre cargas, ao
# contrário do nº da linha da planilha.
#   status "confirmada" -> divergência real; usa `descricao` e `uoSugerida`
#   status "descartada" -> falso positivo; não vai para a aba (fica no log)
# `gravidade`: "alta" = divergência clara | "media" = requer verificação
REVISAO_MANUAL = {
    ("41440013", "52101"): {
        "status": "confirmada", "gravidade": "alta",
        "descricao": "A UO é 52101 (Ministério da Defesa — Administração Direta), "
                     "mas a justificativa destina o recurso ao 28º Batalhão de Caçadores "
                     "do Exército Brasileiro, em Aracaju/SE.",
        "uoSugerida": "52121 (Comando do Exército)",
    },
    ("42510019", "52121"): {
        "status": "confirmada", "gravidade": "alta",
        "descricao": "A UO é 52121 (Comando do Exército), mas o objeto da emenda é a "
                     "Escola de Aprendizes-Marinheiros de Santa Catarina, organização "
                     "militar da Marinha do Brasil.",
        "uoSugerida": "52131 (Comando da Marinha) ou 52931 (Fundo Naval)",
    },
    ("44300001", "52121"): {
        "status": "confirmada", "gravidade": "alta",
        "descricao": "A UO é 52121 (Comando do Exército), mas a justificativa afirma "
                     "expressamente que a emenda \"visa atender a Marinha\" e descreve "
                     "material para o Corpo de Fuzileiros Navais e para um complexo naval.",
        "uoSugerida": "52131 (Comando da Marinha) ou 52931 (Fundo Naval)",
    },
    ("44460018", "52911"): {
        "status": "confirmada", "gravidade": "media",
        "descricao": "A UO é 52911 (Fundo Aeronáutico), em ação de funcionamento de "
                     "estabelecimentos de ensino profissional militares do MD, mas a "
                     "justificativa não identifica a OM beneficiada — apenas \"beneficiários "
                     "no estado de Minas Gerais\". Verificar se o destino não é o ensino "
                     "profissional marítimo (UO 52932) ou uma OM do Exército.",
        "uoSugerida": "verificar — possivelmente 52932 (Fundo de Ensino Profissional Marítimo)",
    },
    ("50270003", "52101"): {
        "status": "confirmada", "gravidade": "alta",
        "descricao": "A UO é 52101 (Ministério da Defesa — Administração Direta), mas a "
                     "justificativa informa o CNPJ 00.394.429 (COMANDO DA AERONÁUTICA) "
                     "como executor.",
        "uoSugerida": "52111 (Comando da Aeronáutica)",
    },
    ("60130005", "52101"): {
        "status": "confirmada", "gravidade": "alta",
        "descricao": "A UO é 52101 (Ministério da Defesa — Administração Direta), mas a "
                     "justificativa informa o CNPJ 00.394.429 (COMANDO DA AERONÁUTICA) "
                     "como executor.",
        "uoSugerida": "52111 (Comando da Aeronáutica)",
    },
    ("71020010", "52121"): {
        "status": "confirmada", "gravidade": "media",
        "descricao": "A UO é 52121 (Comando do Exército) para implantação/restauração de "
                     "aeródromo em Santa Rosa do Purus/AC. O município é sede de Pelotão "
                     "Especial de Fronteira do Exército, o que torna a UO plausível, mas a "
                     "competência sobre infraestrutura aeroportuária deve ser verificada "
                     "(Comando da Aeronáutica).",
        "uoSugerida": "verificar competência — 52111 (Comando da Aeronáutica)",
    },
    ("60020002", "52131"): {
        "status": "descartada",
        "motivo": "O Programa Fragatas Classe Tamandaré é conduzido pela Marinha; a "
                  "menção à indústria aeronáutica no texto é contextual.",
    },
}

# Falsos positivos genéricos já eliminados na própria varredura (documentado
# para memória do critério, ver comentário em PADROES_OM):
FALSOS_POSITIVOS_CONHECIDOS = [
    'Termos "batalhão", "infantaria", "artilharia" e "companhia" em unidades de '
    "Fuzileiros Navais (Marinha) — removidos dos padrões do Exército.",
    "PROFESP / Programa Soldado Cidadão — conduzidos pelo próprio Ministério da "
    "Defesa; a citação de uma Força é apenas o local da atividade.",
]


def forcas_citadas(texto_bruto):
    """Identifica as Forças das OMs citadas no texto.

    Retorna dict {familia: evidencia}. CNPJ prevalece: se houver ao menos um
    CNPJ de Força no texto, apenas os CNPJs são considerados (o nome de uma
    OM pode ser ambíguo entre Forças; o radical do CNPJ não é).
    """
    texto = _sem_acento(texto_bruto or "").upper().replace("_X000D_", " ")
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


def detectar_inconsistencias(registro, descartadas):
    """Aplica as Regras 2.A e 2.B a um registro.

    Retorna a lista de inconsistências estruturadas. `descartadas` é uma lista
    acumuladora dos alertas revisados e descartados (só para o log/estatística).
    """
    achados = []
    emenda = str(registro.get("Emenda") or "").strip()
    uo_cod = str(registro.get("UO (Cod)") or "").strip()
    uo_nome = str(registro.get("UO") or "").strip()

    # --- Regra 2.A — Mod. Aplic. deve ser 90 --------------------------------
    mod = str(registro.get("Mod. Aplic. (Cod)") or "").strip()
    if mod and mod != MOD_APLIC_ESPERADA:
        nome_mod = MOD_APLIC_NOMES.get(mod, "modalidade não prevista")
        achados.append({
            "tipo": "modalidade",
            "gravidade": "alta",
            "rotulo": f"Mod. Aplic. {mod}",
            "descricao": (
                f"Modalidade de Aplicação {mod} ({nome_mod}). As emendas do Ministério "
                f"da Defesa são executadas em Aplicação Direta, portanto o código "
                f"esperado é 90."
            ),
            "evidencia": f"Mod. Aplic. (Cod) = {mod}",
            "uoSugerida": "",
        })

    # --- Regra 2.B — UO x Justificativa -------------------------------------
    familia_uo = UO_FAMILIA.get(uo_cod)
    texto = " ".join(str(registro.get(c) or "") for c in
                     ("Ação", "Subtítulo", "Emenda (Justificativa)"))
    citadas = forcas_citadas(texto)
    revisao = REVISAO_MANUAL.get((emenda, uo_cod))

    divergentes = {f: e for f, e in citadas.items() if f != familia_uo}
    if familia_uo is None:
        # UO neutra (órgão conjunto): só é indício quando o texto aponta para
        # UMA única Força — aí o recurso deveria estar na UO daquela Força.
        divergentes = citadas if len(citadas) == 1 else {}

    if revisao and revisao["status"] == "descartada":
        if divergentes:
            descartadas.append({"emenda": emenda, "uoCod": uo_cod, "motivo": revisao["motivo"]})
        divergentes = {}

    if revisao and revisao["status"] == "confirmada":
        # Casos confirmados na revisão qualitativa entram mesmo quando a
        # varredura automática não encontra palavra-chave (a divergência pode
        # estar na ausência de identificação da OM — ver emenda 44460018).
        forca = (sorted(divergentes)[0] if divergentes else None)
        rotulo_forca = FAMILIA_LABEL[forca] if forca else "verificar destino"
        achados.append({
            "tipo": "uo_justificativa",
            "gravidade": revisao["gravidade"],
            "rotulo": f"UO × justificativa — {rotulo_forca}",
            "descricao": revisao["descricao"],
            "evidencia": divergentes.get(forca, "análise do objeto descrito na justificativa"),
            "uoSugerida": revisao["uoSugerida"],
            "forcaUO": FAMILIA_LABEL.get(familia_uo, "Ministério da Defesa"),
            "forcaCitada": rotulo_forca,
            "revisado": True,
        })
    elif divergentes:
        # Alerta automático, ainda sem revisão qualitativa registrada.
        forca, evidencia = sorted(divergentes.items())[0]
        rotulo_forca = FAMILIA_LABEL[forca]
        origem = (f'a UO da emenda é "{uo_cod} — {uo_nome}"'
                  + (f" ({FAMILIA_LABEL[familia_uo]})" if familia_uo else
                     " (órgão conjunto do MD)"))
        achados.append({
            "tipo": "uo_justificativa",
            "gravidade": "media",
            "rotulo": f"UO × justificativa — {rotulo_forca}",
            "descricao": (
                f"O texto da emenda cita organização militar da {rotulo_forca} "
                f"({evidencia}), mas {origem}. Alerta automático ainda não revisado "
                f"manualmente — verificar."
            ),
            "evidencia": evidencia,
            "uoSugerida": FAMILIA_UO_SUGERIDA[forca],
            "forcaUO": FAMILIA_LABEL.get(familia_uo, "Ministério da Defesa"),
            "forcaCitada": rotulo_forca,
            "revisado": False,
        })

    return achados


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


def normalizar(registro, idx, descartadas):
    """Converte um registro bruto no formato compacto consumido pelo app."""
    def s(col):
        v = registro.get(col)
        return "" if v is None else str(v).strip()

    valor = registro.get("Valor Solicitado")
    if isinstance(valor, str):
        valor = float(re.sub(r"[^\d,.-]", "", valor).replace(".", "").replace(",", ".") or 0)
    valor = float(valor or 0)

    cmila, fallback_mg = deduzir_cmila(registro)
    inconsistencias = detectar_inconsistencias(registro, descartadas)
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

    registros, vistos, descartadas = [], set(), []
    for arq in arquivos:
        print(f"Lendo {arq}")
        for r in ler_registros(arq):
            # Deduplicação entre arquivos: chave = todos os campos relevantes
            chave = tuple(str(r.get(c) or "") for c in COLUNAS if c in r)
            if chave in vistos:
                continue
            vistos.add(chave)
            registros.append(normalizar(r, len(registros), descartadas))

    n_incons = sum(1 for r in registros if r.get("inconsistencias"))
    n_mod = sum(1 for r in registros
                if any(i["tipo"] == "modalidade" for i in r.get("inconsistencias", [])))
    n_uo = sum(1 for r in registros
               if any(i["tipo"] == "uo_justificativa" for i in r.get("inconsistencias", [])))
    saida = {
        "geradoEm": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "fonte": f"github.com/{REPO_DADOS}",
        "escopo": {"orgaoCod": ORGAO_COD, "orgao": "MINISTÉRIO DA DEFESA", "setorCod": SETOR_COD},
        "cmilaNomes": CMILA_NOMES,
        "auditoria": {
            "modAplicEsperada": MOD_APLIC_ESPERADA,
            "revisadosDescartados": len(descartadas),
            "falsosPositivosConhecidos": FALSOS_POSITIVOS_CONHECIDOS,
        },
        "registros": registros,
    }
    os.makedirs(os.path.dirname(os.path.abspath(SAIDA)), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, separators=(",", ":"))
    total = sum(r["valor"] for r in registros)
    print(f"\nOK: {len(registros)} registros | {len(set(r['emenda'] for r in registros))} emendas distintas")
    print(f"Valor total: R$ {total:,.2f}")
    print(f"Inconsistências: {n_incons} registro(s) — "
          f"Regra 2.A (Mod. Aplic. ≠ 90): {n_mod} | Regra 2.B (UO × justificativa): {n_uo} | "
          f"alertas revisados e descartados: {len(descartadas)}")
    print(f"JSON gravado em {os.path.abspath(SAIDA)}")


if __name__ == "__main__":
    main()
