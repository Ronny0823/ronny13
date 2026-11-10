'use strict';

const Quotations = (() => {
  const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 input-focus';
  const actionClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800';
  const primaryClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 font-semibold text-slate-950 hover:bg-primary-400 disabled:opacity-50';
  const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
  const quoteDate = quote => formatDateKey(getLocalDateKey(quote.date));
  const findQuote = id => getRecords('quote').find(quote => quote.__backendId === id);
  const fileName = quote => 'Cotizacion_' + quote.quote_number + '.pdf';

  function render(container) {
    const quotes = getRecords('quote').slice().sort((a, b) => b.date.localeCompare(a.date));
    container.innerHTML = `
      <section class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-slate-400">Prepara, comparte e imprime precios para tus clientes.</p>
          <button type="button" data-quote-action="new" class="${primaryClass}"><i data-lucide="plus" class="h-4 w-4"></i>Nueva cotización</button>
        </div>
        <div class="grid gap-3 lg:grid-cols-2">
          ${quotes.map(quote => `
            <article class="glass space-y-3 rounded-xl border border-slate-700 p-4" data-quote-id="${escapeAttr(quote.__backendId)}">
              <div class="flex flex-wrap justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-xs text-slate-400">${escapeHtml(quote.quote_number)} · ${escapeHtml(quoteDate(quote))}</p>
                  <h3 class="break-words text-lg font-semibold text-slate-100">${escapeHtml(quote.client_name)}</h3>
                </div>
                <p class="text-lg font-bold text-primary-300">${escapeHtml(fmt.currency(quote.total))}</p>
              </div>
              <p class="break-words text-sm text-slate-400">${escapeHtml(quote.items.map(item => item.material_name).join(', '))}
                ${quote.valid_until ? '<span class="block">Válida hasta ' + escapeHtml(formatDateKey(quote.valid_until)) + '</span>' : ''}
              </p>
              <div class="flex flex-wrap gap-2">
                <button type="button" data-quote-action="share" class="${actionClass}"><i data-lucide="file-down" class="h-4 w-4"></i>PDF WhatsApp</button>
                <button type="button" data-quote-action="print" class="${actionClass}"><i data-lucide="printer" class="h-4 w-4"></i>Imprimir</button>
                <button type="button" data-quote-action="edit" class="${actionClass}">Editar</button>
                <button type="button" data-quote-action="delete" class="${actionClass}">Eliminar</button>
              </div>
            </article>`).join('')}
          ${quotes.length ? '' : '<p class="glass rounded-xl p-6 text-sm text-slate-400">Aún no hay cotizaciones. Pulsa «Nueva cotización» para crear la primera.</p>'}
        </div>
      </section>`;

    container.firstElementChild.addEventListener('click', async event => {
      const button = event.target.closest('button[data-quote-action]');
      if (!button) return;
      if (button.dataset.quoteAction === 'new') return openEditor();
      const quote = findQuote(button.closest('[data-quote-id]').dataset.quoteId);
      if (!quote) return;
      switch (button.dataset.quoteAction) {
        case 'edit': openEditor(quote); break;
        case 'share': await share(quote); break;
        case 'print': await print(quote); break;
        case 'delete':
          if (window.confirm('¿Eliminar la cotización ' + quote.quote_number + '?')) {
            button.disabled = true;
            await confirmDeleteRecord(quote.__backendId);
            button.disabled = false;
          }
          break;
      }
    });
  }

  function openEditor(existing) {
    const clients = getRecords('client');
    const materials = new Map(getRecords('material').map(material => [material.name, material]));
    const rate = existing?.tax_rate ?? (AppState.config.iva_default_enabled ? AppState.config.iva_default_rate : 0);
    const options = names => names.map(name => '<option value="' + escapeAttr(name) + '"></option>').join('');
    showModal(`
      <form id="quotationForm" class="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-4 sm:p-6">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-xl font-bold text-slate-100">${existing ? 'Editar cotización' : 'Nueva cotización'}</h2>
          <button type="button" class="${actionClass}" data-close-quote aria-label="Cerrar">Cerrar</button>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="text-sm text-slate-300">Cliente
            <input name="client" class="${inputClass}" list="quotationClients" required maxlength="120" value="${escapeAttr(existing?.client_name || '')}" placeholder="Elige o escribe el nombre">
          </label>
          <label class="text-sm text-slate-300">Teléfono (opcional)
            <input name="phone" class="${inputClass}" type="tel" maxlength="40" value="${escapeAttr(existing?.client_phone || '')}">
          </label>
          <label class="text-sm text-slate-300">Válida hasta (opcional)
            <input name="validity" type="date" class="${inputClass}" value="${escapeAttr(existing?.valid_until || '')}">
          </label>
          <label class="text-sm text-slate-300">Impuesto (%) · 0 si no aplica
            <input name="tax" type="number" min="0" max="100" step="0.01" required class="${inputClass}" value="${escapeAttr(rate ?? 0)}">
          </label>
        </div>
        <datalist id="quotationClients">${options([...new Set(clients.map(client => client.client_name))])}</datalist>
        <datalist id="quotationMaterials">${options([...materials.keys()])}</datalist>
        <h3 class="font-semibold text-slate-100">Materiales o servicios</h3>
        <div data-quote-lines class="space-y-2"></div>
        <button type="button" data-add-line class="${actionClass}">+ Agregar línea</button>
        <label class="block text-sm text-slate-300">Nota para el cliente (opcional)
          <textarea name="note" rows="2" maxlength="500" class="${inputClass}">${escapeHtml(existing?.note || '')}</textarea>
        </label>
        <div data-quote-total class="text-right text-lg font-bold text-primary-300" aria-live="polite"></div>
        <button type="submit" class="${primaryClass} w-full">Guardar cotización</button>
      </form>`);

    const form = document.getElementById('quotationForm');
    const fields = form.elements;
    const lines = form.querySelector('[data-quote-lines]');
    const saveButton = form.querySelector('[type="submit"]');
    const closeButton = form.querySelector('[data-close-quote]');
    const readItems = () => Array.from(lines.children, row => {
      const material_name = safeText(row.querySelector('[data-material]').value);
      const quantity = Number(row.querySelector('[data-quantity]').value);
      const price = Number(row.querySelector('[data-price]').value);
      return { material_name, quantity, price, subtotal: money(quantity * price) };
    });
    const readTotals = items => {
      const subtotal = money(items.reduce((total, item) => total + item.subtotal, 0));
      const tax_rate = Number(fields.tax.value);
      const tax = money(subtotal * tax_rate / 100);
      return { subtotal, tax_rate, tax, total: money(subtotal + tax) };
    };
    const updateTotal = () => {
      const { total, subtotal, tax } = readTotals(readItems());
      form.querySelector('[data-quote-total]').textContent =
        'Subtotal ' + fmt.currency(subtotal) + ' · Impuesto ' + fmt.currency(tax) + ' · Total ' + fmt.currency(total);
    };
    const addLine = (item = {}) => {
      lines.insertAdjacentHTML('beforeend', `
        <div class="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-700 p-2 sm:grid-cols-5">
          <label class="col-span-2 text-xs text-slate-300">Material o servicio
            <input data-material required maxlength="120" list="quotationMaterials" class="${inputClass}" value="${escapeAttr(item.material_name || '')}" placeholder="Elige o escribe">
          </label>
          <label class="text-xs text-slate-300">Cantidad
            <input data-quantity required type="number" min="0.000001" max="1000000" step="any" class="${inputClass}" value="${escapeAttr(item.quantity ?? 1)}">
          </label>
          <label class="text-xs text-slate-300">Precio unitario
            <input data-price required type="number" min="0" max="100000000" step="0.01" class="${inputClass}" value="${escapeAttr(item.price ?? '')}">
          </label>
          <button type="button" data-remove-line class="${actionClass}">Quitar</button>
        </div>`);
      updateTotal();
    };
    for (const item of existing?.items || [{}]) addLine(item);

    closeButton.addEventListener('click', closeModal);
    form.querySelector('[data-add-line]').addEventListener('click', () => {
      addLine();
      lines.lastElementChild.querySelector('[data-material]').focus();
    });
    lines.addEventListener('click', event => {
      const remove = event.target.closest('[data-remove-line]');
      if (!remove) return;
      if (lines.children.length === 1) {
        showToast('La cotización necesita al menos una línea', 'warning');
        return;
      }
      remove.parentElement.remove();
      updateTotal();
    });
    form.addEventListener('input', event => {
      const input = event.target;
      if (input === fields.client && !fields.phone.value) {
        const client = clients.find(item => item.client_name === input.value);
        if (client?.client_phone) fields.phone.value = client.client_phone;
      }
      if (input.matches('[data-material]')) {
        const material = materials.get(input.value);
        if (material) input.closest('div').querySelector('[data-price]').value = material.price ?? '';
      }
      updateTotal();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (saveButton.disabled) return;
      const current = existing && findQuote(existing.__backendId);
      if (existing && !current) {
        showToast('La cotización ya no está disponible', 'warning');
        return;
      }
      const client_name = safeText(fields.client.value);
      const items = readItems();
      const date = current?.date || new Date().toISOString();
      if (!client_name || !items.length || items.some(item => !item.material_name || item.quantity <= 0)) {
        showToast('Escribe el cliente y completa los materiales o servicios', 'warning');
        return;
      }
      if (fields.validity.value && fields.validity.value < getLocalDateKey(date)) {
        showToast('La vigencia debe ser igual o posterior a la fecha de la cotización', 'warning');
        return;
      }
      const id = current?.__backendId || createRecordId('quote');
      const quote = {
        ...current, type: 'quote', __backendId: id,
        quote_number: current?.quote_number || 'COT-' + id.slice(6).replaceAll('-', '').slice(0, 12).toUpperCase(),
        date, client_name, items, ...readTotals(items),
        client_phone: safeText(fields.phone.value),
        valid_until: fields.validity.value,
        note: safeText(fields.note.value)
      };
      saveButton.disabled = true;
      closeButton.disabled = true;
      const previous = AppState.data;
      AppState.data = current
        ? previous.map(record => record.__backendId === id ? quote : record)
        : [...previous, quote];
      try {
        await AppState.saveUserData();
      } catch (error) {
        AppState.data = previous;
        AppState.invalidateDataCache();
        showToast('No se pudo guardar la cotización', 'error');
        console.error(error);
        return;
      } finally {
        saveButton.disabled = false;
        closeButton.disabled = false;
      }
      closeModal();
      renderPage();
      showToast('Cotización guardada', 'success');
    });
  }

  function details(quote) {
    return [
      'N.º ' + quote.quote_number,
      'Fecha: ' + quoteDate(quote),
      'Cliente: ' + quote.client_name,
      quote.client_phone ? 'Teléfono del cliente: ' + quote.client_phone : '',
      quote.valid_until ? 'Válida hasta: ' + formatDateKey(quote.valid_until) : ''
    ].filter(Boolean);
  }

  function totals(quote) {
    return [
      ['Subtotal', fmt.currency(quote.subtotal)],
      ['Impuesto (' + fmt.quantity(quote.tax_rate) + ' %)', fmt.currency(quote.tax)],
      ['Total cotizado', fmt.currency(quote.total)]
    ];
  }

  function companyDetails() {
    const config = AppState.config;
    return [config.company_name, config.company_rfc && 'RNC: ' + config.company_rfc,
      config.company_address, config.company_phone && 'Teléfono: ' + config.company_phone].filter(Boolean);
  }

  function thermalText(quote) {
    const h = BluetoothPrinter.helpers();
    const plain = text => String(text).replace(/[\x00-\x1f\x7f]/g, ' ');
    const wrap = text => h.wordWrap(plain(text)).flatMap(line => h.wrap(line));
    return [
      ...BluetoothPrinter.thermalHeader('COTIZACIÓN'),
      ...details(quote).flatMap(wrap),
      ...h.section('MATERIALES O SERVICIOS'),
      ...quote.items.flatMap(item => [
        ...wrap(item.material_name),
        ...wrap(fmt.quantity(item.quantity) + ' × ' + fmt.currency(item.price)),
        h.item('Importe:', fmt.currency(item.subtotal)),
        h.line
      ]),
      ...totals(quote).slice(0, -1).map(([label, value]) => h.item(label + ':', value)),
      ...h.totalBlock('TOTAL COTIZADO', fmt.currency(quote.total)),
      ...(quote.note ? wrap('Nota: ' + quote.note) : []),
      ...BluetoothPrinter.thermalFooter('GRACIAS POR SU INTERÉS')
    ].join('\n');
  }

  function printHtml(quote, mode) {
    const width = mode === 'thermal_58' ? 58 : mode === 'thermal_80' ? 80 : 0;
    const logo = AppState.config.company_logo;
    const items = quote.items.map(item => width
      ? `<section><strong>${escapeHtml(item.material_name)}</strong><br>${escapeHtml(fmt.quantity(item.quantity))} × ${escapeHtml(fmt.currency(item.price))}<br>Importe: ${escapeHtml(fmt.currency(item.subtotal))}</section>`
      : `<tr><td>${escapeHtml(item.material_name)}</td><td>${escapeHtml(fmt.quantity(item.quantity))}</td><td>${escapeHtml(fmt.currency(item.price))}</td><td>${escapeHtml(fmt.currency(item.subtotal))}</td></tr>`).join('');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(quote.quote_number)}</title>
      <style>
        @page { size: ${width ? width + 'mm 200mm' : AppState.config.paper_size === 'a4' ? 'A4' : 'letter'}; margin: ${width ? '0' : '12mm'} }
        * { box-sizing: border-box } body { font: ${width ? '10pt' : '11pt'}/1.4 Arial,sans-serif; color:#111; margin:0; overflow-wrap:anywhere;
          ${width ? 'width:' + width + 'mm; padding:3mm;' : ''} }
        header { text-align:center; margin-bottom:12px } img { max-width:${width ? '100%' : '145px'}; max-height:60px }
        h1 { margin:8px 0; font-size:${width ? '15pt' : '22pt'} } h2 { font-size:12pt }
        table { width:100%; border-collapse:collapse; margin-top:12px } th,td { padding:6px; border-bottom:1px solid #aaa; text-align:right }
        th:first-child,td:first-child { text-align:left; width:46% } tr,section,footer { break-inside:avoid }
        section { padding:5px 0; border-bottom:1px dashed #888 } footer { margin-top:10px; text-align:right }
        p { margin:8px 0; white-space:pre-wrap }
      </style></head><body>
      <header>${logo ? '<img src="' + escapeAttr(logo) + '" alt="Logo">' : ''}
      ${companyDetails().map(line => '<div>' + escapeHtml(line) + '</div>').join('')}<h1>Cotización</h1></header>
      ${details(quote).map(line => '<div>' + escapeHtml(line) + '</div>').join('')}
      ${width ? '<h2>Materiales o servicios</h2>' + items : '<table><thead><tr><th>Material o servicio</th><th>Cantidad</th><th>Precio unitario</th><th>Importe</th></tr></thead><tbody>' + items + '</tbody></table>'}
      <footer>${totals(quote).map(([label, value]) => '<div><strong>' + escapeHtml(label) + ':</strong> ' + escapeHtml(value) + '</div>').join('')}</footer>
      ${quote.note ? '<p><strong>Nota:</strong> ' + escapeHtml(quote.note) + '</p>' : ''}
      </body></html>`;
  }

  async function createPdf(quote) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      unit: 'mm', format: AppState.config.paper_size === 'a4' ? 'a4' : 'letter', putOnlyUsedFonts: true
    });
    const fonts = await loadExactPdfFontFiles();
    const family = fonts ? 'QuotationSans' : 'helvetica';
    if (fonts) {
      doc.addFileToVFS('LiberationSans-Regular.ttf', fonts.regular);
      doc.addFileToVFS('LiberationSans-Bold.ttf', fonts.bold);
      doc.addFont('LiberationSans-Regular.ttf', family, 'normal');
      doc.addFont('LiberationSans-Bold.ttf', family, 'bold');
    }
    doc.setCharSpace(0);
    const margin = 13;
    const right = doc.internal.pageSize.getWidth() - margin;
    const bottom = doc.internal.pageSize.getHeight() - margin;
    let y = margin + 4;
    const line = (text, { x = margin, align = 'left', bold = false, size = 10 } = {}) => {
      doc.setFont(family, bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      doc.text(text, x, y, { align });
    };
    const heading = () => {
      line('COTIZACIÓN', { bold: true, size: 18 });
      line(quote.quote_number, { x: right, align: 'right', bold: true });
      y += 9;
    };
    const ensureRoom = height => {
      if (y + height <= bottom) return;
      doc.addPage();
      y = margin + 4;
      heading();
    };
    const paragraph = (text, width = right - margin) => {
      doc.setFont(family, 'normal');
      doc.setFontSize(10);
      for (const part of doc.splitTextToSize(text, width)) {
        ensureRoom(5);
        line(part);
        y += 5;
      }
    };

    heading();
    const logo = AppState.config.company_logo;
    if (logo) {
      try {
        const { width, height } = doc.getImageProperties(logo);
        const scale = Math.min(35 / width, 18 / height);
        doc.addImage(logo, margin, y - 3, width * scale, height * scale);
        y += height * scale + 2;
      } catch (error) {
        console.warn('No se pudo incorporar el logo a la cotización', error);
      }
    }
    companyDetails().forEach(text => paragraph(text));
    doc.setDrawColor(165);
    doc.line(margin, y - 1, right, y - 1);
    y += 5;
    details(quote).slice(1).forEach(text => paragraph(text));
    y += 5;
    ensureRoom(10);
    line('Materiales o servicios', { bold: true, size: 12 });
    y += 7;
    for (const item of quote.items) {
      ensureRoom(22);
      paragraph(item.material_name);
      ensureRoom(9);
      line(fmt.quantity(item.quantity) + ' × ' + fmt.currency(item.price));
      line(fmt.currency(item.subtotal), { x: right, align: 'right', bold: true });
      y += 3;
      doc.setDrawColor(205);
      doc.line(margin, y, right, y);
      y += 6;
    }
    ensureRoom(20);
    for (const [label, value] of totals(quote)) {
      line(label, { bold: true });
      line(value, { x: right, align: 'right', bold: true });
      y += 6;
    }
    if (quote.note) {
      y += 4;
      paragraph('Nota: ' + quote.note);
    }
    return doc;
  }

  async function share(quote) {
    try {
      if (!window.jspdf?.jsPDF) throw new Error('No está disponible el generador de PDF');
      await sharePdfDocument(await createPdf(quote), fileName(quote), {
        title: 'Cotización ' + quote.quote_number,
        text: 'Cotización para ' + quote.client_name
      });
    } catch (error) {
      showToast('No se pudo preparar el PDF de la cotización', 'error');
      console.error(error);
    }
  }

  async function print(quote) {
    const mode = getEffectivePrinterType();
    if (mode === 'pdf') {
      try {
        (await createPdf(quote)).save(fileName(quote));
      } catch (error) {
        showToast('No se pudo descargar la cotización en PDF', 'error');
        console.error(error);
      }
      return;
    }
    if (isBluetoothPrinterSelected() && (mode === 'thermal_58' || mode === 'thermal_80')) {
      try {
        await BluetoothPrinter.printText(thermalText(quote));
        showToast('Cotización enviada a la impresora Bluetooth', 'success');
        return;
      } catch (error) {
        showToast('Bluetooth no respondió. Se abrirá la impresión del sistema', 'warning');
      }
    }
    openPrintDocument(printHtml(quote, mode));
  }

  return { render };
})();
