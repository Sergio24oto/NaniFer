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

Quedan para etapas siguientes: stock por unidades, mostrador, administración de catálogo, caja, gestión visual de usuarios y marca definitiva. La consulta de ventas cobradas se incorporó en el módulo descrito al final. Tampoco hay anulaciones, devoluciones, descuentos, división de cuenta ni pagos electrónicos. Antes de usarlo en operación real faltan despliegue HTTPS, respaldo/recuperación y pruebas con los dispositivos y la red del local.

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


## Ventas cobradas

Acceso: http://localhost:4173/atencion/ventas (botón **Ventas** en atención). Usa MySQL y la misma sesión del personal. El informe no crea cobros nuevos.

### Puesta en marcha

En esta computadora se aplicó la migración `20260908_sales`, conservando los tres cobros existentes y vinculándolos con sus consumos. Se reinició el backend para cargar los endpoints nuevos. La base y `.env` no se guardan en Git.

En otra instalación o al actualizar esta versión, detené primero el backend para evitar cobros durante la migración. Desde `backend`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

En otra terminal, desde `frontend`, ejecutá `npm start`. Si el puerto 4173 ya está ocupado por esta aplicación, detené esa terminal con Ctrl+C antes de volver a iniciarla; no abras otra instancia. Si solo recompilás con `npm run build`, la vista previa existente sirve el nuevo resultado al recargar el navegador.

### Cómo probar

1. Iniciá sesión y entrá en **Ventas**: abre la jornada actual. Cada jornada comienza a las 04:00 en `America/Argentina/Buenos_Aires`. Por ejemplo, el domingo a las 00:45 y a las 03:59 cuenta para el sábado; a las 04:00 empieza el domingo. Se muestran las horas reales locales, aunque la operación corresponda a la jornada anterior.
2. Registrá un pedido y comprobá que todavía no figura como venta. Cobrá la cuenta desde atención: aparece una operación. Agregá y cobrá otro pedido en la misma visita: aparecen dos ventas, cada una con sus propios consumos. Entregar y cerrar siguen siendo acciones independientes.
3. Usá **Ver detalle** para revisar productos, cantidades, precios unitarios finales (incluyen opciones), subtotales, cobro, responsable y venta original.
4. Como administrador, seleccioná hasta 31 jornadas inclusivas y pulsá **Consultar**. El botón **Jornada actual** vuelve al período automático. El personal solo ve la jornada actual: los endpoints también rechazan períodos anteriores, correcciones y PDF para ese rol.
5. Para probar una corrección, usá una venta de desarrollo. Elegí **Corregir venta**, cambiá producto, cantidad o precio final y explicá el motivo (3 a 500 caracteres). **Revisar antes y después** consulta el cálculo al servidor sin guardar nada. Solo **Confirmar corrección** la registra. Podés cancelar la vista previa.
6. Verificá que el total vigente cambió, que el cobrado registrado conserva su importe y que la diferencia es solo informativa. Abrí **Venta original** e **Historial de correcciones**. Un segundo ajuste crea otra versión sin sumar ambas correcciones al total de ventas.
7. Como administrador, pulsá **Descargar PDF**: incluye todas las operaciones del período consultado, aunque el listado esté paginado de a 20. Probá también un período vacío.

### Integración y límites

