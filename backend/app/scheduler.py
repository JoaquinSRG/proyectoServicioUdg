from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from app.database import SessionLocal  # Importa tu generador de sesiones local
from app import models, email_service

def evaluar_y_notificar_formularios():
    db: Session = SessionLocal()
    ahora = datetime.utcnow()
    
    try:

        todas = db.query(models.FormScheduleDB).all()
        print(f"📊 Total de programaciones encontradas en la BD: {len(todas)}")
        for t in todas:
            print(f"   -> Form ID: {t.id_formulario} | Inicio: {t.fecha_inicio} | Fin: {t.fecha_fin} | Apertura Enviada: {t.aviso_apertura_enviado}")

        # --- CASO A: NOTIFICACIÓN DE APERTURA ---
        # Formularios cuya fecha_inicio ya pasó, pero no se ha mandado el aviso
        programaciones_apertura = db.query(models.FormScheduleDB).filter(
            models.FormScheduleDB.fecha_inicio <= ahora,
            models.FormScheduleDB.fecha_fin > ahora,
            models.FormScheduleDB.aviso_apertura_enviado == False
        ).all()
        print(f"🎯 Programaciones que pasaron el filtro de fecha: {len(programaciones_apertura)}")
        for prog in programaciones_apertura:
            form = prog.formulario
            # Consumir usuarios relacionados al departamento del formulario
            usuarios = db.query(models.UserDB).filter(models.UserDB.id_departamento == form.id_departamento).all()
            print(f"   👥 Usuarios encontrados para el Depto {form.id_departamento}: {len(usuarios)}")
            for usuario in usuarios:
                print(f"   📧 Intentando enviar correo a: {usuario.email}")
                html = f"""<div style="width: 100%; background-color: #f9f9f9; padding: 40px 20px; font-family: Arial, sans-serif;">
<div style="color:#ffff ;max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e0e0e0; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; display: flex; align-items: center; justify-content: center;"> 
<div style="padding: 10px; width: 100%; height: 300px; background: linear-gradient(to right, #2ec4e6, #1e5fa5); display: flex; flex-direction: column; align-items: center; justify-content: center; ">
        <table style="padding: 10px; ">
            <thead ><tr ><h3 style="padding: 20px; border-radius: 12px; width: 100%; color: #ffff; height: 40px; background:#1e5fa5; display: flex; align-items: center; justify-content: center;">¡Hola, {usuario.nombre}!</h3></tr></thead>
            <tbody >
                <tr>
                    <td><p>El formulario <b>{form.nombre}</b> ya está disponible para su llenado.</p></td>
                </tr>
                <tr><td><p><b>Recuerde:</b> el formulario cierra: {prog.fecha_fin}, Esperamos sus respuestas </p></td></tr>
                <tr style="display: flex; align-items: center; justify-content: center;"><td><h2>Gracias</h2></td></tr>
            </tbody>
        </table>
</div>
</div>
</div>
"""
                exito = email_service.enviar_correo(usuario.email, f"Apertura: {form.nombre}", html)
                
                # Registrar en el log de notificaciones
                log = models.NotificationLogDB(
                    id_formulario=form.id,
                    usuario_destino=usuario.email,
                    tipo_notificacion="APERTURA",
                    estado="EXITOSO" if exito else "FALLIDO"
                )
                db.add(log)
            
            # Marcar como enviado para no repetir en el próximo ciclo
            prog.aviso_apertura_enviado = True
            db.commit()
            print("   ✅ Bandera 'aviso_apertura_enviado' cambiada a TRUE en la BD.")
        # --- CASO B: RECORDATORIO DE CIERRE ---
        # Formularios que cierran en menos de 24 horas y no se ha enviado aviso de cierre
        limite_cierre = ahora + timedelta(hours=24)
        programaciones_cierre = db.query(models.FormScheduleDB).filter(
            models.FormScheduleDB.fecha_fin <= limite_cierre,
            models.FormScheduleDB.fecha_fin > ahora,
            models.FormScheduleDB.aviso_cierre_enviado == False
        ).all()

        for prog in programaciones_cierre:
            form = prog.formulario
            usuarios = db.query(models.UserDB).filter(models.UserDB.id_departamento == form.id_departamento).all()
            
            for usuario in usuarios:
                html = f"""<div style="width: 100%; background-color: #f9f9f9; padding: 40px 20px; font-family: Arial, sans-serif;">
<div style="color:#ffff ;max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e0e0e0; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; display: flex; align-items: center; justify-content: center;"> 
<div style="padding: 10px; width: 100%; height: 300px; background: linear-gradient(to right, #2ec4e6, #1e5fa5); display: flex; flex-direction: column; align-items: center; justify-content: center; ">
        <table style="padding: 10px; ">
            <thead ><tr ><h3 style="padding: 20px; border-radius: 12px; width: 100%; color: #ffff; height: 40px; background:#1e5fa5; display: flex; align-items: center; justify-content: center;">{usuario.nombre}, Recordatorio Urgente</h3></tr></thead>
            <tbody >
                <tr>
                    <td><p>El formulario {form.nombre} cerrará pronto: {prog.fecha_fin}. Por favor, complétalo.</p></td>  
                </tr>
                <tr style="display: flex; align-items: center; justify-content: center;"><td><h2>Gracias</h2></td></tr>
            </tbody>
        </table>
</div>
</div>
</div>
"""
                exito = email_service.enviar_correo(usuario.email, f"Recordatorio de Cierre: {form.nombre}", html)
                
                log = models.NotificationLogDB(
                    id_formulario=form.id,
                    usuario_destino=usuario.email,
                    tipo_notificacion="RECORDATORIO_CIERRE",
                    estado="EXITOSO" if exito else "FALLIDO"
                )
                db.add(log)
                
            prog.aviso_cierre_enviado = True
            db.commit()

    except Exception as e:
        print(f"Error en el Scheduler: {e}")
    finally:
        db.close()

# Inicializar el Scheduler para que corra en segundo plano
scheduler = BackgroundScheduler()
# Evalúa la función cada 10 minutos
scheduler.add_job(evaluar_y_notificar_formularios, 'interval', minutes=10)