const key=(user,place)=>'nf.draft.v1.'+user+'.'+place;
export function readDraft(user,place){try{const d=JSON.parse(sessionStorage.getItem(key(user,place))||'null');return d&&Array.isArray(d.cart)?d:null;}catch{return null;}}
export function writeDraft(user,place,draft){if(!user)throw Error('Falta la usuaria del borrador.');if(draft.cart.length)sessionStorage.setItem(key(user,place),JSON.stringify(draft));else clearDraft(user,place);}
export function clearDraft(user,place){sessionStorage.removeItem(key(user,place));}