- Una venta usa como identificador el cobro existente (`payments.id`), con una relación uno a uno en `sales`. `sale_allocations` vincula cada renglón cobrado una sola vez. Se crean dentro de la misma transacción que el pago: si falla el registro de la venta, tampoco se confirma el cobro. Los pedidos sin cobrar no entran al informe.
- El modelo actual permite un medio de pago por cobro y cobra todo el saldo pendiente. Si una visita tiene varios cobros, son operaciones de venta distintas. No hay reparto de un mismo cobro entre medios ni pagos parciales arbitrarios.
- `sales.original_items` conserva el original. `sale_corrections` registra administrador, momento, motivo y valores anteriores/nuevos. El total vigente se actualiza una sola vez por versión. La clave de idempotencia evita repetir una corrección y la versión esperada rechaza ediciones simultáneas incompatibles.
- Las correcciones no modifican `payments`, `order_items`, el catálogo ni el saldo de la visita; tampoco generan devolución o deuda. Se imputan a la jornada de la fecha original del cobro, conservando la fecha real de cada ajuste. Reemplazar un producto quita sus opciones anteriores del renglón corregido; el precio final se ingresa expresamente. Se conservan los renglones: esta etapa no permite agregar/eliminar renglones de una venta ni anular operaciones.
- No existen movimientos de stock en el modelo actual. Una integración futura deberá tomar la relación entre venta y renglón original y registrar ajustes explícitos, sin interpretar estas correcciones como movimientos de stock automáticos.
- La migración valida los cobros históricos antes de crear tablas. Si no puede asignar consumos con certeza (por ejemplo, operaciones antiguas ambiguas en el mismo segundo), se detiene y pide revisar esa asignación; no inventa productos ni reconstruye importes silenciosamente.
- Resumen, jornadas, listado y PDF usan la misma consulta y reglas. Cada informe obtiene ventas e historial en una sola lectura SQL consistente. Si entra una operación entre dos consultas, el informe posterior reflejará ese cambio. La pantalla consulta cada 4 segundos y avisa si conserva datos de una consulta anterior por un error.
- Para este local pequeño se carga el período completo en memoria y se pagina en pantalla. No hay límite oculto de operaciones para el PDF. Con volúmenes mucho mayores convendrá añadir paginación de servidor y exportación en segundo plano.
- El PDF es un informe interno en español, no un comprobante fiscal. Incluye logo disponible, período, generación, resumen, jornadas, todas las ventas, correcciones, encabezados repetidos y páginas numeradas.

### Verificaciones del módulo

Se ejecutaron pruebas sobre MySQL de desarrollo: corte 00:45/03:59/04:00, rangos de 31 jornadas y rechazo de rangos mayores/invertidos, permisos de personal y administrador, período vacío, dos cobros de una visita sin repetir renglones, saldo nuevo, original intacto, reemplazo de producto, precios del catálogo y cobros intactos, múltiples correcciones, reintentos y conflictos concurrentes. También se verificó un PDF de 23 ventas y 31 jornadas, incluyendo operaciones fuera de la primera página del listado.

La suite completa del backend pasa 18 pruebas; el frontend pasa 7 y compila. Alembic no detecta diferencias pendientes y las dependencias pasan `pip check`. Persisten las dos advertencias de deprecación de TestClient/httpx y AnyIO ya documentadas; no se modificó esa compatibilidad en esta etapa. Se revisaron visualmente el PDF de los cobros existentes y las tres páginas de un ejemplo de maquetación con correcciones. En el navegador se revisaron resumen, detalle y vista previa, sin guardar correcciones sobre las ventas existentes. La validación en celular físico sigue pendiente.

## Ajustes de claridad de Ventas

Se conservaron la estructura visual, los colores y las reglas de ventas, cobros, correcciones y permisos.

- Textos simplificados: **Total vendido**, **Cobros registrados**, **Fecha y hora** y **Total**. Si hay correcciones, se explica que están incluidas en el total. Si no hay ninguna, aparece **Sin correcciones en este período**. La existencia de correcciones se cuenta por ventas corregidas, no por su diferencia monetaria: dos ajustes que se compensan siguen visibles.
- Filtros rápidos: **Jornada actual**, **Últimas 7 jornadas** y **Últimas 31 jornadas**. El servidor calcula el período respecto de la jornada actual de Buenos Aires, con corte a las 04:00. Incluyen la jornada actual y avanzan automáticamente al cambiar de jornada. El personal solo tiene acceso al primer filtro; el backend rechaza los demás para ese rol. El rango manual sigue disponible para administradores.
- El título describe la jornada o jornadas efectivamente consultadas y su horario. Editar las fechas no cambia el informe hasta pulsar **Consultar**. El PDF siempre usa las fechas de la última consulta exitosa, no las que se estén escribiendo. Un aviso explica esa diferencia mientras se editan.
- Se aumentaron moderadamente la letra y el contraste de la tabla y textos secundarios, y se hicieron más claros los estados de actualización, error, desconexión y botones deshabilitados.
- La migración `20260908_sale_numbers` agrega `sales.number`, único y generado atómicamente por MySQL. Los identificadores internos y vínculos permanecen intactos. Los registros existentes reciben un número persistente; las nuevas ventas reciben el suyo en la misma transacción del cobro. El número aparece como **Venta #N** en listado, detalle y PDF. No cambia al filtrar, paginar o corregir.
- La numeración puede tener saltos por pruebas o transacciones no confirmadas. No se recicla ni pretende ser una numeración de comprobantes fiscales. Las pruebas de desarrollo también consumen números, aunque sus datos se limpien después.

