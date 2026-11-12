'use strict';

// Diseño exclusivo de despacho de combustible en papel térmico de 58/80 mm.
const FuelReceipt = (() => {
  const isThermal = mode => mode === 'thermal_58' || mode === 'thermal_80';

  function receiptNumber(record) {
    if (record.receipt_number) return String(record.receipt_number);
    const id = String(record.__backendId || '').replace(/^fuel_dispatch_/, '');
    // Referencia breve y estable; no renumera ni modifica los registros existentes.
    return 'GAS-' + id.replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase();
  }

  function layout(record, available, width, measure) {
    const scale = width / 80, margin = 3, left = margin, right = width - margin;
    const usable = right - left, blocks = [], font = 4.25 * scale;
    const text = (value, x, y, size = font, bold = false, align = 'left', color = '#000') =>
      ({ type: 'text', value: String(value ?? ''), x, y, size, bold, align, color });
    const line = (x1, y1, x2, y2, dashed = false) => ({ type: 'line', x1, y1, x2, y2, dashed });
    const rect = (x, y, w, h, fill = '#fff', radius = 0, stroke = false) =>
      ({ type: 'rect', x, y, w, h, fill, radius, stroke });
    const icon = (kind, x, y, size) => ({ type: 'icon', kind, x, y, size });
    const add = (height, commands) => blocks.push({ height, commands });
    const fit = (value, maxWidth, size, bold = false) =>
      Math.min(size, size * maxWidth / Math.max(1, measure(String(value), size, bold)));
    const wrap = (value, maxWidth, size, bold = false) => {
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
    const row = (kind, label, value, shade = false) => {
      const labelX = left + 9 * scale, valueX = labelX + measure(label + ' ', font, true);
      const lines = wrap(value || '—', right - valueX - scale, font);
      const height = Math.max(7 * scale, lines.length * font * 1.22 + 1.5 * scale);
      add(height, [
        ...(shade ? [rect(left, 0, usable, height, '#ddd', 1.6 * scale)] : []),
        icon(kind, left + 1.5 * scale, .6 * scale, 5.6 * scale),
        text(label, labelX, font + .5 * scale, font, true),
        ...lines.map((v, i) => text(v, valueX, font + .5 * scale + i * font * 1.22))
      ]);
    };

    const config = AppState.config;
    if (config.company_logo) {
      add(25 * scale, [{ type: 'image', value: config.company_logo, x: left, y: 0, w: usable, h: 24 * scale }]);
    } else center(config.company_name || 'DESPACHO DE COMBUSTIBLE', 5.2 * scale, true);
    if (config.company_slogan) center(config.company_slogan, 3.8 * scale, true);
    if (config.company_rfc) center('RNC: ' + config.company_rfc, 3.8 * scale, true);
    divider();
    const title = 'DESPACHO DE GASOL';
    add(10 * scale, [icon('fuel', left + scale, 0, 9 * scale),
      text(title, left + 12 * scale, 7 * scale, fit(title, usable - 13 * scale, 5.4 * scale, true), true)]);
    const number = 'N.º ' + receiptNumber(record);
    add(8 * scale, [rect(left + 12 * scale, 0, 24 * scale, 6 * scale, '#000', 1.3 * scale),
      text('RECIBO', left + 24 * scale, 4.5 * scale, 4 * scale, true, 'center', '#fff'),
      text(number, right, 4.8 * scale, fit(number, usable - 39 * scale, 4.5 * scale, true), true, 'right')]);
    divider();
    add(7 * scale, [rect(left, 0, usable, 6 * scale, '#ddd', 1.7 * scale), text('DATOS', left + 4 * scale, 4.8 * scale, 4.6 * scale, true)]);
    row('calendar', 'Fecha:', fmt.date(record.date));
    row('user', 'Nombre:', record.name);
    if (record.odometer) row('card', 'Horómetro:', record.odometer);
    row('truck', 'Placa:', fuelPlate(record), true);
    row('truck', 'Equipo:', fuelVehicleModel(record));
    divider();
    row('pin', 'Dirección:', record.address);
    divider();
    const amount = fmt.number(record.quantity, 2) + ' G';
    const amountX = left + usable * .66;
    add(23 * scale, [rect(left + 2 * scale, 0, usable - 4 * scale, 21 * scale, '#fff', 4 * scale, true),
      icon('fuel', left + 6 * scale, 4 * scale, 13 * scale), line(left + 23 * scale, 3 * scale, left + 23 * scale, 18 * scale),
      text('CANTIDAD', amountX, 7 * scale, 4.8 * scale, true, 'center'),
      text(amount, amountX, 17 * scale, fit(amount, usable - 30 * scale, 8.6 * scale, true), true, 'center')]);
    divider();
    const remaining = 'Disponible: ' + fmt.number(available, 2) + ' G';
    add(9 * scale, [rect(left, 0, usable, 8 * scale, '#ddd', 1.6 * scale),
      icon('drop', left + 3 * scale, scale, 6 * scale),
      text(remaining, left + 12 * scale, 5.7 * scale, fit(remaining, usable - 14 * scale, 4.4 * scale, true), true)]);
    divider();
    const heading = 'CONFIRMACIÓN DE ENTREGA';
    const message = wrap('Confirmo haber recibido el combustible detallado en este recibo.', usable - 8 * scale, 3.9 * scale);
    const signatureHeight = (36 + message.length * 4.8) * scale;
    add(signatureHeight + scale, [rect(left, 0, usable, signatureHeight, '#fff', 4 * scale, true),
      text(heading, width / 2, 7 * scale, fit(heading, usable - 6 * scale, 4.8 * scale, true), true, 'center'),
      ...message.map((v, i) => text(v, width / 2, (14 + i * 4.8) * scale, 3.9 * scale, false, 'center')),
      line(left + 5 * scale, signatureHeight - 10 * scale, right - 5 * scale, signatureHeight - 10 * scale),
      text('Firma de recibido', width / 2, signatureHeight - 4 * scale, 4 * scale, true, 'center')]);
    if (config.company_phone) {
      divider();
      const phone = 'Tel: ' + config.company_phone;
      add(9 * scale, [icon('phone', left + 2 * scale, .5 * scale, 5 * scale),
        text(phone, left + 10 * scale, 4.8 * scale, fit(phone, usable - 11 * scale, 3.8 * scale, true), true)]);
    }
    return { blocks, width, margin };
  }

  const builder = record => {
    const available = getFuelTotals().remaining;
    return (width, measure) => layout(record, available, width, measure);
  };
  return {
    isThermal, receiptNumber,
    pdf: (record, mode) => {
      if (!isThermal(mode)) throw new Error('Este diseño requiere impresión térmica');
      return SaleInvoice.thermalDocument.pdf(builder(record), mode,
        'recibo_gasol_' + receiptNumber(record) + '_' + (mode === 'thermal_58' ? '58mm' : '80mm') + '.pdf');
    },
    html: (record, mode) => SaleInvoice.thermalDocument.html(builder(record), mode, 'Despacho de gasol'),
    bluetoothBytes: record => SaleInvoice.thermalDocument.bluetoothBytes(builder(record))
  };
})();
