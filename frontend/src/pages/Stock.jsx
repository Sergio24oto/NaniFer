import React, { useEffect, useRef, useState } from "react";
import { useStore, request, submitOnce, pendingOperation } from "../store";
import { Modal, Badge } from "../components";
import { money } from "../domain";
const labels = {
  receive: "Ingresar mercadería",
  count: "Ajustar por conteo",
  out: "Salida sin venta",
  open: "Abrir recipiente",
  finish: "Terminar recipiente",
  rename: "Cambiar nombre"
};
const today = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Argentina/Buenos_Aires'
}).format(new Date());
const stamp = x => new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  dateStyle: 'short',
  timeStyle: 'short'
}).format(new Date(x));
function DownloadReport({
  filters,
  disabled,
  onError
}) {
  const [busy, setBusy] = useState(false);
  return <button className="secondary" disabled={disabled || busy} onClick={async () => {
    setBusy(true);
    try {
      const blob = await request('/stock/export.pdf?' + new URLSearchParams(filters), {
        asBlob: true
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'NaniFer-existencias.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }}>{busy ? 'Generando…' : 'Descargar PDF'}</button>;
}
function Configure({
  row,
  cones,
  onClose,
  onSaved
}) {
  const s = useStore();
  const scope = 'stock-config-' + row.id;
  const pending = pendingOperation(scope);
  const [mode, setMode] = useState(pending?.body.mode || row.mode);
  const [unit, setUnit] = useState(pending?.body.unit || (row.unit === 'porciones' ? 'porciones' : 'unidades'));
  const [available, setAvailable] = useState(pending?.body.available ?? row.manualAvailable);
  const [links, setLinks] = useState(pending?.body.coneLinks || row.coneLinks || {});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const lock = useRef(false);
  async function save(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const path = row.flavorId ? '/stock/flavors/' + row.flavorId + '/configure' : '/stock/products/' + row.productId + '/configure';
      await submitOnce(scope, path, row.flavorId ? {
        available
      } : {
        mode,
        unit,
        available,
        coneLinks: links
      });
      onSaved('Configuración guardada.');
    } catch (e) {
      setError(e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return <Modal title={'Configurar · ' + row.name} onClose={onClose}><form onSubmit={save}>
    <p>Los cambios se aplican a nuevos pedidos. No se descuentan pedidos históricos ni se cambia el precio de venta.</p>
    {error && <p className="alert" role="alert">{error}</p>}{pending && <p className="note">Reintentá la misma configuración pendiente.</p>}
    <fieldset disabled={busy || !!pending}><legend>Control y disponibilidad</legend>
      {!row.flavorId && <><label>Modalidad<select value={mode} onChange={e => setMode(e.target.value)}><option value="manual">Disponibilidad manual · sin conteo</option><option value="unit">Stock por unidad</option></select></label>{mode === 'unit' && <label>Unidad de control<select value={unit} onChange={e => setUnit(e.target.value)}><option value="unidades">Unidades</option><option value="porciones">Porciones de torta</option></select></label>}</>}
      <label className="option"><input type="checkbox" checked={available} onChange={e => setAvailable(e.target.checked)} />Habilitar venta {row.flavorId ? 'de este sabor' : ''}</label>
      {row.flavorId ? <p>Los recipientes se cuentan aparte. Abrir o terminar uno no cambia esta disponibilidad manual.</p> : <details><summary>Cucurucho utilizado · solo para presentaciones de helado</summary><p>Una unidad consume un cucurucho. No se agrega otro precio a la venta.</p>{(row.sizes.length ? row.sizes : ['']).map(size => <label key={size}>{size || 'Presentación única'}<select value={links[size] || ''} onChange={e => {
              const value = e.target.value;
              setLinks(old => {
                const next = {
                  ...old
                };
                if (value) next[size] = value;else delete next[size];
                return next;
              });
            }}><option value="">No consume cucurucho</option>{cones.map(c => <option key={c.stockId} value={c.stockId}>{c.name}</option>)}</select></label>)}</details>}
    </fieldset>
    <p className="note">Al activar el conteo por primera vez, la existencia queda sin cargar. Después registrá la entrada real o el conteo inicial. No se asigna cero a los demás productos.</p>
    <button className="primary full" disabled={busy || !s.connected}>{busy ? 'Guardando…' : pending ? 'Reintentar configuración' : 'Guardar configuración'}</button>
  </form></Modal>;
}
function Movement({
  row,
  action,
  onClose,
  onSaved
}) {
  const s = useStore(),
    scope = 'stock-move-' + row.stockId,
    pending = pendingOperation(scope);
  const [body, setBody] = useState(pending?.body || {
    action,
    quantity: action === 'open' || action === 'finish' ? 1 : 0,
    bucket: 'closed',
    expectedVersion: row.version,
    reason: '',
    outReason: 'otro',
    supplierId: null,
    unitCost: null,
    totalCost: null,
    name: row.name
  });
  const [suppliers, setSuppliers] = useState([]),
    [supplierName, setSupplierName] = useState(''),
    [contact, setContact] = useState('');
  const [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    request('/stock/suppliers').then(x => {
      if (live) setSuppliers(x);
    }).catch(e => {
      if (live) setError(e.message);
    });
    return () => {
      live = false;
    };
  }, []);
  function patch(p) {
    setPreview(null);
    setBody(x => ({
      ...x,
      ...p
    }));
  }
  async function run(fn) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return <Modal title={labels[body.action] + ' · ' + row.name} onClose={onClose}>
    <p>Registrado: {row.quantity == null ? 'sin carga inicial' : row.quantity + ' ' + row.unit}{row.mode === 'containers' ? ' cerrados · ' + row.opened + ' abiertos' : ''}.</p>
    {error && <p className="alert" role="alert">{error}</p>}{pending && <p className="note">Hay una operación sin confirmar. Se reintentará con los mismos datos.</p>}
    <form onSubmit={e => {
      e.preventDefault();
      run(async () => setPreview(await request('/stock/items/' + row.stockId + '/preview', {
        method: 'POST',
        body
      })));
    }}>
      <fieldset disabled={busy || !!pending || !!preview}><legend>Datos del movimiento</legend>
        {body.action === 'rename' ? <label>Nombre del cucurucho<input required maxLength={150} value={body.name} onChange={e => patch({
            name: e.target.value
          })} /></label> : <label>{body.action === 'count' ? 'Cantidad física contada' : body.action === 'receive' && row.unit === 'porciones' ? 'Total de porciones incorporadas' : 'Cantidad'}<input type="number" min={body.action === 'count' ? 0 : 1} max="1000000000" step="1" required value={body.quantity} onChange={e => patch({
            quantity: Number(e.target.value)
          })} /></label>}
        {row.mode === 'containers' && ['count', 'out'].includes(body.action) && <label>Afecta a<select value={body.bucket} onChange={e => patch({
            bucket: e.target.value
          })}><option value="closed">Recipientes cerrados</option><option value="opened">Recipientes abiertos</option></select></label>}
        {body.action === 'receive' && <><label>Proveedor<select required value={body.supplierId || ''} onChange={e => patch({
              supplierId: e.target.value
            })}><option value="">Seleccionar proveedor</option>{suppliers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><details><summary>Crear proveedor</summary><label>Nombre del proveedor<input maxLength={150} value={supplierName} onChange={e => setSupplierName(e.target.value)} /></label><label>Contacto opcional<input maxLength={200} value={contact} onChange={e => setContact(e.target.value)} /></label><button type="button" className="secondary" disabled={!supplierName.trim()} onClick={() => run(async () => {
              const p = await submitOnce('supplier-' + s.user.id, '/stock/suppliers', {
                name: supplierName,
                contact
              });
              setSuppliers(await request('/stock/suppliers'));
              patch({
                supplierId: p.id
              });
              setSupplierName('');
              setContact('');
            })}>Guardar proveedor</button></details>
          <label>{row.unit === 'porciones' ? 'Costo total de las tortas recibidas ($)' : 'Costo unitario de compra ($)'}<input type="number" min="0" step={row.unit === 'porciones' ? '0.01' : '0.000001'} required value={(row.unit === 'porciones' ? body.totalCost : body.unitCost) ?? ''} onChange={e => patch(row.unit === 'porciones' ? {
              totalCost: e.target.value,
              unitCost: null
            } : {
              unitCost: e.target.value,
              totalCost: null
            })} /></label><p>La compra suma la cantidad recibida. El total y el costo por porción se calculan al revisar.</p></>}
        {body.action === 'out' && <label>Tipo de salida<select value={body.outReason} onChange={e => patch({
            outReason: e.target.value
          })}><option value="rotura">Rotura</option><option value="vencimiento">Vencimiento</option><option value="regalo">Regalo</option><option value="personal">Consumo del personal</option><option value="otro">Otro motivo</option></select></label>}
        {body.action !== 'rename' && <label>{['out', 'count'].includes(body.action) ? 'Motivo obligatorio' : 'Nota opcional'}<textarea required={['out', 'count'].includes(body.action)} maxLength={450} value={body.reason} onChange={e => patch({
            reason: e.target.value
          })} /></label>}
      </fieldset>
      {!preview && !pending && <button className="primary full" disabled={busy || !s.connected}>{busy ? 'Revisando…' : 'Revisar antes de confirmar'}</button>}
    </form>
    {preview && <div className="note"><strong>Antes y después</strong><p>{preview.before ?? 'Sin carga'} → {body.action === 'rename' ? row.quantity ?? 'Sin carga' : preview.after} {row.unit}{body.action !== 'rename' ? ' · diferencia ' + (preview.difference > 0 ? '+' : '') + preview.difference : ''}</p>{row.mode === 'containers' && <p>Abiertos: {preview.openedBefore} → {preview.openedAfter}</p>}{preview.totalCost != null && <><p>Total de compra: <strong>{money(preview.totalCost)}</strong></p><p>Costo por {row.unit === 'porciones' ? 'porción' : 'unidad'}: {new Intl.NumberFormat('es-AR', {
            maximumFractionDigits: 6
          }).format(Number(preview.unitCost))}</p></>}<button className="secondary" disabled={busy} onClick={() => setPreview(null)}>Volver a editar</button></div>}
    {(preview || pending) && <button className="primary full" disabled={busy || !s.connected} onClick={() => run(async () => {
      await submitOnce(scope, '/stock/items/' + row.stockId + '/movements', body);
      onSaved('Movimiento guardado.');
    })}>{busy ? 'Guardando…' : pending ? 'Reintentar la misma operación' : 'Confirmar movimiento'}</button>}
  </Modal>;
}
function History({
  row,
  onClose
}) {
  const [start, setStart] = useState(today()),
    [end, setEnd] = useState(today()),
    [rows, setRows] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return <Modal title={'Historial · ' + row.name} onClose={onClose}><form onSubmit={async e => {
      e.preventDefault();
      setBusy(true);
      setError('');
      try {
        setRows(await request('/stock/items/' + row.stockId + '/history?' + new URLSearchParams({
          start,
          end
        })));
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }}><div className="stock-filters"><label>Desde<input type="date" required value={start} onInput={e => setStart(e.currentTarget.value)} /></label><label>Hasta<input type="date" required value={end} onInput={e => setEnd(e.currentTarget.value)} /></label><button className="primary" disabled={busy}>{busy ? 'Consultando…' : 'Consultar'}</button></div></form><small>Fechas reales de Argentina. Hasta 366 días por consulta; se conserva todo el historial.</small>{error && <p className="alert" role="alert">{error}</p>}{rows?.length === 0 && <p>Sin movimientos en este período.</p>}{rows?.map(r => <article className="stock-history" key={r.id}><strong>{labels[r.kind] || {
          order: 'Pedido',
          correction_return: 'Corrección: reposición',
          correction_out: 'Corrección: consumo',
          correction_no_return: 'Corrección: sin reposición'
        }[r.kind] || r.kind}</strong><p>{stamp(r.createdAt)} · {r.user}</p><p>{r.before ?? 'Sin carga'} → {r.after} {row.unit}{row.mode === 'containers' ? ' · abiertos: ' + r.openedBefore + ' → ' + r.openedAfter : ''}</p>{r.supplier && <p>Proveedor: {r.supplier} · Costo unitario: {Number(r.unitCost).toLocaleString('es-AR', {
          maximumFractionDigits: 6
        })} · Total: {money(r.totalCost)}</p>}{r.note && <p>{r.note}</p>}{r.orderItemId && <small>Línea de pedido: {r.orderItemId}</small>}{r.correctionId && <small>Corrección: {r.correctionId}</small>}</article>)}</Modal>;
}
export default function Stock() {
  const s = useStore(),
    isAdmin = s.user?.role === 'admin';
  const [items, setItems] = useState([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [mode, setMode] = useState(''),
    [modal, setModal] = useState(null);
  const [pickSearch,setPickSearch] = useState("");
  const generation = useRef(0);
  async function load() {
    const g = ++generation.current;
    try {
      const data = await request('/stock');
      if (g === generation.current) {
        setItems(data.items);
        setLoaded(true);
        setError('');
      }
    } catch (e) {
      if (g === generation.current) setError(e.message);
    }
  }
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 4000);
    return () => {
      clearInterval(id);
      generation.current++;
    };
  }, []);
  const filtered = items.filter(r => (!search || r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && (!category || r.category === category) && (!mode || r.mode === mode));
  const cones = items.filter(r => r.kind === 'cone');
  async function saved(text) {
    setModal(null);
    setMessage(text);
    await load();
  }
  function openAction(row, action) { setMessage(''); setModal({row, action}); }
  function actions(row) {
    return isAdmin && <div className="stock-actions">
      {row.stockId && row.mode !== 'manual' && <button className="primary" disabled={!s.connected} onClick={() => openAction(row, 'receive')}>+ Agregar stock</button>}
      <button className="secondary" disabled={!s.connected} onClick={() => openAction(row, 'manage')}>Gestionar stock</button>
    </div>;
  }
  return <main className="stock-page"><div className="page-heading"><div className="intro"><span className="eyebrow">EXISTENCIAS</span><h1>Stock</h1>{isAdmin && <button className="primary" disabled={!loaded || !s.connected} onClick={()=>{setPickSearch("");setModal({action:"pick"});}}>+ Agregar stock</button>}<p>{isAdmin ? 'Entradas, conteos y disponibilidad del local.' : 'Consulta de cantidades y disponibilidad.'}</p></div>{isAdmin && <DownloadReport filters={{
        search,
        category,
        mode
      }} disabled={!loaded || !s.connected || !!error} onError={setError} />}</div>
    {error && <p className="alert" role="alert">{error}<button onClick={() => void load()}>Reintentar</button></p>}{message && <p className="success" role="status">{message}</p>}
    <div className="stock-filters"><label>Buscar<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Producto, insumo o sabor" /></label><label>Categoría<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas</option>{[...new Set(items.map(r => r.category))].map(c => <option key={c}>{c}</option>)}</select></label><label>Modalidad<select value={mode} onChange={e => setMode(e.target.value)}><option value="">Todas</option><option value="unit">Por unidad</option><option value="containers">Recipientes de helado</option><option value="manual">Disponibilidad manual</option></select></label></div>
    {!loaded && !error && <p role="status">Consultando existencias…</p>}{loaded && !filtered.length && <p>No hay productos con estos filtros.</p>}
    {['unit', 'containers', 'manual'].map(group => {
      const rows = filtered.filter(r => r.mode === group);
      return rows.length > 0 && <section className="panel stock-section" key={group}><h2>{{
            unit: 'Stock por unidad',
            containers: 'Helados · recipientes por sabor',
            manual: 'Disponibilidad manual'
          }[group]}</h2>{group === 'containers' && <p>Vender helado no descuenta recipientes. La disponibilidad del sabor se decide manualmente.</p>}<div className="sales-table-scroll"><table className="sales-table"><thead><tr><th>{group === 'containers' ? 'Sabor' : 'Producto / insumo'}</th>{group !== 'containers' && <th>Categoría</th>}{group === 'unit' && <th>Existencia</th>}{group === 'containers' && <><th>Cerrados</th><th>Abiertos</th></>}<th>Estado de venta</th>{isAdmin && <th>Gestión</th>}</tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><strong>{r.name}</strong></td>{group !== 'containers' && <td>{r.category}</td>}{group === 'unit' && <td>{r.quantity == null ? 'Sin carga inicial' : r.quantity + ' ' + r.unit}</td>}{group === 'containers' && <><td>{r.quantity ?? 'Sin carga inicial'}</td><td>{r.opened}</td></>}<td><Badge tone={r.available ? 'green' : 'amber'}>{r.available ? 'Disponible' : 'Agotado / no habilitado'}</Badge></td>{isAdmin && <td>{actions(r)}</td>}</tr>)}</tbody></table></div></section>;
    })}
    {isAdmin && <p className="note">Primero configurá qué productos se controlan por unidad. Después cargá la entrada o el conteo inicial. Una entrada suma; un conteo establece la cantidad física y conserva la diferencia.</p>}
    {modal?.action === 'pick' && <Modal title="Agregar stock" onClose={()=>setModal(null)}><p>Buscá el producto o insumo. Si todavía no tiene control de stock, primero elegí cómo se cuenta.</p><label>Buscar producto o insumo<input type="search" value={pickSearch} onChange={e=>setPickSearch(e.target.value)} autoFocus /></label><div className="stock-management">{items.filter(r=>r.name.toLocaleLowerCase().includes(pickSearch.toLocaleLowerCase())).map(row=><button key={row.id} className="secondary" disabled={!s.connected} onClick={()=>openAction(row,row.stockId&&row.mode!=='manual'?'receive':'configure')}>{row.name} · {row.stockId&&row.mode!=='manual'?'Agregar mercadería':'Configurar stock'}</button>)}</div><p>¿Es un producto nuevo? <a href="/atencion/carta">Crearlo en Gestionar carta</a> y después cargar sus existencias.</p></Modal>}
    {modal?.action === 'manage' && <Modal title={'Gestionar stock · ' + modal.row.name} onClose={() => setModal(null)}><p>Elegí la acción que necesitás.</p><div className="stock-management">{[
      ...(modal.row.productId || modal.row.flavorId ? [['configure', 'Configurar stock y disponibilidad']] : []),
      ...(modal.row.stockId && modal.row.mode !== 'manual' ? [['receive', '+ Agregar stock'], ['count', 'Ajustar por conteo'], ['out', 'Registrar salida sin venta']] : []),
      ...(modal.row.stockId && modal.row.mode === 'containers' ? [['open', 'Abrir recipiente'], ['finish', 'Terminar recipiente']] : []),
      ...(modal.row.kind === 'cone' ? [['rename', 'Cambiar nombre']] : []),
      ...(modal.row.stockId ? [['history', 'Ver historial']] : [])
    ].map(([action, label]) => <button key={action} className={action === 'receive' ? 'primary' : 'secondary'} disabled={!s.connected} onClick={() => openAction(modal.row, action)}>{label}</button>)}</div></Modal>}
    {modal?.action === 'configure' && <Configure row={modal.row} cones={cones} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.action === 'history' && <History row={modal.row} onClose={() => setModal(null)} />}
    {modal && labels[modal.action] && <Movement row={modal.row} action={modal.action} onClose={() => setModal(null)} onSaved={saved} />}
  </main>;
}