En esta computadora ya se aplicó la migración y se verificó que cobros, importes, renglones y correcciones preexistentes no cambiaron. Para actualizar otra instalación, detener el backend, ejecutar `python -m alembic upgrade head` desde su entorno virtual y reiniciarlo; después compilar el frontend y recargar el navegador.

Verificación de estos ajustes: **24 pruebas del backend y 10 del frontend aprobadas**, compilación correcta y Alembic sin diferencias. Se probaron cortes de medianoche y 04:00 para los filtros rápidos, permisos del personal, números únicos con cobros simultáneos, números estables en consultas/detalle/PDF y correcciones con diferencia neta cero. En navegador se probaron edición de fechas sin consultar y un listado de 28 ventas en dos páginas. Se revisaron visualmente los PDF multipágina, corregido y vacío usando datos temporales. Los datos de prueba fueron limpiados; no se corrigieron ventas reales. Continúan pendientes las pruebas en celular físico y las dos advertencias de dependencias ya documentadas.

## Atención rápida, Mostrador y reservas

Esta sección describe el recorrido actual y reemplaza el flujo manual anterior. Se conserva el módulo de Ventas, sus correcciones, el historial y el corte comercial de las 04:00.

### Actualizar y ejecutar

La migración `20260909_attention` ya está aplicada en esta base de desarrollo. No borra ni recrea la base y no cambia estados de pedidos anteriores: agrega procedencia y autor para las nuevas cargas, permite visitas sin mesa y crea las reservas. Los pedidos anteriores quedan identificados internamente como `legacy`, sin inventarles un autor.

Para actualizar otra instalación, detener su backend, activar su entorno y ejecutar desde `backend`:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Desde otra terminal, en `frontend`, ejecutar `npm start`. Si la vista previa ya está funcionando en 4173, basta `npm run build` y recargar el navegador. No iniciar una segunda instancia en ese puerto.

Abrir `http://localhost:4173/atencion`. Para otro equipo o celular de la misma red, usar `http://IP-DE-LA-COMPUTADORA:4173/atencion`; la carta pública sigue en `/mesa/1` hasta `/mesa/15`. Vite reenvía `/api` al backend local. Windows debe permitir ese puerto en la red privada. No se abren puertos del router ni se publica esta instalación en Internet.

### Recorridos para probar

1. **Mesa:** elegir una mesa, buscar productos o elegir categoría, agregar y ajustar cantidades. Solo se abre el selector si hay opciones del producto. Las observaciones son opcionales. La indicación inicial es **Se registra como entregado**. Pulsar **Guardar consumos**: vuelve al salón y muestra el saldo pendiente. Aún no se registró una venta cobrada.
2. **Preparación excepcional:** antes de guardar, marcar **Necesita preparación**. El pedido entra a la comandera. Los pedidos QR siempre siguen entrando como pendientes, en la misma visita. La comandera muestra pendiente, en preparación y listo para entregar; los entregados permanecen en los consumos e historial.
3. **Cobrar y cerrar:** abrir la mesa y pulsar **Cobrar**, elegir medio y confirmar. Primero hay que guardar cualquier carga en edición. Cobrar no entrega pedidos ni libera la mesa. En **Responsable y cierre de visita**, cerrar explícitamente cuando no haya saldo ni entregas pendientes. Agregar consumos después de un cobro crea saldo nuevo, sin repetir los anteriores.
4. **Mostrador:** abrir su tarjeta, seleccionar productos y pulsar **Cobrar**. El servidor calcula el importe; confirmar medio de pago. Se guarda una compra independiente sin mesa y queda listo para la siguiente. Con **Necesita preparación**, la compra ya cobrada sigue en la comandera hasta entregarse. Al completar esa entrega se cierra esa compra, sin afectar mesas.
5. **Ventas y PDF:** las compras de Mostrador aparecen como **Mostrador**, con el mismo número de venta del listado, detalle y PDF. Cada cobro sigue teniendo una sola venta; no hay un segundo registro de dinero ni un cierre de caja nuevo.
6. **Reservas:** abrir una mesa y pulsar **Reservas**. Elegir nombre, fecha y hora argentina; nota opcional. Se puede editar, cancelar o marcar **Llegó**. Si está ocupada, la llegada exige confirmar expresamente que se trata de los mismos clientes antes de vincular la visita. Nunca se reemplaza una cuenta activa. Abrir una mesa libre con reserva para hoy requiere reconocer el aviso. En el salón, **Ver reservas de otra fecha** permite consultar fechas futuras manteniendo visibles los saldos y la ocupación actual.

