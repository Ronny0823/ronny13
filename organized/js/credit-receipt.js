'use strict';

// Formatos de Gestión de crédito: únicamente impresión térmica 58/80 mm.
const CreditReceipt = (() => {
  const isThermal = mode => mode === 'thermal_58' || mode === 'thermal_80';
  const amount = value => Math.round(Math.max(0, toFiniteNumber(value, 0)) * 100) / 100;
  const sum = values => amount(values.reduce((total,value)=>total + toFiniteNumber(value,0),0));
  const material = value => String(value || 'Sin material').replace(/panete/gi,word=>
    word === word.toUpperCase() ? 'PAÑETE' : word[0] === 'P' ? 'Pañete' : 'pañete');
  const groups = (records,client) => {
    const grouped = new Map();
    records.forEach(record=>{const name=String(client(record)||'Cliente').trim();if(!grouped.has(name))grouped.set(name,[]);grouped.get(name).push(record);});
    return [...grouped.values()];
  };
  const relatedPayments = (sale,invoice) => getRecords('payment').filter(payment=>sale
    ? payment.sale_id === sale.__backendId
    : payment.invoice_number === invoice?.invoice_number && payment.client_name === invoice?.client_name);
  function summary(invoice) {
    const sale=findSaleForInvoice(invoice),payments=relatedPayments(sale,invoice);
    const total=amount(sale?.sale_total ?? invoice.sale_total),tax=amount(invoice.tax ?? sale?.sale_tax);
    const subtotalValue=invoice.subtotal ?? sale?.sale_subtotal;
    const subtotal=amount(subtotalValue==null || subtotalValue==='' ? total-tax : subtotalValue);
    const paid=Math.min(total,sum(payments.map(payment=>payment.amount)));
    return {invoice,sale,payments,total,tax,subtotal,paid,pending:amount(total-paid),items:getInvoiceItems(invoice)};
  }
  const unique = values => [...new Set(values.filter(Boolean).map(String))];
  function invoiceModels(invoices,paidReceipt=false,options={}) {
    return groups(invoices,invoice=>invoice.client_name || findSaleForInvoice(invoice)?.client_name).map(group=>{
      const details=group.map(summary),payments=details.flatMap(detail=>detail.payments).sort((a,b)=>new Date(a.date)-new Date(b.date));
      const latest=payments.at(-1),pending=sum(details.map(detail=>detail.pending));
      const total=sum(details.map(detail=>detail.total));
      return {
        kind:paidReceipt && pending<=.005?'paid':'invoices',client:group[0].client_name || details[0].sale?.client_name || 'Cliente',
        plate:unique(details.map(detail=>detail.invoice.vehicle_plate || detail.sale?.vehicle_plate)).join(' / '),details,
        subtotal:sum(details.map(detail=>detail.subtotal)),tax:sum(details.map(detail=>detail.tax)),total,
        paid:sum(details.map(detail=>detail.paid)),pending,
        received:options.received == null ? total : amount(options.received),date:options.date || latest?.date,
        method:options.method || unique(payments.map(payment=>getPaymentMethodLabel(payment))).join(' / ') || 'NO ESPECIFICADO',
        route:options.route || unique(payments.map(getPaymentRouteLabel)).join(' / ') || 'No especificado'
      };
    });
  }
  function paymentDetail(payment) {
    const sale=getRecords('sale').find(s=>s.__backendId === payment.sale_id);
    const invoice=(sale && findInvoiceForSale(sale)) || getRecords('invoice').find(inv=>
      inv.invoice_number === payment.invoice_number && inv.client_name === payment.client_name);
    const history=relatedPayments(sale,invoice),index=history.findIndex(p=>p.__backendId === payment.__backendId);
    const time=new Date(payment.date).getTime();
    const paidUntil=sum(history.filter((p,i)=>new Date(p.date).getTime()<time ||
      (new Date(p.date).getTime()===time && (index<0 || i<=index))).map(p=>p.amount));
    const total=amount(sale?.sale_total ?? invoice?.sale_total);
    return {payment,sale,invoice,remaining:sale || invoice ? amount(total-paidUntil):null,
      materials:unique((invoice?getInvoiceItems(invoice):sale?.items || [{material_name:sale?.material_name}]).map(item=>material(item.material_name))).join(' / ')};
  }
  function paymentModels(payments) {
    return groups(payments,p=>p.client_name || getRecords('sale').find(s=>s.__backendId === p.sale_id)?.client_name).map(group=>{
      const details=group.slice().sort((a,b)=>new Date(a.date)-new Date(b.date)).map(paymentDetail);
      const client=group[0].client_name || details[0].sale?.client_name || 'Cliente';
      const sales=getRecords('sale').filter(sale=>sale.payment_type==='credito' && sale.client_name===client);
      const pending=sales.length ? sum(sales.map(sale=>amount(amount(sale.sale_total)-sum(relatedPayments(sale).map(p=>p.amount)))))
        : details.every(detail=>detail.remaining!=null) ? sum([...new Map(details.map(detail=>[detail.payment.sale_id || detail.payment.invoice_number,detail.remaining])).values()]) : null;
      return {kind:'payments',client,details,received:sum(group.map(payment=>payment.amount)),pending};
    });
  }
  const saleInvoice = sale => findInvoiceForSale(sale) || {...sale,type:'invoice',sale_id:sale.__backendId,
    subtotal:sale.sale_subtotal,tax:sale.sale_tax,items:Array.isArray(sale.items)&&sale.items.length?sale.items:[{
      material_name:sale.material_name,quantity:sale.sale_quantity,price:sale.price,subtotal:sale.sale_subtotal ?? sale.sale_total
    }]};
  function singlePaymentModels(payment) {
    const detail=paymentDetail(payment);
    if((payment.is_full_payment || detail.remaining===0) && detail.sale) {
      const models=invoiceModels([detail.invoice || saleInvoice(detail.sale)],true,{
        received:payment.amount,date:payment.date,method:getPaymentMethodLabel(payment),route:getPaymentRouteLabel(payment)
      });
      if(models[0]?.pending===0)return models;
    }
    return paymentModels([payment]);
  }
  function multipleModels(selectedSales,total,method,notes) {
    const records=selectedSales.map(item=>item.sale).filter(Boolean),invoices=records.map(saleInvoice);
    const models=invoiceModels(invoices,true,{method:method?getPaymentMethodLabel(method):'',route:getPaymentRouteValue(notes)});
    if(models.length===1)models[0].received=amount(total);
    else models.forEach(model=>{model.received=sum(model.details.map(detail=>detail.payments.slice().sort((a,b)=>new Date(a.date)-new Date(b.date)).at(-1)?.amount));});
    return models;
  }

  function layout(model,width,measure) {
    const scale=width/80,margin=3,left=margin,right=width-margin,usable=right-left,blocks=[],font=3.8*scale;
    const text=(value,x,y,size=font,bold=false,align='left',color='#000')=>({type:'text',value:String(value??''),x,y,size,bold,align,color});
    const line=(x1,y1,x2,y2,dashed=false)=>({type:'line',x1,y1,x2,y2,dashed});
    const rect=(x,y,w,h,fill='#fff',radius=0,stroke=false)=>({type:'rect',x,y,w,h,fill,radius,stroke});
    const icon=(kind,x,y,size)=>({type:'icon',kind,x,y,size});
    const add=(height,commands)=>blocks.push({height,commands});
    const fit=(value,max,size,bold=false)=>Math.min(size,size*max/Math.max(1,measure(String(value),size,bold)));
    const wrap=(value,max,size=font,bold=false)=>{
      const lines=[];
      for(const paragraph of String(value??'').split('\n')){
        let current='';for(const char of paragraph){
          if(current && measure(current+char,size,bold)>max){const space=current.lastIndexOf(' ');
            if(space>0){lines.push(current.slice(0,space));current=current.slice(space+1);}else{lines.push(current);current='';}}
          current+=char;
        }lines.push(current.trim());
      }return lines;
    };
    const center=(value,size=font,bold=false)=>{const lines=wrap(value,usable-2,size,bold);
      add(lines.length*size*1.25+scale,lines.map((v,i)=>text(v,width/2,size+i*size*1.25,size,bold,'center')));};
    const divider=()=>add(3*scale,[line(left,1.2*scale,right,1.2*scale,true)]);
    const heading=value=>{const lines=wrap(value,usable-4*scale,4.1*scale,true),height=lines.length*5.2*scale+scale;
      add(height+scale,[rect(left,0,usable,height,'#ddd',1.4*scale),...lines.map((v,i)=>text(v,left+2*scale,(4.2+i*5.2)*scale,4.1*scale,true))]);blocks.at(-1).keepWithNext=true;};
    const paragraph=(value,size=font,bold=false,kind)=>{const x=left+(kind?9:2)*scale;
      const lines=wrap(value,right-x-scale,size,bold);add(lines.length*size*1.25+scale,[
        ...(kind?[icon(kind,left+scale,.3*scale,5.7*scale)]:[]),...lines.map((v,i)=>text(v,x,size+i*size*1.25,size,bold))]);};
    const row=(label,value,{bold=false,shade=false,kind}={})=>{
      const x=left+(kind?8:2)*scale,height=6.2*scale;
      add(height,[...(shade?[rect(left,0,usable,height,'#ddd',scale)]:[]),...(kind?[icon(kind,left+scale,.3*scale,5.1*scale)]:[]),
        text(label,x,4.6*scale,fit(label,usable*.5-(x-left),font,bold),bold),
        text(value,right-1.5*scale,4.6*scale,fit(value,usable*.46,font,bold),bold,'right')]);
    };
    const totalBox=(label,value)=>{
      const x=left+usable*.65,available=usable-29*scale;
      add(23*scale,[rect(left+scale,0,usable-2*scale,21*scale,'#fff',3*scale,true),icon('coins',left+4*scale,4*scale,13*scale),
        line(left+22*scale,3*scale,left+22*scale,18*scale),
        text(label,x,6.5*scale,fit(label,available,4.8*scale,true),true,'center'),
        text(fmt.currency(value),x,16.8*scale,fit(fmt.currency(value),available,8.1*scale,true),true,'center')]);
    };
    const signature=(title,message,label,pill=false)=>{
      const lines=wrap(message,usable-6*scale,3.5*scale),height=(30+lines.length*4.4)*scale;
      const titleSize=fit(title,usable-6*scale,4.4*scale,true),pillWidth=Math.min(usable-4*scale,measure(title,titleSize,true)+4*scale);
      add(height+scale,[rect(left,0,usable,height,'#fff',4*scale,true),
        ...(pill?[rect((width-pillWidth)/2,scale,pillWidth,6.5*scale,'#000',3*scale)]:[]),
        text(title,width/2,6*scale,titleSize,true,'center',pill?'#fff':'#000'),
        ...lines.map((v,i)=>text(v,width/2,(13+i*4.4)*scale,3.5*scale,false,'center')),
        line(left+6*scale,height-10*scale,right-6*scale,height-10*scale),text(label,width/2,height-4*scale,3.9*scale,true,'center')]);
    };
    const config=AppState.config,paid=model.kind==='paid',abonos=model.kind==='payments';
    if(config.company_logo)add(25*scale,[{type:'image',value:config.company_logo,x:left,y:0,w:usable,h:24*scale}]);
    else center(config.company_name||'AGRECACI',5.1*scale,true);
    center('CONTROL DE VIAJES DE MINA',3.1*scale,true);
    if(config.company_slogan)center(config.company_slogan,3.7*scale,true);
    if(config.company_rfc)center('RNC: '+config.company_rfc,3.7*scale,true);
    divider();
    const title=paid?'RECIBO DE PAGO TOTAL':abonos?'ABONOS SELECCIONADOS':'FACTURAS SELECCIONADAS';
    add(10*scale,[icon('receipt',left+scale,0,8*scale),text(title,left+12*scale,6.5*scale,fit(title,usable-13*scale,5*scale,true),true)]);
    const subtitle=paid?'LIQUIDACIÓN COMPLETA':model.details.length+(abonos?' ABONO(S)':' FACTURA(S)');
    const pillWidth=Math.min(usable,Math.max(34*scale,measure(subtitle,4.3*scale,true)+8*scale));
    add(9*scale,[rect((width-pillWidth)/2,0,pillWidth,7*scale,'#000',3*scale),
      text(subtitle,width/2,5*scale,fit(subtitle,pillWidth-5*scale,4.3*scale,true),true,'center','#fff')]);
    divider();heading('DATOS DEL CLIENTE');paragraph('Cliente: '+model.client,4.1*scale,true,'user');
    if(model.plate)paragraph('Placa: '+model.plate,font,false,'car');
    if(paid){
      divider();heading('INFORMACIÓN DEL PAGO');
      paragraph('Fecha del pago:',font,true,'calendar');paragraph(model.date?fmt.dateTime(model.date):'No especificada');
      paragraph('Facturas: '+model.details.length);paragraph('Método: '+model.method);paragraph('Por dónde fue: '+model.route);
    }
    divider();heading(paid?'DETALLE DE FACTURAS':'DETALLE');
    if(abonos){
      model.details.forEach((detail,index)=>{
        if(index)divider();
        paragraph('Factura: '+(detail.payment.invoice_number || detail.sale?.invoice_number || 'Sin número'),font,true);
        paragraph('Fecha: '+fmt.dateTime(detail.payment.date),3.5*scale,false,'calendar');
        paragraph(detail.materials,4.6*scale,true,'material');
        paragraph('Forma: '+getPaymentMethodLabel(detail.payment));
        const route=getPaymentRouteLabel(detail.payment);if(route)paragraph('Por dónde fue: '+route);
        row('Abono:',fmt.currency(amount(detail.payment.amount)),{bold:true,kind:'coins'});
        row('Falta por pagar:',detail.remaining==null?'No disponible':fmt.currency(detail.remaining),{bold:true});
      });
      divider();totalBox('TOTAL ABONADO',model.received);divider();
      row('Saldo pendiente:',model.pending==null?'No disponible':fmt.currency(model.pending),{bold:true,shade:true,kind:'check'});divider();
      const balance=model.pending==null?'El saldo pendiente de mi cuenta debe ser verificado.':'Queda un saldo pendiente de '+fmt.currency(model.pending)+'.';
      signature('CONFORMIDAD DEL CLIENTE','Declaro estar de acuerdo y conforme con el abono de '+fmt.currency(model.received)+' aplicado a mi cuenta. '+balance,'Firma del cliente',true);
    }else{
      model.details.forEach((detail,index)=>{
        if(index)divider();heading('Factura: '+(detail.invoice.invoice_number||'Sin número'));
        paragraph('Fecha: '+fmt.dateTime(detail.invoice.date),3.3*scale,false,'calendar');
        detail.items.forEach(item=>{
          paragraph(material(item.material_name),4.7*scale,true,'material');
          row('Cantidad:',fmt.quantity(item.quantity));row('Precio:',fmt.currency(toFiniteNumber(item.price,0)));
          const itemTotal=item.subtotal==null||item.subtotal===''?toFiniteNumber(item.quantity,0)*toFiniteNumber(item.price,0):item.subtotal;
          row('Total:',fmt.currency(amount(itemTotal)),{bold:true});
        });
        if(!paid && model.details.length>1){row('Abonado:',fmt.currency(detail.paid));row('Falta por pagar:',fmt.currency(detail.pending),{bold:true});}
        const note=getInvoiceNote(detail.invoice);if(note)paragraph('Nota: '+note,3.4*scale);
      });
      divider();row('Subtotal:',fmt.currency(model.subtotal),{bold:true,shade:true});row('IVA:',fmt.currency(model.tax),{bold:true,shade:true});
      if(paid)row('Total facturas:',fmt.currency(model.total),{bold:true,shade:true});
      divider();totalBox(paid?'PAGO TOTAL':'TOTAL GENERAL',paid?model.received:model.total);divider();
      if(!paid)row('Abonado:',fmt.currency(model.paid),{kind:'wallet'});
      else if(model.received<model.total)row('Abonado anteriormente:',fmt.currency(amount(model.total-model.received)));
      row('Falta por pagar:',fmt.currency(model.pending),{bold:true,kind:'check'});divider();
      heading(paid?'DEUDA LIQUIDADA COMPLETAMENTE':model.pending<=.005?'ESTADO: PAGADO':model.paid>0?'ESTADO: PAGO PARCIAL':'ESTADO: PENDIENTE');
      if(paid){divider();signature('CONFORMIDAD DEL CLIENTE',
        'Confirmo el pago total de las facturas detalladas en este comprobante, quedando únicamente estas liquidadas y sin saldo pendiente.','Firma del cliente',true);}
    }
    divider();if(!paid)center(abonos?'COMPROBANTE CONSOLIDADO':'IMPRESIÓN CONSOLIDADA',3.6*scale,true);
    if(config.company_phone)paragraph('Tel: '+config.company_phone,3.5*scale,true,'phone');
    return {blocks,width,margin};
  }
  async function output(models,{download=false,mode=getEffectivePrinterType()}={}) {
    if(!models.length)return;
    if(!isThermal(mode))throw new Error('Este diseño requiere impresión térmica');
    try {
      const builders=models.map(model=>(width,measure)=>layout(model,width,measure));
      if(!download && isBluetoothPrinterSelected()) {
        for(const builder of builders)await BluetoothPrinter.writeBytes(await SaleInvoice.thermalDocument.bluetoothBytes(builder));
        showToast('Comprobante enviado a la impresora térmica','success');return;
      }
      const doc=await SaleInvoice.thermalDocument.pdfBatch(builders,mode,'credito_'+models[0].kind+'_'+(mode==='thermal_58'?'58mm':'80mm')+'.pdf');
      showToast('Comprobante térmico descargado','success');return doc;
    }catch(error){console.error('No se pudo preparar el comprobante térmico de crédito',error);showToast('No se pudo preparar el comprobante térmico','error');}
  }
  return {isThermal,invoiceModels,paymentModels,singlePaymentModels,multipleModels,
    printInvoices:(invoices,paid)=>output(invoiceModels(invoices,paid)),
    printPayments:payments=>output(paymentModels(payments)),
    printSingle:payment=>output(singlePaymentModels(payment)),
    printSaved:payment=>output(payment.is_full_payment?singlePaymentModels(payment):paymentModels([payment])),
    printMultiple:(sales,total,method,notes)=>output(multipleModels(sales,total,method,notes)),
    downloadInvoices:(invoices,paid,mode)=>output(invoiceModels(invoices,paid),{download:true,mode}),
    downloadPayments:(payments,mode)=>output(paymentModels(payments),{download:true,mode}),
    downloadSingle:(payment,mode)=>output(singlePaymentModels(payment),{download:true,mode}),
    downloadMultiple:(sales,total,method,notes,mode)=>output(multipleModels(sales,total,method,notes),{download:true,mode})
  };
})();
