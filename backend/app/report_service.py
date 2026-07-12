import io
import pandas as pd
from sqlalchemy.orm import Session
from fastapi.responses import StreamingResponse
from fastapi import HTTPException
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import app.models as models

def generar_excel_consolidado(formularios_ids: list[int], db: Session):
    # 1. Buscar los registros de los formularios en la Base de Datos
    formularios = db.query(models.FormularioDB).filter(models.FormularioDB.id.in_(formularios_ids)).all()
    
    if not formularios:
        raise HTTPException(status_code=404, detail="No se encontraron formularios válidos.")

    # 2. Crear un archivo Excel en memoria (BytesIO) para no ocupar almacenamiento en Render
    output = io.BytesIO()
    
    # Inicializar el escritor de pandas con el motor openpyxl
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        
        for form in formularios:
            if not form.sheet_id:
                continue # Saltar si el formulario no tiene link/ID asociado
            
            # Construir la URL de exportación directa a CSV usando el ID de tu BD
            # Si el documento es accesible mediante el enlace, este endpoint responderá con el CSV crudo
            url_csv = f"https://docs.google.com/spreadsheets/d/{form.sheet_id}/export?format=csv"
            
            try:
                # Pandas descarga y parsea el CSV directamente desde internet en una sola línea
                df = pd.read_csv(url_csv)
                
                # Limpiar el nombre del formulario para usarlo como pestaña (máximo 31 caracteres, regla de Excel)
                nombre_pestaña = form.nombre[:30].replace("/", "-").replace("\\", "-")
                
                # Escribir el DataFrame en su respectiva pestaña
                # Empezamos en la fila 4 para dejar espacio a un encabezado estético
                df.to_excel(writer, sheet_name=nombre_pestaña, index=False, startrow=3)
                
                # ---- ESTILIZADO PROFESIONAL CON OPENPYXL ----
                workbook = writer.book
                worksheet = writer.sheets[nombre_pestaña]
                worksheet.views.sheetView[0].showGridLines = True # Asegurar que las cuadrículas se vean
                
                # Estilos de diseño
                azul_marino = "1F497D"
                gris_claro = "F2F5F8"
                
                fuente_titulo = Font(name="Arial", size=14, bold=True, color=azul_marino)
                fuente_headers = Font(name="Arial", size=10, bold=True, color="FFFFFF")
                fuente_datos = Font(name="Arial", size=10)
                
                fill_header = PatternFill(start_color=azul_marino, end_color=azul_marino, fill_type="solid")
                fill_zebra = PatternFill(start_color=gris_claro, end_color=gris_claro, fill_type="solid")
                
                border_fino = Border(
                    left=Side(style='thin', color='D9D9D9'),
                    right=Side(style='thin', color='D9D9D9'),
                    top=Side(style='thin', color='D9D9D9'),
                    bottom=Side(style='thin', color='D9D9D9')
                )
                
                # Añadir Título de la sección en la fila 1
                worksheet["A1"] = f"REPORTE CONSOLIDADO: {form.nombre.upper()}"
                worksheet["A1"].font = fuente_titulo
                worksheet["A2"] = f"ID de origen: {form.sheet_id}"
                worksheet["A2"].font = Font(name="Arial", size=9, italic=True, color="595959")
                
                # Estilizar los encabezados de la tabla (Fila 4 de Excel)
                num_columnas = df.shape[1]
                for col in range(1, num_columnas + 1):
                    cell = worksheet.cell(row=4, column=col)
                    cell.font = fuente_headers
                    cell.fill = fill_header
                    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                worksheet.row_dimensions[4].height = 25
                
                # Estilizar las filas de datos (Zebra striping y bordes)
                num_filas = df.shape[0]
                for row in range(5, num_filas + 5):
                    worksheet.row_dimensions[row].height = 18
                    for col in range(1, num_columnas + 1):
                        cell = worksheet.cell(row=row, column=col)
                        cell.font = fuente_datos
                        cell.border = border_fino
                        if row % 2 == 0:
                            cell.fill = fill_zebra
                
                # Autoajustar el ancho de las columnas según el contenido para evitar que se corte el texto
                for col in worksheet.columns:
                    max_len = max(len(str(cell.value or '')) for cell in col)
                    col_letter = get_column_letter(col[0].column)
                    worksheet.column_dimensions[col_letter].width = max(max_len + 3, 12)
                    
            except Exception as e:
                print(f"⚠️ Error al procesar el Sheet {form.sheet_id}: {e}")
                # Podrías crear una pestaña de error si un documento no es accesible
                continue

    # 3. Preparar el puntero del archivo en memoria para ser transmitido por HTTP
    output.seek(0)
    
    # 4. Retornar una respuesta de tipo Stream para que el navegador inicie la descarga inmediata
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=reporte_formularios_consolidado.xlsx"}
    )