### Integración y límites deliberados

- Mostrador usa `visits.table_number = NULL`, no una mesa ficticia. Pedido, cobro, venta y asignación de renglones se guardan en una sola transacción. Una diferencia entre el presupuesto mostrado y el precio actual hace rechazar el cobro completo para revisarlo.
- Cargas manuales nuevas: `orders.origin = manual`, autor y estado entregado por defecto. QR: `qr` y pendiente. Mostrador: `counter`. Los precios se validan y guardan en el servidor.
- Reservas: permiso `reservations.manage`, inicialmente habilitado para administrador y personal mediante `users.can_manage_reservations`. Se valida en cada operación del servidor. No se añadió una pantalla de administración de permisos.
- Máximo una reserva pendiente por mesa y fecha calendario. No expiran automáticamente. Reservar no crea visitas, pedidos, cobros ni ventas. La fecha elegida no cambia por el corte comercial de las 04:00. Quedan guardados creador, último editor, fechas, estado y visita vinculada. Los datos de reservas se entregan solo en rutas internas autenticadas; no aparecen en la API pública.
- Las reservas canceladas o con llegada quedan conservadas en MySQL; el formulario muestra las pendientes. No se agregó un calendario ni un historial visual específico de reservas.
- Se usan claves de operación, bloqueos de filas y restricciones únicas para reintentos y operaciones simultáneas. Ante respuesta incierta se conserva la misma solicitud para reintentar; no se presenta como confirmada. Los borradores aún no enviados no se guardan al abandonar la pantalla.
- Tablero compacto de 15 mesas más Mostrador, comprobado en una ventana de escritorio de aproximadamente 1264 × 714. Con nombres largos, varios avisos, zoom o pantallas pequeñas puede requerir desplazamiento para conservar legibilidad.
- Sin stock, señas, devoluciones, notificaciones externas, calendario complejo ni cierre de caja. Los cobros existentes quedan disponibles para la futura integración de caja.

### Verificación de esta etapa

**30 pruebas del backend y 10 del frontend aprobadas**, compilación correcta, `alembic check` sin cambios pendientes y `pip check` sin dependencias rotas. Se probaron consumos manuales entregados más QR en la misma visita, cobro antes de entrega, independencia de visitas, compras de Mostrador inmediatas y con preparación, rollback por importe incorrecto, reintentos simultáneos, 15 mesas temporales con cargas concurrentes, reservas por ambos roles, permisos denegados, privacidad pública, reservas futuras en mesa ocupada, edición, cancelación y llegada a mesa libre u ocupada. Las pruebas existentes de Ventas, correcciones, PDF, jornada comercial y persistencia entre reinicios siguen pasando.

Se revisaron en navegador tablero, selección rápida, cantidades, presupuesto de Mostrador y formulario de reservas; sin confirmar operaciones sobre ventas reales. Un PDF de 23 compras temporales se comprobó por contenido y visualmente en sus dos páginas, con Mostrador, totales y encabezados completos. Los registros temporales fueron retirados. La base de desarrollo y sus credenciales, entornos virtuales, dependencias y archivos de trabajo continúan excluidos de Git.

