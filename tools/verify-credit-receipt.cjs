'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const storage=new Map(),events=[],pdfs=[];const library=process.env.CREDIT_TEST_JSPDF?require(process.env.CREDIT_TEST_JSPDF):null;
const context=vm.createContext({console,setTimeout,clearTimeout,TextEncoder,
 document:{addEventListener(){},getElementById(){return null;},querySelectorAll(){return[];}},
 window:{location:{},addEventListener(){},jspdf:{jsPDF:function(options){if(!library)throw new Error('Renderizado no solicitado');const doc=new library.jsPDF(options);doc.save=name=>pdfs.push({name,doc,bytes:Buffer.from(doc.output('arraybuffer'))});return doc;}}},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
const run=s=>vm.runInContext(s,context);
for(const file of ['app','sale-invoice','credit-receipt'])run(fs.readFileSync('organized/js/'+file+'.js','utf8'));
context.capture=(name,...args)=>events.push({name,args});
run('showToast=()=>{};openPrintDocument=html=>capture("standard",html);openCombinedCreditPrint=()=>capture("standard");BluetoothPrinter.writeBytes=async bytes=>capture("bluetooth",bytes);BluetoothPrinter.printText=async()=>capture("legacy-bluetooth");');
const state=run('AppState'),credit=run('CreditReceipt'),renderer=run('SaleInvoice.thermalDocument');
Object.assign(state.config,{company_name:'AGRECACI',company_slogan:'Calidad en cada metro cúbico',company_rfc:'1-31-33066-5',company_phone:'809-467-2820 / 809-467-2810',company_logo:''});
const pending={type:'invoice',__backendId:'ip',sale_id:'sp',invoice_number:'FAC-2591',client_name:'Franklin',vehicle_plate:'S025819',date:'2026-11-07T14:00:00',payment_type:'credito',sale_total:4250,subtotal:4250,tax:0,items:[{material_name:'Panete',quantity:2.5,price:1700,subtotal:4250}]};
const paid={...pending,__backendId:'if',sale_id:'sf',invoice_number:'FAC-2533',date:'2026-10-31T14:00:00',sale_total:3450,subtotal:3450,items:[{material_name:'Arena',quantity:.5,price:1700,subtotal:850},{material_name:'Grava',quantity:2,price:1300,subtotal:2600}]};
const abono={...pending,__backendId:'ia',sale_id:'sa',invoice_number:'FAC-2393',client_name:'Deisy',vehicle_plate:'',sale_total:5400,subtotal:5400,items:[{material_name:'Panete',quantity:3,price:1800,subtotal:5400}]};
const sale=invoice=>({...invoice,type:'sale',__backendId:invoice.sale_id,invoice_id:invoice.__backendId,sale_subtotal:invoice.subtotal,sale_tax:invoice.tax});
const fullPayment={type:'payment',__backendId:'pf',sale_id:'sf',invoice_number:paid.invoice_number,client_name:'Franklin',date:'2026-11-01T13:08:00',amount:3450,method:'transferencia',notes:'Cooperativa San José',is_full_payment:true};
const payment={type:'payment',__backendId:'pa',sale_id:'sa',invoice_number:abono.invoice_number,client_name:'Deisy',date:'2026-10-26T10:02:00',amount:3400,method:'efectivo'};
state.data=[pending,paid,abono,sale(pending),sale(paid),sale(abono),fullPayment,payment];
const baseline=JSON.stringify(state.data),normal=credit.invoiceModels([pending])[0],settled=credit.invoiceModels([paid],true)[0],deposit=credit.paymentModels([payment])[0];
assert.equal(credit.invoiceModels([{...pending,subtotal:''}])[0].subtotal,4250,'Un subtotal vacío no debe convertirse en cero');
assert.equal(normal.total,4250);assert.equal(normal.pending,4250);assert.equal(settled.kind,'paid');assert.equal(settled.pending,0);assert.equal(settled.method,'TRANSFERENCIA');assert.equal(settled.route,'Cooperativa San José');assert.equal(deposit.received,3400);assert.equal(deposit.pending,2000);assert.equal(deposit.details[0].remaining,2000);
const later={...payment,__backendId:'later',date:'2026-10-30T09:00:00',amount:500};state.data.push(later);
const history=credit.paymentModels([payment])[0];assert.equal(history.details[0].remaining,2000,'El abono debe conservar el saldo histórico');assert.equal(history.pending,1500,'El saldo de cuenta debe incluir pagos posteriores');
state.data.push({...later,__backendId:'final',date:'2026-11-01T09:00:00',amount:1500});const final=credit.singlePaymentModels(state.data.at(-1))[0];assert.equal(final.kind,'paid');assert.equal(final.received,1500);assert.equal(final.total,5400);assert.equal(final.pending,0);
state.data.splice(-2);assert.equal(JSON.stringify(state.data),baseline);
assert.equal(credit.paymentModels([payment,fullPayment]).length,2,'No se deben mezclar cuentas de clientes distintos');
assert.equal(credit.singlePaymentModels({...payment,sale_id:'unknown',invoice_number:'missing',client_name:'Unknown'})[0].pending,null);
let selection=[pending],payments=[payment];context.getInvoices=()=>({selectedIds:selection.map(i=>i.sale_id),invoices:selection,selectedSales:selection.map(i=>({sale:state.data.find(s=>s.__backendId===i.sale_id),remaining:i.sale_total}))});context.getPayments=()=>payments;
run('getSelectedCreditInvoiceData=()=>getInvoices();getSelectedCreditPayments=()=>getPayments();');
const originalPDF=renderer.pdfBatch,originalBytes=renderer.bluetoothBytes;
renderer.pdfBatch=async(builders,mode)=>{const content=builders.map(b=>b(mode==='thermal_58'?58:80,(v,s)=>String(v).length*s*.5).blocks.flatMap(b=>b.commands).filter(c=>c.type==='text').map(c=>c.value).join('\n'));events.push({name:'thermal-pdf',mode,content});};
renderer.bluetoothBytes=async()=>new Uint8Array([29,118,48,0]);
(async()=>{
 for(const mode of ['thermal_58','thermal_80']){
  state.config.printer_type=mode;state.creditFilters.status='pending';selection=[pending];await context.printSelectedCreditInvoices('Franklin');assert.equal(events.at(-1).name,'thermal-pdf');assert(events.at(-1).content[0].includes('Pañete'));assert(events.at(-1).content[0].includes('ESTADO: PENDIENTE'));
  state.creditFilters.status='paid';selection=[paid];await context.printSelectedCreditInvoices('Franklin');assert(events.at(-1).content[0].includes('RECIBO DE PAGO TOTAL'));assert(events.at(-1).content[0].includes('CONFORMIDAD DEL CLIENTE'));
  await context.printSelectedCreditPayments();assert(events.at(-1).content[0].includes('CONFORMIDAD DEL CLIENTE'));assert(events.at(-1).content[0].includes('Firma del cliente'));
  await context.printPaymentReceipt(payment.__backendId);assert(events.at(-1).content[0].includes('ABONOS SELECCIONADOS'));
  await context.printPaymentReceipt(fullPayment.__backendId);assert(events.at(-1).content[0].includes('RECIBO DE PAGO TOTAL'));
  await context.printMultiplePaymentReceipt([{sale:state.data.find(s=>s.__backendId==='sf')}],3450,'transferencia','Cooperativa San José');assert(events.at(-1).content[0].includes('PAGO TOTAL'));
  state.config.printer_type='bluetooth';state.config.bluetooth_print_mode=mode;
  for(const action of [()=>context.printSelectedCreditInvoices('Franklin'),()=>context.printSelectedCreditPayments(),()=>context.printPaymentReceipt(payment.__backendId),()=>context.printMultiplePaymentReceipt([{sale:state.data.find(s=>s.__backendId==='sf')}],3450,'transferencia','Cooperativa San José')]){await action();assert.equal(events.at(-1).name,'bluetooth');}
 }
 state.config.printer_type='standard';await context.printSelectedCreditInvoices('Franklin');assert.equal(events.at(-1).name,'standard');await context.printSelectedCreditPayments();assert.equal(events.at(-1).name,'standard');await context.printPaymentReceipt(payment.__backendId);assert.equal(events.at(-1).name,'standard');
 renderer.pdfBatch=originalPDF;renderer.bluetoothBytes=originalBytes;
 if(library){
  context.fontFiles={regular:fs.readFileSync('organized/assets/fonts/LiberationSans-Regular.ttf').toString('base64'),bold:fs.readFileSync('organized/assets/fonts/LiberationSans-Bold.ttf').toString('base64')};run('loadExactPdfFontFiles=async()=>fontFiles;');
  for(const mode of ['thermal_58','thermal_80']){
   for(const action of [()=>credit.downloadInvoices([pending],false,mode),()=>credit.downloadInvoices([paid],true,mode),()=>credit.downloadPayments([payment],mode)]){
    await action();const result=pdfs.at(-1);assert.equal(result.doc.getNumberOfPages(),1);assert(Math.abs(result.doc.internal.pageSize.getWidth()-(mode==='thermal_58'?58:80))<.1);
    if(process.env.CREDIT_TEST_OUTPUT){fs.mkdirSync(process.env.CREDIT_TEST_OUTPUT,{recursive:true});fs.writeFileSync(process.env.CREDIT_TEST_OUTPUT+'/'+result.name,result.bytes);}
   }
   await credit.downloadInvoices(Array.from({length:20},(_,i)=>({...pending,__backendId:'copy-'+i,invoice_number:'FAC-LONG-'+i})),false,mode);assert(pdfs.at(-1).doc.getNumberOfPages()>1,'Debe paginar selecciones largas');
  }
  let shared;context.captureShare=doc=>{shared=doc;};run('sharePdfDocument=async doc=>captureShare(doc);');state.config.printer_type='thermal_58';
  for(const action of [()=>context.generateClientCreditReportPDF([pending],false),()=>context.generateClientCreditReportPDF([paid],true),()=>context.generateClientPaymentReportPDF([payment]),()=>context.generateConsolidatedCreditInvoicePDF([pending],false,true),()=>context.generateConsolidatedCreditPaymentPDF([payment],true)]){await action();assert(shared.internal.pageSize.getWidth()>200,'PDF WhatsApp debe conservar su formato');}
 }
 assert.equal(JSON.stringify(state.data),baseline,'La impresión no debe modificar ventas, facturas ni abonos');
 console.log('Crédito y abonos: saldos históricos/actuales, tres diseños, selección, Bluetooth y formatos normales verificados.');
})().catch(error=>{console.error(error);process.exitCode=1;});
