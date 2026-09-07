-- Ejecutar en MySQL Workbench con un usuario administrador.
-- Crear la base no modifica otras bases existentes.
CREATE DATABASE IF NOT EXISTS heladeria_pos_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- En Administration > Users and Privileges, crear heladeria_pos_app
-- con host localhost y una contraseña propia.
-- Luego ejecutar esta concesión, limitada a la base de desarrollo:
GRANT ALL PRIVILEGES ON heladeria_pos_dev.* TO 'heladeria_pos_app'@'localhost';
-- Copiar la contraseña SOLO a backend/.env (DB_PASSWORD).
-- Nunca agregar contraseñas a este script ni guardarlas en Git.