Pendiente: prueba presencial por las mozas y en el celular físico del local. Persisten las dos advertencias de deprecación de TestClient/httpx y AnyIO; no impiden las pruebas. No se hizo commit ni publicación de esta etapa.

## Gestión de stock

Las migraciones `20260910_stock` y `20260910_stock_sequence` están aplicadas en desarrollo. Conservan los registros existentes y agregan existencias y movimientos vinculados a pedidos y correcciones. No descuentan pedidos históricos. Esta sección reemplaza la limitación anterior «sin stock».

### Configuración y carga inicial

Ingresar como administrador a **Stock** (`/atencion/stock`). El personal puede consultar cantidades y disponibilidad, pero el servidor impide modificar existencias, consultar costos/proveedores/historial interno o exportar PDF.

1. En cada producto, elegir **Configurar**. Seleccionar control por unidades para bebidas y chocolates, y unidad **porciones** para tortas. Café y productos sin conteo permanecen con disponibilidad manual. Los productos existentes no se convierten automáticamente a stock cero: la configuración cuantitativa requiere una carga explícita antes de vender.
2. Para mercadería que ya está en el local, usar **Ajustar por conteo**, ingresar la cantidad física y un motivo, revisar la diferencia y confirmar. Para una entrega nueva, usar **Ingresar mercadería**: suma la cantidad recibida y conserva proveedor y costo de esa entrega. Una recepción de 12 porciones por $24.000 agrega 12 porciones y calcula $2.000 por porción. Se conserva el costo total original y el unitario con seis decimales.
3. Los dos cucuruchos empiezan sin existencia cargada y sin asociaciones inventadas. Editar sus nombres, cargar cada existencia y vincular cada presentación del producto al tipo que utiliza. Una venta consume uno por unidad, sin sumar otro precio. Una presentación sin cucuruchos se bloquea; las alternativas disponibles siguen habilitadas.
4. Configurar cada sabor y cargar sus recipientes cerrados y abiertos según el conteo físico. Las recepciones agregan cerrados; **Abrir** transfiere a abiertos y **Terminar** descuenta abiertos. La disponibilidad comercial del sabor se cambia manualmente, independientemente de estos conteos.

Se puede deshabilitar la venta de un producto con unidades disponibles sin modificar su existencia. Las salidas por rotura, vencimiento, regalo, personal u otro motivo conservan responsable y detalle. Todos los cambios de cantidad tienen valores anteriores y nuevos en el historial; las operaciones simultáneas se validan nuevamente en el servidor.

### Pedidos, correcciones y reportes

- Mesa manual, QR y Mostrador descuentan una sola vez al guardar el pedido. Preparar, entregar o cobrar no vuelven a descontar. Si falta una unidad, se rechaza toda la operación sin guardar líneas ni descuentos parciales. El carrito no reserva existencias.
- Una corrección solo de precio no afecta stock. Incrementos y reemplazos consumen existencias; en una reducción se debe indicar si las unidades realmente vuelven a estar disponibles. La vista previa muestra el efecto antes de confirmar. Los movimientos conservan el vínculo con el pedido y la corrección. Nunca se reponen automáticamente unidades históricas que no habían sido descontadas.
- Cantidad cero en una corrección anula ese renglón del informe de ventas. No borra el pedido ni devuelve dinero. No se agregó un circuito nuevo de cancelación de pedidos todavía sin cobrar; ese recorrido sigue pendiente.
- El historial se consulta por producto y fechas reales argentinas, hasta 366 días por consulta, sin borrar el historial anterior. El PDF exporta existencias actuales con los filtros seleccionados, categorías, recipientes y disponibilidad; no incluye valuación ni suma unidades incompatibles.

### Ejecución y comprobación

Usar las instrucciones de ejecución de la sección anterior. En otra instalación, detener el backend y aplicar `python -m alembic upgrade head` desde su entorno virtual antes de reiniciarlo. Compilar el frontend con `npm run build` y recargar si ya hay una vista previa en 4173. No iniciar otra instancia en el mismo puerto. La configuración permanece en `backend/.env`, excluido de Git.

