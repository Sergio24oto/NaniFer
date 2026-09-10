import {useState,useRef} from 'react';
import {readDraft,writeDraft,clearDraft} from './drafts';
export function useDraft(user,place,initialCart,account){
 const [draft,setDraft]=useState(()=>readDraft(user,place)||{cart:initialCart(),account});const current=useRef(draft);
 const [storageError,setStorageError]=useState('');
 function update(patch){const next={...current.current,...patch};current.current=next;setDraft(next);try{writeDraft(user,place,next);setStorageError('');}catch{setStorageError('No se pudo conservar el borrador en este navegador. No cierres esta pantalla antes de guardarlo.');}}
 return {cart:draft.cart,setCart:value=>update({cart:typeof value==='function'?value(current.current.cart):value}),account:draft.account,setAccount:account=>update({account}),storageError,clear:()=>{clearDraft(user,place);current.current={cart:[],account:current.current.account};setDraft(current.current);}};
}
