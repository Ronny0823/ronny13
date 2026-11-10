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
    const clientId = client => SupabaseSync.getRecordId(client);
    const clients = getRecords('client')
      .filter(client => clientId(client) && safeText(client.client_name))
      .sort((a, b) => a.client_name.localeCompare(b.client_name, 'es'));
    const clientsById = new Map(clients.map(client => [clientId(client), client]));
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
          <div class="min-w-0 sm:col-span-2" data-quote-client-picker>
            <label for="quotationClient" class="mb-2 block text-sm font-medium text-slate-400">Cliente</label>
            <div class="relative">
              <input type="text" name="client" id="quotationClient" required maxlength="120"
                placeholder="Buscar cliente por nombre..." autocomplete="off"
                aria-controls="quotationClientSuggestions"
                value="${escapeAttr(existing?.client_name || '')}"
                class="w-full px-4 py-3 pr-10 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 input-focus transition-all">
              <i data-lucide="search" class="w-4 h-4 text-slate-500 absolute right-3 top-3.5 pointer-events-none"></i>
              <div id="quotationClientSuggestions" class="hidden absolute z-50 left-0 right-0 top-full mt-2 max-h-56 overflow-y-auto bg-slate-950 border border-slate-700 rounded-lg shadow-xl shadow-black/30"></div>
            </div>
            <p class="mt-1 text-xs text-slate-500">También puedes escribir el nombre de un cliente nuevo.</p>
          </div>
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
    const clientPicker = form.querySelector('[data-quote-client-picker]');
    const suggestions = form.querySelector('#quotationClientSuggestions');
    let selectedClientId = existing?.client_id || '';
    const normalizeName = name => name.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const hideSuggestions = () => suggestions.classList.add('hidden');
    const showSuggestions = () => {
      const query = normalizeName(fields.client.value);
      const matches = clients.filter(client => normalizeName(client.client_name).includes(query)).slice(0, 8);
      suggestions.innerHTML = matches.length ? matches.map(client => {
        const contact = [
          client.vehicle_plate && 'Placa: ' + client.vehicle_plate,
          client.client_phone
        ].filter(Boolean).join(' · ') || client.client_address || 'Cliente registrado';
        return `<button type="button" data-client-id="${escapeAttr(clientId(client))}"
          class="w-full text-left px-4 py-3 hover:bg-slate-800/80 border-b border-slate-800 last:border-b-0 transition-colors">
          <div class="font-medium text-slate-200">${escapeHtml(client.client_name)}</div>
          <div class="text-xs text-slate-500">${escapeHtml(contact)}</div>
        </button>`;
      }).join('') : '<div class="px-4 py-3 text-sm text-slate-500">Sin clientes encontrados</div>';
      suggestions.classList.remove('hidden');
    };
    fields.client.addEventListener('focus', showSuggestions);
    fields.client.addEventListener('input', () => {
      if (selectedClientId) fields.phone.value = '';
      selectedClientId = '';
      showSuggestions();
    });
    clientPicker.addEventListener('focusout', event => {
      if (!clientPicker.contains(event.relatedTarget)) hideSuggestions();
    });
    clientPicker.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' && event.target === fields.client) {
        event.preventDefault();
        showSuggestions();
        suggestions.querySelector('button')?.focus();
      } else if (event.key === 'Escape') {
        fields.client.focus();
        hideSuggestions();
      }
    });
    suggestions.addEventListener('pointerdown', event => {
      if (event.target.closest('button[data-client-id]')) event.preventDefault();
    });
    suggestions.addEventListener('click', event => {
      const button = event.target.closest('button[data-client-id]');
      const client = clientsById.get(button?.dataset.clientId);
      if (!client) return;
      selectedClientId = clientId(client);
      fields.client.value = client.client_name;
      fields.phone.value = client.client_phone || '';
      if (suggestions.contains(document.activeElement)) fields.client.focus();
      hideSuggestions();
    });
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
        showToast('Selecciona o escribe el cliente y completa los materiales o servicios', 'warning');
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
        client_id: selectedClientId,
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
      'No. ' + quote.quote_number,
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

  function thermalCalculation(item) {
    return fmt.quantity(item.quantity) + ' x ' + fmt.currency(item.price);
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
        ...wrap(thermalCalculation(item)),
        h.item('Importe:', fmt.currency(item.subtotal)),
        h.line
      ]),
      ...totals(quote).slice(0, -1).map(([label, value]) => h.item(label + ':', value)),
      ...h.totalBlock('TOTAL COTIZADO', fmt.currency(quote.total)),
      ...(quote.note ? wrap('Nota: ' + quote.note) : []),
      ...BluetoothPrinter.thermalFooter('GRACIAS POR SU INTERÉS')
    ].join('\n');
  }

  function thermalPrintHtml(quote, mode) {
    const width = mode === 'thermal_58' ? 58 : 80;
    const logo = AppState.config.company_logo;
    const items = quote.items.map(item =>
      `<section><strong>${escapeHtml(item.material_name)}</strong><br>${escapeHtml(thermalCalculation(item))}<br>Importe: ${escapeHtml(fmt.currency(item.subtotal))}</section>`
    ).join('');
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(quote.quote_number)}</title>
      <style>
        @page { size: ${width}mm 200mm; margin: 0 }
        * { box-sizing: border-box } body { font: 10pt/1.4 Arial,sans-serif; color:#111; margin:0; overflow-wrap:anywhere;
          width:${width}mm; padding:3mm; }
        header { text-align:center; margin-bottom:12px } img { max-width:100%; max-height:60px }
        h1 { margin:8px 0; font-size:15pt } h2 { font-size:12pt }
        section,footer { break-inside:avoid }
        section { padding:5px 0; border-bottom:1px dashed #888 } footer { margin-top:10px; text-align:right }
        p { margin:8px 0; white-space:pre-wrap }
      </style></head><body>
      <header>${logo ? '<img src="' + escapeAttr(logo) + '" alt="Logo">' : ''}
      ${companyDetails().map(line => '<div>' + escapeHtml(line) + '</div>').join('')}<h1>Cotización</h1></header>
      ${details(quote).map(line => '<div>' + escapeHtml(line) + '</div>').join('')}
      <h2>Materiales o servicios</h2>${items}
      <footer>${totals(quote).map(([label, value]) => '<div><strong>' + escapeHtml(label) + ':</strong> ' + escapeHtml(value) + '</div>').join('')}</footer>
      ${quote.note ? '<p><strong>Nota:</strong> ' + escapeHtml(quote.note) + '</p>' : ''}
      </body></html>`;
  }

  const currency = amount => fmt.currency(amount).replace(/^RD\$(?=\d)/, 'RD$ ');
  const quoteThanks = () => AppState.config.company_name
    ? 'Gracias por cotizar con ' + AppState.config.company_name + '.'
    : 'Gracias por su interés.';

  function printBusinessInfo() {
    const { company_rfc, company_address, company_phone } = AppState.config;
    return [
      [company_rfc && 'RNC ' + company_rfc, company_address].filter(Boolean).join(' · '),
      company_phone
    ].filter(Boolean);
  }

  function standardPrintHtml(quote) {
    const { company_name, company_logo, paper_size } = AppState.config;
    const paper = paper_size === 'a4' ? 'A4' : 'letter';
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(quote.quote_number)}</title>
      <style>
        @page { size: ${paper}; margin:17mm }
        * { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact }
        body { margin:0; color:#142640; font:10pt/1.4 Arial,sans-serif; overflow-wrap:anywhere }
        header { border-top:1.45mm solid #23448b; border-bottom:.25mm solid #dce3ec; padding:5mm 0; min-height:42mm;
          display:flex; justify-content:space-between; gap:6mm; break-inside:avoid }
        .business { width:49%; color:#49586b; font-size:9.5pt }
        .business img { display:block; max-width:37mm; max-height:16mm; margin-bottom:2mm }
        .business-name { display:block; color:#142640; font-size:14pt; margin-bottom:2mm }
        .business div + div { margin-top:1mm }
        .heading { flex:1; text-align:right }
        h1 { font-size:31pt; line-height:1.1; margin:0 0 2mm }
        .number { font-weight:bold; color:#23448b }
        .cards { display:flex; gap:6mm; margin:7mm 0 7mm; break-inside:avoid }
        .card { flex:1; min-width:0; background:#f0f4fa; border-radius:2.5mm; padding:6mm; min-height:35.5mm }
        .client { flex:1.27 }
        .label { color:#23448b; font-size:8.5pt; font-weight:bold; display:block; margin-bottom:3mm }
        .client-name { font-size:17pt; font-weight:bold; line-height:1.15; margin-bottom:2mm }
        .date-row,.amount-row { display:flex; justify-content:space-between; gap:3mm; color:#49586b }
        .date-row { font-size:9.5pt; margin-top:3mm }
        .date-row strong,.amount-row strong { color:#142640; text-align:right }
        h2 { font-size:17pt; margin:0 0 3mm; break-after:avoid }
        table { width:100%; border-spacing:0; table-layout:fixed }
        thead { display:table-header-group }
        th { background:#142640; color:white; text-align:left; font-size:9.2pt; padding:3.4mm 6mm }
        th:first-child { border-radius:2mm 0 0 2mm }
        th:last-child { border-radius:0 2mm 2mm 0 }
        th:first-child { width:43% }
        th:nth-child(2) { width:32% }
        td { padding:4.8mm 6mm; border-bottom:.25mm solid #dce3ec }
        tbody tr:nth-child(even) { background:#f0f4fa }
        tr,.summary { break-inside:avoid }
        th:not(:first-child),td:not(:first-child) { text-align:right }
        td:first-child,td:last-child { font-weight:bold }
        .summary { width:49%; margin:8mm 0 0 auto }
        .amount-row { margin:0 6mm 3mm }
        .total { background:#142640; color:white; border-radius:2.5mm; padding:4mm 6mm }
        .total-label { font-size:8.7pt; font-weight:bold }
        .total-amount { display:block; text-align:right; font-size:23pt; line-height:1.15; margin-top:2mm }
        .note { white-space:pre-wrap; margin:7mm 0 0 }
        footer { border-top:.25mm solid #dce3ec; margin-top:15mm; padding-top:4mm; color:#49586b; font-size:9pt; break-inside:avoid }
      </style></head><body>
      <header>
        <div class="business">
          ${company_logo ? '<img src="' + escapeAttr(company_logo) + '" alt="' + escapeAttr(company_name || 'Logo') + '">'
            : '<strong class="business-name">' + escapeHtml(company_name || '') + '</strong>'}
          ${printBusinessInfo().map(line => '<div>' + escapeHtml(line) + '</div>').join('')}
        </div>
        <div class="heading"><h1>COTIZACIÓN</h1><div class="number">${escapeHtml(quote.quote_number)}</div></div>
      </header>
      <div class="cards">
        <section class="card client">
          <span class="label">CLIENTE</span><div class="client-name">${escapeHtml(quote.client_name)}</div>
          ${quote.client_phone ? '<div>' + escapeHtml(quote.client_phone) + '</div>' : ''}
        </section>
        <section class="card">
          <span class="label">FECHAS DE LA COTIZACIÓN</span>
          <div class="date-row">Emisión <strong>${escapeHtml(quoteDate(quote))}</strong></div>
          <div class="date-row">Válida hasta <strong>${escapeHtml(quote.valid_until ? formatDateKey(quote.valid_until) : 'Sin indicar')}</strong></div>
        </section>
      </div>
      <h2>Detalle de materiales</h2>
      <table><thead><tr><th>Material o servicio</th><th>Cantidad × precio unitario</th><th>Importe</th></tr></thead><tbody>
        ${quote.items.map(item => `<tr><td>${escapeHtml(item.material_name)}</td>
          <td>${escapeHtml(fmt.quantity(item.quantity))} × ${escapeHtml(currency(item.price))}</td>
          <td>${escapeHtml(currency(item.subtotal))}</td></tr>`).join('')}
      </tbody></table>
      <div class="summary">
        <div class="amount-row">Subtotal <strong>${escapeHtml(currency(quote.subtotal))}</strong></div>
        <div class="amount-row">Impuesto (${escapeHtml(fmt.quantity(quote.tax_rate))} %) <strong>${escapeHtml(currency(quote.tax))}</strong></div>
        <div class="total"><span class="total-label">TOTAL COTIZADO</span><strong class="total-amount">${escapeHtml(currency(quote.total))}</strong></div>
      </div>
      ${quote.note ? '<p class="note"><strong>Nota:</strong> ' + escapeHtml(quote.note) + '</p>' : ''}
      <footer>${escapeHtml(quoteThanks())}</footer>
      </body></html>`;
  }

  async function createStyledPdf(quote) {
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
    const config = AppState.config;
    const margin = 17;
    const right = doc.internal.pageSize.getWidth() - margin;
    const width = right - margin;
    const bottom = doc.internal.pageSize.getHeight() - margin;
    const navy = '#142640';
    const blue = '#23448B';
    const muted = '#49586B';
    const pale = '#F0F4FA';
    const border = '#DCE3EC';
    let y = margin;

    const font = (size, bold = false) => {
      doc.setFont(family, bold ? 'bold' : 'normal');
      doc.setFontSize(size);
    };
    const text = (value, x, baseline, { size = 10, bold = false, color = navy, align = 'left' } = {}) => {
      font(size, bold);
      doc.setTextColor(color);
      doc.text(String(value), x, baseline, { align });
    };
    const wrap = (value, maxWidth, size, bold = false) => {
      font(size, bold);
      return doc.splitTextToSize(String(value), maxWidth);
    };
    const block = (lines, x, top, options = {}, spacing = 4.5) => {
      lines.forEach((line, index) => text(line, x, top + index * spacing, options));
    };
    const rule = (at, color = border, thickness = 0.25) => {
      doc.setDrawColor(color);
      doc.setLineWidth(thickness);
      doc.line(margin, at, right, at);
    };
    const panel = (x, top, panelWidth, height, color, radius = 2.5) => {
      doc.setFillColor(color);
      doc.roundedRect(x, top, panelWidth, height, radius, radius, 'F');
    };
    const pageHeading = () => {
      rule(margin - 1, blue, 1.45);
      text('COTIZACIÓN', right, margin + 14, { size: 31, bold: true, align: 'right' });
      text(quote.quote_number, right, margin + 22, { size: 10, bold: true, color: blue, align: 'right' });
    };
    const nextPage = () => {
      doc.addPage();
      pageHeading();
      y = margin + 33;
    };

    pageHeading();
    const companyWidth = width * 0.49;
    let companyY = margin + 8;
    if (config.company_logo) {
      try {
        const { width: logoWidth, height: logoHeight } = doc.getImageProperties(config.company_logo);
        const scale = Math.min(37 / logoWidth, 16 / logoHeight);
        doc.addImage(config.company_logo, margin, companyY - 3, logoWidth * scale, logoHeight * scale);
        companyY += logoHeight * scale + 1;
      } catch (error) {
        console.warn('No se pudo incorporar el logo a la cotización', error);
      }
    }
    if (companyY === margin + 8) {
      const name = wrap(config.company_name || 'Cotización', companyWidth, 14, true);
      block(name, margin, companyY + 4, { size: 14, bold: true }, 5.5);
      companyY += name.length * 5.5 + 5;
    }
    for (const info of printBusinessInfo()) {
      const lines = wrap(info, companyWidth, 9.5);
      block(lines, margin, companyY + 3, { size: 9.5, color: muted });
      companyY += lines.length * 4.5 + 1.3;
    }
    y = Math.max(margin + 41, companyY + 5);
    rule(y);
    y += 7;

    const gap = 6;
    const clientWidth = width * 0.535;
    const dateX = margin + clientWidth + gap;
    const dateWidth = right - dateX;
    const nameLines = wrap(quote.client_name, clientWidth - 12, 17, true);
    const phoneLines = quote.client_phone ? wrap(quote.client_phone, clientWidth - 12, 10.5) : [];
    const cardHeight = Math.max(35.5, 20 + nameLines.length * 6.5 + phoneLines.length * 4.5);
    panel(margin, y, clientWidth, cardHeight, pale);
    panel(dateX, y, dateWidth, cardHeight, pale);
    const smallHeading = { size: 8.5, bold: true, color: blue };
    text('CLIENTE', margin + 6, y + 9, smallHeading);
    block(nameLines, margin + 6, y + 19, { size: 17, bold: true }, 6.5);
    block(phoneLines, margin + 6, y + 20.5 + nameLines.length * 6.5, { size: 10.5, color: muted });
    text('FECHAS DE LA COTIZACIÓN', dateX + 5.5, y + 9, smallHeading);
    text('Emisión', dateX + 5.5, y + 18.5, { size: 9.5, color: muted });
    text(quoteDate(quote), right - 5.5, y + 18.5, { size: 9.5, bold: true, align: 'right' });
    text('Válida hasta', dateX + 5.5, y + 27, { size: 9.5, color: muted });
    text(quote.valid_until ? formatDateKey(quote.valid_until) : 'Sin indicar', right - 5.5, y + 27, {
      size: 9.5, bold: true, align: 'right'
    });
    y += cardHeight + 14;

    const padding = 6;
    const detailRight = margin + width * 0.75;
    const rightText = right - padding;
    const tableHeading = () => {
      text('Detalle de materiales', margin, y, { size: 17, bold: true });
      y += 5.5;
      panel(margin, y, width, 11.5, navy, 2);
      const labels = { size: 9.2, bold: true, color: '#FFFFFF' };
      text('Material o servicio', margin + padding, y + 7.3, labels);
      text('Cantidad × precio unitario', detailRight, y + 7.3, { ...labels, align: 'right' });
      text('Importe', rightText, y + 7.3, { ...labels, align: 'right' });
      y += 11.5;
    };
    tableHeading();
    quote.items.forEach((item, index) => {
      const material = wrap(item.material_name, width * 0.43 - padding, 11, true);
      const calculation = wrap(fmt.quantity(item.quantity) + ' × ' + currency(item.price), width * 0.28, 10);
      const amount = wrap(currency(item.subtotal), width * 0.25 - padding - 4, 10, true);
      const height = Math.max(15, 9 + Math.max(material.length, calculation.length, amount.length) * 4.6);
      if (y + height > bottom) {
        nextPage();
        tableHeading();
      }
      if (index % 2) {
        doc.setFillColor(pale);
        doc.rect(margin, y, width, height, 'F');
      }
      const firstBaseline = lines => y + (height - (lines.length - 1) * 4.6) / 2 + 1.3;
      block(material, margin + padding, firstBaseline(material), { size: 11, bold: true }, 4.6);
      block(calculation, detailRight, firstBaseline(calculation), { size: 10, align: 'right' }, 4.6);
      block(amount, rightText, firstBaseline(amount), { size: 10, bold: true, align: 'right' }, 4.6);
      y += height;
      rule(y);
    });

    const summaryX = margin + width * 0.51;
    if (y + 66 > bottom) nextPage();
    y += 12;
    text('Subtotal', summaryX + padding, y, { color: muted });
    text(currency(quote.subtotal), rightText, y, { bold: true, align: 'right' });
    y += 9;
    text('Impuesto (' + fmt.quantity(quote.tax_rate) + ' %)', summaryX + padding, y, { color: muted });
    text(currency(quote.tax), rightText, y, { bold: true, align: 'right' });
    y += 6;
    panel(summaryX, y, right - summaryX, 24, navy);
    text('TOTAL COTIZADO', summaryX + padding, y + 7.5, { size: 8.7, bold: true, color: '#FFFFFF' });
    const total = currency(quote.total);
    font(23, true);
    const totalWidth = rightText - summaryX - padding;
    const totalSize = Math.min(23, 23 * totalWidth / doc.getTextWidth(total));
    text(total, rightText, y + 18, { size: totalSize, bold: true, color: '#FFFFFF', align: 'right' });
    y += 24;

    if (quote.note) {
      y += 10;
      for (const line of wrap('Nota: ' + quote.note, width, 10)) {
        if (y > bottom - 22) nextPage();
        text(line, margin, y, { color: muted });
        y += 4.6;
      }
    }
    const footerLines = wrap(quoteThanks(), width, 9);
    const lastRulePosition = bottom - 8 - (footerLines.length - 1) * 4.5;
    if (y + 7 > lastRulePosition) nextPage();
    y = Math.min(lastRulePosition, Math.max(margin + 212, y + 16));
    rule(y);
    block(footerLines, margin, y + 8, { size: 9, color: muted });
    return doc;
  }

  async function share(quote) {
    try {
      if (!window.jspdf?.jsPDF) throw new Error('No está disponible el generador de PDF');
      await sharePdfDocument(await createStyledPdf(quote), fileName(quote), {
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
        (await createStyledPdf(quote)).save(fileName(quote));
      } catch (error) {
        showToast('No se pudo descargar la cotización en PDF', 'error');
        console.error(error);
      }
      return;
    }
    const thermal = mode === 'thermal_58' || mode === 'thermal_80';
    if (thermal && isBluetoothPrinterSelected()) {
      try {
        await BluetoothPrinter.printText(thermalText(quote));
        showToast('Cotización enviada a la impresora Bluetooth', 'success');
        return;
      } catch (error) {
        showToast('Bluetooth no respondió. Se abrirá la impresión en hoja', 'warning');
        openPrintDocument(standardPrintHtml(quote));
        return;
      }
    }
    openPrintDocument(thermal ? thermalPrintHtml(quote, mode) : standardPrintHtml(quote));
  }

  return { render };
})();
