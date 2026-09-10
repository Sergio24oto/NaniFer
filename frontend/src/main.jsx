import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { LayoutGrid, ClipboardList, Coffee, ReceiptText } from "lucide-react";
import { useStore, configure, refresh, login, logout } from "./store";
import Menu from "./pages/DigitalMenu";
import MenuManagement from "./pages/MenuManagement";
import "./digital-menu.css";
import Sales from "./pages/Sales";
import Counter from "./pages/Counter";
import Stock from "./pages/Stock";
import "./stock.css";
import "./sales.css";
import { Salon, Account, Kitchen } from "./pages/Staff";
import "./style.css";
import "./brand.css";
import "./attention.css";
import Brand from "./Brand";
function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="login brand-login">
      <div className="login-photo">
        <img
          src="/brand/interior.jpg"
          alt="El salón de NaniFer, con mesas y sillas turquesa"
        />
        <div>
          <span>BIENVENIDOS A NANIFER</span>
          <h2>
            Todo listo para
            <br />
            un lindo día.
          </h2>
        </div>
      </div>
      <div className="panel">
        <Brand />
        <span className="eyebrow">ESPACIO DEL PERSONAL</span>
        <h1>Iniciar sesión</h1>
        <p>Acceso a mesas, pedidos y cobros.</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await login(username, password);
              setPassword("");
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Usuario
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="note" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </main>
  );
}
function App() {
  const s = useStore();
  const [path, setPath] = useState(location.pathname);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const publicView = path.startsWith("/mesa");
  const m = path.match(/^\/mesa\/(\d+)\/?$/);
  const table = m ? Number(m[1]) : null;
  const valid = table >= 1 && table <= 15;
  const accountMatch = path.match(/^\/(?:atencion\/mesas|salon)\/(\d+)\/?$/);
  const accountTable = accountMatch ? Number(accountMatch[1]) : null;
  const kitchen = path === "/atencion/comandera" || path === "/comandera";
  useEffect(() => {
    const handler = () => setPath(location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  useEffect(
    () =>
      configure(
        publicView ? "public" : "staff",
        publicView && valid ? table : null,
      ),
    [publicView, table, valid],
  );
  function nav(p, confirmation = "") {
    setMessage(confirmation);
    history.pushState({}, "", p);
    setPath(p);
    window.scrollTo(0, 0);
  }
  const ready = s.orders.filter(
    (o) => o.status === "listo para entregar",
  ).length;
  return (
    <>
      <header>
        <a
          className="brand"
          href={publicView ? "/mesa/" + (table || "") : "/atencion"}
          onClick={(e) => {
            e.preventDefault();
            nav(publicView ? "/mesa/" + (table || "") : "/atencion");
          }}
        >
          <Brand />
        </a>
        {!publicView && (
          <nav>
            {[
              ["/atencion", "Salón", LayoutGrid],
              ["/atencion/ventas", "Ventas", ReceiptText],
              ["/atencion/stock", "Stock", LayoutGrid],
              ["/mesa/1", "Carta", Coffee],
              ...(s.user?.role === "admin" ? [["/atencion/carta", "Gestionar carta", Coffee]] : []),
            ].map(([p, label, Icon]) => (
              <button
                key={p}
                className={path === p ? "active" : ""}
                onClick={() => nav(p)}
              >
                <Icon size={17} />
                {label}
                {p.includes("comandera") && ready > 0 && <i>{ready}</i>}
              </button>
            ))}
          </nav>
        )}
        <span className="demo">Desarrollo · catálogo provisional</span>
        {!publicView && s.user && (
          <button
            className="text-button"
            onClick={async () => {
              try {
                await logout();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            {s.user.name} · Salir
          </button>
        )}
      </header>
      {s.connected === false && (
        <div className="alert" role="alert">
          Sin conexión con el servidor. Los datos pueden estar desactualizados;
          no se confirmarán operaciones sin respuesta.
          <button onClick={() => void refresh()}>Reintentar</button>
        </div>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {s.loading ? (
        <main>
          <p role="status">Consultando al servidor…</p>
        </main>
      ) : publicView ? (
        valid ? (
          <Menu key={table} table={table} />
        ) : (
          <main><h1>Enlace de mesa inválido</h1><p>Escaneá el QR de tu mesa o consultá a la moza.</p></main>
        )
      ) : !s.user ? (
        <Login />
      ) : path === "/atencion/carta" && s.user.role === "admin" ? (<MenuManagement />) : path === "/atencion/ventas" ? (
        <Sales />
      ) : path === "/atencion/stock" ? (
        <Stock />
      ) : path === "/atencion/mostrador" ? (
        <Counter nav={nav} />
      ) : kitchen ? (
        <Kitchen />
      ) : accountTable >= 1 && accountTable <= 15 ? (
        <Account key={accountTable} table={accountTable} nav={nav} />
      ) : (
        <Salon nav={nav} message={message} />
      )}
      <footer>
        <span>NaniFer · Aplicación en desarrollo</span>
        <span>
          {s.connected
            ? "Conectado · actualización automática cada 4 s"
            : "Servidor no disponible"}
        </span>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
