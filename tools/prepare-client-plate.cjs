const fs = require('fs');

const file = process.argv[2];
if (!file) throw new Error('Indica el archivo HTML');
let html = fs.readFileSync(file, 'utf8');

const oldSelect = `    function selectSaleClient(name) {
      const input = document.getElementById('saleClient');
      const box = document.getElementById('saleClientSuggestions');
      if (input) input.value = name;
      if (box) box.classList.add('hidden');
    }`;

const newSelect = `    function getLastVehiclePlateForClient(name) {
      const normalizedName = String(name || '').trim().toLowerCase();
      if (!normalizedName) return '';

      const registeredClient = getRecords('client').find(client =>
        String(client.client_name || '').trim().toLowerCase() === normalizedName
      );
      if (registeredClient?.vehicle_plate) {
        return String(registeredClient.vehicle_plate).toUpperCase();
      }

      return getRecords('sale')
        .filter(sale =>
          String(sale.client_name || '').trim().toLowerCase() === normalizedName &&
          String(sale.vehicle_plate || '').trim()
        )
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0]?.vehicle_plate?.toUpperCase() || '';
    }

    function selectSaleClient(name) {
      const input = document.getElementById('saleClient');
      const plateInput = document.getElementById('saleVehiclePlate');
      const box = document.getElementById('saleClientSuggestions');
      if (input) input.value = name;
      if (plateInput) plateInput.value = getLastVehiclePlateForClient(name);
      if (box) box.classList.add('hidden');
    }`;

const oldSave = `        // Guardar venta y factura juntas antes de iniciar cualquier impresion.
        AppState.data.push(saleData, invoiceData);`;

const newSave = `        // Recordar la ultima placa usada por el cliente, sin bloquear su edicion.
        if (vehiclePlate) {
          const normalizedClientName = client.trim().toLowerCase();
          const clientRecord = getRecords('client').find(record =>
            String(record.client_name || '').trim().toLowerCase() === normalizedClientName
          );
          if (clientRecord) clientRecord.vehicle_plate = vehiclePlate;
        }

        // Guardar venta y factura juntas antes de iniciar cualquier impresion.
        AppState.data.push(saleData, invoiceData);`;

if (!html.includes(oldSelect)) throw new Error('No se encontro selectSaleClient');
if (!html.includes(oldSave)) throw new Error('No se encontro el guardado de venta');
html = html.replace(oldSelect, newSelect).replace(oldSave, newSave);
fs.writeFileSync(file, html);
