import test from 'node:test';
import assert from 'node:assert/strict';
import {readDraft,writeDraft,clearDraft} from './drafts.js';
const memory=new Map();globalThis.sessionStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
test('borradores separados por usuaria, mesa y Mostrador; recuperables tras navegar',()=>{
 writeDraft('a','table-1',{cart:[{productId:'uno',quantity:2}],account:'visita-1'});
 writeDraft('a','table-2',{cart:[{productId:'dos',quantity:1}],account:null});
 writeDraft('a','counter',{cart:[{productId:'tres',quantity:1}],account:null});
 assert.equal(readDraft('b','table-1'),null);
 assert.equal(readDraft('a','table-1').account,'visita-1');
 assert.equal(readDraft('a','table-2').cart[0].productId,'dos');
 clearDraft('a','table-1');assert.equal(readDraft('a','table-1'),null);
 assert.equal(readDraft('a','counter').cart.length,1);assert.equal(readDraft('a','table-2').cart.length,1);
});
test('vaciar un borrador elimina solo su clave y datos corruptos no rompen la pantalla',()=>{
 writeDraft('a','counter',{cart:[],account:null});assert.equal(readDraft('a','counter'),null);
 memory.set('nf.draft.v1.a.table-3','no json');assert.equal(readDraft('a','table-3'),null);
});
