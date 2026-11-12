'use strict';

// Un solo diseño para la impresión web, el PDF y la imagen enviada a la térmica.
const SaleInvoice = (() => {
  const point = 72 / 25.4;
  const primitives = {
    receipt: [['line', 4, 2, 20, 2], ['line', 20, 2, 20, 23], ['line', 20, 23, 16, 20], ['line', 16, 20, 12, 23], ['line', 12, 23, 8, 20], ['line', 8, 20, 4, 23], ['line', 4, 23, 4, 2], ['line', 8, 7, 16, 7], ['line', 8, 11, 16, 11], ['line', 8, 15, 16, 15]],
    check: [['circle', 12, 12, 10], ['line', 6, 12, 10, 16], ['line', 10, 16, 18, 7]],
    building: [['rect', 3, 6, 18, 17, 0], ['line', 2, 6, 12, 1], ['line', 12, 1, 22, 6], ['rect', 6, 9, 3, 3, 0], ['rect', 15, 9, 3, 3, 0], ['rect', 6, 15, 3, 3, 0], ['rect', 15, 15, 3, 3, 0], ['rect', 10, 18, 4, 5, 0]],
    clipboard: [['rect', 4, 4, 16, 19, 2], ['rect', 8, 1, 8, 5, 1], ['line', 8, 11, 16, 11], ['line', 8, 15, 16, 15], ['line', 8, 19, 16, 19]],
    material: [['line', 2, 22, 12, 4], ['line', 12, 4, 22, 22], ['line', 2, 22, 22, 22], ['circle', 11, 12, 1], ['circle', 8, 18, 1], ['circle', 15, 18, 1]],
    coins: [['line', 9, 5, 9, 18], ['line', 21, 5, 21, 18], ['ellipse', 15, 18, 6, 2.5], ['ellipse', 15, 14, 6, 2.5], ['ellipse', 15, 10, 6, 2.5], ['ellipse', 15, 5, 6, 2.5], ['rect', 1, 18, 10, 4, 0, '#fff'], ['ellipse', 6, 22, 5, 2], ['ellipse', 6, 18, 5, 2]],
    fuel: [
      ['rect', 3, 2, 12, 20, 2, '#000'], ['rect', 5, 5, 8, 5, 1, '#fff'],
      ['line', 15, 8, 20, 8], ['line', 20, 8, 22, 12], ['line', 22, 12, 22, 19],
      ['line', 22, 19, 18, 19], ['line', 18, 19, 18, 10], ['line', 18, 3, 22, 7],
      ['line', 2, 23, 16, 23]
    ],
    truck: [['rect', 2, 5, 13, 12, 1, '#000'], ['rect', 15, 9, 7, 8, 1, '#000'], ['rect', 17, 10, 4, 3, 0, '#fff'], ['circle', 6, 19, 3], ['circle', 18, 19, 3]],
    pin: [['circle', 12, 8, 6], ['circle', 12, 8, 2], ['line', 6, 11, 12, 23], ['line', 18, 11, 12, 23]],
    drop: [['line', 12, 2, 4, 15], ['line', 12, 2, 20, 15], ['line', 4, 15, 5, 20], ['line', 5, 20, 12, 23], ['line', 12, 23, 19, 20], ['line', 19, 20, 20, 15]],
    calendar: [
      ['rect', 3, 5, 18, 16, 2], ['line', 3, 10, 21, 10],
      ['line', 8, 2, 8, 7], ['line', 16, 2, 16, 7],
      ['rect', 7, 13, 2, 2, 0], ['rect', 14, 13, 2, 2, 0]
    ],
    card: [['rect', 2, 5, 20, 15, 2], ['line', 2, 10, 22, 10], ['line', 6, 16, 10, 16]],
    user: [['circle', 12, 6, 4], ['rect', 3, 13, 18, 9, 4]],
    car: [['rect', 3, 9, 18, 10, 2], ['rect', 6, 3, 12, 7, 2], ['circle', 7, 14, 1], ['circle', 17, 14, 1], ['line', 5, 19, 5, 22], ['line', 19, 19, 19, 22]],
    wallet: [['rect', 3, 5, 18, 16, 2], ['rect', 13, 10, 9, 6, 1], ['circle', 17, 13, .6], ['line', 4, 5, 16, 1]],
    phone: [['line', 5, 3, 3, 7], ['line', 3, 7, 6, 14], ['line', 6, 14, 13, 21], ['line', 13, 21, 18, 20], ['line', 18, 20, 21, 16], ['line', 21, 16, 16, 13], ['line', 16, 13, 13, 16], ['line', 13, 16, 8, 10], ['line', 8, 10, 11, 7], ['line', 11, 7, 5, 3]]
  };

  function data(invoice) {
    const credit = invoice.payment_type === 'credito';
    const sale = findSaleForInvoice(invoice);
    const snapshot = getCreditSalePaymentSnapshot(sale || {
      ...invoice, sale_total: invoice.sale_total, __backendId: invoice.sale_id || invoice.__backendId || "invoice-without-sale"
    });
    const paid = credit ? snapshot.paidAmount : toFiniteNumber(invoice.sale_total, 0);
    const remaining = credit ? snapshot.pendingAmount : 0;
    const status = credit
      ? remaining <= .01 ? 'PAGO COMPLETADO' : paid > 0 ? 'ABONO PARCIAL - PENDIENTE' : 'PAGO A CRÉDITO - PENDIENTE'
      : 'PAGO DE CONTADO';
    return {
      invoice, credit, paid, remaining, status,
      thanks: credit && remaining > .01 ? 'GRACIAS POR SU COMPRA A CRÉDITO' : 'GRACIAS POR SU PAGO',
      items: getInvoiceItems(invoice),
      note: getInvoiceNote(invoice),
      subtotal: invoice.subtotal == null || invoice.subtotal === ""
        ? toFiniteNumber(invoice.sale_total, 0) - toFiniteNumber(invoice.tax, 0)
        : toFiniteNumber(invoice.subtotal, 0)
    };
  }

  async function documentKit() {
    if (!window.jspdf?.jsPDF) throw new Error('No se pudo cargar la librería de PDF');
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', putOnlyUsedFonts: true });
    const fonts = await loadExactPdfFontFiles();
    const family = fonts ? 'SaleInvoiceSans' : 'helvetica';
    if (fonts) {
      doc.addFileToVFS('SaleInvoice-Regular.ttf', fonts.regular);
      doc.addFileToVFS('SaleInvoice-Bold.ttf', fonts.bold);
      doc.addFont('SaleInvoice-Regular.ttf', family, 'normal');
      doc.addFont('SaleInvoice-Bold.ttf', family, 'bold');
    }
    doc.setCharSpace(0);
    return { doc, family };
  }

  function layout(invoiceData, width, measure) {
    const { invoice, credit, paid, remaining, status, thanks, items, note, subtotal } = invoiceData;
    const thermal = width <= 80;
    const scale = width < 70 ? .8 : thermal ? 1 : .9;
    const margin = thermal ? 3 : 18;
    const left = margin, right = width - margin, usable = right - left;
    const font = 3.5 * scale;
    const blocks = [];
    const add = (height, commands) => blocks.push({ height, commands });
    const text = (value, x, y, size = font, bold = false, align = 'left', color = '#000') =>
      ({ type: 'text', value: String(value || ''), x, y, size, bold, align, color });
    const line = (x1, y1, x2, y2, dashed = false) => ({ type: 'line', x1, y1, x2, y2, dashed });
    const rect = (x, y, w, h, fill = '#fff', radius = 0, stroke = false) =>
      ({ type: 'rect', x, y, w, h, fill, radius, stroke });
    const wrap = (value, max, size = font, bold = false) => {
      const result = [];
      for (const paragraph of String(value || '').split('\n')) {
        let current = '';
        for (const character of paragraph) {
          if (current && measure(current + character, size, bold) > max) {
            const space = current.lastIndexOf(' ');
            if (space > 0) {
              result.push(current.slice(0, space).trim());
              current = current.slice(space + 1);
            } else {
              result.push(current);
              current = '';
            }
          }
          current += character;
        }
        result.push(current.trim());
      }
      return result;
    };
    const centered = (value, size = font, bold = false) => {
      const lines = wrap(value, usable - 2, size, bold);
      add(lines.length * size * 1.22 + 1, lines.map((value, i) => text(value, width / 2, size + i * size * 1.22, size, bold, 'center')));
    };
    const divider = () => add(2.5 * scale, [line(left, scale, right, scale, true)]);
    const row = (label, value, { bold = false, shade = false, icon } = {}) => {
      const labelX = left + (icon ? 6 * scale : 1);
      const valueLines = wrap(value, usable * .46, font, bold);
      const labelLines = wrap(label, usable * .48 - (icon ? 6 * scale : 1), font, bold);
      const height = Math.max(labelLines.length, valueLines.length) * font * 1.2 + 1.8 * scale;
      add(height, [
        ...(shade ? [rect(left, 0, usable, height, '#ddd', 1)] : []),
        ...(icon ? [{ type: 'icon', kind: icon, x: left + .5, y: .5, size: 4.7 * scale }] : []),
        ...labelLines.map((value, i) => text(value, labelX, font + i * font * 1.2, font, bold)),
        ...valueLines.map((value, i) => text(value, right - 1, font + i * font * 1.2, font, bold, 'right'))
      ]);
    };
    const iconText = (kind, value, bold = false) => {
      const lines = wrap(value, usable - 8 * scale, font, bold);
      add(lines.length * font * 1.22 + 1.7 * scale, [
        { type: 'icon', kind, x: left + .5, y: .6, size: 4.7 * scale },
        ...lines.map((value, i) => text(value, left + 8 * scale, font + i * font * 1.22, font, bold))
      ]);
    };

    if (AppState.config.company_logo) {
      const imageWidth = Math.min(usable * .9, 70 * scale);
      add(25 * scale, [{ type: 'image', value: AppState.config.company_logo, x: (width - imageWidth) / 2, y: 0, w: imageWidth, h: 24 * scale }]);
    } else {
      centered(AppState.config.company_name, 5 * scale, true);
    }
    if (AppState.config.company_slogan) centered(AppState.config.company_slogan, 3.4 * scale);
    if (AppState.config.company_rfc) centered('RNC: ' + AppState.config.company_rfc, 3.4 * scale);
    if (!thermal && AppState.config.company_address) centered(AppState.config.company_address, 3.1 * scale);
    divider();
    centered('FACTURA', 5.6 * scale, true);
    add(5 * scale, [text(invoice.invoice_number, right, 3.8 * scale, 3.8 * scale, false, 'right')]);
    iconText('calendar', fmt.dateTime(invoice.date));
    iconText('card', status);
    divider();
    iconText('user', 'CLIENTE', true);
    const clientLines = wrap(invoice.client_name, usable - 8 * scale);
    add(clientLines.length * font * 1.22 + 1, clientLines.map((value, i) => text(value, left + 8 * scale, font + i * font * 1.22)));
    if (invoice.vehicle_plate) row('Placa:', invoice.vehicle_plate, { icon: 'car' });
    if (note) {
      divider();
      const lines = wrap('NOTA: ' + note, usable);
      add(lines.length * font * 1.22 + 2, lines.map((value, i) => text(value, left, font + i * font * 1.22)));
    }
    divider();
    add(5 * scale, [text('DETALLE', left + 1, 4 * scale, 4.2 * scale, true)]);
    items.forEach(item => {
      const names = wrap(String(item.material_name || '').toUpperCase(), usable - 3, 4 * scale, true);
      const titleHeight = names.length * 4.7 * scale + 1;
      add(titleHeight, [rect(left, 0, usable, titleHeight, '#ddd', 1),
        ...names.map((value, i) => text(value, left + 2, 4 * scale + i * 4.7 * scale, 4 * scale, true))]);
      row('Cantidad:', fmt.quantity(item.quantity));
      row('Precio:', fmt.currency(item.price));
      row('Importe:', fmt.currency(item.subtotal == null || item.subtotal === ""
        ? toFiniteNumber(item.quantity, 0) * toFiniteNumber(item.price, 0)
        : toFiniteNumber(item.subtotal, 0)));
      divider();
    });
    row('Subtotal:', fmt.currency(subtotal), { bold: true });
    if (invoice.iva_enabled) row('IVA (' + fmt.quantity(invoice.iva_rate) + '%):', fmt.currency(invoice.tax || 0));
    divider();
    const boxWidth = Math.min(usable * .82, 95 * scale);
    const total = fmt.currency(invoice.sale_total);
    const totalSize = Math.min(7 * scale, 7 * scale * (boxWidth - 5) / Math.max(1, measure(total, 7 * scale, true)));
    add(17 * scale, [
      text('TOTAL', width / 2, 5.5 * scale, 4.8 * scale, true, 'center'),
      text(total, width / 2, 13.6 * scale, totalSize, true, 'center')
    ]);
    if (credit) {
      row('Abonado:', fmt.currency(paid));
      row('Falta por pagar:', fmt.currency(remaining), { bold: true, shade: true, icon: 'wallet' });
    }
    divider();
    centered('** ' + status + ' **', 3.1 * scale, true);
    centered('** ' + thanks + ' **', 3.1 * scale, true);
    if (AppState.config.company_phone) iconText('phone', 'Tel: ' + AppState.config.company_phone);
    divider();
    const confirmationWidth = Math.min(usable, 120 * scale);
    const confirmationX = (width - confirmationWidth) / 2;
    const heading = wrap('CONFIRMACIÓN DE ENTREGA', confirmationWidth - 5, 4.3 * scale, true);
    const message = wrap('Confirmo haber recibido los materiales detallados en esta factura.', confirmationWidth - 7, 3.3 * scale);
    const height = (37 + heading.length * 5 + message.length * 4) * scale;
    add(height + 2, [
      rect(confirmationX, 0, confirmationWidth, height, '#fff', 4, true),
      ...heading.map((value, i) => text(value, width / 2, (7 + i * 5) * scale, 4.3 * scale, true, 'center')),
      ...message.map((value, i) => text(value, width / 2, (8 + heading.length * 5 + i * 4) * scale, 3.3 * scale, false, 'center')),
      line(confirmationX + 5, height - 13 * scale, confirmationX + confirmationWidth - 5, height - 13 * scale),
      text('Firma de quien recibe', width / 2, height - 7 * scale, 3.6 * scale, true, 'center')
    ]);
    return { blocks, width, margin };
  }

  function pages(plan, height) {
    const result = [];
    let page = { height, commands: [] }, y = plan.margin;
    for (let index = 0; index < plan.blocks.length; index++) {
      const block = plan.blocks[index];
      const needed = block.height + (block.keepWithNext ? plan.blocks[index + 1]?.height || 0 : 0);
      if (y + needed > height - plan.margin + .01 && page.commands.length) {
        result.push(page);
        page = { height, commands: [] };
        y = plan.margin;
      }
      page.commands.push(...block.commands.map(command => ({ ...command, offset: y })));
      y += block.height;
    }
    result.push(page);
    return result;
  }

  function iconCommands(command) {
    const factor = command.size / 24;
    const x = value => command.x + value * factor;
    const y = value => command.y + value * factor;
    return primitives[command.kind].map(([type, ...v]) => {
      if (type === 'line') return { type, x1: x(v[0]), y1: y(v[1]), x2: x(v[2]), y2: y(v[3]) };
      if (type === 'circle') return { type, x: x(v[0]), y: y(v[1]), r: v[2] * factor };
      if (type === 'ellipse') return { type, x: x(v[0]), y: y(v[1]), rx: v[2] * factor, ry: v[3] * factor };
      return { type, x: x(v[0]), y: y(v[1]), w: v[2] * factor, h: v[3] * factor, radius: v[4] * factor, fill: v[5] || '#fff', stroke: true };
    });
  }

  function svgPage(page, width, pixelWidth) {
    const draw = command => {
      const c = command, y = c.offset || 0;
      switch (c.type) {
        case 'text': return `<text x="${c.x}" y="${c.y + y}" font-size="${c.size}" font-weight="${c.bold ? 700 : 400}" text-anchor="${c.align === 'center' ? 'middle' : c.align === 'right' ? 'end' : 'start'}" fill="${c.color}">${escapeHtml(c.value)}</text>`;
        case 'rect': return `<rect x="${c.x}" y="${c.y + y}" width="${c.w}" height="${c.h}" rx="${c.radius}" fill="${c.fill}" stroke="${c.stroke ? '#000' : 'none'}" stroke-width=".4"/>`;
        case 'line': return `<line x1="${c.x1}" y1="${c.y1 + y}" x2="${c.x2}" y2="${c.y2 + y}" stroke="#000" stroke-width=".3" ${c.dashed ? 'stroke-dasharray="1.2 .6"' : ''}/>`;
        case 'circle': return `<circle cx="${c.x}" cy="${c.y + y}" r="${c.r}" fill="none" stroke="#000" stroke-width=".35"/>`;
        case 'ellipse': return `<ellipse cx="${c.x}" cy="${c.y + y}" rx="${c.rx}" ry="${c.ry}" fill="white" stroke="#000" stroke-width=".35"/>`;
        case 'icon': return iconCommands(c).map(part => draw({ ...part, offset: y })).join('');
        case 'image': return `<image href="${escapeAttr(c.value)}" xlink:href="${escapeAttr(c.value)}" x="${c.x}" y="${c.y + y}" width="${c.w}" height="${c.h}" preserveAspectRatio="xMidYMid meet"/>`;
        default: return '';
      }
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${pixelWidth || width + 'mm'}" height="${pixelWidth ? Math.ceil(page.height * pixelWidth / width) : page.height + 'mm'}" viewBox="0 0 ${width} ${page.height}" font-family="Arial, Helvetica, Liberation Sans, sans-serif"><rect width="100%" height="100%" fill="white"/>${page.commands.map(draw).join('')}</svg>`;
  }

  async function prepare(invoice, mode, layoutBuilder) {
    const kit = await documentKit();
    const thermal = mode === 'thermal_58' || mode === 'thermal_80';
    const width = thermal ? mode === 'thermal_58' ? 58 : 80 : AppState.config.paper_size === 'a4' ? 210 : 215.9;
    const measure = (value, size, bold) => {
      kit.doc.setFont(kit.family, bold ? 'bold' : 'normal');
      kit.doc.setFontSize(size * point);
      return kit.doc.getTextWidth(value);
    };
    const plan = layoutBuilder ? layoutBuilder(width, measure) : layout(data(invoice), width, measure);
    const naturalHeight = plan.blocks.reduce((total, block) => total + block.height, plan.margin * 2);
    const height = thermal ? Math.min(400, naturalHeight) : AppState.config.paper_size === 'a4' ? 297 : 279.4;
    return { ...kit, width, pages: pages(plan, height), thermal };
  }

  function renderPDF(prepared) {
    const { doc, family, width } = prepared;
    const draw = (c, offset = c.offset || 0) => {
      doc.setDrawColor(0);
      doc.setLineWidth(.3);
      if (c.type === 'icon') return iconCommands(c).forEach(part => draw(part, offset));
      if (c.type === 'text') {
        doc.setFont(family, c.bold ? 'bold' : 'normal');
        doc.setFontSize(c.size * point);
        doc.setTextColor(c.color);
        doc.text(c.value, c.x, c.y + offset, { align: c.align });
      } else if (c.type === 'rect') {
        doc.setFillColor(c.fill);
        doc.roundedRect(c.x, c.y + offset, c.w, c.h, c.radius, c.radius, c.stroke ? 'FD' : 'F');
      } else if (c.type === 'line') {
        doc.setLineDashPattern(c.dashed ? [1.2, .6] : [], 0);
        doc.line(c.x1, c.y1 + offset, c.x2, c.y2 + offset);
        doc.setLineDashPattern([], 0);
      } else if (c.type === 'circle') {
        doc.circle(c.x, c.y + offset, c.r, 'S');
      } else if (c.type === 'ellipse') {
        doc.setFillColor('#fff');
        doc.ellipse(c.x, c.y + offset, c.rx, c.ry, 'FD');
      } else if (c.type === 'image') {
        try {
          const info = doc.getImageProperties(c.value), factor = Math.min(c.w / info.width, c.h / info.height);
          const w = info.width * factor, h = info.height * factor;
          doc.addImage(c.value, c.x + (c.w - w) / 2, c.y + offset + (c.h - h) / 2, w, h);
        } catch (error) { console.warn('No se pudo incorporar el logo a la factura', error); }
      }
    };
    prepared.pages.forEach((page, index) => {
      doc.addPage([width, page.height], 'portrait');
      if (index === 0) doc.deletePage(1);
      page.commands.forEach(command => draw(command));
    });
    return doc;
  }

  async function pdf(invoice) {
    const mode = getEffectivePrinterType();
    const prepared = await prepare(invoice, mode);
    const doc = renderPDF(prepared);
    const suffix = prepared.thermal ? mode === 'thermal_58' ? '58mm' : '80mm' : AppState.config.paper_size === 'a4' ? 'A4' : 'Carta';
    doc.save('factura_' + invoice.invoice_number + '_' + suffix + '.pdf');
    showToast('PDF de factura descargado', 'success');
  }

  async function html(invoice, mode, isTest = false, layoutBuilder) {
    const prepared = await prepare(invoice, mode, layoutBuilder);
    const { width } = prepared;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(invoice.document_title || 'Factura ' + invoice.invoice_number)}</title>
      <style>@page { size:${width}mm ${prepared.pages[0].height}mm; margin:0 }
      * { box-sizing:border-box; print-color-adjust:exact; -webkit-print-color-adjust:exact }
      body { margin:0; background:#fff } .invoice-page { width:${width}mm; height:${prepared.pages[0].height}mm; break-after:page }
      .invoice-page:last-child { break-after:auto } svg { display:block; max-width:100% }</style>
      </head><body>${isTest ? '<p style="position:fixed;top:0;right:0;margin:0;font-weight:bold">DOCUMENTO DE PRUEBA</p>' : ''}${prepared.pages.map(page => '<div class="invoice-page">' + svgPage(page, width) + '</div>').join('')}</body></html>`;
  }

  async function bluetoothBytes(invoice, layoutBuilder) {
    const mode = AppState.config.bluetooth_print_mode === 'thermal_58' ? 'thermal_58' : 'thermal_80';
    const prepared = await prepare(invoice, mode, layoutBuilder);
    const dots = mode === 'thermal_58' ? 384 : 576;
    const chunks = [new Uint8Array([27, 64, 27, 97, 1])];
    for (const page of prepared.pages) {
      const canvas = document.createElement('canvas');
      canvas.width = dots;
      canvas.height = Math.ceil(page.height * dots / prepared.width);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('No se pudo preparar la imagen del ticket');
      const image = new Image();
      const loaded = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('La imagen del ticket tardó demasiado')), 15000);
        image.onload = () => { clearTimeout(timeout); resolve(); };
        image.onerror = () => { clearTimeout(timeout); reject(new Error('No se pudo dibujar el ticket')); };
      });
      image.src = 'data:image/svg+xml;base64,' + exactArrayBufferToBase64(new TextEncoder().encode(svgPage(page, prepared.width, dots)).buffer);
      await loaded;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const bytesPerRow = dots / 8;
      // Texto a resolución nativa, sin el tramado que fragmentaba los trazos.
      const raster = new Uint8Array(bytesPerRow * canvas.height);
      const inkRows = new Uint8Array(canvas.height);
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < dots; x++) {
          const pixel = (y * dots + x) * 4;
          const light = pixels[pixel] * .299 + pixels[pixel + 1] * .587 + pixels[pixel + 2] * .114;
          if (pixels[pixel + 3] > 40 && light < 180) {
            raster[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
            inkRows[y] = 1;
          }
        }
      }
      // Una franja blanca necesita solo un byte por fila; conserva el avance
      // exacto y reduce los datos Bluetooth sin cambiar la velocidad del enlace.
      for (let top = 0; top < canvas.height;) {
        const ink = inkRows[top];
        let end = top + 1;
        while (end < canvas.height && end - top < 128 && inkRows[end] === ink) end++;
        const height = end - top, rowBytes = ink ? bytesPerRow : 1;
        chunks.push(new Uint8Array([29, 118, 48, 0, rowBytes, 0, height, 0]),
          ink ? raster.slice(top * bytesPerRow, end * bytesPerRow) : new Uint8Array(height));
        top = end;
      }
    }
    chunks.push(new Uint8Array([10, 10, 10, 29, 86, 66, 0]));
    return BluetoothPrinter.concatBytes(chunks);
  }

  return { pdf, html, bluetoothBytes,
    thermalDocument: {
      pdfBatch: async (layoutBuilders, mode, filename) => {
        if (!layoutBuilders.length) return;
        const prepared = await prepare({}, mode, layoutBuilders[0]);
        for (const builder of layoutBuilders.slice(1)) {
          const next = await prepare({}, mode, builder);
          prepared.pages.push(...next.pages);
        }
        const doc = renderPDF(prepared);
        doc.save(filename);
        return doc;
      },
      pdf: async (layoutBuilder, mode, filename) => {
        const doc = renderPDF(await prepare({}, mode, layoutBuilder));
        doc.save(filename);
        return doc;
      },
      html: (layoutBuilder, mode, title) => html({ document_title: title }, mode, false, layoutBuilder),
      bluetoothBytes: layoutBuilder => bluetoothBytes({}, layoutBuilder)
    }
  };
})();