Verificación: **40 pruebas del backend aprobadas**, además de las **10 del frontend y compilación** comprobadas durante esta etapa. Se probaron entradas y costos por porción, ambos cucuruchos, recipientes, los tres orígenes de pedido, reintentos, competencia por la última unidad, rechazo sin cambios parciales, conteos, salidas, correcciones y permisos. Alembic no detecta cambios de estructura pendientes. Se revisó visualmente un PDF de cuatro páginas y otro vacío; los resultados coinciden con las existencias consultadas. En navegador se guardó una entrada temporal de 12 porciones por $24.000; sus registros fueron retirados. La comprobación visual adicional de conteo e historial quedó interrumpida al cerrarse la sesión, aunque sus pruebas del backend pasan.

Pendiente: configurar el catálogo real y cargar las cantidades físicas con la dueña, probar los recorridos presencialmente y completar la revisión visual indicada. Persisten dos advertencias de deprecación de las dependencias de pruebas. La comparación final global con la huella anterior de datos no coincidió; sin una copia detallada de aquella referencia no se puede atribuir la diferencia. No se restauraron ni alteraron registros para forzar esa comparación. Las pruebas de conservación de originales, cobros y precios sí pasan. No se realizó commit ni publicación.

## Menú digital de consulta

El QR `/mesa/4` muestra la mesa desde el enlace y consulta el catálogo de MySQL, sin iniciar visitas ni crear pedidos. No hay carrito, selección de compra ni seguimiento de cuentas. Los POST públicos están bloqueados en el servidor; el código anterior de Menu y las funciones de pedidos QR se conservan para una futura reactivación controlada. Los pedidos QR históricos permanecen intactos. `/api/catalog` ahora requiere sesión del personal; el menú público usa `/api/public/menu/{mesa}` con campos públicos únicamente.

La migración `20260911_menu` agrega foto, orden y visibilidad pública a categorías, sin modificar precios, consumos ni existencias. Está aplicada en desarrollo. El administrador encuentra **Gestionar carta** en la navegación: puede editar nombre, foto, orden y visibilidad de las categorías existentes, y foto opcional de productos. Ocultar una categoría no afecta atención. No se agregó una herramienta para crear productos nuevos o editar sus precios; el catálogo actual sigue siendo provisional y debe completarse en una etapa de gestión de productos.

Fotos optimizadas WebP: `frontend/public/menu/helados.webp`, `tortas.webp`, `meriendas.webp`, `pizza.webp`, `sintacc.webp`, `cenas.webp`. Los originales se conservan en `assets/menu-originals` y en su ubicación de origen. Para nuevas fotos, colocar archivos en `frontend/public/menu` con nombres simples, por ejemplo `bebidas.webp`, `chocolates.webp` o `nombre-del-producto.webp`, y seleccionar o escribir `/menu/nombre.webp` en Gestionar carta. No hay subida de archivos desde el navegador en esta etapa. Si se utiliza la vista previa, recompilar con `npm run build` tras agregar archivos.

Solo se asociaron fotos a Helados, Tortas y Cafetería (foto de merienda). No se inventaron productos/precios ni categorías duplicadas. Faltan fotografías específicas de Bebidas y Chocolates, fotos individuales opcionales y la carta real de comidas, combos y Sin TACC con precios y organización confirmada. Las piezas promocionales proporcionadas incluyen texto; se muestran con recortes consistentes y no se consideran fotos definitivas de cada producto.

Abrir `http://localhost:4173/mesa/4`; desde un celular de la misma red usar la IP de la computadora, por ejemplo `http://192.168.100.59:4173/mesa/4`. Se mantiene la ejecución documentada del backend y frontend. Sin publicación ni push.

Verificación: consultas a las 15 mesas sin modificaciones de visitas/pedidos/stock, rechazo de pedidos públicos, permisos administrativos, fotos locales válidas y visibilidad pública independiente del catálogo interno. La suite completa tuvo 40 pruebas aprobadas y dos fallos de expectativas antiguas; tras corregirlos, las cuatro pruebas enfocadas pasaron. Alembic sin diferencias, frontend compilado. Navegación y fotos revisadas en navegador; sin desborde horizontal a 360 y 1280 píxeles. Pendiente prueba en celular físico y revisión visual del editor con la dueña. Persisten las advertencias de deprecación de dependencias de pruebas ya documentadas.

