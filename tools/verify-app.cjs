'use strict';

const fs = require('fs');
const app = fs.readFileSync('organized/js/app.js', 'utf8');
const html = fs.readFileSync('organized/index.html', 'utf8');
const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const mainActivity = fs.readFileSync('android/app/src/main/java/com/ronny/erpmaterialesnorte/MainActivity.java', 'utf8');
const workflow = fs.readFileSync('.github/workflows/build-apk.yml', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261101200000_pull_erp_record_changes.sql', 'utf8');
const pdfFontRegular = fs.statSync('organized/assets/fonts/LiberationSans-Regular.ttf');
const pdfFontBold = fs.statSync('organized/assets/fonts/LiberationSans-Bold.ttf');

const checks = [
  [app.includes('const RecordSyncV2'), 'Falta la sincronización por registro'],
  [app.includes("rpc('sync_erp_records'"), 'Falta el envío normalizado a Supabase'],
  [app.includes("rpc('reserve_erp_invoice_numbers'"), 'Falta la reserva atómica de facturas'],
  [app.includes("crypto?.randomUUID?.()"), 'Faltan identificadores UUID'],
  [!/(?<!await )AppState\.saveUserData\(\);/.test(app), 'Hay guardados sin esperar confirmación'],
  [!/__backendId[^\n]*Date\.now/.test(app), 'Hay identificadores basados solo en Date.now'],
  [html.includes('id="syncStatusDot"') && html.includes('id="syncStatusText"'), 'Falta el indicador de sincronización'],
  [app.includes("if (!silent) updateSyncStatus('syncing');"), 'La sincronización silenciosa no debe hacer parpadear el indicador'],
  [!mainActivity.includes('autoSyncRetry') && mainActivity.includes('if (changed) notifyWebNetwork(online);'), 'Android no debe forzar sincronización repetida'],
  [app.includes("rpc('pull_erp_record_changes'") && app.includes("'pull_cursor'"), 'Falta la descarga incremental'],
  [app.includes("if (!RecordSyncV2.hasCursor(username)) await SupabaseSync.pullUser(username)"), 'La copia antigua no debe descargarse en cada sincronización'],
  [migration.includes('pull_erp_record_changes') && migration.includes('security invoker'), 'Falta la migración incremental segura'],
  [workflow.includes('ANDROID_KEYSTORE_BASE64') && workflow.includes('assembleRelease'), 'Falta la firma permanente de Android'],
  [app.includes('generateClientCreditReportPDF') && app.includes('generateClientPaymentReportPDF'), 'Faltan los nuevos reportes claros para clientes'],
  [app.includes('createExactClientPdf') && app.includes('drawExactPaidInvoiceCard') && app.includes('drawExactPendingInvoice'), 'Los reportes no reproducen los tres formatos exactos'],
  [app.includes("format: [pageWidth, pageHeight]") && app.includes("const pageHeight = 324"), 'El formato PDF no conserva la proporcion vertical de las referencias'],
  [app.includes('loadExactPdfFontFiles') && app.includes('LiberationSans-Regular.ttf') && app.includes('LiberationSans-Bold.ttf'), 'Los PDF no usan la tipografia visual de las referencias'],
  [app.includes("doc.text('TOTAL A SALDAR', margin + 7, amountTop + 42)") && app.includes("doc.text('LE FALTA POR PAGAR', margin + 6, pendingTop + 15)"), 'El comprobante de abono no tiene la etiqueta TOTAL A SALDAR o se alteró el estado de cuenta'],
  [pdfFontRegular.size > 300000 && pdfFontBold.size > 300000, 'Faltan los archivos completos de tipografia para los PDF'],
  [app.includes('await generateClientCreditReportPDF(invoices, isPaidSelection)') && app.includes('await generateClientPaymentReportPDF(selectedPayments)'), 'El boton PDF WhatsApp no usa los nuevos formatos'],
  [!app.includes('await generateConsolidatedCreditInvoicePDF(invoices, isPaidSelection, true)') && !app.includes('await generateConsolidatedCreditPaymentPDF(selectedPayments, true)'), 'El boton PDF WhatsApp todavia usa los formatos anteriores'],
  [app.includes('showSelectedDirectTripPaymentModal') && app.includes('saveSelectedDirectTripPayment'), 'Falta el pago multiple de Viajes Directos'],
  [app.includes('updateDirectTripPaymentPreview') && app.includes('Guardar y aplicar el pago') && app.includes('Trabajar con varias facturas'), 'La pantalla de pago multiple no explica ni muestra el reparto'],
  [app.includes('printSelectedDirectTrips') && app.includes('buildSelectedDirectTripsPrintText') && app.includes('btnDirectTripPrint'), 'Falta la impresion de varias facturas de Viajes Directos'],
  [app.includes('TOTAL POR PAGAR') && app.includes('Falta por pagar') && app.includes('PAGO PARCIAL'), 'La impresion multiple no muestra saldos y estados claros'],
  [app.includes("batch_id: batchId") && app.includes("multiple_payment: true"), 'El pago multiple no conserva el grupo de facturas'],
  [app.includes('await AppState.saveUserData();') && app.includes('No se aplicaron cambios.'), 'El pago multiple no espera el guardado o no revierte en error'],
  [workflow.includes('v1.53'), 'El flujo de APK no apunta a v1.53'],
  [gradle.includes('versionCode 54') && gradle.includes("versionName '1.53.0'"), 'Versión Android incorrecta'],
  [manifest.includes('android:allowBackup="false"'), 'El respaldo Android debe estar desactivado']
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Verificaciones v1.53 completadas');
