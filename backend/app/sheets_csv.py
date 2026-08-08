import csv, io
from urllib.request import urlopen
import pandas as pd
from sqlalchemy.orm import Session
from fastapi import HTTPException
import app.models as models
from datetime import datetime
import re

# Mapas de sinónimos para detectar géneros sin importar cómo los nombren en Google Forms
MAPA_GENEROS = {
    'hombres': 'Masculino', 'hombre': 'Masculino', 'masculino': 'Masculino', 'varones': 'Masculino', 'varon': 'Masculino',
    'mujeres': 'Femenino', 'mujer': 'Femenino', 'femenino': 'Femenino', 'damas': 'Femenino',
    'no binario': 'No Binario', 'nobinario': 'No Binario', 'otro': 'No Binario', 'otros': 'No Binario'
}

# Columnas que son metadatos personales o de sistema (no son indicadores cuantitativos)
COLS_IGNORAR_IDENTIFICADORES = [
    'marca temporal', 'dirección de correo electrónico', 'email', 'correo', 'usuario',
    'nombre', 'código', 'codigo', 'descripción', 'descripcion'
]

# Posibles nombres de columna para identificar el programa/carrera
COLS_PROGRAMA_CANDIDATAS = ['carrera', 'programa', 'disciplina', 'representación', 'representacion', 'cargo']

# Posibles nombres de columna para identificar el periodo o ciclo
COLS_CICLO_CANDIDATAS = ['calendario', 'periodo', 'ciclo']

def normalizar_texto(texto: str) -> str:
    """Limpia espacios extras y pasa a minúsculas para comparar fácilmente."""
    if not isinstance(texto, str):
        return ""
    return texto.strip().lower()

def extraer_valor_programa(fila: pd.Series, cols_presentes: list) -> str:
    """Busca en orden de prioridad qué columna del formulario representa el programa o área."""
    for col_candidata in COLS_PROGRAMA_CANDIDATAS:
        for col_real in cols_presentes:
            if normalizar_texto(col_real) == col_candidata:
                val = str(fila.get(col_real, '')).strip()
                if val and val.lower() != 'nan':
                    return val
    return "General"

def obtener_ciclo_desde_fecha(fecha_str: str) -> str:
    """Deriva el ciclo académico (ej. 2026 A) a partir de la Marca temporal si no hay columna de ciclo."""
    try:
        # Intenta parsear formatos comunes de fecha de Google Sheets
        fecha_limpia = fecha_str.split()[0]
        # Probar formato DD/MM/YYYY o YYYY-MM-DD
        if "/" in fecha_limpia:
            partes = fecha_limpia.split("/")
            if len(partes[0]) == 4: # YYYY/MM/DD
                anio, mes = int(partes[0]), int(partes[1])
            else: # DD/MM/YYYY
                anio, mes = int(partes[2]), int(partes[1])
        elif "-" in fecha_limpia:
            partes = fecha_limpia.split("-")
            anio, mes = int(partes[0]), int(partes[1])
        else:
            return "Ciclo Actual"
            
        letra = "A" if mes <= 6 else "B"
        return f"{anio} {letra}"
    except Exception:
        return "Ciclo Actual"


def extraer_valor_ciclo(fila: pd.Series, cols_presentes: list, fecha_captura: str) -> str:
    """Busca si el CSV trae columna de ciclo/periodo; si no, lo calcula con la fecha."""
    for col_candidata in COLS_CICLO_CANDIDATAS:
        for col_real in cols_presentes:
            if normalizar_texto(col_real) == col_candidata:
                val = str(fila.get(col_real, '')).strip()
                if val and val.lower() != 'nan':
                    return val
    return obtener_ciclo_desde_fecha(fecha_captura)


def leer_respuestas(sheet_id: str):
    """Devuelve (headers, rows) de la primera pestaña del spreadsheet público."""
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv"
    with urlopen(url, timeout=10) as resp:
        text = resp.read().decode("utf-8")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return [], []
    headers = rows[0]
    body = rows[1:]
    body = [r + [""] * (len(headers) - len(r)) for r in body]
    return headers, body

