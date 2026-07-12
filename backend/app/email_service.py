
import os
import requests
from dotenv import load_dotenv

load_dotenv()

GOOGLE_SCRIPT_URL = os.getenv("GOOGLE_SCRIPT_URL")
GOOGLE_SCRIPT_TOKEN = os.getenv("GOOGLE_SCRIPT_TOKEN")

def enviar_correo(destinatario: str, asunto: str, cuerpo_html: str):
    if not GOOGLE_SCRIPT_URL or not GOOGLE_SCRIPT_TOKEN:
        print("Variable GOOGLE_SCRIPT_URL no configurada. Correo abortado.")
        return False

    url_con_token = f"{GOOGLE_SCRIPT_URL}?token={GOOGLE_SCRIPT_TOKEN}"
    # Estructura del JSON que pide la documentación de Brevo
    payload = {
        "destinatario": destinatario,
        "subject": asunto,  
        "asunto": asunto,
        "cuerpo_html": cuerpo_html
    }

    try:
       
        response = requests.post(url_con_token, json=payload)
        
        resultado = response.json()
        if response.status_code == 200:
            resultado = response.json()
            if resultado.get("status") == "success":
                return True
            else:
                print(f"Google Apps Script reportó un error: {resultado.get('message')}")
                return False
        else:
            print(f"Falló la conexión con Google. Status code: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"Error al conectar con Google Apps Script: {e}")
        return False