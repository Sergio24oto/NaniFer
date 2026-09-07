# NaniFer / heladeria-pos

Primera etapa real: React + Vite + Tailwind, una API FastAPI y MySQL. Un solo repositorio para frontend y backend. La apariencia y el catálogo siguen siendo provisionales.

## Ejecutar en esta computadora

MySQL80 debe estar iniciado. La base `heladeria_pos_dev` ya está creada y migrada. El entorno Python `backend/.venv` está preparado. No hay usuarios con contraseñas predeterminadas.

### 1. Crear tu acceso (una sola vez)

Desde una terminal de VS Code en NaniFer:

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.cli create-user
```

Elegí usuario, nombre visible, rol `admin` o `staff` y una contraseña de al menos 12 caracteres. La contraseña no se muestra al escribir. El usuario de la aplicación es distinto del usuario de MySQL. Si ya existe, el comando no lo sobrescribe.

### 2. Iniciar el backend

En esa terminal, dentro de backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 3. Iniciar el frontend

En otra terminal, desde NaniFer:

```powershell
cd frontend
npm start
```

`npm start` compila y sirve la aplicación en http://localhost:4173. El servidor frontend deriva `/api` hacia FastAPI; no necesita exponer MySQL ni el puerto 8000 a la red. Mantené abiertas las dos terminales; Ctrl+C detiene cada servidor.

Rutas:

- http://localhost:4173/mesa/1 — carta de la mesa 1 (hasta 15).
- http://localhost:4173/mesa/ — selector de mesa para pruebas.
- http://localhost:4173/atencion — inicio de sesión y salón.
- http://localhost:4173/atencion/comandera — comandera.
- http://localhost:4173/atencion/mesas/1 — cuenta de la visita.

`npm run dev` habilita edición con actualización automática en el puerto 5173. En el entorno restringido de Codex, esbuild sigue encontrando un error de permisos al optimizar dependencias; `npm start` es la alternativa comprobada. En modo start, reiniciá ese comando después de modificar el frontend. No es necesario cambiar permisos de Windows para probar la aplicación compilada.

## Probar desde un celular

1. Conectá computadora y celular a la misma red Wi-Fi.
2. En la computadora ejecutá `ipconfig` y buscá la dirección IPv4 del adaptador Wi-Fi/Ethernet que uses. No uses la dirección de un adaptador virtual.
3. En el celular abrí `http://IP-DE-LA-PC:4173/mesa/1`. La IP observada durante esta implementación fue `192.168.100.59`; puede cambiar.
4. Si Windows consulta por Node.js, permití el acceso solo para tu red privada. Si no conecta, comprobá que no estés en una red de invitados con aislamiento entre dispositivos. No abras el puerto MySQL.
5. Para probar el QR, usá como destino esa URL de la mesa. En esta etapa las rutas están listas; no se generaron etiquetas QR para imprimir.

HTTP local sirve para pruebas en una red de confianza; la publicación real necesitará HTTPS y `COOKIE_SECURE=true`. No se configuró despliegue público.

## Recorrido funcional

1. Consultá la carta y elegí **Iniciar visita**. Se abre una visita o se comparte la activa de esa mesa.
2. Elegí un producto, opciones y observaciones. Confirmá el pedido. Solo aparece confirmado después de la respuesta del servidor.
3. Iniciá sesión en atención desde la computadora. Entrá a la mesa para revisar consumos y asignar responsable.
4. En la comandera, pasá por pendiente → en preparación → listo para entregar → entregado.
5. Agregá otro pedido desde la carta o mediante Agregar pedido en atención.
6. **Cobrar saldo** permite cobrar en cualquier estado de preparación. Elegí efectivo, tarjeta o transferencia. En efectivo, el importe recibido es opcional y calcula el vuelto.
7. Cobrar deja abierta la visita y mantiene los pedidos en la comandera. Los consumos posteriores generan nuevo saldo, descontando todos los cobros anteriores.
8. Cuando el saldo sea cero y todos los pedidos estén entregados, elegí **Cerrar visita y liberar mesa** y confirmá. La siguiente visita tiene otro identificador y consumos cero.
9. Reiniciá el backend o recargá el navegador: lo confirmado permanece en MySQL.

Las vistas consultan la API cada cuatro segundos. Si no responde, muestran desconexión y deshabilitan operaciones. Un envío cuya respuesta se perdió conserva su identificador y contenido en sessionStorage; el botón Reintentar recupera la misma operación. El borrador no enviado permanece solo en memoria y se pierde al recargar. No se implementó funcionamiento sin conexión.

## Configuración y migraciones

`backend/.env` contiene la configuración local y está excluido de Git. `.env.example` no contiene contraseñas reales. No imprimir ni compartir `.env`.

En otra computadora, instalá Python 3.12 (versión usada en las pruebas), Node.js y MySQL 8.0. Creá un entorno con `py -3.12 -m venv .venv` dentro de backend e instalá con `.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt`. En frontend ejecutá `npm ci`. Creá la base y un usuario exclusivo usando `backend/scripts/setup_mysql.sql` como guía; copiá `.env.example` a `.env` solo si este no existe y completá los datos locales.

Desde backend:

```powershell
.\.venv\Scripts\python.exe -m app.cli check-db
.\.venv\Scripts\python.exe -m alembic upgrade head
```

La migración inicial está en `backend/migrations/versions`. `upgrade head` aplica solo revisiones pendientes. No se usa `drop_all`, no se recrea la base y no se ejecutan migraciones automáticamente al iniciar el servidor.

