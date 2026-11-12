'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const storage=new Map(),fields=new Map(),messages=[];let modal='',saves=0;
const context=vm.createContext({console,setTimeout,clearTimeout,crypto:webcrypto,navigator:{onLine:true},lucide:{createIcons(){}},
 document:{addEventListener(){},getElementById:id=>fields.get(id)||null,querySelectorAll:()=>[]},window:{location:{},addEventListener(){}},
 localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
});
const run=s=>vm.runInContext(s,context);
run(fs.readFileSync('organized/js/app.js','utf8'));
const state=run('AppState'),sync=run('SupabaseSync');
sync.originalSetItem=(key,value)=>storage.set(key,value);
context.captureToast=message=>messages.push(message);
context.captureModal=html=>{modal=html;const tag=html.match(/<input type="text" id="tripInvoiceNumber"[\s\S]*?>/)[0];fields.set('tripInvoiceNumber',{value:tag.match(/value="([^"]*)"/)[1],dataset:{manualNumber:'false'},focus(){this.focused=true;}});};
run('showToast=message=>captureToast(message);showModal=html=>captureModal(html);closeModal=()=>{};renderPage=()=>{};');
state.currentUser='number-test';state.saveUserData=async()=>{saves++;};
function setForm(number,manual='true'){
 for(const [id,value] of Object.entries({tripDate:'2026-11-11T14:00',tripAmount:'10000',tripPaymentStatus:'pendiente',tripInvoiceNumber:number,tripSourceCompany:'Agrecaci',tripDriverName:'Ramon',tripVehiclePlate:'L283172',tripMaterialType:'Arena',tripDestinationClient:'Danilo Colon',tripMeters:'16',tripNotes:''}))fields.set(id,{value,dataset:{manualNumber:manual},focus(){this.focused=true;}});
 return {preventDefault(){},currentTarget:{dataset:{}}};
}
(async()=>{
 storage.set('erp_invoice_block_number-test',JSON.stringify({next:1234,end:1299}));
 assert.equal(await context.generateDirectTripInvoiceNumber(),'VD-001234');
 assert.equal(await context.generateDirectTripInvoiceNumber(),'VD-001235');
 state.data=[{type:'direct_trip',__backendId:'existing-auto',invoice_number:'VD-001236'}];
 assert.equal(await context.generateDirectTripInvoiceNumber(),'VD-001237');
 storage.delete('erp_invoice_block_number-test');let rpcCalls=0;
 sync.client={rpc:async(name,params)=>{rpcCalls++;assert.equal(name,'reserve_erp_invoice_numbers');assert.equal(params.p_count,50);return {data:{start:2000,end:2049},error:null};}};
 assert.equal(await context.generateDirectTripInvoiceNumber(),'VD-002000');assert.equal(await context.generateDirectTripInvoiceNumber(),'VD-002001');assert.equal(rpcCalls,1);
 context.showDirectTripModal();let input=fields.get('tripInvoiceNumber');await input.directTripNumberRequest;await Promise.resolve();assert.equal(input.value,'VD-002002');
 assert(!/readonly|disabled/.test(modal.match(/<input type="text" id="tripInvoiceNumber"[\s\S]*?>/)[0]));
 const generator=context.generateInvoiceNum;let resolveNumber;context.generateInvoiceNum=()=>new Promise(resolve=>{resolveNumber=resolve;});
 context.showDirectTripModal();input=fields.get('tripInvoiceNumber');input.value='MI-FACTURA';input.dataset.manualNumber='true';resolveNumber('FAC-2003');await input.directTripNumberRequest;await Promise.resolve();assert.equal(input.value,'MI-FACTURA');context.generateInvoiceNum=generator;
 let event=setForm(' mi-factura ');await context.saveDirectTrip(event,'');const created=state.data.at(-1);assert.equal(created.invoice_number,'MI-FACTURA');assert.equal(saves,1);
 created.amount_paid=3000;created.payments=[{amount:3000,date:'2026-11-11',method:'efectivo'}];const originalPayments=JSON.stringify(created.payments);
 const blockBefore=storage.get('erp_invoice_block_number-test');context.showDirectTripModal(created.__backendId);assert.equal(fields.get('tripInvoiceNumber').value,'MI-FACTURA');assert.equal(storage.get('erp_invoice_block_number-test'),blockBefore);
 event=setForm('FACTURA-CAMBIADA');await context.saveDirectTrip(event,created.__backendId);assert.equal(created.invoice_number,'FACTURA-CAMBIADA');assert.equal(created.amount_paid,3000);assert.equal(JSON.stringify(created.payments),originalPayments);assert.equal(saves,2);
 const count=state.data.length;event=setForm('factura-cambiada');await context.saveDirectTrip(event,'');assert.equal(state.data.length,count);assert.equal(saves,2);assert(messages.at(-1).includes('ya está registrado'));assert(fields.get('tripInvoiceNumber').focused);
 event=setForm('  ');await context.saveDirectTrip(event,'');assert.match(state.data.at(-1).invoice_number,/^VD-\d{6}$/);assert.equal(saves,3);
 let releaseSave;state.saveUserData=()=>new Promise(resolve=>{releaseSave=resolve;});event=setForm('UNA-SOLA-VEZ');const first=context.saveDirectTrip(event,'');await context.saveDirectTrip(event,'');assert.equal(state.data.filter(t=>t.invoice_number==='UNA-SOLA-VEZ').length,1);releaseSave();await first;assert.equal(event.currentTarget.dataset.saving,undefined);
 context.navigator.onLine=false;sync.client=null;storage.delete('erp_invoice_block_number-test');storage.set('erp_v2_device_id','device-test123');const offline1=await context.generateDirectTripInvoiceNumber(),offline2=await context.generateDirectTripInvoiceNumber();assert.match(offline1,/^VD-OFF-/);assert.notEqual(offline1,offline2);
 console.log('Numeración de viajes: automática, reserva compartida, edición manual, pagos conservados, duplicados y modo sin conexión verificados.');
})().catch(error=>{console.error(error);process.exitCode=1;});
