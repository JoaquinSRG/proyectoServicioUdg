import csv, io
from urllib.request import urlopen


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
