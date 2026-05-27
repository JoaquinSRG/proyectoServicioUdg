from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    nombre: str
    departamento: str # Aquí guardamos el "tag" (it, ventas, rrhh)

class UserCreate(BaseModel):
    nombre: str
    email: EmailStr
    password: str
    id_departamento: int # Solo para cuando creamos al usuario

class UserResponse(BaseModel):
    id: int
    nombre: str
    email: EmailStr
    departamento: str # El nombre del depto para el Front

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class UpdatePassword(BaseModel):
    old_password: str
    new_password: str

class DeptoBase(BaseModel):
    nombre: str
    codigo: str

class DeptoCreate(DeptoBase):
    pass

class DeptoResponse(DeptoBase):
    id: int
    class Config:
        from_attributes = True

class FormBase(BaseModel):
    nombre: str
    link: str
    id_departamento: int

class FormCreate(FormBase):
    pass

class FormResponse(FormBase):
    id: int
    # Añadimos el nombre del depto para que el front lo muestre fácil
    nombre_departamento: str 

    class Config:
        from_attributes = True

class FormUpdate(BaseModel):
    nombre: Optional[str] = None
    link: Optional[str] = None
    id_departamento: Optional[int] = None

class ScheduleCreate(BaseModel):
    id_formulario: int
    fecha_inicio: datetime
    fecha_fin: datetime

class ScheduleResponse(ScheduleCreate):
    id: int
    class Config:
        from_attributes = True

class AuditoriaResponse(BaseModel):
    id: int
    usuario: str
    accion: str
    tabla: str
    registro_id: int
    detalles: Optional[str]
    fecha: datetime

    class Config:
        from_attributes = True