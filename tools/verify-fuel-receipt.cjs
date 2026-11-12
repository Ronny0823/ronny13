'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const storage = new Map(), events = [], pdfs = [];
// El renderizado real es opcional; las rutas se verifican también en GitHub Actions.
const pdfLibrary = process.env.FUEL_TEST_JSPDF ? require(process.env.FUEL_TEST_JSPDF) : null;
const context = vm.createContext({
  console, setTimeout, clearTimeout, TextEncoder,
  document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
  window: { location: {}, addEventListener() {}, jspdf: { jsPDF: function(options) {
    if (!pdfLibrary) throw new Error('Renderizado no solicitado');
    const doc = new pdfLibrary.jsPDF(options);
    doc.save = name => pdfs.push({ name, bytes: Buffer.from(doc.output('arraybuffer')), doc });
    return doc;
  } } },
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) }
});
const run = source => vm.runInContext(source, context);
run(fs.readFileSync('organized/js/app.js', 'utf8'));
run(fs.readFileSync('organized/js/sale-invoice.js', 'utf8'));
run(fs.readFileSync('organized/js/fuel-receipt.js', 'utf8'));
context.capture = (name,...args) => events.push({ name, args });
run('showToast=()=>{}; openPrintDocument=html=>capture("standard",html); BluetoothPrinter.writeBytes=async bytes=>capture("bluetooth",bytes); BluetoothPrinter.printText=async text=>capture("legacy-bluetooth",text);');
const state = run('AppState'), fuel = run('FuelReceipt'), renderer = run('SaleInvoice.thermalDocument');
const record = { type:'fuel_dispatch', __backendId:'fuel_dispatch_b9bf50c0-4a66-4b53-8991-0714ba193583', date:'2026-11-10T10:15:00', name:'Neuri T', plate:'BURDO', vehicle_model:'Burdo', address:'La Cuesta', quantity:80 };
state.data = [{type:'fuel_delivery',quantity:1962,date:'2026-11-10T08:00:00'},record];
Object.assign(state.config,{company_name:'AGRECACI',company_slogan:'Calidad en cada metro cúbico',company_rfc:'1-31-33066-5',company_phone:'809-467-2820 / 809-467-2810',company_logo:''});
const before = JSON.stringify(state.data);
const originalPDF = renderer.pdf, originalBytes = renderer.bluetoothBytes;
renderer.pdf = async(builder,mode,filename) => {
  const width = mode === 'thermal_58' ? 58 : 80;
  const plan = builder(width, (text,size) => text.length * size * .51);
  const content = plan.blocks.flatMap(b=>b.commands).filter(c=>c.type==='text').map(c=>c.value).join('\n');
  for (const expected of ['Placa:','BURDO','Equipo:','Burdo','80.00 G','1,882.00 G','CONFIRMACIÓN DE ENTREGA','Firma de recibido']) assert(content.includes(expected),expected);
  assert(!content.includes(record.__backendId));
  events.push({name:'thermal-pdf',mode,filename});
};
renderer.bluetoothBytes = async builder => { assert.equal(typeof builder,'function'); return new Uint8Array([29,118,48,0]); };
(async()=>{
  for (const mode of ['thermal_58','thermal_80']) {
    state.config.printer_type=mode;
    await context.printFuelReceipt(record.__backendId);
    assert.equal(events.at(-1).name,'thermal-pdf');assert.equal(events.at(-1).mode,mode);
    state.config.printer_type='bluetooth';state.config.bluetooth_print_mode=mode;
    await context.printFuelReceipt(record.__backendId);
    assert.equal(events.at(-1).name,'bluetooth');
  }
  state.config.printer_type='standard';await context.printFuelReceipt(record.__backendId);
  assert.equal(events.at(-1).name,'standard');
  assert(!events.at(-1).args[0].includes('CONFIRMACIÓN DE ENTREGA'));
  state.config.printer_type='bluetooth';state.config.bluetooth_print_mode='standard';
  await context.printFuelReceipt(record.__backendId);assert.equal(events.at(-1).name,'legacy-bluetooth');
  renderer.pdf=originalPDF;renderer.bluetoothBytes=originalBytes;
  if (pdfLibrary) {
    context.fontFiles={regular:fs.readFileSync('organized/assets/fonts/LiberationSans-Regular.ttf').toString('base64'),bold:fs.readFileSync('organized/assets/fonts/LiberationSans-Bold.ttf').toString('base64')};
    run('loadExactPdfFontFiles=async()=>fontFiles;');
    for (const mode of ['thermal_58','thermal_80']) {
      state.config.printer_type=mode;
      await context.printFuelReceipt(record.__backendId);
      const output=pdfs.at(-1);assert.equal(output.doc.getNumberOfPages(),1);
      assert(Math.abs(output.doc.internal.pageSize.getWidth()-(mode==='thermal_58'?58:80))<.1);
      if(process.env.FUEL_TEST_OUTPUT){fs.mkdirSync(process.env.FUEL_TEST_OUTPUT,{recursive:true});fs.writeFileSync(process.env.FUEL_TEST_OUTPUT+'/'+output.name,output.bytes);}
    }
    state.config.printer_type='pdf';await context.generateFuelReceiptPDF(record.__backendId);
    assert(pdfs.at(-1).doc.internal.pageSize.getWidth()>200,'El PDF normal no debe usar papel térmico');
  }
  assert.equal(JSON.stringify(state.data),before,'Imprimir no debe modificar registros ni inventario');
  console.log('Despacho de gasol: rutas térmicas 58/80 mm y Bluetooth, datos, inventario e impresión normal verificados.');
})().catch(error=>{console.error(error);process.exitCode=1;});
