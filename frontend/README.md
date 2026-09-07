# Frontend de NaniFer

React, Vite y Tailwind conectados a FastAPI. Las instrucciones vigentes de configuración, inicio de sesión, MySQL y pruebas están en el README.md de la raíz del repositorio.

Desde esta carpeta: `npm start` compila y sirve la aplicación en http://localhost:4173; requiere el backend en http://127.0.0.1:8000. Para desarrollo con recarga automática, `npm run dev` usa el puerto 5173.

Los datos de pedidos y cobros ya no usan localStorage. Los datos antiguos del prototipo no se migran automáticamente a MySQL.
