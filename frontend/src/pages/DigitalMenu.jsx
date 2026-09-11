import React, {useState,useEffect} from 'react';
import {useStore} from '../store';
import {money,estimate} from '../domain';
import Product from './Product';
import PublicCart from './PublicCart';
function Photo({src,alt,...props}) {const [failed,setFailed]=useState(false);return src && !failed ? <img {...props} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} /> : null;}
export default function DigitalMenu({table}) {
 useEffect(()=>{document.body.classList.add("public-menu-page");return()=>document.body.classList.remove("public-menu-page");},[]);
 const s=useStore();const [selected,setSelected]=useState(null);
 const [cart,setCartState]=useState(()=>{try{return JSON.parse(localStorage.getItem('nf.public.cart.'+table)||'[]');}catch{return [];}});const [product,setProduct]=useState(null),[showCart,setShowCart]=useState(false);
 const setCart=c=>{localStorage.setItem('nf.public.cart.'+table,JSON.stringify(c));setCartState(c);};
 const cat=s.catalog.categories.find(c=>c.id===selected);
 if(s.error) return <main><h1>No pudimos consultar el menú</h1><p role="alert">{s.error}</p><p>Consultá a la moza mientras se restablece el servicio.</p></main>;
 const products=cat?s.catalog.products.filter(p=>p.category===cat.name||p.publicCategories?.includes(cat.id)):[];
 return <main className="digital-menu"><span className="menu-table">Estás en la mesa {table}</span>
 {!cat ? <><div className="digital-intro"><span className="eyebrow">MENÚ DIGITAL · BIENVENIDOS</span><h1>Tu momento<br/><em>NaniFer.</em></h1><span className="digital-subtitle">HELADERÍA · CAFETERÍA · COMIDAS</span><p>Elegí una categoría para ver nuestra carta.<br/>Armá tu pedido o llamá a la moza.</p></div><div className="menu-section-title"><span>NUESTRA CARTA</span><h2>¿Qué te gustaría disfrutar?</h2></div><div className="digital-categories">{s.catalog.categories.map(c=><button className="digital-category" key={c.id} onClick={()=>{setSelected(c.id);window.scrollTo(0,0);}}><div className="category-photo"><Photo key={c.image} src={c.image} alt={c.name}/></div><span><span><small>DESCUBRÍ</small>{c.name}</span><span className="category-arrow" aria-hidden="true">↗</span></span></button>)}</div>{!s.catalog.categories.length&&<p>La carta todavía no tiene categorías visibles. Consultá a la moza.</p>}</> : <><button className="secondary menu-back" onClick={()=>setSelected(null)}>← Volver al menú</button><h1>{cat.name}</h1><p>Armá tu pedido o llamá a la moza.</p>{cat.note&&<aside className="combo-note">{cat.note}</aside>}<div className="digital-products">{products.map(p=><article key={p.id} className="digital-product"><Photo key={p.image} src={p.image} alt={p.name}/><div><div className="menu-product-heading"><h2>{p.name}</h2><strong>{p.pricePending ? "Consultar precio" : money(p.price)}</strong></div>{!p.available&&!p.pricePending&&<span className="badge amber">Agotado</span>}{p.description&&<p>{p.description}</p>}{p.sizes?.length>0&&<><h3>Presentaciones</h3><ul>{p.sizes.map(z=><li key={z.name}>{z.name} · {money(estimate(p,z.name,[]))}{z.max>0?' · hasta '+z.max+' sabores':''}{z.available===false?' · No disponible':''}</li>)}</ul></>}{p.extras?.length>0&&<><h3>Extras</h3><ul>{p.extras.map(e=><li key={e.name}>{e.name} · +{money(e.price)}</li>)}</ul></>}<button className="primary" disabled={!p.available||cart.length>=50||!!localStorage.getItem("nf.public.pending."+table)} onClick={()=>setProduct(p)}>Agregar</button></div></article>)}</div>{!products.length&&<p>Todavía no hay productos en esta categoría. Consultá a la moza.</p>}{products.some(p=>p.sizes?.some(z=>z.max>0))&&<section className="panel"><h2>Sabores</h2><p>{s.catalog.flavors.map(f=>f.name+(f.available?'':' (agotado)')).join(' · ')}</p></section>}</>}
 <button className="primary public-cart-bar" onClick={()=>setShowCart(true)}>Ver carrito · {cart.reduce((n,i)=>n+i.quantity,0)} productos · {money(cart.reduce((n,i)=>n+i.unitPrice*i.quantity,0))}</button>
 {product&&<Product product={product} onClose={()=>setProduct(null)} onAdd={i=>{setCart([...cart,i]);setProduct(null);}}/>}
 {showCart&&<PublicCart table={table} cart={cart} setCart={setCart} onClose={()=>setShowCart(false)}/>}
 </main>;
}
