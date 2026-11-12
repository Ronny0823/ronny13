'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const vendor='android/app/src/main/assets/vendor/jspdf.umd.min.js';
const libraryPath=process.env.CREDIT_STOP_JSPDF || (fs.existsSync(vendor)?path.resolve(vendor):'');
const pdfLibrary=libraryPath?require(libraryPath):null;
const fields=new Map(),storage=new Map(),timers=[],documents=[],writes=[];let saves=0,confirmations=0;
const context=vm.createContext({console:{...console,error(){}},crypto:webcrypto,TextEncoder,setTimeout,clearTimeout,
 confirm:()=>{confirmations++;return true;},
 document:{addEventListener(){},getElementById:id=>fields.get(id)||null,querySelectorAll(){return[];}},
 window:{location:{},addEventListener(){},jspdf:{jsPDF:function(options){const doc=new pdfLibrary.jsPDF(options);doc.save=()=>{};return doc;}}},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
const run=s=>vm.runInContext(s,context);
for(const name of ['app','sale-invoice','credit-receipt'])run(fs.readFileSync('organized/js/'+name+'.js','utf8'));
run('showToast=()=>{};closeModal=()=>{};renderPage=()=>{};');
const state=run('AppState'),credit=run('CreditReceipt'),renderer=run('SaleInvoice.thermalDocument');
const invoice={type:'invoice',__backendId:'i1',sale_id:'s1',invoice_number:'FAC-1',client_name:'Cliente',payment_type:'credito',date:'2026-11-12T08:00:00',sale_total:1000,subtotal:1000,tax:0,items:[{material_name:'Arena',quantity:1,price:1000,subtotal:1000}]};
const second={...invoice,__backendId:'i2',sale_id:'s2',invoice_number:'FAC-2'};
state.data=[invoice,second,...[invoice,second].map(i=>({...i,type:'sale',__backendId:i.sale_id,invoice_id:i.__backendId,payment_status:'pendiente'}))];
state.config.printer_type='bluetooth';state.config.bluetooth_print_mode='thermal_80';
for(const [id,value] of Object.entries({multiPaymentMethod:'efectivo',multiPaymentNotes:'Caja'}))fields.set(id,{value});
for(const id of ['s1','s2'])fields.set('chk_'+id,{checked:true});
const originalBytes=renderer.bluetoothBytes;renderer.bluetoothBytes=async builder=>{documents.push(builder);return new Uint8Array([29,86,66,0]);};
run('BluetoothPrinter.writeBytes=async bytes=>captureWrite(bytes);');context.captureWrite=bytes=>writes.push(bytes);
(async()=>{
 let releaseSave;state.saveUserData=()=>{saves++;return new Promise(resolve=>{releaseSave=resolve;});};
 context.setTimeout=callback=>{timers.push(callback);};
 const first=context.processMultiplePayment({preventDefault(){}},'Cliente');
 await context.processMultiplePayment({preventDefault(){}},'Cliente');await context.processMultiplePayment({preventDefault(){}},'Cliente');
 assert.equal(saves,1);assert.equal(state.data.filter(r=>r.type==='payment').length,2);
 releaseSave();await first;assert.equal(timers.length,1);await timers.shift()();
 assert.equal(confirmations,1);assert.equal(writes.length,1,'El pago múltiple debe imprimir un único comprobante');
 await context.processMultiplePayment({preventDefault(){}},'Cliente');assert.equal(timers.length,0);assert.equal(saves,1,'No debe volver a pagar facturas liquidadas');
 context.setTimeout=setTimeout;
 const baseline=JSON.stringify(state.data);documents.length=0;writes.length=0;
 let releasePreparation,releaseWrite;
 renderer.bluetoothBytes=()=>new Promise(resolve=>{documents.push('preparing');releasePreparation=resolve;});
 context.captureWrite=bytes=>new Promise(resolve=>{writes.push(bytes);releaseWrite=resolve;});
 const printing=credit.printInvoices([invoice,second],true);
 await credit.printInvoices([invoice,second],true);assert.equal(documents.length,1,'No debe preparar otra copia mientras imprime');
 releasePreparation(new Uint8Array([29,86,66,0]));await Promise.resolve();await credit.printInvoices([invoice,second],true);assert.equal(writes.length,1);
 releaseWrite();await printing;
 renderer.bluetoothBytes=originalBytes;context.captureWrite=bytes=>writes.push(bytes);
 if(pdfLibrary){
  context.fontFiles={regular:fs.readFileSync('organized/assets/fonts/LiberationSans-Regular.ttf').toString('base64'),bold:fs.readFileSync('organized/assets/fonts/LiberationSans-Bold.ttf').toString('base64')};
  run('loadExactPdfFontFiles=async()=>fontFiles;');
  context.btoa=v=>Buffer.from(v,'binary').toString('base64');
  context.Image=class{set src(value){Promise.resolve().then(()=>this.onload());}};
  context.document.createElement=()=>{const canvas={};canvas.getContext=()=>({fillRect(){},drawImage(){},getImageData(){const data=new Uint8ClampedArray(canvas.width*canvas.height*4).fill(255);for(let y=0;y<canvas.height;y+=23){const start=y*canvas.width*4;data[start]=data[start+1]=data[start+2]=0;}return{data};}});return canvas;};
  const builder=width=>({width,margin:3,blocks:[195,195,12].map(height=>({height,commands:[{type:'text',value:'PRUEBA',x:3,y:4,size:3,bold:true,align:'left',color:'#000'}]}))});
  for(const mode of ['thermal_58','thermal_80']){
   const width=mode==='thermal_58'?58:80;state.config.bluetooth_print_mode=mode;
   const pdf=await renderer.pdfBatch([builder],mode,'test.pdf');assert.equal(pdf.getNumberOfPages(),2);
   const box=pdf.getPageInfo(2).pageContext.mediaBox;
   assert(Math.abs(box.topRightX*25.4/72-width)<.1);assert(Math.abs(box.topRightY*25.4/72-18)<.1,'La última página no debe arrastrar 400 mm de papel');
   const bytes=await renderer.bluetoothBytes(builder);assert.deepEqual(Array.from(bytes.slice(0,5)),[27,64,27,97,1]);let offset=5,rows=0,frames=0;
   while(offset<bytes.length-7){assert.deepEqual(Array.from(bytes.slice(offset,offset+4)),[29,118,48,0]);const w=bytes[offset+4]+256*bytes[offset+5],h=bytes[offset+6]+256*bytes[offset+7];assert(h>0&&h<=128);offset+=8+w*h;rows+=h;frames++;}
   assert.equal(offset,bytes.length-7,'Cada imagen debe terminar antes del comando de corte');assert.deepEqual(Array.from(bytes.slice(offset)),[10,10,10,29,86,66,0]);
   const dots=mode==='thermal_58'?384:576;assert.equal(rows,Math.ceil(396*dots/width)+Math.ceil(18*dots/width));assert(frames>1);
  }
 }
 assert.equal(JSON.stringify(state.data),baseline);
 console.log('Pago múltiple: una sola operación y un solo envío; páginas térmicas sin cola en blanco y un corte final verificados.');
})().catch(error=>{console.error(error);process.exitCode=1;});
