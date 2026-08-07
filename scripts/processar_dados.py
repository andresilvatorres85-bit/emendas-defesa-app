#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Pipeline de carga: lê o(s) .xlsx do repositório de dados
(andresilvatorres85-bit/emendas.apresentadas.ploa), filtra o Órgão 52000
(Ministério da Defesa) / setor da Defesa, calcula colunas derivadas e gera o
JSON consumido pelo front-end (public/dados.json).

Uso:
    python3 scripts/processar_dados.py [pasta_com_xlsx]

Se nenhuma pasta for informada, o script baixa os .xlsx direto do GitHub
(listando o conteúdo do repositório via API pública).

Colunas derivadas:
  - ano    : exercício das emendas (ver REGRA 0)
  - cmila  : Comando Militar de Área, deduzido de "Autor (UF)" (ver regra abaixo)
  - inconsistencias : lista de descrições de inconsistência OM x UO (ver regra abaixo)

============================================================================
REGRA 0 — De onde vem o ANO e como os anos são normalizados
============================================================================
O repositório tem dois formatos de arquivo:

  a) arquivo de UM exercício ("PLOA 2026 - EMENDAS APRESENTADAS.xlsx"), com as
     abas "Todos os Setores" e "Setor NN". O ano sai do NOME DO ARQUIVO.
  b) arquivo consolidado ("Historico_emendas_apresentadas.xlsx"), com UMA ABA
     POR ANO ("2026", "2025", …). O ano sai do NOME DA ABA.

PRECEDÊNCIA: quando o mesmo ano aparece nos dois formatos, vence o arquivo do
exercício (a). Ele é o que acompanha a tramitação e é atualizado; a aba do
consolidado é uma fotografia. Em 2026 os dois somam o mesmo valor total
(R$ 4.009.124.231,00) — o consolidado só traz 18 linhas de valor zero a mais.

As planilhas não são idênticas entre si. Estas diferenças são normalizadas:

  - SETOR: em 2023 o setor da Defesa tem "Setor (Cod)" = 08; de 2024 em diante,
    13. O recorte, portanto, é feito pelo NOME do setor ("DEFESA") somado ao
    "Órgão (Cod)" = 52000, e não pelo código do setor.
  - RP: em 2025 a coluna vem por extenso ("PRIMÁRIO DISCRICIONÁRIO") e chamada
    "Identificador Primário"; nos demais anos vem como código ("2") na coluna
    "Identificador Primário (Cod)". O texto é convertido para o código
    (ver RP_POR_EXTENSO); um texto desconhecido é mantido como veio e reportado.
  - NOMES DE COLUNA: "Esfera"/"Esfera (Cod)" e "Autor (Cod)"/"Ação (Cod)"
    trocam de nome entre anos. A leitura usa a lista de sinônimos em ALIAS.

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
SETOR_NOME = "DEFESA"  # recorte por nome: o código mudou de 08 (2023) para 13
ABA_PREFERIDA = "Todos os Setores"  # tem as colunas extras "UF" e "Localidade"
SAIDA = os.path.join(os.path.dirname(__file__), "..", "public", "dados.json")

# Sinônimos de coluna entre os anos (chave = nome canônico usado no código).
ALIAS = {
    "Identificador Primário (Cod)": ["Identificador Primário", "RP", "RP (Cod)"],
    "Esfera (Cod)": ["Esfera"],
    "Autor (Cod)": ["Ação (Cod)"],
}

# "Identificador Primário" por extenso (2025) -> código de RP usado no app.
RP_POR_EXTENSO = {
    "FINANCEIRO": "0",
    "PRIMARIO OBRIGATORIO": "1",
    "PRIMARIO DISCRICIONARIO": "2",
    "PRIMARIO DISCRICIONARIO - PAC": "3",
    "DISCRICIONARIA DECORRENTE DE EMENDAS INDIVIDUAIS DE EXECUCAO OBRIGATORIA": "6",
    "DISCRICIONARIA DECORRENTE DE EMENDAS DE BANCADA IMPOSITIVA": "7",
    "DISCRICIONARIA DECORRENTE DE EMENDA DE RELATOR": "8",
    "DISCRICIONARIA DECORRENTE DE EMENDAS DE COMISSAO": "9",
}

