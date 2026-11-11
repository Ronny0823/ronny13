'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const storage = new Map();
const events = [];
const context = vm.createContext({
  console, setTimeout, clearTimeout, TextEncoder,
  document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
  window: { location: {}, addEventListener() {}, open() { events.push('window'); return { close() {} }; } },
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) }
});
const run = source => vm.runInContext(source, context);
run(fs.readFileSync('organized/js/app.js', 'utf8'));
run(fs.readFileSync('organized/js/print-documents.js', 'utf8'));
run('showToast=()=>{};');
const state = run('AppState');
const docs = run('PrintDocuments');
const invoice = { type:'invoice', __backendId:'i1', sale_id:'s1', invoice_number:'FAC-PRUEBA',date:'2026-11-11T12:00:00Z',client_name:'Cliente de prueba',vehicle_plate:'TEST',payment_type:'credito',payment_status:'pendiente',sale_total:19200,subtotal:19200,tax:0,
 items:[{material_name:'Arena',quantity:6,price:1800,subtotal:10800},{material_name:'Grava',quantity:6,price:1400,subtotal:8400}] };
const sale = { ...invoice, type:'sale',__backendId:'s1',sale_quantity:12 };
const abono = { type:'payment',__backendId:'p1',sale_id:'s1',invoice_number:invoice.invoice_number,client_name:invoice.client_name,date:'2026-11-11T13:00:00Z',amount:5000,method:'transferencia',notes:'Banco de prueba' };
const pago = { ...abono,__backendId:'p2',date:'2026-11-11T14:00:00Z',amount:14200,is_full_payment:true };
const trip = {type:'direct_trip',__backendId:'t1',invoice_number:'VD-PRUEBA',date:invoice.date,source_company:'Origen de prueba',destination_client:invoice.client_name,driver_name:'Chofer de prueba',vehicle_plate:'TEST',material_type:'Grava',meters:6,trip_amount:8400,amount_paid:3000,notes:'Nota de viaje',payments:[{date:abono.date,amount:3000,method:'efectivo',payment_channel:'Oficina'}]};
state.data = [invoice,sale,abono,pago,trip];
const before = JSON.stringify(state.data);
const values = model => JSON.stringify(model);
assert(values(docs.payments([abono])).includes('ABONO RECIBIDO'));
assert(values(docs.payments([abono])).includes('14,200.00'));
assert(values(docs.payments([pago])).includes('PAGO RECIBIDO'));
assert(values(docs.payments([pago])).includes('TOTAL A SALDAR:'));
for (const expected of ['Banco de prueba','transferencia','Arena','Grava','FAC-PRUEBA']) assert(values(docs.payments([abono])).toLowerCase().includes(expected.toLowerCase()),expected);
for (const expected of ['19,200.00','0.00','Fecha de compra:','Cantidad:','Precio:']) assert(values(docs.credit([invoice],true)).includes(expected),expected);
const selected = docs.trips([trip]);
for (const expected of ['Origen de prueba','Chofer de prueba','Nota de viaje','5,400.00','Oficina']) assert(values(selected).includes(expected),expected);
assert.equal(selected.entries.filter(e=>e.label==='Fecha del pago:').length,1);
const quote=docs.quote({quote_number:'COT-PRUEBA',client_name:invoice.client_name,client_phone:'8090000000',date:invoice.date,valid_until:'2026-11-20',items:invoice.items,subtotal:19200,total:19200,tax:0,tax_rate:0,note:'Nota de cotización'});
assert(values(quote).includes('TOTAL COTIZADO'));
assert(values(quote).includes('8090000000'));
assert(values(quote).includes('Nota de cotización'));
assert(!quote.signature);
assert(!docs.payments([abono]).signature);
assert.equal(JSON.stringify(state.data),before,'La preparación de documentos no debe modificar registros');
const appSource=fs.readFileSync('organized/js/app.js','utf8'), quoteSource=fs.readFileSync('organized/js/quotations.js','utf8');
assert(appSource.includes("await createExactClientPdf('COMPROBANTE DE ABONO')"));
assert(appSource.includes("await createExactClientPdf('RECIBO DE PAGO TOTAL'"));
assert(quoteSource.includes("const navy = '#142640'"));
assert.equal(docs.credit([]),null);
assert.equal(docs.payment('inexistente'),null);
// Verifica que todos los puntos de entrada sigan conectados al formato común.
const originalPrint=docs.print, originalPdf=docs.pdf;
context.capture = (type,...args) => { events.push(type); return {type,args}; };
run('PrintDocuments.print=(...args)=>capture("print",...args); PrintDocuments.pdf=(...args)=>capture("pdf",...args);');
(async()=>{
 context.SaleInvoice={
  createDocumentPDF:async(document,mode)=>({save(){events.push('download:'+mode);}}),
  documentHTML:async(document,mode)=>'<html>'+document.title+'</html>',
  documentBytes:async()=>new Uint8Array([1,2,3])
 };
 run('openPrintDocument=(html)=>capture("html",html); BluetoothPrinter.writeBytes=async()=>capture("bluetooth"); sharePdfDocument=async()=>capture("share");');
 state.config.printer_type='standard';await originalPrint(quote);assert(events.includes('html'));
 state.config.printer_type='thermal_58';await originalPrint(quote);assert(events.includes('download:thermal_58'));
 state.config.printer_type='bluetooth';state.config.bluetooth_print_mode='thermal_80';await originalPrint(quote);assert(events.includes('bluetooth'));
 await originalPdf(quote,{share:true,mode:'standard'});assert(events.includes('share'));
 state.config.printer_type='standard';
 for (const [name,args] of [
 ['printPaymentReceipt',['p1']],['generatePaymentReceiptPDF',['p1']],['printDirectTripInvoice',['t1']],['generateDirectTripPDF',['t1']],
 ['printDirectTripPaymentReceipt',[trip,3000,'efectivo','Oficina']],['generateDirectTripPaymentPDF',[trip,3000,'efectivo','Oficina']],

 ['generateConsolidatedCreditInvoicePDF',[[invoice]]],['generateConsolidatedCreditPaymentPDF',[[abono]]],['printDailyMetersReport',[]]
 ]) {
   const result=await context[name](...args);assert(result?.args?.[0]?.title,name);
 }
 assert(events.filter(e=>e==='print').length>=4);
 assert(events.filter(e=>e==='pdf').length>=4);
 console.log('Impresión unificada: detalles, pagos/abonos, saldos históricos, rutas, cotizaciones y puntos de entrada verificados.');
})().catch(error=>{console.error(error);process.exitCode=1;});
