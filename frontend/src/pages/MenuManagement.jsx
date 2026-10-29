import React, { useState, useEffect, useRef } from 'react';
import { Camera, Tag, Layers, Plus, Trash2, Sliders, ChevronDown, ChevronUp, GripVertical, X } from 'lucide-react';
import { request, useStore, refresh, submitOnce, pendingOperation } from '../store';
import { Modal, Badge } from '../components';
import { money } from '../domain';
import '../menu-management.css';

function Editor({ item, kind, data, onClose, onSaved }) {
  const isFlavor = kind === 'flavors';
  const isCategory = kind === 'categories';
  const isProduct = !isFlavor && !isCategory;
  const scope = 'new-catalog-' + kind;
  const pending = !item?.id && pendingOperation(scope);
  const initialFlavors = item?.flavorOptions || pending?.body?.flavorOptions || [];
  const [flavorInput, setFlavorInput] = useState(
    Array.isArray(initialFlavors) ? initialFlavors.join(', ') : (initialFlavors || '')
  );

  const initialSizes = (pending?.body?.sizes || item?.sizes || []).map((z, idx) => ({
    ...z,
    salePrice: z.salePrice != null ? z.salePrice : (item?.price != null && z.price ? Number(item.price) + Number(z.price) : (z.price || '')),
    price: z.price || 0,
    stockUnits: z.stockUnits || 1,
    max: z.max || 0,
    enabled: z.enabled !== false,
    isDefault: z.isDefault != null ? Boolean(z.isDefault) : (idx === 0)
  }));

  const [value, setValue] = useState(
    pending?.body || item ? {
      ...(pending?.body || item),
      inMenu: pending?.body?.inMenu ?? item?.inMenu ?? true,
      order: pending?.body?.order ?? item?.order ?? 0,
      publicCategories: pending?.body?.publicCategories ?? item?.publicCategories ?? [],
      sizes: initialSizes,
      flavorOptions: Array.isArray(initialFlavors) ? initialFlavors : [],
      comboConfig: pending?.body?.comboConfig ?? item?.comboConfig ?? null
    } : {
      name: '',
      description: '',
      categoryId: data?.categories?.[0]?.id || '',
      publicCategories: [],
      price: '',
      image: '',
      available: true,
      inMenu: true,
      visible: true,
      order: 0,
      note: '',
      stockArea: 'other',
      manageStock: false,
      sizes: [],
      flavorOptions: []
    }
  );

  const [pricingMode, setPricingMode] = useState(
    initialSizes.length > 0 ? 'variants' : 'simple'
  );
  const [showPhotoGallery, setShowPhotoGallery] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [expandedVariants, setExpandedVariants] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(!!pending);
  const lock = useRef(false);
  const s = useStore();

  const change = (key, v) => setValue(old => ({ ...old, [key]: v }));

  async function handleUploadPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setUploadMsg('');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
          const img = new Image();
          img.onerror = reject;
          img.onload = () => {
            const maxDim = 1200;
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.90));
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });

      const res = await request('/menu-management/upload-photo', {
        method: 'POST',
        body: {
          data: dataUrl,
          name: value.name || file.name.replace(/\.[^/.]+$/, '') || 'producto'
        }
      });

      if (res?.image) {
        change('image', res.image);
        setUploadMsg(`¡Optimizada! (${res.sizeKb} KB, WebP)`);
        if (data && Array.isArray(data.images) && !data.images.includes(res.image)) {
          data.images.unshift(res.image);
        }
      }
    } catch (err) {
      setUploadMsg('Error: ' + (err.message || 'No se pudo subir'));
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  }

  const updateVariant = (index, updates) => {
    setValue(old => ({
      ...old,
      sizes: (old.sizes || []).map((x, n) => n === index ? { ...x, ...updates } : x)
    }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');

    let body;
    if (isFlavor) {
      body = { name: value.name.trim(), available: Boolean(value.available) };
    } else if (isCategory) {
      body = {
        name: value.name.trim(),
        image: value.image || null,
        order: Number(value.order || 0),
        visible: Boolean(value.visible),
        note: value.note || '',
        stockArea: value.stockArea || 'other'
      };
    } else {
      const parsedFlavors = flavorInput
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      let finalSizes = [];
      let finalPrice = value.price === '' || value.price == null ? null : Number(value.price);

      if (pricingMode === 'variants') {
        finalSizes = (value.sizes || [])
          .filter(z => z.name && z.name.trim())
          .map((z, idx) => ({
            name: z.name.trim(),
            salePrice: z.salePrice !== '' && z.salePrice != null ? Number(z.salePrice) : null,
            price: z.price ? Number(z.price) : 0,
            stockUnits: Number(z.stockUnits || 1),
            max: Number(z.max || 0),
            enabled: z.enabled !== false,
            order: idx,
            equivalent: Number(z.equivalent || 1),
            isDefault: Boolean(z.isDefault)
          }));

        // Si ninguna variante está marcada como principal, la primera es la principal por defecto
        if (finalSizes.length > 0 && !finalSizes.some(z => z.isDefault)) {
          finalSizes[0].isDefault = true;
        }

        // El precio base para la carta es el de la variante principal (o primera)
        const defaultVariant = finalSizes.find(z => z.isDefault) || finalSizes[0];
        if (defaultVariant) {
          const defPrice = defaultVariant.salePrice != null && defaultVariant.salePrice > 0
            ? defaultVariant.salePrice
            : (defaultVariant.price ? defaultVariant.price : null);
          if (defPrice != null) {
            finalPrice = defPrice;
          }
        }
      }

      body = {
        name: value.name.trim(),
        description: value.description ? value.description.trim() : '',
        categoryId: value.categoryId,
        publicCategories: (value.publicCategories || []).filter(cId => cId && cId !== value.categoryId),
        price: finalPrice,
        image: value.image || null,
        available: Boolean(value.available),
        inMenu: Boolean(value.inMenu),
        order: Number(value.order || 0),
        ...(!item?.id || Boolean(value.manageStock) !== Boolean(item.manageStock) ? { manageStock: Boolean(value.manageStock) } : {}),
        sizes: finalSizes,
        flavorOptions: parsedFlavors,
        comboConfig: value.comboConfig || null
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

  const modalTitle = (item?.id ? 'Editar ' : 'Nuevo ') + (isFlavor ? 'sabor de helado' : isCategory ? 'categoría' : 'producto');

  return (
    <Modal
      title={modalTitle}
      onClose={() => { if (!busy && !uncertain) onClose(); }}
      className={isProduct ? 'product-modal-wide' : ''}
    >
      <form onSubmit={handleSubmit}>
        <fieldset disabled={busy || uncertain} className="catalog-fields">
          {isFlavor && (
            <>
              <label>
                Nombre del sabor
                <input
                  required
                  maxLength={100}
                  value={value.name}
                  onChange={e => change('name', e.target.value)}
                  placeholder="Ej: Dulce de leche granizado"
                  autoFocus
                />
              </label>
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
                Nombre de la categoría
                <input
                  required
                  maxLength={100}
                  value={value.name}
                  onChange={e => change('name', e.target.value)}
                  placeholder="Ej: Cafetería, Bebidas, Helados..."
                  autoFocus
                />
              </label>
              <label>
                Área de stock
                <select value={value.stockArea || 'other'} onChange={e => change('stockArea', e.target.value)}>
                  <option value="other">Otros</option>
                  <option value="beverages">Bebidas</option>
                  <option value="kiosk">Kiosco</option>
                  <option value="candies">Golosinas</option>
                  <option value="manual">Venta libre</option>
                </select>
              </label>
              <label>
                Orden en la carta
                <input required type="number" min="0" max="9999" value={value.order} onChange={e => change('order', e.target.value)} />
              </label>
              <label>
                Nota para clientes
                <textarea maxLength={500} value={value.note || ''} onChange={e => change('note', e.target.value)} placeholder="Nota informativa que verán los clientes..." />
              </label>
              <label className="option">
                <input type="checkbox" checked={value.visible} onChange={e => change('visible', e.target.checked)} />
                Mostrar categoría en la carta pública
              </label>
              <small>Ocultarla conserva sus productos para atención interna de mozos.</small>
            </>
          )}

          {isProduct && (
            <>
              {/* Bloque superior: Foto + Nombre / Categoría / Descripción */}
              <div className="editor-top-grid">
                <div className="photo-uploader-box">
                  <div
                    className="photo-preview-wrap"
                    onClick={() => setShowPhotoGallery(prev => !prev)}
                    title="Hacé clic para elegir foto de la carta"
                  >
                    {value.image ? (
                      <img src={value.image} alt={value.name || 'Foto del producto'} />
                    ) : (
                      <div className="photo-placeholder">
                        <Camera size={28} />
                        <span>Elegir foto</span>
                      </div>
                    )}
                  </div>
                  <div className="photo-actions">
                    <div className="photo-actions-row">
                      <button
                        type="button"
                        onClick={() => setShowPhotoGallery(prev => !prev)}
                      >
                        {value.image ? 'Galería' : 'De galería'}
                      </button>
                      {value.image && (
                        <button
                          type="button"
                          onClick={() => { change('image', ''); setShowPhotoGallery(false); setUploadMsg(''); }}
                        >
                          Quitar
                        </button>
                      )}
                    </div>

                    <label className={`photo-upload-label ${uploadingPhoto ? 'loading' : ''}`}>
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleUploadPhoto}
                        disabled={uploadingPhoto}
                      />
                      <span>{uploadingPhoto ? '⏳ Optimizando...' : '📸 Subir foto'}</span>
                    </label>

                    {uploadMsg && (
                      <span className={`photo-upload-msg ${uploadMsg.startsWith('Error') ? 'error' : ''}`}>
                        {uploadMsg}
                      </span>
                    )}
                  </div>
                </div>

                <div className="editor-main-fields">
                  <div className="editor-field">
                    <label>Nombre del producto *</label>
                    <input
                      required
                      maxLength={150}
                      value={value.name}
                      onChange={e => change('name', e.target.value)}
                      placeholder="Ej: Coca Cola, Café cortado, Hamburguesa..."
                      autoFocus
                    />
                  </div>

                  <div className="editor-field">
                    <label>Categoría principal *</label>
                    <select
                      required
                      value={value.categoryId}
                      onChange={e => {
                        const nextCat = e.target.value;
                        change('categoryId', nextCat);
                        change('publicCategories', (value.publicCategories || []).filter(cid => cid !== nextCat));
                      }}
                    >
                      <option value="">Elegir categoría</option>
                      {(data?.categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="editor-field">
                    <label>Categorías adicionales en la carta (opción múltiple):</label>
                    <small style={{ color: '#64748b', display: 'block', marginBottom: '8px', fontSize: '12px' }}>
                      Marcá si este producto también debe mostrarse en otras secciones de la carta digital (por ej. Cafés en Meriendas/Desayunos además de Cafetería).
                    </small>
                    <div className="category-chips-select">
                      {(data?.categories || [])
                        .filter(c => c.id !== value.categoryId)
                        .map(c => {
                          const isChecked = (value.publicCategories || []).includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              className={`cat-chip-btn ${isChecked ? 'selected' : ''}`}
                              onClick={() => {
                                const current = value.publicCategories || [];
                                const next = isChecked ? current.filter(id => id !== c.id) : [...current, c.id];
                                change('publicCategories', next);
                              }}
                              title={isChecked ? 'Quitar de esta categoría' : 'Agregar a esta categoría'}
                            >
                              <span className="cat-chip-icon">{isChecked ? '✓' : '+'}</span>
                              <span>{c.name}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>

                  <div className="editor-field">
                    <label>Descripción (opcional)</label>
                    <textarea
                      maxLength={500}
                      rows={2}
                      value={value.description || ''}
                      onChange={e => change('description', e.target.value)}
                      placeholder="Ingredientes, detalles o preparación que verá el cliente..."
                    />
                  </div>

                  <div className="editor-field">
                    <label>Orden en la carta</label>
                    <input
                      type="number"
                      min="0"
                      max="9999"
                      value={value.order ?? 0}
                      onChange={e => change('order', e.target.value)}
                    />
                    <small style={{ color: '#64748b', fontSize: '12px' }}>
                      Define la posición del producto en la carta digital (menor número = aparece primero).
                    </small>
                  </div>
                </div>
              </div>

              {/* Selector de galería de fotos */}
              {showPhotoGallery && (
                <div className="photo-gallery-picker">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <h4>Elegí una foto de la carta o subí una:</h4>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <label className={`photo-upload-label ${uploadingPhoto ? 'loading' : ''}`} style={{ padding: '3px 8px', fontSize: '11px' }}>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={handleUploadPhoto}
                          disabled={uploadingPhoto}
                        />
                        <span>{uploadingPhoto ? '⏳ Procesando...' : '➕ Subir nueva'}</span>
                      </label>
                      <button type="button" className="text-button" onClick={() => setShowPhotoGallery(false)}>Cerrar</button>
                    </div>
                  </div>
                  <div className="gallery-grid">
                    {(data?.images || []).map(src => (
                      <div
                        key={src}
                        className={`gallery-item ${value.image === src ? 'selected' : ''}`}
                        onClick={() => { change('image', src); setShowPhotoGallery(false); }}
                        title={src.split('/').pop()}
                      >
                        <img src={src} alt={src.split('/').pop()} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sección Precio(s): Simple vs Variantes */}
              <div className="editor-card">
                <div className="editor-card-header">
                  <h3>
                    <Tag size={17} style={{ color: '#2563eb' }} />
                    Precio(s)
                  </h3>
                  <div className="pricing-segmented-control">
                    <button
                      type="button"
                      className={pricingMode === 'simple' ? 'active' : ''}
                      onClick={() => setPricingMode('simple')}
                    >
                      Simple
                    </button>
                    <button
                      type="button"
                      className={pricingMode === 'variants' ? 'active' : ''}
                      onClick={() => {
                        setPricingMode('variants');
                        setValue(old => {
                          if (!old.sizes || old.sizes.length === 0) {
                            return {
                              ...old,
                              sizes: [{
                                name: 'Estándar',
                                salePrice: old.price || '',
                                price: 0,
                                stockUnits: 1,
                                max: 0,
                                enabled: true,
                                order: 0,
                                equivalent: 1,
                              }]
                            };
                          }
                          return old;
                        });
                      }}
                    >
                      Variantes
                      {value.sizes?.length > 0 && (
                        <span className="count-pill">{value.sizes.length}</span>
                      )}
                    </button>
                  </div>
                </div>

                {pricingMode === 'simple' ? (
                  <div className="simple-price-box">
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                      Precio de venta ($)
                    </label>
                    <div className="simple-price-input-wrap">
                      <span>$</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={value.price ?? ''}
                        onChange={e => change('price', e.target.value)}
                        placeholder="Sin precio definido"
                      />
                    </div>
                    <small style={{ color: '#64748b', marginTop: '4px' }}>
                      Precio único para este producto. Si se deja vacío, figurará como "Consultar precio".
                    </small>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '12px', lineHeight: '1.4' }}>
                      Cargá los tamaños o presentaciones (ej: <em>Chico, Mediano, Grande</em> o <em>Lata, 1.5L</em>) con su precio final directo en pesos.
                    </p>

                    <div className="variants-list">
                      {(value.sizes || []).map((z, i) => {
                        const isExpanded = Boolean(expandedVariants[i]);
                        const currentPrice = z.salePrice != null && z.salePrice !== '' ? z.salePrice : (z.price ? z.price : '');
                        return (
                          <div className="variant-row-card" key={i}>
                            <div className="variant-main-row">
                              <span className="variant-drag-handle" title="Variante">
                                <GripVertical size={16} />
                              </span>
                              <input
                                className="variant-name-input"
                                placeholder="Nombre: ej. Mediano, 500ml, Doble"
                                value={z.name || ''}
                                onChange={e => updateVariant(i, { name: e.target.value })}
                                required
                              />
                              <div className="variant-price-wrap">
                                <span>$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="Precio: ej. 5000"
                                  value={currentPrice}
                                  onChange={e => {
                                    const val = e.target.value;
                                    updateVariant(i, {
                                      salePrice: val === '' ? '' : val,
                                      price: 0
                                    });
                                  }}
                                />
                              </div>
                              <div className="variant-actions" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setValue(old => ({
                                      ...old,
                                      sizes: (old.sizes || []).map((s, idx) => ({
                                        ...s,
                                        isDefault: idx === i
                                      }))
                                    }));
                                  }}
                                  title="Esta variante determina el precio que se muestra en la carta y viene seleccionada por defecto"
                                  style={{
                                    background: (z.isDefault || (!value.sizes?.some(s => s.isDefault) && i === 0)) ? '#fef3c7' : '#f8fafc',
                                    color: (z.isDefault || (!value.sizes?.some(s => s.isDefault) && i === 0)) ? '#92400e' : '#64748b',
                                    border: (z.isDefault || (!value.sizes?.some(s => s.isDefault) && i === 0)) ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {(z.isDefault || (!value.sizes?.some(s => s.isDefault) && i === 0)) ? '⭐ Principal (precio en carta)' : 'Hacer principal'}
                                </button>

                                <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '2px' }}>
                                  <button
                                    type="button"
                                    disabled={i === 0}
                                    onClick={() => {
                                      setValue(old => {
                                        const arr = [...(old.sizes || [])];
                                        const temp = arr[i];
                                        arr[i] = arr[i - 1];
                                        arr[i - 1] = temp;
                                        return { ...old, sizes: arr };
                                      });
                                    }}
                                    style={{ padding: '1px 5px', fontSize: '10px', lineHeight: 1, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#ffffff', cursor: i === 0 ? 'default' : 'pointer' }}
                                    title="Subir posición"
                                  >
                                    ▲
                                  </button>
                                  <button
                                    type="button"
                                    disabled={i === (value.sizes || []).length - 1}
                                    onClick={() => {
                                      setValue(old => {
                                        const arr = [...(old.sizes || [])];
                                        const temp = arr[i];
                                        arr[i] = arr[i + 1];
                                        arr[i + 1] = temp;
                                        return { ...old, sizes: arr };
                                      });
                                    }}
                                    style={{ padding: '1px 5px', fontSize: '10px', lineHeight: 1, border: '1px solid #cbd5e1', borderRadius: '3px', background: '#ffffff', cursor: i === (value.sizes || []).length - 1 ? 'default' : 'pointer' }}
                                    title="Bajar posición"
                                  >
                                    ▼
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  className="variant-expand-btn"
                                  onClick={() => setExpandedVariants(prev => ({ ...prev, [i]: !prev[i] }))}
                                  title="Opciones avanzadas"
                                >
                                  <Sliders size={13} />
                                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                                <button
                                  type="button"
                                  className="variant-delete-btn"
                                  onClick={() => {
                                    setValue(old => ({
                                      ...old,
                                      sizes: (old.sizes || []).filter((_, n) => n !== i)
                                    }));
                                  }}
                                  title="Eliminar variante"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="variant-advanced-panel">
                                {value.manageStock && (
                                  <label>
                                    Unidades de stock por venta
                                    <input
                                      type="number"
                                      min="1"
                                      max="1000"
                                      value={z.stockUnits || 1}
                                      onChange={e => updateVariant(i, { stockUnits: Number(e.target.value) })}
                                    />
                                  </label>
                                )}
                                <label>
                                  Máximo de sabores (heladería)
                                  <input
                                    type="number"
                                    min="0"
                                    max="10"
                                    value={z.max || 0}
                                    onChange={e => updateVariant(i, { max: Number(e.target.value) })}
                                  />
                                </label>
                                <label style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
                                  <input
                                    type="checkbox"
                                    checked={z.enabled !== false}
                                    onChange={e => updateVariant(i, { enabled: e.target.checked })}
                                  />
                                  Habilitada para la venta
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      className="add-variant-btn"
                      onClick={() => {
                        setValue(old => ({
                          ...old,
                          sizes: [
                            ...(old.sizes || []),
                            {
                              name: '',
                              salePrice: '',
                              price: 0,
                              max: 0,
                              enabled: true,
                              order: (old.sizes || []).length,
                              equivalent: 1,
                              stockUnits: 1,
                            }
                          ]
                        }));
                      }}
                    >
                      <Plus size={16} />
                      Agregar variante
                    </button>
                  </div>
                )}
              </div>

              {/* Control de Stock estilo OlaClick */}
              <div className="editor-card">
                <div className="stock-toggle-row">
                  <div className="stock-toggle-info">
                    <strong>
                      <Layers size={17} style={{ color: value.manageStock ? '#0284c7' : '#16a34a' }} />
                      Control de Stock
                    </strong>
                    <p className={value.manageStock ? 'stock-strict-hint' : 'stock-free-hint'}>
                      {value.manageStock
                        ? '📦 Control estricto activado: descuenta existencias físicas del módulo de Stock en cada venta.'
                        : '🟢 Venta libre (Recomendado): se puede vender siempre sin límites ni bloqueo a los mozos.'}
                    </p>
                  </div>
                  <label className="switch-control" title={value.manageStock ? 'Desactivar control de stock' : 'Activar control de stock'}>
                    <input
                      type="checkbox"
                      checked={Boolean(value.manageStock)}
                      onChange={e => change('manageStock', e.target.checked)}
                    />
                    <span className="switch-slider"></span>
                  </label>
                </div>
              </div>

              {/* Sabores / Modificadores específicos del producto */}
              <div className="editor-card">
                <label style={{ fontWeight: 'bold', color: '#0369a1', display: 'block', marginBottom: '6px', fontSize: '13.5px' }}>
                  🥤 Sabores o variedades de este producto (opcional)
                </label>
                <input
                  value={flavorInput}
                  onChange={e => {
                    const text = e.target.value;
                    setFlavorInput(text);
                    change(
                      'flavorOptions',
                      text.split(',').map(s => s.trim()).filter(Boolean)
                    );
                  }}
                  placeholder="Ej: Durazno, Naranja, Multifruta, Manzana"
                  style={{ width: '100%', background: '#fff' }}
                />
                <small style={{ display: 'block', color: '#075985', marginTop: '6px', lineHeight: '1.4' }}>
                  Escribí los sabores separados por coma. Si cargás opciones acá (por ejemplo para <em>Baggio</em>, <em>Gaseosas</em> o <em>Aguas</em>), el cliente o la moza deberán elegir obligatoriamente 1 sabor al pedirlo.
                </small>
                {value.flavorOptions?.length > 0 && (
                  <div className="flavor-chips-wrap">
                    {value.flavorOptions.map((fl, idx) => (
                      <span key={idx} className="flavor-chip">
                        ✓ {fl}
                        <button
                          type="button"
                          onClick={() => {
                            const updated = value.flavorOptions.filter((_, n) => n !== idx);
                            change('flavorOptions', updated);
                            setFlavorInput(updated.join(', '));
                          }}
                          title="Quitar sabor"
                        >
                          <X size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Habilitar venta */}
              <div className="editor-card" style={{ marginBottom: '10px' }}>
                <div className="stock-toggle-row">
                  <div className="stock-toggle-info">
                    <strong>Habilitar para la venta inmediata</strong>
                    <p style={{ color: '#64748b' }}>
                      {value.available
                        ? 'Habilitado para atención de mozos, mostrador y venta general.'
                        : 'Pausado: el producto no se podrá pedir.'}
                    </p>
                  </div>
                  <label className="switch-control" title={value.available ? "Pausar venta" : "Habilitar venta"}>
                    <input
                      type="checkbox"
                      checked={Boolean(value.available)}
                      onChange={e => change('available', e.target.checked)}
                    />
                    <span className="switch-slider"></span>
                  </label>
                </div>
              </div>

              {/* Mostrar en la carta digital */}
              <div className="editor-card" style={{ marginBottom: '10px' }}>
                <div className="stock-toggle-row">
                  <div className="stock-toggle-info">
                    <strong>Mostrar en la carta digital pública</strong>
                    <p style={{ color: '#64748b' }}>
                      {value.inMenu
                        ? 'Visible para los clientes al escanear el QR de mesa (/mesa/:id).'
                        : 'Oculto al público: solo se vende por Mostrador / Kiosco.'}
                    </p>
                  </div>
                  <label className="switch-control" title={value.inMenu ? "Ocultar de la carta digital" : "Mostrar en la carta digital"}>
                    <input
                      type="checkbox"
                      checked={Boolean(value.inMenu)}
                      onChange={e => change('inMenu', e.target.checked)}
                    />
                    <span className="switch-slider"></span>
                  </label>
                </div>
              </div>
            </>
          )}
        </fieldset>

        {error && <p className="alert" role="alert">{error}</p>}
        {uncertain && <p className="note">La respuesta no se confirmó. Reintentá el mismo guardado antes de cerrar.</p>}

        <div className="editor-footer-actions">
          <button
            type="button"
            className="cancel-btn"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="save-btn"
            disabled={busy || !s.connected}
          >
            {busy ? 'Guardando…' : uncertain ? 'Reintentar guardado' : item?.id ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </div>
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
  const [menuFilter, setMenuFilter] = useState('');
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

  async function handleMoveProduct(prodId, direction) {
    if (busy || !s.connected) return;
    const currentList = [...itemsList];
    const idx = currentList.findIndex(p => p.id === prodId);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentList.length) return;

    const temp = currentList[idx];
    currentList[idx] = currentList[targetIdx];
    currentList[targetIdx] = temp;

    const orderedIds = currentList.map(p => p.id);
    try {
      setBusy(true);
      await request('/menu-management/products-reorder', {
        method: 'PUT',
        body: { productIds: orderedIds }
      });
      await load();
      await refresh();
    } catch (e) {
      setError(e.message || 'No se pudo reordenar los productos.');
    } finally {
      setBusy(false);
    }
  }

  const itemsList = !data ? [] : (data[tab] || [])
    .filter(item => {
      const matchesSearch = item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase());
      if (!matchesSearch) return false;
      if (tab === 'products') {
        if (item.archived !== archived) return false;
        if (filter && item.categoryId !== filter && !item.publicCategories?.includes(filter)) return false;
        if (menuFilter === 'in_menu' && !item.inMenu) return false;
        if (menuFilter === 'off_menu' && item.inMenu) return false;
        return true;
      }
      if (tab === 'flavors') {
        if (flavorFilter === 'available') return item.available;
        if (flavorFilter === 'unavailable') return !item.available;
        return true;
      }
      return true;
    })
    .sort((a, b) => {
      if (tab === 'categories' || tab === 'products') {
        return (a.order ?? 0) - (b.order ?? 0);
      }
      return 0;
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
                <label>
                  Carta digital
                  <select value={menuFilter} onChange={e => setMenuFilter(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="in_menu">En la carta digital</option>
                    <option value="off_menu">Solo mostrador (kiosco)</option>
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
            {itemsList.map((item, idx) => (
              <article className="panel catalog-row" key={item.id}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flex: 1 }}>
                  {tab === 'products' && (
                    <div className="catalog-row-thumb">
                      {item.image ? (
                        <img src={item.image} alt={item.name} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      ) : (
                        <span className="catalog-row-thumb-empty"><Camera size={18} /></span>
                      )}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <h2>{item.name}</h2>
                  {tab === 'products' && (
                    <>
                      <strong>
                        {item.sizes?.length > 0
                          ? `Desde ${money(item.price)} · ${item.sizes.length} variante(s)`
                          : item.price == null
                          ? 'Consultar precio'
                          : money(item.price)}
                      </strong>
                      <p>
                        <strong>{data.categories.find(c => c.id === item.categoryId)?.name || 'Sin categoría'}</strong>
                        {item.publicCategories?.length > 0 && (
                          <span style={{ color: '#4f46e5', fontWeight: 600, fontSize: '0.82rem', marginLeft: '4px' }}>
                            {'(+ ' + item.publicCategories.map(cid => data.categories.find(c => c.id === cid)?.name).filter(Boolean).join(', ') + ')'}
                          </span>
                        )}
                        {' · '}
                        {item.archived
                          ? 'Retirado'
                          : !item.available
                          ? 'Venta deshabilitada'
                          : item.price == null
                          ? 'Precio pendiente'
                          : item.manageStock
                          ? 'Control de stock estricto'
                          : 'Venta libre'}
                        {' · '}
                        <Badge tone={item.inMenu ? 'green' : 'slate'} style={{ fontSize: '10.5px' }}>
                          {item.inMenu ? 'En carta digital' : 'Solo mostrador'}
                        </Badge>
                        {' · '}
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                          Orden: {item.order ?? 0}
                        </span>
                      </p>
                      {item.description && <p>{item.description}</p>}
                      {item.sizes?.length > 0 && (
                        <p style={{ color: '#475569', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                          <strong>Variantes:</strong> {item.sizes.map(z => {
                            const vPrice =
                              z.salePrice != null && z.salePrice !== ""
                                ? z.salePrice
                                : z.price != null && item.price != null
                                ? Number(item.price) + Number(z.price)
                                : z.price != null
                                ? z.price
                                : item.price;
                            return `${z.name} (${money(vPrice)})`;
                          }).join(' · ')}
                        </p>
                      )}
                      {item.flavorOptions?.length > 0 && (
                        <p style={{ color: '#0369a1', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                          <strong>Sabores:</strong> {item.flavorOptions.join(' · ')}
                        </p>
                      )}
                      {item.comboConfig?.is_combo && (
                        <p style={{ color: '#ea580c', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                          <strong>Combo:</strong> {item.comboConfig.steps?.map(s => s.title).join(' · ')}
                        </p>
                      )}
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
                    <div style={{ display: 'inline-flex', gap: '3px' }}>
                      <button
                        type="button"
                        className="secondary"
                        style={{ padding: '3px 7px', fontSize: '11px' }}
                        disabled={!s.connected || busy || idx === 0}
                        onClick={() => handleMoveProduct(item.id, 'up')}
                        title="Subir posición en la carta"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        style={{ padding: '3px 7px', fontSize: '11px' }}
                        disabled={!s.connected || busy || idx === itemsList.length - 1}
                        onClick={() => handleMoveProduct(item.id, 'down')}
                        title="Bajar posición en la carta"
                      >
                        ▼
                      </button>
                    </div>
                  )}

                  {tab === 'products' && !item.archived && (
                    <button
                      className={item.inMenu ? 'secondary' : 'primary'}
                      style={{ fontSize: '11px', padding: '4px 8px' }}
                      disabled={!s.connected || busy}
                      title={item.inMenu ? 'Visible en el menú digital (/mesa/:id). Clic para ocultar.' : 'Oculto del menú digital. Clic para agregar.'}
                      onClick={async () => {
                        try {
                          const res = await request('/menu-management/products/' + item.id + '/toggle-menu', { method: 'POST' });
                          item.inMenu = res.inMenu;
                          await load();
                          await refresh();
                          setMessage(res.inMenu ? `"${item.name}" se agregó a la carta digital de las mesas.` : `"${item.name}" se quitó de la carta digital (solo mostrador).`);
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      {item.inMenu ? 'Quitar de carta' : '+ A la carta'}
                    </button>
                  )}

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
