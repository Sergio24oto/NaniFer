import React, { useEffect, useRef, useState } from "react";
import { useStore, request, submitOnce, pendingOperation, refresh } from "../store";
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
function NewFlavor({onClose,onSaved}){
 const s=useStore(),scope='flavor-create-'+s.user.id,pending=pendingOperation(scope);
 const [name,setName]=useState(pending?.body.name||''),[available,setAvailable]=useState(pending?.body.available??true),[busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
 return <Modal title="Agregar sabor de helado" onClose={()=>!busy&&onClose()}><form onSubmit={async e=>{e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await submitOnce(scope,'/stock/flavors',{name,available});onSaved('Sabor agregado correctamente. Ya podés gestionar su disponibilidad y recibir sus recipientes.');}catch(e){setError(e.message);}finally{lock.current=false;setBusy(false);}}}><p>El sabor se incorpora al catálogo compartido. Los recipientes se cargan después, sin inventar existencias.</p><fieldset disabled={busy||!!pending}><label>Nombre del sabor<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="Por ejemplo: chocolate con almendras"/></label><label className="option"><input type="checkbox" checked={available} onChange={e=>setAvailable(e.target.checked)}/>Disponible para elegir en los helados</label></fieldset>{error&&<p className="alert" role="alert">{error}</p>}{pending&&!busy&&<p className="note">El resultado aún no se confirmó. Reintentá con la misma operación.</p>}<button className="primary full" disabled={busy||!s.connected||!name.trim()}>{busy?'Guardando…':pending?'Reintentar de forma segura':'Agregar sabor'}</button></form></Modal>;
}

const PACKAGE_INFO = {
  caja: {
    label: "Caja",
    singular: "caja",
    plural: "cajas",
    packagesLabel: "Cantidad de cajas",
    unitsLabel: "Unidades por caja",
    unitsHint: "Ej: 24 chocolates, 12 alfajores",
    defaultUnits: 24
  },
  bolsa: {
    label: "Bolsa",
    singular: "bolsa",
    plural: "bolsas",
    packagesLabel: "Cantidad de bolsas",
    unitsLabel: "Unidades por bolsa",
    unitsHint: "Ej: 50 gomitas, 100 caramelos",
    defaultUnits: 50
  },
  pack: {
    label: "Pack",
    singular: "pack",
    plural: "packs",
    packagesLabel: "Cantidad de packs",
    unitsLabel: "Unidades por pack",
    unitsHint: "Ej: 6 latas o botellas",
    defaultUnits: 6
  },
  cajón: {
    label: "Cajón",
    singular: "cajón",
    plural: "cajones",
    packagesLabel: "Cantidad de cajones",
    unitsLabel: "Unidades por cajón",
    unitsHint: "Ej: 24 botellas retornables",
    defaultUnits: 24
  },
  unidades: {
    label: "Unidades sueltas",
    singular: "unidad",
    plural: "unidades",
    packagesLabel: "Cantidad de unidades sueltas",
    unitsLabel: "Unidades",
    unitsHint: "Unidades directas",
    defaultUnits: 1
  }
};

