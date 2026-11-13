# Convite

App para organizar eventos familiares. La primera versión se hizo para un baby shower real y quedó lista para otros eventos: las funciones son las mismas y cada evento cambia solo de colores, portada e ilustraciones.

Hay dos formas de usarla:

- Los organizadores usan la app Android.
- Los invitados abren su invitación en el navegador desde un QR o un enlace de WhatsApp, sin instalar nada ni crear cuenta.

## Funciones

### App Android (organizadores)

Hay dos roles. Los propietarios tienen acceso total. Los ayudantes ven el evento, gestionan invitaciones, registran llegadas y suben fotos, pero no ven montos de dinero.

- Inicio de sesión con correo y contraseña.
- Panel del evento con cuenta regresiva, resumen de asistencia por persona y accesos a cada módulo. Se actualiza solo cuando un invitado responde.
- Invitaciones individuales o de grupo, con búsqueda, filtros por estado y respuesta manual por persona.
- Envío por WhatsApp de una en una o en serie, con el estado de cada envío.
- Código QR de cada invitación.
- Registro de respuestas: quién cambió su respuesta y cuándo.
- Lista de regalos (solo propietarios): regalos únicos, repetibles con tope, regalo libre, sugerencias y lluvia de sobres.
- Registro de llegadas en la entrada leyendo el QR del invitado. Funciona sin conexión: las llegadas quedan en una cola local y se envían cuando vuelve la señal.
- Presupuesto y gastos (solo propietarios): categorías, gastos con abonos y estado calculado (pendiente, abonado o pagado).
- Tareas con responsable y fecha límite. Los ayudantes las ven y las marcan como hechas.
- Galería compartida del evento: tomar una foto con la cámara o elegirla de la galería del celular, verlas en cuadrícula y abrirlas a pantalla completa.

### Vista web (invitados)

- Invitación con portada, fecha, hora, lugar y enlace al mapa.
- Confirmación o rechazo por persona hasta la fecha límite.
- Lista de regalos para elegir y liberar el propio. Quien elige no queda a la vista de los demás invitados.

## Hardware y permisos

La app usa la cámara del celular de dos formas:

- Galería de fotos con `@capacitor/camera`.
- Lector de QR de llegadas con `@capacitor/barcode-scanner`.

El permiso `CAMERA` está declarado en `android/app/src/main/AndroidManifest.xml`, pero eso no basta: Android exige que el usuario lo acepte mientras usa la app. Por eso, antes de abrir la cámara, la app consulta el permiso (`checkPermissions`) y, si falta, lo pide (`requestPermissions`). Si el usuario lo niega, la app no se cierra y explica qué permiso falta. Si lo niega dos veces, Android deja de preguntar; la app lo detecta y ofrece un botón que abre los ajustes de Convite. Ese botón es un plugin nativo propio, escrito en Java, porque ningún plugin oficial lo trae.

Para elegir fotos se usa el selector de fotos del sistema, que solo le entrega a la app las fotos que el usuario escoge. Por eso no se pide ningún permiso de almacenamiento.

Las fotos se comprimen en el celular antes de subirlas (una foto de varios MB queda en unos cientos de KB) y se guardan en un bucket privado de Supabase Storage.

## Datos

- El backend es Supabase: PostgreSQL con Row Level Security, autenticación, Realtime y funciones RPC. La app lo consume por su API REST de forma asíncrona.
- Todas las pantallas que cargan datos muestran estados de carga, error y "Reintentar". Las operaciones que se repiten por una falla de red no duplican datos.
- Persistencia local con `@capacitor/preferences`: la cola de llegadas y la última lista descargada sobreviven a cerrar la app o reiniciar el celular.

## Stack

- [Ionic 9](https://ionicframework.com/) con [Angular 22](https://angular.dev/): componentes standalone, signals y sin Zone.js.
- [Capacitor 8](https://capacitorjs.com/) para Android, con plugins oficiales como cámara, lector de códigos, red, preferencias, archivos, teclado, compartir, háptica y barra de estado.
- [Supabase](https://supabase.com/) en el plan gratuito.
- Cloudflare Pages para la vista web de los invitados.

## Estructura

```text
src/app/core        servicios compartidos: sesión, repositorios, permisos, fotos, llegadas, tiempo real
src/app/shared      componentes reutilizables
src/app/features    pantallas por módulo (eventos, invitaciones, regalos, llegadas, galería, presupuesto, tareas...)
src/theme           temas por tipo de evento
supabase/migrations esquema, políticas RLS y funciones de la base de datos
functions           funciones de Cloudflare Pages para la vista web
scripts/reglas      pruebas de reglas de negocio y seguridad contra Supabase
android             proyecto nativo de Android
```

Las pantallas no hablan directamente con Supabase ni con los plugins: lo hacen a través de servicios inyectados con `inject()`, y cada respuesta tiene su interfaz de TypeScript.

## Seguridad

- RLS activado en todas las tablas. Las reglas importantes viven en la base de datos, no solo en la interfaz: por ejemplo, un ayudante no puede borrar la foto de otra persona aunque llame a la API directamente.
- El invitado no consulta tablas. Solo llama funciones RPC que validan el código de su invitación.
- La app solo lleva la clave publishable de Supabase. La clave secreta vive en `.env`, fuera del repositorio, y solo la usan las pruebas de reglas.

## Instalar el APK en el celular

1. Descarga `app-debug.apk` desde el enlace de Google Drive de la entrega. Gmail bloquea los archivos `.apk`, por eso va en Drive.
2. Ábrelo desde el celular. Android pregunta si permites instalar apps de esa fuente (el navegador o la app de archivos); acepta solo para esa instalación.
3. Toca "Instalar" y luego "Abrir".
4. Inicia sesión con la cuenta que te compartieron. La app no tiene registro abierto: las cuentas se crean desde Supabase.
5. La primera vez que uses la cámara, Android pregunta por el permiso. Si lo niegas, la app te dice cómo activarlo después.

Funciona en Android 8 o superior.

## Cómo correrlo en local

Requisitos: Node.js 24, npm y la CLI de Ionic (`npm install -g @ionic/cli`).

```bash
npm install
ionic serve
```

La app queda en `http://localhost:8100`. En el navegador la cámara y el lector de QR no están disponibles; esas partes se prueban en el celular.

### Pruebas

```bash
npm test                # pruebas unitarias
npm run test:reglas     # reglas de negocio y seguridad contra Supabase
npm run test:funciones  # funciones de Cloudflare Pages
```

`test:reglas` necesita un archivo `.env` con las variables de `.env.example`. Crea sus propios usuarios y eventos de prueba y los borra al terminar.

### Generar el APK

Requisitos: Android Studio y JDK 21. El JDK que trae Android Studio no sirve con la versión de Gradle de Capacitor.

```bash
ionic build
npx cap sync android
npx cap open android
```

En Android Studio: Build > Build Bundle(s) / APK(s) > Build APK(s). El archivo queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

Cada cambio en el código web necesita `ionic build` y `npx cap sync android` antes de volver a compilar; si no, el APK sale con la versión anterior.

## Estado

En uso para el primer evento. Pendiente para después: asignación de mesas, recordatorios por WhatsApp y textos de la invitación editables por evento.
