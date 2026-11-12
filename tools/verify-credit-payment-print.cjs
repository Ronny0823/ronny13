'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const fields=new Map(),scheduled=[],documents=[],pending=[],storage=new Map();let confirms=true,saves=0;
const context=vm.createContext({console,TextEncoder,crypto:webcrypto,confirm:()=>confirms,
 setTimeout:callback=>{scheduled.push(callback);return scheduled.length;},clearTimeout(){},
 document:{addEventListener(){},getElementById:id=>fields.get(id)||null,querySelectorAll(){return[];}},
 window:{location:{},addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
const run=source=>vm.runInContext(source,context);
for(const file of ['app','sale-invoice','credit-receipt'])run(fs.readFileSync('organized/js/'+file+'.js','utf8'));
run('showToast=()=>{};closeModal=()=>{};renderPage=()=>{};');
const state=run('AppState'),renderer=run('SaleInvoice.thermalDocument');
state.saveUserData=async()=>{saves++;state.data=JSON.parse(JSON.stringify(state.data));};
function content(builder,mode){return builder(mode==='thermal_58'?58:80,(v,size)=>String(v).length*size*.5).blocks.flatMap(b=>b.commands).filter(c=>c.type==='text').map(c=>c.value).join('\n');}
renderer.pdfBatch=async(builders,mode)=>{documents.push(...builders.map(b=>content(b,mode)));};
renderer.bluetoothBytes=async builder=>{documents.push(content(builder,state.config.bluetooth_print_mode));return new Uint8Array([29,118,48,0]);};
run('BluetoothPrinter.writeBytes=async()=>{};');
const originalMultiple=context.printMultiplePaymentReceipt;
context.printMultiplePaymentReceipt=(...args)=>{const promise=originalMultiple(...args);pending.push(promise);return promise;};
function fixture(){
 const invoice={type:'invoice',__backendId:'invoice',sale_id:'sale',invoice_number:'FAC-2533',client_name:'Franklin',vehicle_plate:'S025819',date:'2026-10-25T10:00:00',sale_total:3450,subtotal:3450,tax:0,payment_type:'credito',items:[{material_name:'Arena',quantity:.5,price:1700,subtotal:850},{material_name:'Grava',quantity:2,price:1300,subtotal:2600}]};
 const sale={...invoice,type:'sale',__backendId:'sale',invoice_id:'invoice',payment_status:'pendiente',amount_paid:1000};
 const previous={type:'payment',__backendId:'previous',sale_id:'sale',invoice_number:'FAC-2533',client_name:'Franklin',amount:1000,date:'2026-11-02T09:00:00',method:'efectivo'};
 state.data=[invoice,sale,previous];fields.clear();documents.length=0;scheduled.length=0;pending.length=0;
 for(const [id,value] of Object.entries({paymentMethod:'transferencia',paymentNotes:'Cooperativa San José',fullPaymentAmount:'2450',paymentAmount:'2450',entryDate:'2026-11-01T13:08:00',multiPaymentMethod:'transferencia',multiPaymentNotes:'Cooperativa San José'}))fields.set(id,{value});
 fields.set('chk_sale',{checked:true});return sale;
}
async function drain(){while(scheduled.length)await scheduled.shift()();await Promise.all(pending.splice(0));}
const event=()=>({preventDefault(){}});
(async()=>{
 for(const printer of ['thermal_58','thermal_80','bluetooth_58','bluetooth_80']){
  state.config.printer_type=printer.startsWith('bluetooth')?'bluetooth':printer;
  state.config.bluetooth_print_mode=printer.endsWith('58')?'thermal_58':'thermal_80';
  fixture();await context.saveFullPayment(event(),'sale',2450);assert.equal(scheduled.length,1);const newPayment=state.data.at(-1);assert.equal(newPayment.is_full_payment,true);await drain();
  assert.equal(documents.length,1);const full=documents.at(-1);for(const text of ['RECIBO DE PAGO TOTAL','LIQUIDACIÓN COMPLETA','2,450.00','1,000.00','DEUDA LIQUIDADA COMPLETAMENTE','CONFORMIDAD DEL CLIENTE','Confirmo el pago total de las facturas','únicamente estas liquidadas y sin saldo pendiente.','Firma del cliente','Cooperativa San José','Arena','Grava'])assert(full.replace(/\s+/g,' ').includes(text),printer+': '+text);
  const count=state.data.length;await context.printPaymentReceipt(newPayment.__backendId);assert(documents.at(-1).includes('RECIBO DE PAGO TOTAL'));assert.equal(state.data.length,count);
  fixture();fields.get('fullPaymentAmount').value='500';await context.saveFullPayment(event(),'sale',2450);assert.equal(state.data.at(-1).is_full_payment,false);await drain();assert(documents.at(-1).includes('ABONOS SELECCIONADOS'));assert(!documents.at(-1).includes('DEUDA LIQUIDADA COMPLETAMENTE'));
  fixture();await context.savePayment(event(),'sale',2450);assert.equal(state.data.at(-1).is_full_payment,true);await drain();assert(documents.at(-1).includes('RECIBO DE PAGO TOTAL'));
  fixture();await context.processMultiplePayment(event(),'Franklin');await drain();assert(documents.at(-1).includes('RECIBO DE PAGO TOTAL'));assert(documents.at(-1).includes('2,450.00'));
 }
 fixture();confirms=false;state.config.printer_type='thermal_80';await context.saveFullPayment(event(),'sale',2450);await drain();assert.equal(documents.length,0);assert.equal(state.data.filter(r=>r.type==='payment').length,2);
 const legacy=[];context.printPaymentReceipt=id=>legacy.push(id);state.config.printer_type='standard';await context.printSavedCreditPayment(state.data.at(-1).__backendId);assert.equal(legacy.length,1);
 assert.equal(saves,17);
 console.log('Pago recién guardado: pago total, abono, fecha anterior, reimpresión y pago múltiple verificados en 58/80 mm y Bluetooth.');
})().catch(error=>{console.error(error);process.exitCode=1;});