Para agregar datos provisionales explícitamente:

```powershell
.\.venv\Scripts\python.exe -m app.cli seed-demo
```

Solo se permite en bases cuyo nombre termina en `_dev` o `_test`. Agrega registros faltantes, no modifica los existentes. El catálogo provisional ya fue cargado en esta computadora. No hay botón para borrar datos reales desde la interfaz.

## Datos y reglas

MySQL guarda categorías, productos con tamaños/extras e imágenes opcionales, sabores con disponibilidad, 15 mesas, usuarios y sesiones, visitas, pedidos, renglones, cobros y claves de operaciones.

Cada renglón conserva nombre, opciones y precio unitario al venderlo. Los importes usan DECIMAL en MySQL y Decimal en Python. El cliente envía producto, opciones y cantidades; FastAPI valida y calcula. El saldo es consumos menos cobros registrados. Ninguna operación de cobro recibe un total editable por el personal: el importe visible se envía solo como comprobación de que el saldo no cambió.

Los bloqueos de filas de InnoDB serializan modificaciones de una visita. Las claves de operación se guardan en MySQL para recuperar resultados repetidos. Una restricción única impide dos visitas activas para la misma mesa. El cierre exige saldo cero y entrega completa; no se deduce del cobro ni de la entrega.

El acceso del personal usa contraseñas con hash scrypt, cookies HttpOnly, caducidad de sesión y protección CSRF. Staff y admin pueden realizar las operaciones de atención; cualquier otro rol es rechazado. La carta usa una sesión limitada a la visita de esa mesa y no expone rutas internas. El QR identifica la mesa, no demuestra presencia física: no publiques estas pruebas abiertas a Internet.

## Verificaciones

Desde backend:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m alembic check
```

Las pruebas requieren MySQL de desarrollo accesible. Crean registros temporales identificados, los limpian al terminar y no borran ni recrean la base. No ejecutarlas contra producción. Incluyen recorrido completo, precio histórico, cobro anticipado, saldo posterior, duplicados concurrentes, permisos, validaciones, error de base y dos reinicios reales de FastAPI.

Desde frontend:

```powershell
npm test
npm run build
```

## Organización y próximos pasos

- frontend/src/pages: carta, opciones, salón, comandera y cobro.
- frontend/src/components.jsx: componentes compartidos del prototipo.
- frontend/src/store.js: API, sesión, actualización periódica y reintentos.
- backend/app: configuración, modelos, validación, reglas, autenticación y rutas.
- backend/migrations: estructura de la base versionada con Alembic.
- backend/tests: integración sobre MySQL real.

Quedan para etapas siguientes: stock por unidades, mostrador, administración de catálogo, caja, ventas diarias, gestión visual de usuarios y marca definitiva. Tampoco hay anulaciones, devoluciones, descuentos, división de cuenta ni pagos electrónicos. Antes de usarlo en operación real faltan despliegue HTTPS, respaldo/recuperación y pruebas con los dispositivos y la red del local.

## Resultado de esta etapa

- Conexión verificada a heladeria_pos_dev; migración 879fddfe8172 aplicada sin borrar ni recrear la base. Todas las tablas usan InnoDB.
- 8 pruebas de integración con MySQL y 6 del frontend aprobadas. Compilación aprobada y Alembic sin cambios de estructura pendientes.
- En navegador se probó la carta, la creación de una visita y un pedido, la desconexión al detener FastAPI y la reconexión automática. El inicio de sesión bloquea la entrada al panel. El recorrido interno completo y los permisos se verificaron con pruebas de API/MySQL.
- Quedó una visita de prueba en la mesa 15, con un agua de $1.800 y observación "Prueba técnica de integración". Podés usarla para probar preparación, cobro y cierre cuando crees tu usuario.
- Los usuarios temporales de las pruebas automáticas fueron eliminados al terminar. Se verificó el usuario creado por vos: hay un acceso habilitado para atención. No hay contraseñas predeterminadas.
- Se revisaron 40 archivos candidatos a Git sin coincidencias de secretos. backend/.env sigue excluido.
- La prueba desde un celular físico de la misma red queda a realizar con los pasos de este documento.


## Versión guardada antes del módulo de ventas — 2026-09-07

Este punto de control incluye API FastAPI con MySQL, migración inicial, acceso del personal, carta conectada, visitas, pedidos, comandera y cobros independientes del cierre. También incorpora el logo real y la fotografía del local en la carta y el acceso del personal. No es una versión terminada para producción.

Verificación repetida antes del commit: 8 pruebas de integración con MySQL y 6 del frontend aprobadas; compilación Vite aprobada; `alembic check` sin diferencias pendientes. La revisión de archivos candidatos no encontró secretos locales ni patrones de credenciales. Se conservan los manifiestos y lockfiles; `.env.example` tiene la contraseña vacía. La base de datos y sus registros no forman parte del commit: requieren su configuración y respaldo propios.

Las pruebas del backend emiten dos advertencias de deprecación relacionadas con TestClient/httpx y el alias BlockingPortal de AnyIO. No fallan las pruebas; queda pendiente revisar esa compatibilidad de dependencias. La comprobación en un celular físico, el despliegue HTTPS y el respaldo/recuperación siguen pendientes. El módulo de ventas/mostrador, stock, administración y caja todavía no están implementados. El catálogo y el diseño continúan abiertos a ajustes.