ANO_RE = re.compile(r"(20\d{2})")

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
    "96": "Aplicação Direta decorrente de operação com consórcio público",
    "99": "A Definir",
    "30": "Transferência a Estados e ao DF",
    "31": "Transferência a Estados e ao DF — fundo a fundo",
    "40": "Transferência a Municípios",
    "41": "Transferência a Municípios — fundo a fundo",
    "50": "Transferência a Instituições Privadas sem Fins Lucrativos",
}

UO_FAMILIA = {
    "52131": "MARINHA", "52931": "MARINHA", "52932": "MARINHA", "52133": "MARINHA",
    "52232": "MARINHA",  # CCCPM — só aparece em 2023
    "52121": "EXERCITO", "52221": "EXERCITO", "52921": "EXERCITO",
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
    ("2026", "41440013", "52101"): {
        "status": "confirmada", "gravidade": "alta",
        "descricao": "A UO é 52101 (Ministério da Defesa — Administração Direta), "
                     "mas a justificativa destina o recurso ao 28º Batalhão de Caçadores "
                     "do Exército Brasileiro, em Aracaju/SE.",
        "uoSugerida": "52121 (Comando do Exército)",
    },
    ("2026", "42510019", "52121"): {
        "status": "confirmada", "gravidade": "alta",
        "descricao": "A UO é 52121 (Comando do Exército), mas o objeto da emenda é a "
                     "Escola de Aprendizes-Marinheiros de Santa Catarina, organização "
                     "militar da Marinha do Brasil.",
        "uoSugerida": "52131 (Comando da Marinha) ou 52931 (Fundo Naval)",
    },
    ("2026", "44300001", "52121"): {
        "status": "confirmada", "gravidade": "alta",
        "descricao": "A UO é 52121 (Comando do Exército), mas a justificativa afirma "
                     "expressamente que a emenda \"visa atender a Marinha\" e descreve "
                     "material para o Corpo de Fuzileiros Navais e para um complexo naval.",
        "uoSugerida": "52131 (Comando da Marinha) ou 52931 (Fundo Naval)",
    },
    ("2026", "44460018", "52911"): {
        "status": "confirmada", "gravidade": "media",
        "descricao": "A UO é 52911 (Fundo Aeronáutico), em ação de funcionamento de "
                     "estabelecimentos de ensino profissional militares do MD, mas a "
                     "justificativa não identifica a OM beneficiada — apenas \"beneficiários "
                     "no estado de Minas Gerais\". Verificar se o destino não é o ensino "
                     "profissional marítimo (UO 52932) ou uma OM do Exército.",
        "uoSugerida": "verificar — possivelmente 52932 (Fundo de Ensino Profissional Marítimo)",
    },
    ("2026", "50270003", "52101"): {
        "status": "confirmada", "gravidade": "alta",
        "descricao": "A UO é 52101 (Ministério da Defesa — Administração Direta), mas a "
                     "justificativa informa o CNPJ 00.394.429 (COMANDO DA AERONÁUTICA) "
                     "como executor.",
        "uoSugerida": "52111 (Comando da Aeronáutica)",
    },
    ("2026", "60130005", "52101"): {
        "status": "confirmada", "gravidade": "alta",
        "descricao": "A UO é 52101 (Ministério da Defesa — Administração Direta), mas a "
                     "justificativa informa o CNPJ 00.394.429 (COMANDO DA AERONÁUTICA) "
                     "como executor.",
        "uoSugerida": "52111 (Comando da Aeronáutica)",
    },
    ("2026", "71020010", "52121"): {
        "status": "confirmada", "gravidade": "media",
        "descricao": "A UO é 52121 (Comando do Exército) para implantação/restauração de "
                     "aeródromo em Santa Rosa do Purus/AC. O município é sede de Pelotão "
                     "Especial de Fronteira do Exército, o que torna a UO plausível, mas a "
                     "competência sobre infraestrutura aeroportuária deve ser verificada "
                     "(Comando da Aeronáutica).",
        "uoSugerida": "verificar competência — 52111 (Comando da Aeronáutica)",
    },
    ("2026", "60020002", "52131"): {
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
    ano = str(registro.get("__ano") or "").strip()
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
    # A chave inclui o ano: o número da emenda repete entre exercícios (é o
    # código do autor + sequencial), então sem o ano uma revisão de 2026
    # poderia ser aplicada por engano a uma emenda de outro ano.
    revisao = REVISAO_MANUAL.get((ano, emenda, uo_cod))

    divergentes = {f: e for f, e in citadas.items() if f != familia_uo}
    if familia_uo is None:
        # UO neutra (órgão conjunto): só é indício quando o texto aponta para
        # UMA única Força — aí o recurso deveria estar na UO daquela Força.
        divergentes = citadas if len(citadas) == 1 else {}

    if revisao and revisao["status"] == "descartada":
        if divergentes:
            descartadas.append({"ano": ano, "emenda": emenda, "uoCod": uo_cod,
                                "motivo": revisao["motivo"]})
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


def _resolver_alias(registro):
    """Preenche os nomes canônicos de coluna a partir dos sinônimos do ano."""
    for canonico, sinonimos in ALIAS.items():
        if registro.get(canonico) not in (None, ""):
            continue
        for alt in sinonimos:
            if registro.get(alt) not in (None, ""):
                registro[canonico] = registro[alt]
                break
    return registro


def _normalizar_rp(registro, desconhecidos):
    """RP sempre como código. Em 2025 a planilha traz o texto por extenso."""
    bruto = str(registro.get("Identificador Primário (Cod)") or "").strip()
    if not bruto or re.fullmatch(r"\d+", bruto):
        return
    chave = re.sub(r"\s+", " ", _sem_acento(bruto).upper()).strip()
    cod = RP_POR_EXTENSO.get(chave)
    if cod:
        registro["Identificador Primário (Cod)"] = cod
    else:
        desconhecidos.add(bruto)


def _ler_aba(ws, ano, desconhecidos):
    """Devolve os registros do Órgão 52000 / setor DEFESA de uma aba."""
    linhas = ws.iter_rows(values_only=True)
    cabecalho = [str(c).strip() if c is not None else "" for c in next(linhas)]
    registros = []
    for linha in linhas:
        d = dict(zip(cabecalho, linha))
        # Recorte de escopo. O setor é conferido pelo NOME porque o código
        # mudou de 08 (2023) para 13 (2024 em diante) — ver REGRA 0.
        if str(d.get("Órgão (Cod)") or "").strip() != ORGAO_COD:
            continue
        if _sem_acento(str(d.get("Setor") or "")).strip().upper() != SETOR_NOME:
            continue
        _resolver_alias(d)
        _normalizar_rp(d, desconhecidos)
        d["__ano"] = ano
        registros.append(d)
    return registros


def ler_blocos(caminho_xlsx, desconhecidos):
    """Lê um .xlsx e devolve [(ano, origem, registros)].

    `origem` é "exercicio" (arquivo de um único ano) ou "historico" (arquivo
    consolidado com uma aba por ano) — usado para desempatar anos repetidos.
    """
    wb = openpyxl.load_workbook(caminho_xlsx, read_only=True, data_only=True)
    abas_ano = [n for n in wb.sheetnames if re.fullmatch(r"\s*20\d{2}\s*", str(n))]
    if abas_ano:
        blocos = []
        for nome in abas_ano:
            ano = str(nome).strip()
            registros = _ler_aba(wb[nome], ano, desconhecidos)
            print(f"  aba {ano}: {len(registros)} registros no escopo")
            blocos.append((ano, "historico", registros))
        return blocos

    # Arquivo de um único exercício: o ano vem do nome do arquivo.
    m = ANO_RE.search(os.path.basename(caminho_xlsx))
    if not m:
        print(f"  AVISO: não foi possível identificar o ano de {caminho_xlsx}; arquivo ignorado")
        return []
    ano = m.group(1)
    # Prefere a aba consolidada (tem "UF" e "Localidade"); senão, "Setor 13".
    if ABA_PREFERIDA in wb.sheetnames:
        ws = wb[ABA_PREFERIDA]
    elif "Setor 13" in wb.sheetnames:
        ws = wb["Setor 13"]
    else:
        ws = wb[wb.sheetnames[0]]
    registros = _ler_aba(ws, ano, desconhecidos)
    print(f"  aba utilizada: {ws.title} — ano {ano}, {len(registros)} registros no escopo")
    return [(ano, "exercicio", registros)]


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
        "ano": str(registro.get("__ano") or ""),
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

    # 1) Lê tudo e agrupa por ano. Ver REGRA 0 para a precedência entre o
    #    arquivo do exercício e a aba do consolidado.
    rp_desconhecidos = set()
    por_ano = {}
    for arq in arquivos:
        print(f"Lendo {arq}")
        for ano, origem, brutos in ler_blocos(arq, rp_desconhecidos):
            atual = por_ano.get(ano)
            if atual and atual[0] == "exercicio" and origem == "historico":
                print(f"  ano {ano}: aba do consolidado ignorada "
                      f"(já veio do arquivo do exercício)")
                continue
            if atual and origem == "exercicio" and atual[0] == "historico":
                print(f"  ano {ano}: arquivo do exercício substitui a aba do consolidado")
            elif atual:
                print(f"  ano {ano}: {len(brutos)} registros somados aos {len(atual[1])} já lidos")
                por_ano[ano] = (origem, atual[1] + brutos)
                continue
            por_ano[ano] = (origem, brutos)

    if not por_ano:
        sys.exit("Nenhum registro no escopo (Órgão 52000 / setor DEFESA).")
    if rp_desconhecidos:
        print("\nAVISO: RP por extenso não reconhecido (mantido como veio): "
              + "; ".join(sorted(rp_desconhecidos)))

    # 2) Normaliza ano a ano. A deduplicação é POR ANO: o mesmo número de
    #    emenda existe em exercícios diferentes e são emendas diferentes.
    registros, descartadas = [], []
    for ano in sorted(por_ano):
        vistos = set()
        for r in por_ano[ano][1]:
            chave = tuple(str(r.get(c) or "") for c in COLUNAS if c in r)
            if chave in vistos:
                continue
            vistos.add(chave)
            registros.append(normalizar(r, len(registros), descartadas))

    anos = sorted({r["ano"] for r in registros})
    print("\nPor ano:")
    for ano in anos:
        do_ano = [r for r in registros if r["ano"] == ano]
        print(f"  {ano} ({por_ano[ano][0]}): {len(do_ano)} registros | "
              f"{len(set(r['emenda'] for r in do_ano))} emendas | "
              f"R$ {sum(r['valor'] for r in do_ano):,.2f}")

    n_incons = sum(1 for r in registros if r.get("inconsistencias"))
    n_mod = sum(1 for r in registros
                if any(i["tipo"] == "modalidade" for i in r.get("inconsistencias", [])))
    n_uo = sum(1 for r in registros
               if any(i["tipo"] == "uo_justificativa" for i in r.get("inconsistencias", [])))
    saida = {
        "geradoEm": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "fonte": f"github.com/{REPO_DADOS}",
        "escopo": {"orgaoCod": ORGAO_COD, "orgao": "MINISTÉRIO DA DEFESA", "setor": SETOR_NOME},
        "anos": anos,
        "anoCorrente": anos[-1] if anos else "",
        "origemPorAno": {a: por_ano[a][0] for a in anos},
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
