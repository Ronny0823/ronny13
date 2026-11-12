'use strict';

// Factura de viaje directo: diseño exclusivo para papel térmico 58/80 mm.
const TripReceipt = (() => {
  const isThermal = mode => mode === 'thermal_58' || mode === 'thermal_80';
  const money = trip => {
    const total = Math.max(0, toFiniteNumber(trip.trip_amount, 0));
    const paid = Math.min(total, Math.max(0, toFiniteNumber(trip.amount_paid, 0)));
    const pending = Math.max(0, total - paid);
    return { total, paid, pending, status: pending <= .005 ? 'PAGADO' : paid > 0 ? 'PAGO PARCIAL' : 'PENDIENTE' };
  };

  function layout(trip, width, measure) {
    const scale = width / 80, margin = 3, left = margin, right = width - margin;
    const usable = right - left, blocks = [], font = 4.1 * scale;
    const text = (value, x, y, size = font, bold = false, align = 'left', color = '#000') =>
      ({ type: 'text', value: String(value ?? ''), x, y, size, bold, align, color });
    const line = (x1, y1, x2, y2, dashed = false) => ({ type: 'line', x1, y1, x2, y2, dashed });
    const rect = (x, y, w, h, fill = '#fff', radius = 0, stroke = false) =>
      ({ type: 'rect', x, y, w, h, fill, radius, stroke });
    const icon = (kind, x, y, size) => ({ type: 'icon', kind, x, y, size });
    const add = (height, commands) => blocks.push({ height, commands });
    const fit = (value, maxWidth, size, bold = false) =>
      Math.min(size, size * maxWidth / Math.max(1, measure(String(value), size, bold)));
    const wrap = (value, maxWidth, size = font, bold = false) => {
      const lines = [];
      for (const paragraph of String(value ?? '').split('\n')) {
        let current = '';
        for (const char of paragraph) {
          if (current && measure(current + char, size, bold) > maxWidth) {
            const space = current.lastIndexOf(' ');
            if (space > 0) { lines.push(current.slice(0, space)); current = current.slice(space + 1); }
            else { lines.push(current); current = ''; }
          }
          current += char;
        }
        lines.push(current.trim());
      }
      return lines;
    };
    const center = (value, size, bold = false) => {
      const lines = wrap(value, usable - 3, size, bold);
      add(lines.length * size * 1.25 + scale, lines.map((v, i) => text(v, width / 2, size + i * size * 1.25, size, bold, 'center')));
    };
    const divider = () => add(3.2 * scale, [line(left, 1.4 * scale, right, 1.4 * scale, true)]);
    const section = (kind, title, value) => {
      const titleX = left + 9 * scale, titleWidth = usable - 10 * scale;
      add(7 * scale, [icon(kind, left + .5 * scale, .3 * scale, 6 * scale),
        rect(titleX, 0, titleWidth, 6 * scale, '#ddd', 1.3 * scale),
        text(title, titleX + 1.2 * scale, 4.6 * scale, fit(title, titleWidth - 2.4 * scale, 4.25 * scale, true), true)]);
      if (value != null) {
        const lines = wrap(value || '—', titleWidth - 2 * scale, 3.9 * scale);
        add(lines.length * 4.9 * scale + scale, lines.map((v,i)=>text(v,titleX + 1.2 * scale,(3.9 + i * 4.9) * scale,3.9 * scale)));
      }
    };
    const row = (kind, label, value, bold = false) => {
      const labelX = left + 12 * scale, valueX = left + 35 * scale;
      const lines = wrap(value || '—', right - valueX - scale, font, bold);
      const height = lines.length * font * 1.23 + 1.2 * scale;
      add(height, [icon(kind, left + 4 * scale, .3 * scale, 5.5 * scale),
        text(label, labelX, font, fit(label, 22 * scale, font, true), true),
        ...lines.map((v,i)=>text(v,valueX,font + i * font * 1.23,font,bold))]);
    };
    const config = AppState.config, amounts = money(trip);
    if (config.company_logo) add(25 * scale, [{ type:'image',value:config.company_logo,x:left,y:0,w:usable,h:24 * scale }]);
    else center(config.company_name || 'CONTROL DE VIAJES', 5.2 * scale, true);
    center('CONTROL DE VIAJES DE MINA', 3.1 * scale, true);
    if (config.company_slogan) center(config.company_slogan, 3.8 * scale, true);
    if (config.company_rfc) center('RNC: ' + config.company_rfc, 3.8 * scale, true);
    divider();
    const title = 'FACTURA VIAJE DIRECTO';
    add(10 * scale, [icon('truck',left + scale,0,10 * scale),
      text(title,left + 13 * scale,7 * scale,fit(title,usable - 14 * scale,5.3 * scale,true),true)]);
    const number = 'N.º ' + (trip.invoice_number || 'Sin número');
    const pillWidth = Math.min(usable, Math.max(34 * scale, measure(number,4.8 * scale,true) + 8 * scale));
    add(9 * scale,[rect((width-pillWidth)/2,0,pillWidth,7 * scale,'#000',3 * scale),
      text(number,width/2,5.2 * scale,fit(number,pillWidth - 5 * scale,4.8 * scale,true),true,'center','#fff')]);
    divider();
    const status = 'ESTADO: ' + amounts.status;
    add(8 * scale,[rect(left,0,usable,7 * scale,'#ddd',1.7 * scale),
      text(status,width/2,5.3 * scale,fit(status,usable - 4 * scale,4.9 * scale,true),true,'center')]);
    divider();
    section('calendar','FECHA DEL VIAJE',fmt.dateTime(trip.date));
    divider();
    section('building','COMPAÑÍA ORIGEN',trip.source_company);
    divider();
    section('clipboard','INFORMACIÓN DEL VIAJE');
    row('user','Chofer:',trip.driver_name);
    row('truck','Vehículo:',trip.vehicle_plate);
    row('material','Metros³:',fmt.number(trip.meters,2));
    if (trip.material_type) row('material','Material:',trip.material_type);
    divider();
    section('pin','DESTINO',trip.destination_client);
    divider();
    const amount = fmt.currency(amounts.total), amountX = left + usable * .65;
    add(23 * scale,[rect(left + 2 * scale,0,usable - 4 * scale,21 * scale,'#fff',4 * scale,true),
      icon('coins',left + 5 * scale,4 * scale,13 * scale),line(left + 22 * scale,3 * scale,left + 22 * scale,18 * scale),
      text('TOTAL',amountX,7 * scale,5.5 * scale,true,'center'),
      text(amount,amountX,17 * scale,fit(amount,usable - 30 * scale,8.2 * scale,true),true,'center')]);
    if (amounts.paid > 0) {
      row('wallet','Abonado:',fmt.currency(amounts.paid));
      row('wallet','Pendiente:',fmt.currency(amounts.pending),true);
      const paymentInfo = summarizeDirectTripPaymentInfo([trip]);
      divider();
      section('wallet','INFORMACIÓN DEL PAGO',
        'Fecha del pago:\n' + paymentInfo.date + '\nMétodo: ' + paymentInfo.method + '\nPor dónde fue: ' + paymentInfo.channel);
    }
    if (trip.notes) { divider();section('clipboard','NOTAS',trip.notes); }
    divider();
    const heading = 'CONFIRMACIÓN DE ENTREGA';
    const message = wrap('Confirmo haber recibido el material correspondiente a este viaje.',usable - 7 * scale,3.8 * scale);
    const signatureHeight = (29 + message.length * 4.8) * scale;
    add(signatureHeight + scale,[rect(left,0,usable,signatureHeight,'#fff',4 * scale,true),
      text(heading,width/2,7 * scale,fit(heading,usable - 6 * scale,4.8 * scale,true),true,'center'),
      ...message.map((v,i)=>text(v,width/2,(13 + i * 4.8) * scale,3.8 * scale,false,'center')),
      line(left + 5 * scale,signatureHeight - 10 * scale,right - 5 * scale,signatureHeight - 10 * scale),
      text('Firma de quien recibe',width/2,signatureHeight - 4 * scale,4 * scale,true,'center')]);
    if (config.company_phone) {
      divider();const phone = 'Tel: ' + config.company_phone;
      add(9 * scale,[icon('phone',left + 2 * scale,.5 * scale,5 * scale),
        text(phone,left + 10 * scale,4.8 * scale,fit(phone,usable - 11 * scale,3.8 * scale,true),true)]);
    }
    return { blocks,width,margin };
  }

  const builder = trip => (width,measure) => layout(trip,width,measure);
  return {
    isThermal,money,
    pdf: (trips,mode) => {
      if (!isThermal(mode)) throw new Error('Este diseño requiere impresión térmica');
      const records = Array.isArray(trips) ? trips : [trips];
      const reference = records.length === 1 ? records[0].invoice_number || 'factura' : 'seleccion';
      const filename = 'viaje_directo_' + String(reference).replace(/[^a-z0-9_-]/gi,'_') + '_' + (mode === 'thermal_58' ? '58mm' : '80mm') + '.pdf';
      return SaleInvoice.thermalDocument.pdfBatch(records.map(builder),mode,filename);
    },
    bluetoothBytes: trip => SaleInvoice.thermalDocument.bluetoothBytes(builder(trip))
  };
})();