def obtener_encabezados_formulario(form_id: int, db: Session) -> list[dict]:
    form = db.query(models.FormularioDB).filter(models.FormularioDB.id == form_id).first()
    id_depto = form.id_departamento
    depto = db.query(models.DepartamentoDB).filter(models.DepartamentoDB.id == id_depto).first()
    nombre_depto = depto.nombre
    if not form or not form.sheet_id:
        raise HTTPException(status_code=404, detail="Formulario no encontrado o sin Sheet ID asignado.")
    
    url_csv = f"https://docs.google.com/spreadsheets/d/{form.sheet_id}/export?format=csv"
    try:
        df = pd.read_csv(url_csv)
        df.columns = df.columns.str.strip()
        cols_map = {col: normalizar_texto(col) for col in df.columns}

        cols_genero_encontradas = {}
        for col_original, col_norm in cols_map.items():
            if col_norm in MAPA_GENEROS:
                cols_genero_encontradas[col_original] = MAPA_GENEROS[col_norm]

        registros_normalizados = []
        if cols_genero_encontradas:
        # =========================================================================
        # CASO TIPO 1: FORMULARIO CON DESGLOSE DE GÉNERO
        # =========================================================================
            cols_id = [col for col in df.columns if col not in cols_genero_encontradas]
        
        # Despivote (melt) dinámico usando las columnas de género detectadas
            df_melted = pd.melt(
                df,
                id_vars=cols_id,
                value_vars=list(cols_genero_encontradas.keys()),
                var_name='columna_genero_orig',
                value_name='valor_numerico'
            )
            for _, fila in df_melted.iterrows():
                fecha_str = str(fila.get('Marca temporal', ''))
                genero_std = cols_genero_encontradas[fila['columna_genero_orig']]
                programa = extraer_valor_programa(fila, cols_id)
                ciclo = extraer_valor_ciclo(fila, cols_id, fecha_str)
                indicador = str(fila.get('Tipo', 'Conteo por Género'))

                try:
                    valor = int(pd.to_numeric(fila['valor_numerico'], errors='coerce'))
                    if pd.isna(valor): valor = 0
                except Exception:
                    valor = 0

                registros_normalizados.append({
                    "id_depto": id_depto,
                    "nombre_departamento": nombre_depto,
                    "nombre_ciclo": ciclo,
                    "nombre_programa": programa,
                    "indicador_nombre": indicador,
                    "valor_numerico": valor,
                    "genero": genero_std,
                    "nivel": str(fila.get('Perfil', 'Licenciatura')),
                    "modalidad": "Presencial",
                    "fecha_captura": fecha_str,
                    "status": form.estatus
                })
        else:
            cols_metricas = []
            for col_orig, col_norm in cols_map.items():
                es_identificador = any(ign in col_norm for ign in COLS_IGNORAR_IDENTIFICADORES)
                es_dimension = any(dim in col_norm for dim in COLS_PROGRAMA_CANDIDATAS + COLS_CICLO_CANDIDATAS + ['instancia emisora', 'perfil'])
                if not es_identificador and not es_dimension:
                    cols_metricas.append(col_orig)

            for _, fila in df.iterrows():
                fecha_str = str(fila.get('Marca temporal', ''))
                ciclo = extraer_valor_ciclo(fila, df.columns, fecha_str)
                programa = extraer_valor_programa(fila, df.columns)


                if cols_metricas:
                # Si se detectaron columnas de métricas/trámites (ej. "Número de sesiones", "Expedición de constancias")
                    for col in cols_metricas:
                        raw_val = fila[col]
                        val_num = pd.to_numeric(raw_val, errors='coerce')
                        
                        # Si el valor de la celda es numérico se asigna, si no es número se cuenta como 1 registro
                        valor = int(val_num) if pd.notna(val_num) else 1

                        registros_normalizados.append({
                            "id_depto": id_depto,
                            "nombre_departamento": nombre_depto,
                            "nombre_ciclo": ciclo,
                            "nombre_programa": programa,
                            "indicador_nombre": str(col),
                            "valor_numerico": valor,
                            "genero": "No Aplica",
                            "nivel": str(fila.get('Perfil', 'General')),
                            "modalidad": "General",
                            "fecha_captura": fecha_str
                        })
                else:
                    # Si todo el formulario son datos de registro (cada fila = 1 participación/evento)
                    registros_normalizados.append({
                        "id_depto": id_depto,
                        "nombre_departamento": nombre_depto,
                        "nombre_ciclo": ciclo,
                        "nombre_programa": programa,
                        "indicador_nombre": "Registro de Participación",
                        "valor_numerico": 1,
                        "genero": "No Aplica",
                        "nivel": str(fila.get('Perfil', 'General')),
                        "modalidad": "General",
                        "fecha_captura": fecha_str
                    })

        return registros_normalizados

    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al leer el CSV de Google Sheets: {str(e)}")