function NewStockProduct({ area, categories, onClose, onSaved }) {
  const s = useStore(),
    scope = "stock-product-create-" + s.user.id,
    pending = pendingOperation(scope);

  const matchingCats = (categories || []).filter(c => {
    if (!area) return true;
    if (c.stockArea === area) return true;
    if (area === "beverages" && c.name?.toLowerCase().includes("bebida")) return true;
    if (area === "kiosk" && (c.name?.toLowerCase().includes("kiosco") || c.name?.toLowerCase().includes("quiosco"))) return true;
    if (area === "candies" && (c.name?.toLowerCase().includes("golosina") || c.name?.toLowerCase().includes("caramelo") || c.name?.toLowerCase().includes("chicle") || c.name?.toLowerCase().includes("gomita"))) return true;
    return false;
  });
  const defaultCatName = area === "beverages" ? "Bebidas" : area === "kiosk" ? "Kiosco" : area === "candies" ? "Golosinas" : "";
  const defaultCatId = matchingCats[0]?.id || "__new__";

  const defaultPackageType = area === "beverages" ? "pack" : area === "candies" ? "bolsa" : "caja";
  const availablePackageTypes = area === "beverages"
    ? ["pack", "cajón", "caja", "unidades"]
    : area === "candies"
    ? ["bolsa", "caja", "pack", "unidades"]
    : ["caja", "bolsa", "pack", "unidades"];

  const [name, setName] = useState(pending?.body.name || "");
  const [categoryId, setCategoryId] = useState(pending?.body.categoryId || defaultCatId);
  const [categoryName, setCategoryName] = useState(pending?.body.categoryName || (defaultCatId === "__new__" ? defaultCatName : ""));
  const [price, setPrice] = useState(pending?.body.price ?? "");
  const [packageType, setPackageType] = useState(pending?.body.packageType || defaultPackageType);
  const [packages, setPackages] = useState(pending?.body.packages ?? 1);
  const [unitsPerPackage, setUnitsPerPackage] = useState(
    pending?.body.unitsPerPackage ?? (PACKAGE_INFO[packageType]?.defaultUnits || 12)
  );
  const [initialStock, setInitialStock] = useState(pending?.body.initialStock ?? true);
  const [receivedDate, setReceivedDate] = useState(pending?.body.receivedDate || today());
  const [supplierId, setSupplierId] = useState(pending?.body.supplierId || "");
  const [totalCost, setTotalCost] = useState(pending?.body.totalCost ?? "");
  const [available, setAvailable] = useState(pending?.body.available ?? true);

  const [suppliers, setSuppliers] = useState([]);
  const [supplierName, setSupplierName] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  useEffect(() => {
    let live = true;
    request("/stock/suppliers")
      .then(x => { if (live) setSuppliers(x); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  function handlePackageTypeChange(newType) {
    setPackageType(newType);
    setUnitsPerPackage(PACKAGE_INFO[newType]?.defaultUnits ?? 12);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const body = {
        name: name.trim(),
        categoryId: categoryId === "__new__" ? null : categoryId,
        categoryName: categoryId === "__new__" ? categoryName.trim() : null,
        area: area || null,
        price: price === "" || price == null ? null : Number(price),
        available,
        initialStock,
        packageType,
        packages: Number(packages),
        unitsPerPackage: packageType === "unidades" ? 1 : Number(unitsPerPackage),
        receivedDate: initialStock ? receivedDate : null,
        supplierId: initialStock && supplierId ? supplierId : null,
        totalCost: initialStock && totalCost !== "" && totalCost != null ? Number(totalCost) : null
      };
      const result = await submitOnce(scope, "/stock/products", body);
      const pkgInfo = PACKAGE_INFO[packageType] || PACKAGE_INFO.caja;
      const unitsCount = body.packages * (packageType === "unidades" ? 1 : body.unitsPerPackage);
      const unitsText = initialStock ? ` con ${body.packages} ${body.packages === 1 ? pkgInfo.singular : pkgInfo.plural} (${unitsCount} unidades en stock)` : "";
      onSaved(`Producto "${result.name}" agregado a ${area === "beverages" ? "Bebidas" : area === "kiosk" ? "Kiosco" : area === "candies" ? "Golosinas" : "Stock"}${unitsText}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const pkgInfo = PACKAGE_INFO[packageType] || PACKAGE_INFO.caja;
  const totalUnits = packages * (packageType === "unidades" ? 1 : unitsPerPackage);
  const unitCostCalc = totalCost && totalUnits > 0 ? (Number(totalCost) / totalUnits) : null;
  const title = area === "beverages" ? "Agregar bebida" : area === "kiosk" ? "Agregar producto de kiosco" : area === "candies" ? "Agregar golosina" : "Agregar producto con stock";

  return (
    <Modal title={title} onClose={() => !busy && onClose()}>
      <form onSubmit={handleSubmit}>
        <p>
          {area === "beverages"
            ? "Cargá la bebida para incorporarla a la carta y registrar su ingreso inicial (pack, cajón, etc.)."
            : area === "kiosk"
            ? "Cargá el artículo de kiosco para incorporarlo a la carta y controlar sus existencias por unidad."
            : area === "candies"
            ? "Cargá la golosina para incorporarla a la carta y controlar sus existencias por bolsa, caja, pack o unidad."
            : "Cargá el producto para incorporarlo a la carta y controlar sus existencias por unidad."}
        </p>

        <fieldset disabled={busy || !!pending} className="catalog-fields">
          <label>
            Nombre del producto
            <input
              required
              maxLength={150}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={area === "beverages" ? "Ej: Sprite 500ml" : area === "kiosk" ? "Ej: Alfajor Havanna" : area === "candies" ? "Ej: Gomitas frutales, Chicles Beldent" : "Nombre del producto"}
              autoFocus
            />
          </label>

          <label>
            Categoría
            <select
              value={categoryId}
              onChange={e => {
                const val = e.target.value;
                setCategoryId(val);
                if (val === "__new__" && !categoryName) {
                  setCategoryName(defaultCatName);
                }
              }}
              required
            >
              {matchingCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new__">+ Crear nueva categoría {area === "beverages" ? "para Bebidas" : area === "kiosk" ? "para Kiosco" : area === "candies" ? "para Golosinas" : "en esta sección"}</option>
            </select>
          </label>

          {categoryId === "__new__" && (
            <label>
              Nombre de la nueva categoría
              <input
                required
                maxLength={100}
                value={categoryName}
                onChange={e => setCategoryName(e.target.value)}
                placeholder={area === "beverages" ? "Ej: Gaseosas" : area === "kiosk" ? "Ej: Chocolates" : area === "candies" ? "Ej: Gomitas y Chicles" : "Nombre de categoría"}
              />
            </label>
          )}

          <label>
            Precio de venta en carta ($) · opcional
            <input
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="Ej: 1800"
            />
          </label>

          <label className="option">
            <input
              type="checkbox"
              checked={available}
              onChange={e => setAvailable(e.target.checked)}
            />
            Habilitar venta inmediata en atención y carta
          </label>

          <div className="note" style={{ marginTop: 14 }}>
            <label className="option" style={{ fontWeight: 700, marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={initialStock}
                onChange={e => setInitialStock(e.target.checked)}
              />
              Registrar ingreso inicial de mercadería
            </label>

            {initialStock && (
              <>
                <label>
                  ¿Cómo llega la compra?
                  <select
                    value={packageType}
                    onChange={e => handlePackageTypeChange(e.target.value)}
                  >
                    {availablePackageTypes.map(x => (
                      <option key={x} value={x}>
                        {PACKAGE_INFO[x]?.label || x}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  {pkgInfo.packagesLabel}
                  <input
                    required
                    type="number"
                    min="1"
                    max="1000000"
                    value={packages}
                    onChange={e => setPackages(Number(e.target.value))}
                  />
                </label>

                {packageType !== "unidades" && (
                  <label>
                    {pkgInfo.unitsLabel}
                    <input
                      required
                      type="number"
                      min="1"
                      max="10000"
                      value={unitsPerPackage}
                      onChange={e => setUnitsPerPackage(Number(e.target.value))}
                    />
                    <small>{pkgInfo.unitsHint}</small>
                  </label>
                )}

                <p>
                  <strong>
                    {packageType === "unidades"
                      ? `${packages} ${packages === 1 ? "unidad" : "unidades"} en stock`
                      : `${packages} ${packages === 1 ? pkgInfo.singular : pkgInfo.plural} × ${unitsPerPackage} unidades = ${totalUnits} unidades en stock`}
                  </strong>
                </p>

                <label>
                  Fecha de recepción
                  <input
                    required
                    type="date"
                    value={receivedDate}
                    onChange={e => setReceivedDate(e.target.value)}
                  />
                </label>

                <label>
                  Proveedor (opcional)
                  <select
                    value={supplierId}
                    onChange={e => setSupplierId(e.target.value)}
                  >
                    <option value="">Sin proveedor asignado</option>
                    {suppliers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>

                <details>
                  <summary>Crear nuevo proveedor</summary>
                  <label>
                    Nombre del proveedor
                    <input
                      maxLength={150}
                      value={supplierName}
                      onChange={e => setSupplierName(e.target.value)}
                      placeholder="Ej: Distribuidora Quilmes"
                    />
                  </label>
                  <label>
                    Contacto opcional
                    <input
                      maxLength={200}
                      value={contact}
                      onChange={e => setContact(e.target.value)}
                      placeholder="Teléfono o dirección"
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!supplierName.trim()}
                    onClick={async () => {
                      try {
                        const p = await submitOnce("supplier-" + s.user.id, "/stock/suppliers", {
                          name: supplierName,
                          contact
                        });
                        const next = await request("/stock/suppliers");
                        setSuppliers(next);
                        setSupplierId(p.id);
                        setSupplierName("");
                        setContact("");
                      } catch (err) {
                        setError(err.message);
                      }
                    }}
                  >
                    Guardar proveedor
                  </button>
                </details>

                <label>
                  Costo total de la compra ($) · opcional
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalCost}
                    onChange={e => setTotalCost(e.target.value)}
                    placeholder="Costo total abonado"
                  />
                </label>
                {unitCostCalc != null && (
                  <p>
                    Costo calculado por unidad: <strong>${unitCostCalc.toFixed(2)}</strong>
                  </p>
                )}
              </>
            )}
          </div>
        </fieldset>

        {error && <p className="alert" role="alert">{error}</p>}
        {pending && !busy && <p className="note">Hay una operación pendiente de confirmación. Reintentá con los mismos datos.</p>}

        <button className="primary full" disabled={busy || !s.connected || !name.trim()}>
          {busy ? "Guardando…" : pending ? "Reintentar de forma segura" : (area === "beverages" ? "Agregar bebida y stock" : area === "kiosk" ? "Agregar producto y stock" : "Guardar producto")}
        </button>
      </form>
    </Modal>
  );
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
        coneLinks: mode === "manual" ? {} : links
      });
      onSaved('Configuración guardada.');
    } catch (e) {
      setError(e.uncertain ? e.message : "No se pudo guardar o consultar. Intentá nuevamente. " + e.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return <Modal title={'Configurar · ' + row.name} onClose={onClose}><form onSubmit={save}>
    <p>Los cambios se aplican a nuevos pedidos. No se descuentan pedidos históricos ni se cambia el precio de venta.</p>
    {error && <p className="alert" role="alert">{error}</p>}{pending && !busy && <p className="note">Reintentá la misma configuración pendiente.</p>}
    <fieldset disabled={busy || !!pending}><legend>Control y disponibilidad</legend>
      {!row.flavorId && <><label>Gestionar stock de este producto<select value={mode} onChange={e => setMode(e.target.value)}><option value="manual">No · disponibilidad manual</option><option value="unit">Sí · por unidad</option></select></label>{mode === 'unit' && <label>Unidad de control<select value={unit} onChange={e => setUnit(e.target.value)}><option value="unidades">Unidades</option><option value="porciones">Porciones de torta</option></select></label>}</>}
      <label className="option"><input type="checkbox" checked={available} onChange={e => setAvailable(e.target.checked)} />Habilitar venta {row.flavorId ? 'de este sabor' : ''}</label>
      {row.flavorId ? <p>Los recipientes se cuentan aparte. Abrir o terminar uno no cambia esta disponibilidad manual.</p> : row.coneEligible && <details><summary>Cucurucho utilizado · solo para presentaciones de helado</summary><p>Una unidad consume un cucurucho. No se agrega otro precio a la venta.</p>{(row.sizes.length ? row.sizes : ['']).map(size => <label key={size}>{size || 'Presentación única'}<select value={links[size] || ''} onChange={e => {
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
  const defaultPkg = (row.stockArea === 'beverages' || row.category?.toLowerCase().includes('bebida'))
    ? 'pack'
    : (row.stockArea === 'candies' || row.category?.toLowerCase().includes('golosina') || row.category?.toLowerCase().includes('caramelo') || row.category?.toLowerCase().includes('chicle') || row.category?.toLowerCase().includes('gomita'))
    ? 'bolsa'
    : 'caja';
  const availablePkgTypes = (row.stockArea === 'beverages' || row.category?.toLowerCase().includes('bebida'))
    ? ['pack', 'cajón', 'caja', 'unidades']
    : (row.stockArea === 'candies' || row.category?.toLowerCase().includes('golosina') || row.category?.toLowerCase().includes('caramelo') || row.category?.toLowerCase().includes('chicle') || row.category?.toLowerCase().includes('gomita'))
    ? ['bolsa', 'caja', 'pack', 'unidades']
    : ['caja', 'bolsa', 'pack', 'unidades'];

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
    name: row.name,
    ...(action==='receive' && row.mode!=='containers' && row.unit!=='porciones'
      ? {
          packageType: defaultPkg,
          packages: 1,
          unitsPerPackage: row.unitsPerPackage || PACKAGE_INFO[defaultPkg]?.defaultUnits || 12,
          receivedDate: today()
        }
      : {})
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
      if (live) setError(e.uncertain ? e.message : "No se pudo guardar o consultar. Intentá nuevamente. " + e.message);
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

  const movementPkgInfo = PACKAGE_INFO[body.packageType] || PACKAGE_INFO.caja;

  function handleMovementPkgChange(newType) {
    patch({
      packageType: newType,
      unitsPerPackage: newType === 'unidades' ? 1 : (PACKAGE_INFO[newType]?.defaultUnits || 12)
    });
  }

  async function run(fn) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.uncertain ? e.message : "No se pudo guardar o consultar. Intentá nuevamente. " + e.message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return <Modal title={labels[body.action] + ' · ' + row.name} onClose={onClose}>
    <p>Registrado: {row.quantity == null ? 'sin carga inicial' : row.quantity + ' ' + row.unit}{row.mode === 'containers' ? ' cerrados · ' + row.opened + ' abiertos' : ''}.</p>
    {error && <p className="alert" role="alert">{error}</p>}{pending && !busy && <p className="note">Hay una operación sin confirmar. Se reintentará con los mismos datos.</p>}
    <form onSubmit={e => {
      e.preventDefault();
      run(async () => setPreview(await request('/stock/items/' + row.stockId + '/preview', {
        method: 'POST',
        body
      })));
    }}>
      <fieldset disabled={busy || !!pending || !!preview}><legend>Datos del movimiento</legend>
        {body.action === 'rename' ? (
          <label>
            Nombre del cucurucho
            <input
              required
              maxLength={150}
              value={body.name}
              onChange={e => patch({ name: e.target.value })}
            />
          </label>
        ) : body.packageType ? (
          <>
            <label>
              ¿Cómo llega la compra?
              <select
                value={body.packageType}
                onChange={e => handleMovementPkgChange(e.target.value)}
              >
                {availablePkgTypes.map(x => (
                  <option key={x} value={x}>
                    {PACKAGE_INFO[x]?.label || x}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {movementPkgInfo.packagesLabel}
              <input
                required
                type="number"
                min="1"
                max="1000000"
                value={body.packages}
                onChange={e => patch({ packages: Number(e.target.value) })}
              />
            </label>
            {body.packageType !== 'unidades' && (
              <label>
                {movementPkgInfo.unitsLabel}
                <input
                  required
                  type="number"
                  min="1"
                  max="10000"
                  value={body.unitsPerPackage}
                  onChange={e => patch({ unitsPerPackage: Number(e.target.value) })}
                />
                <small>{movementPkgInfo.unitsHint}</small>
              </label>
            )}
            <p>
              <strong>
                {body.packageType === 'unidades'
                  ? `${body.packages} ${body.packages === 1 ? 'unidad' : 'unidades'} en stock`
                  : `${body.packages} ${body.packages === 1 ? movementPkgInfo.singular : movementPkgInfo.plural} × ${body.unitsPerPackage} unidades = ${body.packages * body.unitsPerPackage} unidades en stock`}
              </strong>
            </p>
            <label>
              Fecha de recepción
              <input
                required
                type="date"
                value={body.receivedDate}
                onChange={e => patch({ receivedDate: e.target.value })}
              />
            </label>
          </>
        ) : (
          <label>
            {body.action === 'count'
              ? 'Cantidad física contada'
              : body.action === 'receive' && row.unit === 'porciones'
              ? 'Cantidad de porciones disponibles'
              : body.action === 'receive'
              ? row.mode === 'containers'
                ? 'Cantidad de potes recibidos'
                : 'Cantidad de unidades recibidas'
              : body.action === 'open'
              ? 'Cantidad de potes a abrir'
              : body.action === 'finish'
              ? 'Cantidad de potes terminados'
              : 'Cantidad'}
            <input
              type="number"
              min={body.action === 'count' ? 0 : 1}
              max="1000000000"
              step="1"
              required
              value={body.quantity}
              onChange={e => patch({ quantity: Number(e.target.value) })}
            />
          </label>
        )}
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
          <label>{(row.unit === 'porciones' || body.packageType) ? 'Costo total de la compra ($)' : row.mode === 'containers' ? 'Costo por pote ($)' : 'Costo por unidad ($)'}<input type="number" min="0" step={(row.unit === 'porciones' || body.packageType) ? '0.01' : '0.000001'} required value={((row.unit === 'porciones' || body.packageType) ? body.totalCost : body.unitCost) ?? ''} onChange={e => patch((row.unit === 'porciones' || body.packageType) ? {
              totalCost: e.target.value,
              unitCost: null
            } : {
              unitCost: e.target.value,
              totalCost: null
            })} /></label><p>{row.unit === "porciones" ? "La compra suma las porciones recibidas. Al revisar se calcula el costo por porción." : "La compra suma las unidades recibidas. Al revisar se calcula el costo total de la compra."}</p></>}
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
        setError(e.uncertain ? e.message : "No se pudo guardar o consultar. Intentá nuevamente. " + e.message);
      } finally {
        setBusy(false);
      }
    }}><div className="stock-filters"><label>Desde<input type="date" required value={start} onInput={e => setStart(e.currentTarget.value)} /></label><label>Hasta<input type="date" required value={end} onInput={e => setEnd(e.currentTarget.value)} /></label><button className="primary" disabled={busy}>{busy ? 'Consultando…' : 'Consultar'}</button></div></form><small>Fechas reales de Argentina. Hasta 366 días por consulta; se conserva todo el historial.</small>{error && <p className="alert" role="alert">{error}</p>}{rows?.length === 0 && <p>Sin movimientos en este período.</p>}{rows?.map(r => <article className="stock-history" key={r.id}><strong>{labels[r.kind] || {
          order: 'Pedido',
          correction_return: 'Corrección: reposición',
          correction_out: 'Corrección: consumo',
          correction_no_return: 'Corrección: sin reposición'
        }[r.kind] || r.kind}</strong><p>{stamp(r.createdAt)} · {r.user}</p><p>{r.before ?? 'Sin carga'} → {r.after} {row.unit}{row.mode === 'containers' ? ' · abiertos: ' + r.openedBefore + ' → ' + r.openedAfter : ''}</p>{r.purchase && (
  <p>
    {r.purchase.type === 'unidades'
      ? `${r.purchase.packages} ${r.purchase.packages === 1 ? 'unidad suelta' : 'unidades sueltas'}`
      : `${r.purchase.packages} ${r.purchase.packages === 1 ? (PACKAGE_INFO[r.purchase.type]?.singular || r.purchase.type) : (PACKAGE_INFO[r.purchase.type]?.plural || r.purchase.type)} × ${r.purchase.unitsPerPackage} unidades`}
    {' · Recepción: '}{r.purchase.date}
  </p>
)}{r.supplier && <p>Proveedor: {r.supplier} · Costo unitario: {Number(r.unitCost).toLocaleString('es-AR', {
          maximumFractionDigits: 6
        })} · Total: {money(r.totalCost)}</p>}{r.note && <p>{r.note}</p>}{r.orderItemId && <small>Línea de pedido: {r.orderItemId}</small>}{r.correctionId && <small>Corrección: {r.correctionId}</small>}</article>)}</Modal>;
}
export default function Stock() {
  const s = useStore(),
    isAdmin = s.user?.role === 'admin';
  const [items, setItems] = useState([]),
    [categories, setCategories] = useState([]),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [mode, setMode] = useState(''),
    [modal, setModal] = useState(null);
  const [area,setArea]=useState('');
  const [pickSearch,setPickSearch] = useState("");
  const generation = useRef(0);
  async function load() {
    const g = ++generation.current;
    try {
      const data = await request('/stock');
      if (g === generation.current) {
        setItems(data.items);
        if (data.categories) setCategories(data.categories);
        setLoaded(true);
        setError('');
      }
    } catch (e) {
      if (g === generation.current) setError(e.uncertain ? e.message : "No se pudo guardar o consultar. Intentá nuevamente. " + e.message);
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
  const filtered = items.filter(r => {
    if (search && !r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) return false;
    if (category && r.category !== category) return false;
    if (mode && r.mode !== mode) return false;
    if (!area) return true;
    if (area === 'flavors') return r.mode === 'containers' || r.category?.toLowerCase().includes('sabor');
    if (area === 'beverages') return r.stockArea === 'beverages' || r.category?.toLowerCase().includes('bebida');
    if (area === 'kiosk') return r.stockArea === 'kiosk' || r.category?.toLowerCase().includes('kiosco') || r.category?.toLowerCase().includes('quiosco');
    if (area === 'candies') return r.stockArea === 'candies' || r.category?.toLowerCase().includes('golosina') || r.category?.toLowerCase().includes('caramelo') || r.category?.toLowerCase().includes('chicle') || r.category?.toLowerCase().includes('gomita');
    if (area === 'other') return r.mode !== 'manual' && r.stockArea !== 'beverages' && r.stockArea !== 'kiosk' && r.stockArea !== 'candies' && !r.category?.toLowerCase().includes('bebida') && !r.category?.toLowerCase().includes('kiosco') && !r.category?.toLowerCase().includes('quiosco') && !r.category?.toLowerCase().includes('golosina') && !r.category?.toLowerCase().includes('caramelo') && !r.category?.toLowerCase().includes('chicle') && !r.category?.toLowerCase().includes('gomita');
    if (area === 'empty') return r.mode !== 'manual' && r.quantity === 0;
    if (area === 'manual') return r.mode === 'manual';
    return true;
  });
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
        mode,area
      }} disabled={!loaded || !s.connected || !!error} onError={setError} />}</div>
    {error && <p className="alert" role="alert">{error}<button onClick={() => void load()}>Reintentar</button></p>}{message && <p className="success" role="status">{message}</p>}
    <section className="panel">
      <h2>Control principal de stock</h2>
      <div className="catalog-actions">{[['beverages','Bebidas'],['kiosk','Kiosco'],['candies','Golosinas'],['flavors','Helados · Sabores']].map(([v,label])=><button key={v} className={area===v?'primary':'secondary'} onClick={()=>{setArea(v);setCategory('');setMode('');}}>{label}</button>)}</div>
      {area==='beverages'&&<div className="intro"><h3>Administrar bebidas</h3><p>Consultá bebidas y disponibilidad. Registrá compras por pack o cajón y controlá las existencias por unidad.</p>{isAdmin&&<button className="primary" disabled={!s.connected} onClick={()=>setModal({action:'new-product',area:'beverages'})}>+ Agregar bebida</button>}</div>}
      {area==='kiosk'&&<div className="intro"><h3>Administrar kiosco</h3><p>Consultá artículos de kiosco y disponibilidad. Registrá compras por caja o pack y controlá las existencias por unidad.</p>{isAdmin&&<button className="primary" disabled={!s.connected} onClick={()=>setModal({action:'new-product',area:'kiosk'})}>+ Agregar producto de kiosco</button>}</div>}
      {area==='candies'&&<div className="intro"><h3>Administrar golosinas</h3><p>Consultá golosinas y disponibilidad. Registrá compras por bolsa, caja o pack y controlá las existencias por unidad o fracción.</p>{isAdmin&&<button className="primary" disabled={!s.connected} onClick={()=>setModal({action:'new-product',area:'candies'})}>+ Agregar golosina</button>}</div>}
      {area==='flavors'&&<div className="intro"><h3>Administrar sabores de helado</h3><p>Consultá sabores y disponibilidad. El conteo de recipientes es independiente.</p>{isAdmin&&<button className="primary" disabled={!s.connected} onClick={()=>setModal({action:'new-flavor'})}>+ Agregar sabor</button>}</div>}
      <label>Ver<select value={area} onChange={e=>setArea(e.target.value)}>{[['','Todos'],['beverages','Bebidas'],['kiosk','Kiosco'],['candies','Golosinas'],['flavors','Helados · Sabores'],['other','Otros productos con stock'],['empty','Agotados'],['manual','Sin gestión de stock']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    </section>
    <div className="stock-filters"><label>Buscar<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Producto, insumo o sabor" /></label><label>Categoría<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas</option>{[...new Set(items.map(r => r.category))].map(c => <option key={c}>{c}</option>)}</select></label><label>Modalidad<select value={mode} onChange={e => setMode(e.target.value)}><option value="">Todas</option><option value="unit">Por unidad</option><option value="containers">Recipientes de helado</option><option value="manual">Disponibilidad manual</option></select></label></div>
    {!loaded && !error && <p role="status">Consultando existencias…</p>}{loaded && !filtered.length && <p>No hay productos con estos filtros.</p>}
    {['unit', 'containers', 'manual'].map(group => {
      const rows = filtered.filter(r => r.mode === group);
      return rows.length > 0 && <section className="panel stock-section" key={group}><h2>{{
            unit: 'Stock por unidad',
            containers: 'Helados · recipientes por sabor',
            manual: 'Disponibilidad manual'
          }[group]}</h2>{group === 'containers' && <p>Vender helado no descuenta recipientes. La disponibilidad del sabor se decide manualmente.</p>}<div className="sales-table-scroll"><table className="sales-table"><thead><tr><th>{group === 'containers' ? 'Sabor' : 'Producto / insumo'}</th>{group !== 'containers' && <th>Categoría</th>}{group === 'unit' && <th>Existencia</th>}{group === 'containers' && <><th>Cerrados</th><th>Abiertos</th></>}<th>Estado de venta</th>{isAdmin && <th>Gestión</th>}</tr></thead><tbody>{rows.map(r => <tr key={r.id}><td><strong>{r.name}</strong></td>{group !== 'containers' && <td>{r.category}</td>}{group === 'unit' && <td>{r.quantity == null ? 'Sin carga inicial' : r.quantity + ' ' + r.unit}</td>}{group === 'containers' && <><td>{r.quantity ?? 'Sin carga inicial'}</td><td>{r.opened}</td></>}<td><Badge tone={r.available ? 'green' : 'amber'}>{r.availabilityReason || (r.available ? 'Disponible' : r.mode === 'manual' || r.mode === 'containers' ? 'Venta deshabilitada' : r.quantity == null ? 'Sin carga inicial de stock' : 'Sin stock')}</Badge></td>{isAdmin && <td>{actions(r)}</td>}</tr>)}</tbody></table></div></section>;
    })}
    {isAdmin && <p className="note">Primero configurá qué productos se controlan por unidad. Después cargá la entrada o el conteo inicial. Una entrada suma; un conteo establece la cantidad física y conserva la diferencia.</p>}
    {modal?.action === 'new-flavor' && <NewFlavor onClose={()=>setModal(null)} onSaved={async (msg)=>{ await refresh(); saved(msg); }}/>}
    {modal?.action === 'new-product' && <NewStockProduct area={modal.area} categories={categories.length ? categories : (s.catalog?.categories || [])} onClose={()=>setModal(null)} onSaved={async (msg)=>{ await refresh(); saved(msg); }} />}
    {pendingOperation('flavor-create-'+s.user.id)&&<p className="note">Hay un sabor pendiente de confirmación. <button onClick={()=>setModal({action:'new-flavor'})}>Comprobar guardado</button></p>}
    {pendingOperation('stock-product-create-'+s.user.id)&&<p className="note">Hay un producto pendiente de confirmación. <button onClick={()=>setModal({action:'new-product',area})}>Comprobar guardado</button></p>}
    {modal?.action === 'pick' && <Modal title="Agregar stock" onClose={()=>setModal(null)}>
      <p>Buscá el producto o insumo existente para sumarle stock, o creá uno nuevo directamente.</p>
      <div className="catalog-actions" style={{marginBottom:14}}>
        <button className="secondary" onClick={()=>setModal({action:'new-product',area:'beverages'})}>+ Nueva bebida</button>
        <button className="secondary" onClick={()=>setModal({action:'new-product',area:'kiosk'})}>+ Nuevo producto de kiosco</button>
        <button className="secondary" onClick={()=>setModal({action:'new-product',area:'candies'})}>+ Nueva golosina</button>
        <button className="secondary" onClick={()=>setModal({action:'new-flavor'})}>+ Nuevo sabor</button>
      </div>
      <label>Buscar producto o insumo<input type="search" value={pickSearch} onChange={e=>setPickSearch(e.target.value)} autoFocus /></label>
      <div className="stock-management">{items.filter(r=>r.name.toLocaleLowerCase().includes(pickSearch.toLocaleLowerCase())).map(row=><button key={row.id} className="secondary" disabled={!s.connected} onClick={()=>openAction(row,row.stockId&&row.mode!=='manual'?'receive':'configure')}>{row.name} · {row.stockId&&row.mode!=='manual'?'Agregar mercadería':'Configurar stock'}</button>)}</div>
    </Modal>}
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
