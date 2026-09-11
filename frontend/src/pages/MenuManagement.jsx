import React, { useState, useEffect, useRef } from 'react';
import { request, useStore, refresh, submitOnce, pendingOperation } from '../store';
import { Modal, Badge } from '../components';
import { money } from '../domain';

function Editor({ item, kind, data, onClose, onSaved }) {
  const isFlavor = kind === 'flavors';
  const isCategory = kind === 'categories';
  const scope = 'new-catalog-' + kind;
  const pending = !item?.id && pendingOperation(scope);
  const [value, setValue] = useState(
    pending?.body || item || {
      name: '',
      description: '',
      categoryId: data.categories[0]?.id || '',
      price: '',
      image: '',
      available: true,
      visible: true,
      order: 0,
      note: '',
      stockArea: 'other',
      manageStock: false,
      sizes: []
    }
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(!!pending);
  const lock = useRef(false);
  const s = useStore();

  const change = (key, v) => setValue(old => ({ ...old, [key]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');

    let body;
    if (isFlavor) {
      body = { name: value.name.trim(), available: value.available };
    } else if (isCategory) {
      body = {
        name: value.name,
        image: value.image || null,
        order: Number(value.order),
        visible: value.visible,
        note: value.note || '',
        stockArea: value.stockArea || 'other'
      };
    } else {
      body = {
        name: value.name,
        description: value.description || '',
        categoryId: value.categoryId,
        price: value.price === '' || value.price == null ? null : value.price,
        image: value.image || null,
        available: value.available,
        ...(!item?.id || value.manageStock !== item.manageStock ? { manageStock: value.manageStock ?? false } : {}),
        sizes: value.sizes || []
      };
    }

    try {
      if (item?.id) {
        await request('/menu-management/' + kind + '/' + item.id, { method: 'PUT', body });
      } else {
        await submitOnce(scope, '/menu-management/' + kind, body);
      }
      setUncertain(false);
      onSaved();
    } catch (err) {
      setError(err.message);
      setUncertain(!!err.uncertain);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const modalTitle = (item?.id ? 'Editar ' : 'Nueva alta de ') + (isFlavor ? 'sabor de helado' : isCategory ? 'categoría' : 'producto');

  return (
    <Modal title={modalTitle} onClose={() => { if (!busy && !uncertain) onClose(); }}>
      <form onSubmit={handleSubmit}>
        <fieldset disabled={busy || uncertain} className="catalog-fields">
          <label>
            Nombre
            <input
              required
              maxLength={isCategory || isFlavor ? 100 : 150}
              value={value.name}
              onChange={e => change('name', e.target.value)}
              placeholder={isFlavor ? 'Ej: Dulce de leche granizado' : ''}
              autoFocus
            />
          </label>

          {isFlavor && (
            <>
              <label className="option">
                <input
                  type="checkbox"
                  checked={value.available}
                  onChange={e => change('available', e.target.checked)}
                />
                Disponible para elegir en los helados
              </label>
              <small>El sabor estará activo para la carta y los pedidos. La cantidad física de recipientes se administra desde Stock.</small>
            </>
          )}

          {isCategory && (
            <>
              <label>
                Área de stock
                <select value={value.stockArea || 'other'} onChange={e => change('stockArea', e.target.value)}>
                  <option value="other">Otros</option>
                  <option value="beverages">Bebidas</option>
                  <option value="kiosk">Kiosco</option>
                </select>
              </label>
              <label>
                Orden en la carta
                <input required type="number" min="0" max="9999" value={value.order} onChange={e => change('order', e.target.value)} />
              </label>
              <label>
                Nota para clientes
                <textarea maxLength={500} value={value.note || ''} onChange={e => change('note', e.target.value)} />
              </label>
              <label className="option">
                <input type="checkbox" checked={value.visible} onChange={e => change('visible', e.target.checked)} />
                Mostrar categoría en la carta pública
              </label>
              <small>Ocultarla conserva sus productos para atención interna.</small>
            </>
          )}

          {!isCategory && !isFlavor && (
            <>
              <label>
                Categoría
                <select required value={value.categoryId} onChange={e => change('categoryId', e.target.value)}>
                  <option value="">Elegir categoría</option>
                  {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>
                Precio de venta ($) · opcional
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max="9999999999.99"
                  value={value.price ?? ''}
                  onChange={e => change('price', e.target.value)}
                  placeholder="Sin precio definido"
                />
              </label>
              <small>Sin precio: muestra “Consultar precio” y no se puede vender desde atención. Los precios anteriores de los pedidos no cambian.</small>
              <label>
                Descripción
                <textarea maxLength={500} value={value.description || ''} onChange={e => change('description', e.target.value)} />
              </label>
              <label className="option">
                <input type="checkbox" checked={value.available} onChange={e => change('available', e.target.checked)} />
                Habilitar venta (sujeta a precio y stock)
              </label>

              <label>
                Gestionar stock de este producto
                <select value={value.manageStock ? 'yes' : 'no'} onChange={e => change('manageStock', e.target.value === 'yes')}>
                  <option value="no">No</option>
                  <option value="yes">Sí</option>
                </select>
              </label>
              <small>Sin gestión se registra la venta sin descontar existencias. Al activarla, cargá la entrada inicial desde Stock. Desactivarla también retira vínculos de cucuruchos para nuevos pedidos.</small>

              <h3>Presentaciones comerciales</h3>
              {(value.sizes || []).map((z, i) => {
                const edit = (k, v) => change('sizes', value.sizes.map((x, n) => n === i ? { ...x, [k]: v } : x));
                return (
                  <fieldset key={i}>
                    <label>
                      Nombre de presentación
                      <input required value={z.name} onChange={e => edit('name', e.target.value)} />
                    </label>
                    <label>
                      Precio propio ($)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={z.salePrice ?? ''}
                        placeholder={'Base + adicional: ' + (Number(value.price || 0) + Number(z.price || 0))}
                        onChange={e => edit('salePrice', e.target.value === '' ? null : e.target.value)}
                      />
                    </label>
                    <label>
                      Orden
                      <input type="number" min="0" max="9999" value={z.order || 0} onChange={e => edit('order', Number(e.target.value))} />
                    </label>
                    <label>
                      Equivalencia informativa
                      <input type="number" min="1" max="1000" value={z.equivalent || 1} onChange={e => edit('equivalent', Number(e.target.value))} />
                    </label>
                    {value.manageStock && (
                      <label>
                        Unidades de stock por venta
                        <input type="number" min="1" max="1000" value={z.stockUnits || 1} onChange={e => edit('stockUnits', Number(e.target.value))} />
                      </label>
                    )}
                    <label>
                      Máximo de sabores (0 si no corresponde)
                      <input type="number" min="0" max="10" value={z.max || 0} onChange={e => edit('max', Number(e.target.value))} />
                    </label>
                    <label>
                      <input type="checkbox" checked={z.enabled !== false} onChange={e => edit('enabled', e.target.checked)} />
                      Habilitada
                    </label>
                    <button type="button" onClick={() => change('sizes', value.sizes.filter((_, n) => n !== i))}>
                      Quitar presentación
                    </button>
                  </fieldset>
                );
              })}
              <button
                type="button"
                className="secondary"
                onClick={() => change('sizes', [...(value.sizes || []), { name: '', salePrice: null, price: 0, max: 0, enabled: true, order: (value.sizes || []).length, equivalent: 1, stockUnits: 1 }])}
              >
                + Agregar presentación
              </button>
            </>
          )}

          {!isFlavor && (
            <>
              <label>
                Foto
                <select value={value.image || ''} onChange={e => change('image', e.target.value)}>
                  <option value="">Sin foto</option>
                  {[...new Set([...data.images, ...(value.image ? [value.image] : [])])].map(src => (
                    <option key={src} value={src}>{src.split('/').pop()}</option>
                  ))}
                </select>
              </label>
              <small>Las fotos se cargan en frontend/public/menu. Se conservan las opciones, sabores y vínculos de stock existentes al editar.</small>
            </>
          )}
        </fieldset>

        {error && <p className="alert" role="alert">{error}</p>}
        {uncertain && <p className="note">La respuesta no se confirmó. Reintentá el mismo guardado antes de cerrar.</p>}

        <button className="primary full" disabled={busy || !s.connected}>
          {busy ? 'Guardando…' : uncertain ? 'Reintentar guardado' : 'Guardar cambios'}
        </button>
      </form>
    </Modal>
  );
}

export default function MenuManagement() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [flavorFilter, setFlavorFilter] = useState('');
  const [tab, setTab] = useState('products');
  const [archived, setArchived] = useState(false);
  const [editor, setEditor] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const s = useStore();

  async function load() {
    try {
      setData(await request('/menu-management'));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saved() {
    setEditor(null);
    setConfirmModal(null);
    setMessage('Cambios guardados. La carta se actualizará automáticamente.');
    await load();
    await refresh();
  }

  async function handleConfirmAction() {
    if (!confirmModal || lock.current) return;
    lock.current = true;
    setBusy(true);
    setConfirmModal(old => ({ ...old, error: '' }));

    const { type, item } = confirmModal;

    try {
      if (type === 'retire') {
        await request('/menu-management/products/' + item.id, { method: 'DELETE' });
        setMessage(`El producto "${item.name}" fue retirado de la carta.`);
      } else if (type === 'permanent_product') {
        await request('/menu-management/products/' + item.id + '?permanent=true', { method: 'DELETE' });
        setMessage(`El producto "${item.name}" fue eliminado definitivamente.`);
      } else if (type === 'category') {
        await request('/menu-management/categories/' + item.id, { method: 'DELETE' });
        setMessage(`La categoría "${item.name}" fue eliminada.`);
      } else if (type === 'flavor') {
        await request('/menu-management/flavors/' + item.id, { method: 'DELETE' });
        setMessage(`El sabor "${item.name}" fue eliminado.`);
      }
      setConfirmModal(null);
      await load();
      await refresh();
    } catch (err) {
      setConfirmModal(old => ({ ...old, error: err.message }));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function restoreProduct(p) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await request('/menu-management/products/' + p.id + '/restore', { method: 'POST' });
      setMessage(`El producto "${p.name}" fue restaurado a la carta.`);
      await load();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const itemsList = !data ? [] : (data[tab] || []).filter(item => {
    const matchesSearch = item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase());
    if (!matchesSearch) return false;
    if (tab === 'products') {
      return item.archived === archived && (!filter || item.categoryId === filter);
    }
    if (tab === 'flavors') {
      if (flavorFilter === 'available') return item.available;
      if (flavorFilter === 'unavailable') return !item.available;
      return true;
    }
    return true;
  });

  return (
    <main className="catalog-admin">
      <div className="page-heading">
        <div>
          <h1>Gestionar carta</h1>
          <p>Productos, precios, categorías y sabores de helado de NaniFer.</p>
        </div>
        <div className="catalog-actions">
          <button className="primary" disabled={!data || !s.connected} onClick={() => setEditor({ kind: 'products' })}>
            + Nuevo producto
          </button>
          <button className="secondary" disabled={!data || !s.connected} onClick={() => setEditor({ kind: 'categories' })}>
            + Nueva categoría
          </button>
          <button className="secondary" disabled={!data || !s.connected} onClick={() => setEditor({ kind: 'flavors' })}>
            + Nuevo sabor
          </button>
        </div>
      </div>

      {error && (
        <p className="alert" role="alert">
          {error}
          <button onClick={load}>Reintentar</button>
        </p>
      )}
      {message && <p className="success" role="status">{message}</p>}
      {!data && !error && <p role="status">Cargando carta…</p>}

      {data && (
        <>
          <div className="catalog-actions">
            <button className={tab === 'products' ? 'primary' : 'secondary'} onClick={() => setTab('products')}>
              Productos ({data.products.filter(p => !p.archived).length})
            </button>
            <button className={tab === 'categories' ? 'primary' : 'secondary'} onClick={() => setTab('categories')}>
              Categorías ({data.categories.length})
            </button>
            <button className={tab === 'flavors' ? 'primary' : 'secondary'} onClick={() => setTab('flavors')}>
              Sabores de helado ({data.flavors?.length || 0})
            </button>
          </div>

          <div className="stock-filters">
            <label>
              Buscar
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={tab === 'products' ? 'Nombre del producto' : tab === 'categories' ? 'Nombre de la categoría' : 'Nombre del sabor'}
              />
            </label>

            {tab === 'products' && (
              <>
                <label>
                  Categoría
                  <select value={filter} onChange={e => setFilter(e.target.value)}>
                    <option value="">Todas</option>
                    {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="option">
                  <input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} />
                  Ver retirados
                </label>
              </>
            )}

            {tab === 'flavors' && (
              <label>
                Estado
                <select value={flavorFilter} onChange={e => setFlavorFilter(e.target.value)}>
                  <option value="">Todos los sabores</option>
                  <option value="available">Solo disponibles</option>
                  <option value="unavailable">Solo agotados</option>
                </select>
              </label>
            )}
          </div>

          <div className="catalog-list">
            {itemsList.map(item => (
              <article className="panel catalog-row" key={item.id}>
                <div>
                  <h2>{item.name}</h2>
                  {tab === 'products' && (
                    <>
                      <strong>{item.price == null ? 'Consultar precio' : money(item.price)}</strong>
                      <p>
                        {data.categories.find(c => c.id === item.categoryId)?.name} ·{' '}
                        {item.archived
                          ? 'Retirado'
                          : !item.available
                          ? 'Venta deshabilitada'
                          : item.price == null
                          ? 'Precio pendiente'
                          : 'Habilitado según stock'}
                      </p>
                      {item.description && <p>{item.description}</p>}
                    </>
                  )}

                  {tab === 'categories' && (
                    <p>
                      Orden {item.order} · {item.visible ? 'Visible en la carta pública' : 'Oculta al público'}
                      {item.note && ` · "${item.note}"`}
                    </p>
                  )}

                  {tab === 'flavors' && (
                    <p>
                      <Badge tone={item.available ? 'green' : 'amber'}>
                        {item.available ? 'Disponible' : 'Agotado'}
                      </Badge>
                    </p>
                  )}
                </div>

                <div className="catalog-actions">
                  <button
                    className="secondary"
                    disabled={!s.connected || busy}
                    onClick={() => setEditor({ kind: tab, item })}
                  >
                    Editar
                  </button>

                  {tab === 'products' && (
                    item.archived ? (
                      <>
                        <button
                          className="secondary"
                          disabled={busy || !s.connected}
                          onClick={() => restoreProduct(item)}
                        >
                          Restaurar
                        </button>
                        <button
                          className="text-button"
                          style={{ color: '#b91c1c' }}
                          disabled={busy || !s.connected}
                          onClick={() => setConfirmModal({ type: 'permanent_product', item })}
                        >
                          Eliminar definitivamente
                        </button>
                      </>
                    ) : (
                      <button
                        className="text-button"
                        disabled={busy || !s.connected}
                        onClick={() => setConfirmModal({ type: 'retire', item })}
                      >
                        Retirar de la carta
                      </button>
                    )
                  )}

                  {tab === 'categories' && (
                    <button
                      className="text-button"
                      style={{ color: '#b91c1c' }}
                      disabled={busy || !s.connected}
                      onClick={() => setConfirmModal({ type: 'category', item })}
                    >
                      Eliminar
                    </button>
                  )}

                  {tab === 'flavors' && (
                    <button
                      className="text-button"
                      style={{ color: '#b91c1c' }}
                      disabled={busy || !s.connected}
                      onClick={() => setConfirmModal({ type: 'flavor', item })}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          {!itemsList.length && (
            <p>No hay resultados para estos filtros.</p>
          )}

          {['products', 'categories', 'flavors'].map(
            kind =>
              pendingOperation('new-catalog-' + kind) && (
                <p className="note" key={kind}>
                  Hay un alta pendiente de confirmación.
                  <button onClick={() => setEditor({ kind })}>Recuperar guardado</button>
                </p>
              )
          )}
        </>
      )}

      {editor && <Editor {...editor} data={data} onClose={() => setEditor(null)} onSaved={saved} />}

      {confirmModal && (
        <Modal
          title={
            confirmModal.type === 'retire'
              ? 'Retirar producto'
              : confirmModal.type === 'permanent_product'
              ? 'Eliminar producto definitivamente'
              : confirmModal.type === 'category'
              ? 'Eliminar categoría'
              : 'Eliminar sabor de helado'
          }
          onClose={() => !busy && setConfirmModal(null)}
        >
          <div style={{ display: 'grid', gap: '14px' }}>
            {confirmModal.type === 'retire' && (
              <p>
                ¿Retirar <strong>{confirmModal.item.name}</strong> de la carta y de nuevas ventas?
                Sus consumos, stock e historial se conservan intactos. Podés volver a activarlo en cualquier momento desde "Ver retirados".
              </p>
            )}

            {confirmModal.type === 'permanent_product' && (
              <p>
                ¿Eliminar definitivamente <strong>{confirmModal.item.name}</strong>?
                Solo se permite si el producto no tiene ventas ni movimientos de stock registrados. Si ya tuvo actividad comercial, mantenelo retirado para no alterar la contabilidad histórica.
              </p>
            )}

            {confirmModal.type === 'category' && (
              <p>
                ¿Eliminar la categoría <strong>{confirmModal.item.name}</strong>?
                Solo es posible si no contiene ningún producto asociado (activos o retirados).
              </p>
            )}

            {confirmModal.type === 'flavor' && (
              <p>
                ¿Eliminar el sabor <strong>{confirmModal.item.name}</strong> de la heladería?
                Solo es posible si no posee movimientos de recipientes de stock registrados. De lo contrario, podés marcarlo como "Agotado" para no ofrecerlo en los helados.
              </p>
            )}

            {confirmModal.error && (
              <p className="alert" role="alert">
                {confirmModal.error}
              </p>
            )}

            <div className="catalog-actions" style={{ justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setConfirmModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary"
                style={confirmModal.type !== 'retire' ? { backgroundColor: '#b91c1c', borderColor: '#991b1b' } : {}}
                disabled={busy || !s.connected}
                onClick={handleConfirmAction}
              >
                {busy
                  ? 'Procesando…'
                  : confirmModal.type === 'retire'
                  ? 'Confirmar retiro'
                  : confirmModal.type === 'permanent_product'
                  ? 'Eliminar definitivamente'
                  : confirmModal.type === 'category'
                  ? 'Eliminar categoría'
                  : 'Eliminar sabor'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </main>
  );
}
