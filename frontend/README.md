# NaniFer · prototipo visual

Aplicación local con React, Vite y Tailwind CSS. La carpeta del proyecto estaba vacía al comenzar. No se implementó backend.

## Cómo ejecutarlo

Abrí una terminal en Visual Studio Code, dentro de NaniFer:

```powershell
cd frontend
npm install
npm run dev
```

Abrí la dirección que imprime Vite (habitualmente http://127.0.0.1:5173). Se recomienda Node.js 22 y un navegador actualizado. Si PowerShell bloquea npm.ps1, usá `npm.cmd` en lugar de `npm`.

## Recorrido de prueba

1. Abrí http://127.0.0.1:5173/mesa/1 en una pestaña. En /mesa/ podés seleccionar cualquiera de las 15 mesas.
2. Seleccioná un producto, tamaño, sabores y extras; agregá observaciones y confirmá el pedido. Pistacho y brownie aparecen agotados. El carrito permite cambiar cantidades o quitar productos.
3. Abrí http://127.0.0.1:5173/salon en otra pestaña del mismo navegador. La mesa 1 aparece ocupada. Entrá para ver consumos y elegir la moza responsable.
4. En http://127.0.0.1:5173/comandera pasá el pedido por preparación, listo y entregado. Observá los cambios en las otras pestañas. Entregado sigue pendiente de cobro.
5. Desde la carta o con Agregar pedido en la cuenta, cargá otro pedido. El total se acumula en la misma visita. Preparalo y entregalo.
6. En la cuenta, seleccioná Cobrar y cerrar. Elegí efectivo, tarjeta o transferencia. Para efectivo, ingresá opcionalmente un importe mayor al total y revisá el vuelto.
7. Confirmá el cobro. Aparece en Últimos cobros de prueba y la mesa queda libre. Abrila otra vez: la nueva cuenta empieza en cero y conserva el historial anterior por separado.
8. Restablecer demostración, al pie, permite eliminar los datos de prueba previa confirmación.

Usá exactamente el mismo origen en las pestañas: no mezcles localhost con 127.0.0.1 ni distintos puertos. Los datos persisten al recargar.

## Verificaciones

```powershell
npm test
npm run build
```

Las pruebas cubren acumulación, transiciones, doble envío, validación de opciones y precios, vuelto, medios de pago, cierre, nueva visita y restablecimiento.

## Organización

- src/data.js: catálogo ficticio, sabores y mozas.
- src/domain.js: reglas y cálculo de importes, independientes de las vistas.
- src/store.js: persistencia y sincronización. Es el punto para sustituir por una API de FastAPI.
- src/components.jsx: componentes reutilizables de presentación.
- src/main.jsx: pantallas, navegación y formularios.
- src/style.css: tema visual y adaptación móvil; Tailwind se integra mediante su plugin de Vite.

## Alcance y limitaciones

- Datos de prueba en localStorage, sincronizados con eventos storage y BroadcastChannel; Web Locks serializa escrituras entre pestañas. Requiere navegador moderno y localhost/127.0.0.1 o HTTPS.
- No comparte datos entre dispositivos, perfiles o navegadores. Borrar el almacenamiento del navegador elimina el historial. Los carritos sin enviar son temporales por pestaña y se pierden al recargar; pedidos y cobros sí persisten.
- La demostración empieza con las 15 mesas libres. No hay usuarios reales, permisos, stock operativo, base de datos, cierre de caja, pagos electrónicos ni soporte sin conexión.
- Se exige entregar todos los pedidos de una cuenta antes de cobrarla. No incluye anulaciones, descuentos, división de cuenta ni devoluciones.
- El selector de mesa permite simular distintos QR. No valida presencia física ni identidad.
- Para publicar en otro servidor será necesario configurar la redirección de rutas a index.html. No se realizó despliegue.

## Resultado de la verificación local

- 7 pruebas de lógica aprobadas.
- Compilación de producción aprobada con el cargador runner (incluido en los comandos).
- Recorrido probado en navegador: helado con dos sabores y extra ($4.300), preparación, entrega, pedido manual de agua ($1.800), total $6.100, efectivo $10.000, vuelto $3.900 y mesa liberada. Sincronización confirmada entre dos pestañas.
- Se revisó visualmente el escritorio. La herramienta de navegador no aplicó el tamaño móvil solicitado; la comprobación visual en un celular real queda pendiente. La hoja de estilos incluye adaptación móvil.
- El modo `npm run dev` encontró una restricción de acceso del entorno de Codex al optimizar dependencias con esbuild. Si ocurre en tu terminal, ejecutá la alternativa comprobada:

```powershell
npm start
```

Esto compila y sirve el prototipo en http://127.0.0.1:4173. En esta modalidad, reiniciá el comando después de modificar código. No necesita backend.

