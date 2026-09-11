import React,{useState,useEffect,useRef} from 'react';
import {request} from '../store';
import {money,itemInput,operationId} from '../domain';
import {Modal,Items} from '../components';
export function publicDevice(){let id=localStorage.getItem('nf.public.device');if(!id){id=operationId();localStorage.setItem('nf.public.device',id);}return id;}
export default function PublicCart({table,cart,setCart,onClose}){
 const [orders,setOrders]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[alternative,setAlternative]=useState(false);
 const scope='nf.public.pending.'+table;const [pending,setPending]=useState(()=>JSON.parse(localStorage.getItem(scope)||'null'));const lock=useRef(false);
 const total=cart.reduce((n,i)=>n+i.unitPrice*i.quantity,0);
 async function load(){try{setOrders(await request('/public/qr/'+table+'/orders',{device:publicDevice()}));}catch{}}
 function confirmed(result,kind){localStorage.removeItem(scope);setPending(null);setError('');if(kind==='orders'){setCart([]);setMessage('¡Pedido enviado!');void load();}else setMessage('La moza fue avisada. En breve se acercará a la mesa '+table+'. Tu selección no fue enviada.');}
 useEffect(()=>{void load();const t=setInterval(()=>{void load();},4000);return()=>clearInterval(t);},[table]);
 useEffect(()=>{if(!pending||busy)return;let live=true;const check=async()=>{try{const r=await request('/public/qr/'+table+'/operations/'+pending.key,{device:publicDevice()});if(live&&r.confirmed)confirmed(r.result,pending.kind);}catch{}};void check();const t=setInterval(check,4000);return()=>{live=false;clearInterval(t);};},[pending,busy]);
 async function send(kind){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const p=pending||{kind,key:operationId(),body:kind==='orders'?{items:cart.map(itemInput)}:{}};localStorage.setItem(scope,JSON.stringify(p));setPending(p);const r=await request('/public/qr/'+table+'/'+p.kind,{method:'POST',key:p.key,body:p.body,device:publicDevice()});confirmed(r,p.kind);}catch(e){setError(e.message);if(!e.uncertain){localStorage.removeItem(scope);setPending(null);}}finally{lock.current=false;setBusy(false);}}
 return <Modal title={'Tu selección · Mesa '+table} onClose={()=>!busy&&onClose()}>
 {message&&<p className="success" role="status">{message}</p>}{error&&<p className="alert" role="alert">{error}</p>}
 {pending&&!busy&&<p role="status" className="note">Estamos comprobando si {pending.kind==='orders'?'el pedido fue recibido':'la moza fue avisada'}. <button onClick={()=>send(pending.kind)}>Reintentar de forma segura</button></p>}
 {!cart.length&&<p>Tu carrito está vacío.</p>}{cart.map((i,n)=><div className="quick-line" key={n}><div><strong>{i.name}</strong><small>{i.size}</small><small>{money(i.unitPrice*i.quantity)}</small></div><label>Cantidad<input aria-label={'Cantidad de '+i.name} type="number" min="1" max="99" disabled={busy||!!pending} value={i.quantity} onChange={e=>{const q=Number(e.target.value);if(Number.isInteger(q)&&q>0&&q<=99)setCart(cart.map((x,j)=>j===n?{...x,quantity:q}:x));}}/></label><button disabled={busy||!!pending} onClick={()=>setCart(cart.filter((_,j)=>j!==n))}>Quitar</button></div>)}
 {!!cart.length&&<><div className="total"><span>Total estimado</span><strong>{money(total)}</strong></div><small>El servidor confirma los precios y la disponibilidad al enviar.</small><p>Tu pedido se enviará directamente al personal.</p><button className="primary full" disabled={busy||!!pending} onClick={()=>send('orders')}>{busy?'Enviando…':'Enviar pedido a recepción'}</button><button className="secondary full" disabled={busy||!!pending} onClick={()=>setAlternative(true)}>Prefiero pedirle a la moza</button>{alternative&&<div className="note"><p>Avisaremos a la moza para que se acerque a tu mesa. Tu selección no se enviará.</p><button className="primary" disabled={busy||!!pending} onClick={()=>send('call')}>Llamar a la moza</button></div>}</>}
 {!!orders.length&&<section><h2>Tus pedidos enviados</h2>{orders.map(o=><article className="panel" key={o.id}><strong>Pedido {o.number}</strong><p>Mesa {o.table} · {o.status==='pendiente'?'Recibido':o.status}</p><Items items={o.items}/><strong>{money(o.total)}</strong></article>)}</section>}
 </Modal>;
}
