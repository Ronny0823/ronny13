'use strict';

const fs = require('fs');
const app = fs.readFileSync('organized/js/app.js', 'utf8');
const html = fs.readFileSync('organized/index.html', 'utf8');
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');

const checks = [
  [app.includes('const RecordSyncV2'), 'Falta la sincronización por registro'],
  [app.includes("rpc('sync_erp_records'"), 'Falta el envío normalizado a Supabase'],
  [app.includes("rpc('reserve_erp_invoice_numbers'"), 'Falta la reserva atómica de facturas'],
  [app.includes("crypto?.randomUUID?.()"), 'Faltan identificadores UUID'],
  [!/(?<!await )AppState\.saveUserData\(\);/.test(app), 'Hay guardados sin esperar confirmación'],
  [!/__backendId[^\n]*Date\.now/.test(app), 'Hay identificadores basados solo en Date.now'],
  [html.includes('id="syncStatusDot"') && html.includes('id="syncStatusText"'), 'Falta el indicador de sincronización'],
  [gradle.includes('versionCode 44') && gradle.includes("versionName '1.43.0'"), 'Versión Android incorrecta'],
  [manifest.includes('android:allowBackup="false"'), 'El respaldo Android debe estar desactivado']
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Verificaciones v1.43 completadas');
