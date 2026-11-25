import React, { useState, useEffect } from "react";
import { Shield, KeyRound, UserPlus, Edit3, Eye, EyeOff, CheckCircle2, Lock, Users } from "lucide-react";
import { Modal } from "../components";
import { useStore, request, refresh } from "../store";

export default function UsersManagement() {
  const s = useStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Create user modal state
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: "",
    name: "",
    role: "staff",
    password: "",
  });
  const [showCreatePass, setShowCreatePass] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);

  // Change password modal state
  const [passTarget, setPassTarget] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);
  const [busyPass, setBusyPass] = useState(false);

  // Edit user modal state
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({
    username: "",
    name: "",
    role: "staff",
    active: true,
  });
  const [busyEdit, setBusyEdit] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const res = await request("/users");
      setUsers(res.users || []);
    } catch (e) {
      setError(e.message || "No se pudo cargar la lista de usuarios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (busyCreate) return;
    setBusyCreate(true);
    setError("");
    setNotice("");
    try {
      const created = await request("/users", {
        method: "POST",
        body: createForm,
      });
      setNotice(`Usuario "${created.name}" (${created.username}) creado con éxito.`);
      setShowCreate(false);
      setCreateForm({ username: "", name: "", role: "staff", password: "" });
      await loadUsers();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyCreate(false);
    }
  }

  async function handlePasswordChange(e) {
    e.preventDefault();
    if (!passTarget || busyPass) return;
    setBusyPass(true);
    setError("");
    setNotice("");
    try {
      await request(`/users/${passTarget.id}`, {
        method: "PUT",
        body: { password: newPassword },
      });
      setNotice(
        `Contraseña de "${passTarget.name}" actualizada. Se cerraron las sesiones abiertas en otros dispositivos.`
      );
      setPassTarget(null);
      setNewPassword("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyPass(false);
    }
  }

  async function handleEditSave(e) {
    e.preventDefault();
    if (!editTarget || busyEdit) return;
    setBusyEdit(true);
    setError("");
    setNotice("");
    try {
      const updated = await request(`/users/${editTarget.id}`, {
        method: "PUT",
        body: editForm,
      });
      setNotice(`Datos de "${updated.name}" actualizados correctamente.`);
      setEditTarget(null);
      await loadUsers();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyEdit(false);
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 64px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Shield size={14} /> SEGURIDAD Y CONTROL DE ACCESOS
          </span>
          <h1 style={{ margin: "4px 0 6px" }}>Usuarios y Contraseñas</h1>
          <p style={{ margin: 0, color: "#5c4938", maxWidth: 620 }}>
            Administrá las cuentas del local. Solo los usuarios con rol{" "}
            <strong>Dueña / Administrador</strong> pueden ver el módulo de{" "}
            <strong>Ventas</strong>, <strong>Gestionar carta</strong> y esta pantalla.
          </p>
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setError("");
            setCreateForm({ username: "", name: "", role: "staff", password: "" });
            setShowCreate(true);
          }}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          <UserPlus size={17} /> Nuevo usuario / Administrador
        </button>
      </div>

      {/* Explicación clara de permisos por rol */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: "#fffaf2",
            border: "1px solid #e6d5b8",
            borderRadius: 14,
            padding: "14px 16px",
          }}
        >
          <div style={{ fontWeight: 700, color: "#4a2c11", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            👑 Rol Dueña / Administrador
          </div>
          <p style={{ margin: 0, fontSize: 13.5, color: "#5c4938", lineHeight: 1.45 }}>
            Acceso total al sistema: <strong>Ventas y movimiento de dinero</strong>, reportes históricos, corrección de tickets, <strong>Gestionar carta</strong> y administración de contraseñas.
          </p>
        </div>
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #dce3ec",
            borderRadius: 14,
            padding: "14px 16px",
          }}
        >
          <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
            👤 Rol Personal / Mozas
          </div>
          <p style={{ margin: 0, fontSize: 13.5, color: "#475569", lineHeight: 1.45 }}>
            Acceso de trabajo diario: <strong>Salón, Cocina, Caja del turno, Stock y Carta</strong>.{" "}
            <strong style={{ color: "#b91c1c" }}>Sin acceso al módulo de Ventas.</strong>
          </p>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          style={{
            background: "#ecfdf5",
            border: "1px solid #34d399",
            color: "#065f46",
            padding: "12px 16px",
            borderRadius: 12,
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={18} />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <p className="alert" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </p>
      )}

      {loading ? (
        <p role="status">Cargando usuarios…</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {users.map((u) => {
            const isMe = u.id === s.user?.id;
            const isAdmin = u.role === "admin";
            return (
              <div
                key={u.id}
                style={{
                  background: "#ffffff",
                  border: isAdmin ? "1.5px solid #d9a94b" : "1px solid #e5ded4",
                  borderRadius: 16,
                  padding: "16px 20px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 16,
                  opacity: u.active ? 1 : 0.6,
                  boxShadow: "0 2px 10px rgba(43, 27, 16, 0.05)",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 18, color: "#2b1b10" }}>{u.name}</strong>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "3px 10px",
                        borderRadius: 999,
                        background: isAdmin ? "#fef3c7" : "#e2e8f0",
                        color: isAdmin ? "#92400e" : "#334155",
                        border: isAdmin ? "1px solid #f59e0b" : "1px solid #cbd5e1",
                      }}
                    >
                      {isAdmin ? "👑 Dueña / Administrador" : "👤 Personal / Mozas"}
                    </span>
                    {isMe && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#dcfce7",
                          color: "#166534",
                        }}
                      >
                        Sesión actual
                      </span>
                    )}
                    {!u.active && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "#fee2e2",
                          color: "#991b1b",
                        }}
                      >
                        Desactivado
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13.5, color: "#6b5a48" }}>
                    Usuario para iniciar sesión:{" "}
                    <code
                      style={{
                        background: "#f5efe6",
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontWeight: 700,
                        color: "#3b2417",
                      }}
                    >
                      {u.username}
                    </code>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setNewPassword("");
                      setShowNewPass(false);
                      setPassTarget(u);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid #d9a94b",
                      background: "#fffaf0",
                      color: "#4a2c11",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <KeyRound size={15} /> Cambiar contraseña
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setEditForm({
                        username: u.username,
                        name: u.name,
                        role: u.role,
                        active: u.active,
                      });
                      setEditTarget(u);
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 10,
                      border: "1px solid #d6cec2",
                      background: "#ffffff",
                      color: "#3b2417",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <Edit3 size={15} /> Editar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Cambiar contraseña */}
      {passTarget && (
        <Modal
          title={`Cambiar contraseña de ${passTarget.name}`}
          onClose={() => setPassTarget(null)}
        >
          <form onSubmit={handlePasswordChange} style={{ display: "grid", gap: 14 }}>
            <p style={{ margin: 0, fontSize: 13.5, color: "#5c4938" }}>
              Usuario de ingreso: <strong>{passTarget.username}</strong>. Al guardar la nueva contraseña, cualquier otro celular o computadora que tenga abierta esta cuenta deberá volver a iniciar sesión.
            </p>
            <label>
              Nueva contraseña (mínimo 4 caracteres)
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showNewPass ? "text" : "password"}
                  required
                  minLength={4}
                  autoFocus
                  placeholder="Escribí la nueva contraseña..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ width: "100%", paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass((v) => !v)}
                  title={showNewPass ? "Ocultar" : "Mostrar"}
                  style={{
                    position: "absolute",
                    right: 8,
                    background: "transparent",
                    border: 0,
                    cursor: "pointer",
                    color: "#6b5a48",
                    padding: 4,
                  }}
                >
                  {showNewPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
              <button type="button" onClick={() => setPassTarget(null)}>
                Cancelar
              </button>
              <button type="submit" className="primary" disabled={busyPass || newPassword.trim().length < 4}>
                {busyPass ? "Guardando…" : "Guardar contraseña"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Editar usuario */}
      {editTarget && (
        <Modal
          title={`Editar usuario: ${editTarget.name}`}
          onClose={() => setEditTarget(null)}
        >
          <form onSubmit={handleEditSave} style={{ display: "grid", gap: 14 }}>
            <label>
              Nombre visible (ej. Mozas, Dueña, Turno Tarde)
              <input
                type="text"
                required
                minLength={2}
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </label>
            <label>
              Usuario para iniciar sesión (sin espacios)
              <input
                type="text"
                required
                minLength={2}
                value={editForm.username}
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
              />
            </label>
            <label>
              Rol y nivel de acceso
              <select
                value={editForm.role}
                disabled={editTarget.id === s.user?.id}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              >
                <option value="staff">👤 Personal / Mozas (Sin acceso a Ventas)</option>
                <option value="admin">👑 Dueña / Administrador (Acceso total a Ventas y Carta)</option>
              </select>
            </label>
            {editTarget.id !== s.user?.id && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={editForm.active}
                  onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                />
                Cuenta activa (puede iniciar sesión)
              </label>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
              <button type="button" onClick={() => setEditTarget(null)}>
                Cancelar
              </button>
              <button type="submit" className="primary" disabled={busyEdit}>
                {busyEdit ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Crear nuevo usuario */}
      {showCreate && (
        <Modal
          title="Nuevo usuario o Administrador"
          onClose={() => setShowCreate(false)}
        >
          <form onSubmit={handleCreate} style={{ display: "grid", gap: 14 }}>
            <label>
              Rol y permisos
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
              >
                <option value="staff">👤 Personal / Mozas (Sin acceso a Ventas)</option>
                <option value="admin">👑 Dueña / Administrador (Acceso total a Ventas y Carta)</option>
              </select>
            </label>
            <label>
              Nombre visible (ej. Nani, Mozas, Franco)
              <input
                type="text"
                required
                minLength={2}
                placeholder="Ej: Dueña / Mozas"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              />
            </label>
            <label>
              Nombre de usuario para ingresar
              <input
                type="text"
                required
                minLength={2}
                placeholder="Ej: nani o mozas"
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              />
            </label>
            <label>
              Contraseña (mínimo 4 caracteres)
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                  type={showCreatePass ? "text" : "password"}
                  required
                  minLength={4}
                  placeholder="Escribí la contraseña..."
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  style={{ width: "100%", paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowCreatePass((v) => !v)}
                  title={showCreatePass ? "Ocultar" : "Mostrar"}
                  style={{
                    position: "absolute",
                    right: 8,
                    background: "transparent",
                    border: 0,
                    cursor: "pointer",
                    color: "#6b5a48",
                    padding: 4,
                  }}
                >
                  {showCreatePass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
              <button type="button" onClick={() => setShowCreate(false)}>
                Cancelar
              </button>
              <button type="submit" className="primary" disabled={busyCreate}>
                {busyCreate ? "Creando…" : "Crear usuario"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
