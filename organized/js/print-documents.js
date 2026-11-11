'use strict';

// Datos de cada documento; el dibujo, la paginación y el envío son comunes.
const PrintDocuments = (() => {
  const n = value => toFiniteNumber(value, 0);
  const money = value => fmt.currency(n(value));
  const date = value => value ? fmt.dateTime(value) : 'No registrada';
  const row = (label, value, bold = false) => ({ kind: 'row', label, value: String(value ?? ''), bold });
  const text = value => ({ kind: 'text', value: String(value ?? '') });
  const heading = value => ({ kind: 'heading', value: String(value ?? '') });
  const total = (label, value) => ({ kind: 'total', label, value: money(value) });
  const divider = () => ({ kind: 'divider' });
  const get = id => AppState.data.find(record => record.__backendId === id);
  const model = (title, entries, extra = {}) => ({ title, entries: entries.filter(Boolean), footer: 'Gracias por su confianza.', ...extra });
  const itemRows = items => items.flatMap(item => [
    heading(item.material_name || 'Material o servicio'),
    row('Cantidad:', fmt.quantity(item.quantity)), row('Precio:', money(item.price)),
    row('Importe:', money(item.subtotal == null ? n(item.quantity) * n(item.price) : item.subtotal)), divider()
  ]);
  function clientRows(name, plate) {
    return [heading('CLIENTE'), text(name || 'Cliente sin nombre'), plate && row('Placa:', plate)];
  }
  function credit(invoices, asPaid = false) {
    if (!invoices?.length) return null;
    const summaries = getExactCreditSummaries(invoices);
    const payments = summaries.flatMap(summary => summary.payments).sort((a,b) => String(a.date).localeCompare(String(b.date)));
    const methods = [...new Set(payments.map(getPaymentMethodLabel).filter(Boolean))];
    const routes = [...new Set(payments.map(getPaymentRouteLabel).filter(Boolean))];
    const sum = field => summaries.reduce((result, summary) => result + n(summary[field]), 0);
    return model(asPaid ? 'RECIBO DE PAGO TOTAL' : 'ESTADO DE CUENTA', [
      ...clientRows(invoices[0].client_name, invoices[0].vehicle_plate),
      heading('INFORMACIÓN DEL PAGO'), row('Fecha del pago:', date(payments.at(-1)?.date)),
      row('Método de pago:', methods.join(' / ') || 'No registrado'), row('Por dónde fue:', routes.join(' / ') || 'No registrado'),
      row('Facturas incluidas:', invoices.length),
      ...summaries.flatMap(summary => [
        heading('FACTURA ' + summary.invoice.invoice_number), row('Fecha de compra:', date(summary.invoice.date)),
        ...itemRows(getInvoiceItems(summary.invoice)),
        getInvoiceNote(summary.invoice) && text('Nota: ' + getInvoiceNote(summary.invoice)),
        row('Subtotal:', money(summary.invoice.subtotal ?? n(summary.total) - n(summary.invoice.tax))),
        row('Impuesto:', money(summary.invoice.tax)), row('Total factura:', money(summary.total), true),
        row('Pagado:', money(summary.paid)), row('Saldo pendiente:', money(summary.pending), true), divider()
      ]),
      row('Total facturado:', money(sum('total'))), row('Total pagado:', money(sum('paid'))),
      total(asPaid ? 'TOTAL PAGADO' : 'TOTAL POR PAGAR', sum(asPaid ? 'paid' : 'pending'))
    ], { footer: asPaid ? 'Gracias por su pago.' : 'Este documento muestra el saldo de las facturas seleccionadas.' });
  }
  function payments(selected) {
    if (!selected?.length) return null;
    const all = getRecords('payment');
    const ordered = selected.slice().sort((a,b) => String(a.date).localeCompare(String(b.date)));
    const details = ordered.map(payment => {
      const sale = get(payment.sale_id);
      const invoice = getRecords('invoice').find(item => item.invoice_number === (payment.invoice_number || sale?.invoice_number));
      const paid = all.filter(p => p.sale_id === payment.sale_id && new Date(p.date) <= new Date(payment.date)).reduce((sum,p) => sum + n(p.amount),0);
      const pending = Math.max(0,n(sale?.sale_total) - paid);
      return { payment, sale, invoice, paid, pending, full: payment.is_full_payment || pending <= .01 };
    });
    const clientPending = getRecords('sale').filter(s => s.payment_type === 'credito' && s.client_name === ordered[0].client_name)
      .reduce((sum,s) => sum + getCreditSalePaymentSnapshot(s).pendingAmount,0);
    const full = details.every(d => d.full);
    return model(ordered.length === 1 ? full ? 'RECIBO DE PAGO' : 'COMPROBANTE DE ABONO' : 'PAGOS Y ABONOS RECIBIDOS', [
      ...clientRows(ordered[0].client_name, details[0].sale?.vehicle_plate),
      ...details.flatMap(({ payment:p, sale, invoice, paid, pending, full }) => [
        heading((full ? 'PAGO' : 'ABONO') + ' - ' + (p.invoice_number || sale?.invoice_number || 'Sin factura')),
        row('Fecha del pago:', date(p.date)), row('Método de pago:', getPaymentMethodLabel(p)),
        row('Por dónde fue:', getPaymentRouteLabel(p) || 'No registrado'),
        ...(invoice ? itemRows(getInvoiceItems(invoice)) : [text(sale?.material_name || '')]),
        total(full ? 'PAGO RECIBIDO' : 'ABONO RECIBIDO', p.amount),
        row('Total factura:', money(sale?.sale_total)), row('Pagado hasta esa fecha:', money(paid)),
        row('TOTAL A SALDAR:', money(pending), true), divider()
      ]),
      ordered.length > 1 && total('TOTAL RECIBIDO', ordered.reduce((sum,p)=>sum+n(p.amount),0)),
      ordered.length > 1 && row('Saldo pendiente del cliente:', money(clientPending), true)
    ], { footer: full ? 'Gracias por su pago.' : 'Gracias por su abono.' });
  }
  function payment(id) { const p = get(id); return p ? payments([p]) : null; }
  function multiple(selected, amount, method, notes) {
    if (!selected?.length) return null;
    const data = getPaidCreditReceiptData(selected, amount, method, notes);
    return model('RECIBO DE PAGO TOTAL', [
      ...clientRows(data.firstSale.client_name, data.plate),
      heading('INFORMACIÓN DEL PAGO'), row('Fecha del pago:', date(data.receiptDate)),
      row('Método de pago:', data.effectiveMethod || 'No registrado'), row('Por dónde fue:', data.effectiveRoute || 'No registrado'),
      row('Facturas incluidas:', data.sales.length),
      ...data.rows.flatMap(item => [heading('FACTURA ' + item.invoice_number),row('Fecha de compra:',date(item.date)),...itemRows([item])]),
      row('Subtotal:',money(data.rows.reduce((sum,item)=>sum+n(item.subtotal),0))),row('Impuesto:',money(data.tax)),
      row('Total facturas:',money(data.invoiceTotal)),row('Pagado anteriormente:',money(data.previousPaid)),
      total('PAGO TOTAL',data.paidNow),row('TOTAL A SALDAR:',money(0),true)
    ], {footer:'Gracias por su pago. Deuda liquidada completamente.'});
  }
  function tripRows(trip) {
    const amount=n(trip.trip_amount),paid=Math.min(amount,Math.max(0,n(trip.amount_paid))),pending=Math.max(0,amount-paid);
    return [heading('FACTURA ' + (trip.invoice_number || 'Sin número')),
      row('Fecha:',date(trip.date)),row('Estado:',pending<=.01?'PAGADA':paid>0?'PAGO PARCIAL':'PENDIENTE',true),
      row('Compañía de origen:',trip.source_company || ''),row('Cliente destino:',trip.destination_client || ''),
      row('Chofer:',trip.driver_name || ''),row('Placa:',trip.vehicle_plate || ''),
      heading(trip.material_type || 'VIAJE DIRECTO'),row('Cantidad:',fmt.quantity(trip.meters)+' m³'),
      row('Total viaje:',money(amount),true),row('Pagado:',money(paid)),row('Falta por pagar:',money(pending),true),
      trip.notes && text('Notas: '+trip.notes),divider()];
  }
  function trips(selected) {
    if(!selected?.length)return null;
    const sorted=selected.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const info=summarizeDirectTripPaymentInfo(sorted);
    const sum=field=>sorted.reduce((s,t)=>s+n(t[field]),0);
    const pending=sorted.reduce((s,t)=>s+Math.max(0,n(t.trip_amount)-n(t.amount_paid)),0);
    return model(selected.length===1?'FACTURA VIAJE DIRECTO':'ESTADO DE FACTURAS',[
      ...clientRows(hasMixedDirectTripClients(sorted)?'Varios clientes':sorted[0].destination_client),
      heading('INFORMACIÓN DEL PAGO'),row('Fecha del pago:',info.date),row('Método de pago:',info.method),row('Por dónde fue:',info.channel),
      row('Facturas incluidas:',sorted.length),...sorted.flatMap(tripRows),
      row('Total facturado:',money(sum('trip_amount'))),row('Total pagado:',money(sum('trip_amount')-pending)),
      total(selected.length === 1 ? 'TOTAL' : 'TOTAL POR PAGAR', selected.length === 1 ? sum('trip_amount') : pending),
      selected.length === 1 && row('Falta por pagar:',money(pending),true)
    ],{subtitle:'VIAJES DIRECTOS',footer:pending>.01?'Saldo actual de las facturas seleccionadas.':'Gracias por su pago. Cuenta saldada.'});
  }
  function trip(id) {const t=get(id);return t?trips([t]):null;}
  function tripPayment(trip,amount,method,notes) {
    if(!trip)return null;
    const pending=Math.max(0,n(trip.trip_amount)-n(trip.amount_paid));
    return model(pending<=.01?'RECIBO DE PAGO':'COMPROBANTE DE ABONO',[
      ...clientRows(trip.destination_client,trip.vehicle_plate),heading('INFORMACIÓN DEL PAGO'),
      row('Fecha del pago:',date(new Date().toISOString())),row('Factura:',trip.invoice_number),
      row('Método de pago:',getPaymentMethodLabel(method)),row('Por dónde fue:',getPaymentRouteValue(notes)||'No registrado'),
      ...tripRows(trip),total(pending<=.01?'PAGO RECIBIDO':'ABONO RECIBIDO',amount),row('TOTAL A SALDAR:',money(pending),true)
    ],{footer:pending<=.01?'Gracias por su pago.':'Gracias por su abono.'});
  }
  function fuel(id) {
    const r=get(id);if(!r)return null;
    return model('RECIBO DE DESPACHO DE COMBUSTIBLE',[
      row('No.:',r.__backendId.replace('fuel_dispatch_','GAS-')),row('Fecha:',date(r.date)),
      row('Nombre:',fuelSafe(r.name)),row('Horómetro:',fuelSafe(r.odometer)),row('Placa:',fuelSafe(fuelPlate(r))),
      row('Modelo:',fuelSafe(fuelVehicleModel(r))),text('Dirección: '+fuelSafe(r.address)),
      {kind:'total',label:'CANTIDAD DESPACHADA',value:fmt.number(r.quantity,2)+' G'},
      row('Disponible:',fmt.number(getFuelTotals().remaining,2)+' G')
    ],{signature:{heading:'CONFIRMACIÓN DE RECIBIDO',message:'Confirmo haber recibido el combustible detallado en este documento.',label:'Firma de quien recibe'}});
  }
  function daily() {
    const grouped=new Map();getRecords('sale').forEach(s=>{const day=s.date?.split('T')[0]||'Sin fecha';if(!grouped.has(day))grouped.set(day,[]);grouped.get(day).push(s);});
    return model('REPORTE DE METROS DIARIOS',[
      row('Fecha del reporte:',date(new Date().toISOString())),
      ...[...grouped].sort(([a],[b])=>b.localeCompare(a)).flatMap(([day,sales])=>[
        heading(day),row('Ventas:',sales.length),row('Total metros:',fmt.quantity(sales.reduce((sum,s)=>sum+n(s.sale_quantity),0))),
        row('Total vendido:',money(sales.reduce((sum,s)=>sum+n(s.sale_total),0)),true),
        ...sales.flatMap(s=>[heading(s.invoice_number || 'Sin factura'),text(s.client_name),text(s.material_name),
          row('Cantidad:',fmt.quantity(s.sale_quantity)),row('Importe:',money(s.sale_total))]),divider()
      ])
    ],{footer:'Fin del reporte.'});
  }
  function pendingClients() {
    const report=getPendingClientPaymentReport();
    return model('CLIENTES PENDIENTES POR PAGAR',[
      text('Clientes con saldo pendiente en el período seleccionado.'),
      row('Período:',formatDateKey(report.filters.dateFrom)+' - '+formatDateKey(report.filters.dateTo)),
      ...report.clients.flatMap(c=>[heading(c.clientName),row('Saldo pendiente:',money(c.pendingAmount),true)]),
      !report.clients.length&&text('No hay clientes con saldo pendiente en este período.'),total('TOTAL PENDIENTE POR COBRAR',report.totalPending)
    ]);
  }
  function entriesReport() {
    const entries=getFilteredEntries().slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    if(!entries.length){showToast('No hay entradas para exportar en PDF.','warning');return null;}
    const totals=new Map();entries.forEach(e=>totals.set(e.material_name,(totals.get(e.material_name)||0)+n(e.quantity)));
    return model('REPORTE DE ENTRADA DE MATERIALES',[
      row('Fecha del reporte:',date(new Date().toISOString())),
      ...entries.flatMap(e=>[heading(e.material_name||'Sin material'),row('Fecha:',date(e.date)),row('Cantidad:',fmt.quantity(e.quantity)),
        row('Proveedor:',e.supplier_name||''),row('Factura proveedor:',e.supplier_invoice||''),divider()]),
      heading('RESUMEN DE MATERIALES'),...[...totals].map(([name,value])=>row(name||'Sin material',fmt.quantity(value))),
      {kind:'total',label:'CANTIDAD TOTAL',value:fmt.quantity(entries.reduce((sum,e)=>sum+n(e.quantity),0))}
    ]);
  }
  function quote(q) {
    return model('COTIZACIÓN',[
      row('No.:',q.quote_number),row('Fecha de emisión:',date(q.date)),...clientRows(q.client_name),
      q.client_phone&&row('Teléfono del cliente:',q.client_phone),q.valid_until&&row('Válida hasta:',formatDateKey(q.valid_until)),
      heading('MATERIALES O SERVICIOS'),...itemRows(q.items||[]),row('Subtotal:',money(q.subtotal)),
      row('Impuesto ('+fmt.quantity(q.tax_rate)+' %):',money(q.tax)),total('TOTAL COTIZADO',q.total),q.note&&text('Nota: '+q.note)
    ],{footer:'Gracias por cotizar con '+(AppState.config.company_name||'nosotros')+'.'});
  }
  // Compatibilidad con los generadores de texto que también usan otros módulos.
  function fromThermal(source, title='DOCUMENTO') {
    const clean=line=>line.replace(/\x1b[@]/g,'').replace(/\x1b[!aEt]./g,'').replace(/\x1d[!]./g,'').replace(/\x1dVB./g,'').replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').trim();
    const lines=String(source||'').split('\n').map(line=>({raw:line,value:clean(line)})).filter(line=>line.value);
    const first=lines.findIndex(line=>/^={3,}$/.test(line.value));
    const second=first<0?-1:lines.findIndex((line,i)=>i>first&&/^={3,}$/.test(line.value));
    const start=second>=0?second+1:0;
    if(first>=0&&lines[first+1])title=lines[first+1].value;
    const entries=[];
    for(let i=start;i<lines.length;i++){
      const {raw,value}=lines[i];
      if(/^[-=]{3,}$/.test(value)){entries.push(divider());continue;}
      if(/^_{3,}$/.test(value)){entries.push(text('____________________________'));continue;}
      const parts=value.split(/\s{2,}/);
      if(parts.length>=2)entries.push(row(parts[0],parts.slice(1).join(' '),raw.includes('\x1bE\x01')));
      else entries.push(raw.includes('\x1bE\x01')?heading(value):text(value));
    }
    return model(title,entries,{footer:''});
  }
  const fileName=model=>String(model.title||'documento').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').toLowerCase()+'_'+new Date().toISOString().slice(0,10)+'.pdf';
  async function pdf(document,{share=false,mode=getEffectivePrinterType(),name}={}) {
    if(!document)return;
    try {
      const doc=await SaleInvoice.createDocumentPDF(document,mode);
      if(share)await sharePdfDocument(doc,name||fileName(document),{title:document.title,text:document.title});
      else{doc.save(name||fileName(document));showToast('PDF descargado','success');}
      return doc;
    }catch(error){console.error(error);showToast('No se pudo preparar el documento PDF','error');}
  }
  async function print(document) {
    if(!document)return;
    let mode=getEffectivePrinterType();
    if(isBluetoothPrinterSelected()){
      try{await BluetoothPrinter.writeBytes(await SaleInvoice.documentBytes(document));showToast('Documento enviado a la impresora','success');return;}
      catch(error){console.error(error);showToast('Bluetooth no respondió. Se abrirá la impresión en hoja.','warning');mode='standard';}
    }
    if(isDownloadPrintMode(mode))return pdf(document,{mode});
    const windowRef=window.open('','_blank');
    if(!windowRef){showToast('Permite las ventanas emergentes para imprimir','warning');return;}
    try{openPrintDocument(await SaleInvoice.documentHTML(document,mode),{windowRef,autoClose:true});}
    catch(error){windowRef.close();console.error(error);showToast('No se pudo preparar la impresión','error');}
  }
  return {credit,payments,payment,multiple,trips,trip,tripPayment,fuel,daily,pendingClients,entriesReport,quote,fromThermal,pdf,print};
})();
