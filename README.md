# Convite

App para organizar eventos familiares: invitaciones con código QR, confirmación de asistencia por persona y lista de regalos en tiempo real.

Los organizadores usan la app en Android. Los invitados abren su invitación en el navegador desde un QR o un enlace de WhatsApp, sin crear cuenta.

## Qué incluye la fase 1

Organizadores (propietarios y ayudantes):

- Inicio de sesión con correo y contraseña.
- Lista de eventos con el avance de confirmaciones de cada uno.
- Panel del evento con cuenta regresiva y resumen de asistencia por persona, actualizado en tiempo real.
- Creación y edición del evento (solo propietarios).
- Invitaciones con sus personas: búsqueda, filtros por estado, respuesta manual por persona, código QR y envío del enlace por WhatsApp.
- Lista de regalos con las familias que apartaron cada uno (solo propietarios).

Invitados:

- Invitación con portada, fecha, hora, lugar y enlace al mapa.
- Confirmación o rechazo por persona hasta la fecha límite.
- Lista de regalos: apartar regalos únicos, elegir opciones repetibles y liberar los propios.

Cada evento tiene su tema visual (baby shower o bautizo); las pantallas son las mismas.

## Stack

- [Ionic 9](https://ionicframework.com/) con [Angular 22](https://angular.dev/) (componentes standalone, signals, sin Zone.js)
- [Capacitor 8](https://capacitorjs.com/) para Android
- [Supabase](https://supabase.com/): PostgreSQL con Row Level Security, Auth, Realtime y funciones RPC

## Estructura

```text
src/app/core        servicios compartidos: sesión, repositorios, tiempo real, utilidades
src/app/shared      componentes reutilizables
src/app/features    pantallas por módulo
src/theme           temas por tipo de evento
supabase/migrations esquema, políticas RLS y funciones de la base de datos
scripts/reglas      pruebas de reglas de negocio y seguridad contra Supabase
android             proyecto nativo de Android
```

## Seguridad

- RLS activado en todas las tablas.
- El invitado no consulta tablas: solo llama funciones RPC que validan el código de su invitación y nunca exponen otras invitaciones ni teléfonos.
- La app solo usa la clave publishable de Supabase. La clave secreta vive en `.env` y solo la usan las pruebas de reglas.

## Cómo correrlo en local

Requisitos: Node.js 24, npm y la CLI de Ionic (`npm install -g @ionic/cli`).

```bash
npm install
ionic serve
```

La app queda en `http://localhost:8100`.

### Pruebas

```bash
npm test             # pruebas unitarias
npm run test:reglas  # reglas de negocio y seguridad contra Supabase
```

`test:reglas` necesita un archivo `.env` con las variables de `.env.example`. Crea sus propios usuarios y eventos de prueba y los borra al terminar.

### Android

Requisitos: Android Studio (incluye el JDK y el SDK).

```bash
ionic build --prod
npx cap sync android
npx cap open android
```

## Estado

Fase 1 en desarrollo, en preparación para un piloto.

Pendiente para la fase 2: mesas, recordatorios, presupuesto y gastos, tareas, registro de llegadas con QR y modo sin conexión para la vista del invitado. La dirección pública de la vista del invitado se define cuando se elija el hosting.