### Comidas, Meriendas/Desayunos y Combos

Se incorporaron las ofertas solicitadas mediante `python -m app.menu_offerings`, una carga explícita que no duplica productos al repetirse. Chocolates se ocultó solamente de la carta pública; sus productos e historial siguen disponibles internamente. Tostado es un único producto compartido visualmente entre Comidas y Meriendas/Desayunos.

Los nuevos platos y combos se muestran con **Consultar precio**: no se proporcionaron sus importes. La migración `20260912_menu_offerings` incorpora la marca `price_pending`; el backend impide venderlos mientras esté activa. El cero almacenado no es un precio de venta ni se muestra al público. Para habilitarlos falta completar sus precios y quitar esa marca mediante una actualización controlada; todavía no hay editor de precios en Gestionar carta. Los adicionales confirmados se explican en la nota de Combos: medialuna $1.000 y criollo $500. No se deducen de esos adicionales los precios de los productos individuales.

La foto del local es el fondo de la carta; meriendas2.webp ilustra desayunos y combos y pizza.webp ilustra Comidas. Los originales continúan conservados. Se verificaron compilación, 10 pruebas del frontend, 3 pruebas de menú/seguridad y Alembic sin diferencias. Se revisó la navegación de Combos y sus adicionales a 360 píxeles sin desborde horizontal. Sin publicación ni push.

## Gestión administrativa de carta y acceso de Stock

**Stock → + Agregar stock** abre un buscador de productos e insumos. Elegir uno con control configurado abre la recepción existente (cantidad, proveedor y costo). Si aún no tiene control, abre Configurar stock; después se puede registrar la entrada o conteo inicial. El enlace **Crearlo en Gestionar carta** permite dar de alta un producto nuevo antes de cargar sus existencias. Se conservan las reglas de entradas, conteos, permisos y movimientos.

**Gestionar carta** ahora tiene listado, buscador, filtro de categorías y formularios:

- **Nuevo producto / Editar:** nombre, categoría, descripción, foto, disponibilidad y precio opcional. Dejar precio vacío mantiene “Consultar precio” y bloquea ventas internas; completar el precio habilita su uso según disponibilidad y stock. Las opciones y vínculos de stock existentes no se reemplazan al editar.
- **Retirar de la carta:** quita el producto de la carta pública y de nuevas ventas, conservando pedidos, ventas y existencias. **Ver retirados → Restaurar** permite recuperarlo. No hay borrado físico de productos ni reposición automática por retirarlos.
- **Nueva categoría / Editar:** nombre, foto, orden, nota para clientes y visibilidad pública. Para quitar una categoría del menú, desmarcar su visibilidad; sus productos siguen disponibles internamente. No se borran categorías con sus productos.
- Fotos: elegir archivos locales de `frontend/public/menu`, ahora incluyendo JPG, PNG y WebP. No se añadió subida de archivos desde el navegador.

Permisos validados en el servidor: solo administrador. Altas protegidas con claves de operación y recuperación de reintentos. La migración `20260913_catalog_crud` agrega el indicador de producto retirado sin borrar registros; aplicada en desarrollo. Los cambios de precios no modifican pedidos ni ventas anteriores.

Verificación enfocada: altas y reintentos, precio pendiente/completo, edición sin cambiar importes históricos, retiro/restauración, categorías duplicadas, notas y permisos. Frontend compilado y sus 10 pruebas aprobadas. Sin commit ni subida a GitHub.

La revisión completa de esta entrega obtuvo 43 pruebas del backend aprobadas y detectó dos pruebas antiguas dependientes de datos del local. Se corrigieron para usar un sabor agotado y un producto alternativo temporales; ambas pasaron al repetirlas. No se modificaron el sabor ni el stock reales para satisfacer pruebas. La revisión visual con el usuario administrador queda pendiente. Persisten las dos advertencias de deprecación de dependencias de pruebas.
