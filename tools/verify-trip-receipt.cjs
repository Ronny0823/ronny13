'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const events=[],pdfs=[],storage=new Map();let selected=[];
const pdfLibrary=process.env.TRIP_TEST_JSPDF?require(process.env.TRIP_TEST_JSPDF):null;
const context=vm.createContext({console,setTimeout,clearTimeout,TextEncoder,
  document:{addEventListener(){},getElementById(){return null;},querySelectorAll(){return selected.map(t=>({dataset:{tripId:t.__backendId}}));}},
  window:{location:{},addEventListener(){},jspdf:{jsPDF:function(options){
    if(!pdfLibrary)throw new Error('Renderizado no solicitado');const doc=new pdfLibrary.jsPDF(options);
    doc.save=name=>pdfs.push({name,bytes:Buffer.from(doc.output('arraybuffer')),doc});return doc;
  }}},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
});
const run=source=>vm.runInContext(source,context);
for(const f of ['app','sale-invoice','trip-receipt'])run(fs.readFileSync('organized/js/'+f+'.js','utf8'));
context.capture=(name,...args)=>events.push({name,args});
run('showToast=()=>{};openPrintDocument=html=>capture("standard",html);BluetoothPrinter.writeBytes=async bytes=>capture("bluetooth",bytes);BluetoothPrinter.printText=async text=>capture("legacy-bluetooth",text);');
const state=run('AppState'),tripReceipt=run('TripReceipt'),renderer=run('SaleInvoice.thermalDocument');
const trip={type:'direct_trip',__backendId:'trip-test',invoice_number:'020492',date:'2026-11-07T14:00:00',source_company:'Agrecaci',driver_name:'Ramon',vehicle_plate:'L283172',meters:16,destination_client:'Danilo Colon',trip_amount:10000,amount_paid:0,payment_status:'pendiente'};
const partial={...trip,__backendId:'trip-partial',invoice_number:'020493',material_type:'Arena gris',amount_paid:3000,notes:'Entrega de prueba'};
const paid={...trip,__backendId:'trip-paid',invoice_number:'020494',amount_paid:10000,payment_status:'pagado'};
state.data=[trip,partial,paid];selected=[trip,partial,paid];
Object.assign(state.config,{company_name:'AGRECACI',company_slogan:'Calidad en cada metro cúbico',company_rfc:'1-31-33066-5',company_phone:'809-467-2820 / 809-467-2810',company_logo:''});
const before=JSON.stringify(state.data),originalPDF=renderer.pdfBatch,originalBytes=renderer.bluetoothBytes;
renderer.pdfBatch=async(builders,mode)=>{
  const contents=builders.map(builder=>builder(mode==='thermal_58'?58:80,(t,s)=>t.length*s*.5).blocks.flatMap(b=>b.commands).filter(c=>c.type==='text').map(c=>c.value).join('\n'));
  const first=contents[0];
  for(const expected of ['FACTURA VIAJE DIRECTO','020492','ESTADO: PENDIENTE','FECHA DEL VIAJE','COMPAÑÍA ORIGEN','Ramon','L283172','16.00','Danilo Colon','10,000.00','CONFIRMACIÓN DE ENTREGA','Firma de quien recibe'])assert(first.includes(expected),expected);
  if(contents.length===3){assert(contents[1].includes('ESTADO: PAGO PARCIAL'));assert(contents[1].includes('7,000.00'));assert(contents[1].includes('Arena gris'));assert(contents[2].includes('ESTADO: PAGADO'));}
  events.push({name:'thermal-pdf',mode,count:builders.length});
};
renderer.bluetoothBytes=async builder=>{assert.equal(typeof builder,'function');return new Uint8Array([29,118,48,0]);};
(async()=>{
  for(const mode of ['thermal_58','thermal_80']){
    state.config.printer_type=mode;await context.printDirectTripInvoice(trip.__backendId);assert.equal(events.at(-1).name,'thermal-pdf');assert.equal(events.at(-1).count,1);
    await context.printSelectedDirectTrips();assert.equal(events.at(-1).count,3);
    state.config.printer_type='bluetooth';state.config.bluetooth_print_mode=mode;
    await context.printDirectTripInvoice(trip.__backendId);assert.equal(events.at(-1).name,'bluetooth');
    const count=events.length;await context.printSelectedDirectTrips();assert.equal(events.length-count,3);assert(events.slice(count).every(e=>e.name==='bluetooth'));
  }
  state.config.printer_type='standard';await context.printDirectTripInvoice(trip.__backendId);assert.equal(events.at(-1).name,'standard');assert(!events.at(-1).args[0].includes('CONFIRMACIÓN DE ENTREGA'));
  await context.printSelectedDirectTrips();assert.equal(events.at(-1).name,'standard');
  state.config.printer_type='bluetooth';state.config.bluetooth_print_mode='standard';await context.printDirectTripInvoice(trip.__backendId);assert.equal(events.at(-1).name,'legacy-bluetooth');
  renderer.pdfBatch=originalPDF;renderer.bluetoothBytes=originalBytes;
  if(pdfLibrary){
    context.fontFiles={regular:fs.readFileSync('organized/assets/fonts/LiberationSans-Regular.ttf').toString('base64'),bold:fs.readFileSync('organized/assets/fonts/LiberationSans-Bold.ttf').toString('base64')};run('loadExactPdfFontFiles=async()=>fontFiles;');
    for(const mode of ['thermal_58','thermal_80']){
      state.config.printer_type=mode;await context.printDirectTripInvoice(trip.__backendId);const output=pdfs.at(-1);
      assert.equal(output.doc.getNumberOfPages(),1);assert(Math.abs(output.doc.internal.pageSize.getWidth()-(mode==='thermal_58'?58:80))<.1);
      if(process.env.TRIP_TEST_OUTPUT){fs.mkdirSync(process.env.TRIP_TEST_OUTPUT,{recursive:true});fs.writeFileSync(process.env.TRIP_TEST_OUTPUT+'/'+output.name,output.bytes);}
      await context.printSelectedDirectTrips();assert.equal(pdfs.at(-1).doc.getNumberOfPages(),3,'Cada viaje seleccionado debe conservar su propio ticket');
      if(process.env.TRIP_TEST_OUTPUT){const batch=pdfs.at(-1);fs.writeFileSync(process.env.TRIP_TEST_OUTPUT+'/'+batch.name,batch.bytes);}
    }
    state.config.printer_type='pdf';await context.generateDirectTripPDF(trip.__backendId);assert(pdfs.at(-1).doc.internal.pageSize.getWidth()>200);
  }
  assert.equal(JSON.stringify(state.data),before,'Imprimir no debe modificar viajes ni pagos');
  console.log('Viaje directo: estados y saldos, 58/80 mm, Bluetooth, selección múltiple e impresión normal verificados.');
})().catch(error=>{console.error(error);process.exitCode=1;});
