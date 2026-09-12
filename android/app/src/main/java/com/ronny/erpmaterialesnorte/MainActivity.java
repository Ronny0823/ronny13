package com.ronny.erpmaterialesnorte;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.AlertDialog;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothSocket;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Set;
import java.util.UUID;
import java.lang.reflect.Method;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private static final int FILE_CHOOSER = 101;
    private static final int BLUETOOTH_PERMISSION = 102;
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private volatile boolean trustedContent = false;
    private volatile boolean pageReady = false;
    private volatile boolean networkValidated = false;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final Handler autoSyncHandler = new Handler(Looper.getMainLooper());
    private final Runnable autoSyncRetry = new Runnable() {
        @Override public void run() {
            if (networkValidated) notifyWebNetwork(true);
            autoSyncHandler.postDelayed(this, 5000);
        }
    };
    private WebView activePrintWebView;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(2, 6, 23));
        setContentView(webView);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        // El HTML incluido es de confianza y necesita comunicarse con Supabase/CDN.
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " ERP-Materiales-Android/1.1");

        webView.addJavascriptInterface(new BluetoothBridge(), "AndroidBluetooth");
        webView.addJavascriptInterface(new PrintBridge(), "AndroidPrint");
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                trustedContent = url != null && url.startsWith("file:///android_asset/");
                pageReady = false;
                super.onPageStarted(view, url, favicon);
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri uri = req.getUrl();
                String scheme = uri.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    if (uri.getHost() != null && (uri.getHost().contains("supabase.co") || uri.getHost().contains("github.io"))) return false;
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    return true;
                }
                if (!"file".equals(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                    return true;
                }
                return false;
            }

            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (!url.startsWith("file:///android_asset/")) return;
                String js = "(function(){" +
                    "if(window.AndroidPrint){window.open=function(){let html='',sent=false;const send=function(){if(sent)return;sent=true;AndroidPrint.printHtml(btoa(unescape(encodeURIComponent(html))));};let w={document:{readyState:'complete',images:[],open:function(){html='';sent=false;},write:function(v){html+=String(v||'');},close:function(){if(html.indexOf('window.print()')>=0)setTimeout(send,250);}},focus:function(){},print:send,close:function(){},addEventListener:function(e,f){if(e==='load')setTimeout(f,0);}};return w;};}" +
                    "if(!window.AndroidBluetooth||typeof BluetoothPrinter==='undefined')return;" +
                    "BluetoothPrinter.selectDevice=async function(){AndroidBluetooth.selectPrinter();return{name:'Impresora Android'};};" +
                    "BluetoothPrinter.connect=async function(){return true;};" +
                    "BluetoothPrinter.writeBytes=async function(bytes){let s='';for(let i=0;i<bytes.length;i+=8192){s+=String.fromCharCode.apply(null,bytes.slice(i,i+8192));}let result=AndroidBluetooth.printBase64(btoa(s));if(result!=='ok')throw new Error(result||'No se pudo imprimir');};" +
                    "window.searchBluetoothPrinter=async function(){AndroidBluetooth.selectPrinter();let t=document.getElementById('configPrinterType');let m=document.getElementById('configBluetoothPrintMode');if(t)t.value='bluetooth';if(m&&!m.value)m.value='thermal_80';if(window.updatePrinterOptions)updatePrinterOptions();showToast('Selecciona una impresora emparejada');};" +
                    "if(typeof printInvoiceById==='function'){printInvoiceById=async function(id){let inv=AppState.data.find(r=>r.__backendId===id);if(!inv)return;try{await BluetoothPrinter.printInvoice(inv);showToast('Factura impresa por Bluetooth','success');}catch(err){showToast(err&&err.message?err.message:'Falló Bluetooth directo','error');}};}" +
                    "const setNetState=function(online){let badge=Array.from(document.querySelectorAll('span')).find(x=>x.textContent.trim()==='Online'||x.textContent.trim()==='Sin conexión');if(badge){badge.textContent=online?'Online':'Sin conexión';badge.className=online?'text-xs text-emerald-400 font-medium':'text-xs text-amber-400 font-medium';}};" +
                    "window.erpNetworkChanged=async function(online){setNetState(online);if(!online){showToast('Sin internet: los cambios se guardarán en este teléfono','warning');return;}if(window.erpAutoSyncRunning)return;window.erpAutoSyncRunning=true;try{if(typeof SupabaseSync!=='undefined'&&SupabaseSync.client){SupabaseSync.restorePendingWrites();let dirty=Array.from(SupabaseSync.getDirtyKeys());if(dirty.length){showToast('Internet disponible. Subiendo cambios del teléfono...','info');let response=await SupabaseSync.client.from(SUPABASE_CONFIG.table).select('key,value').in('key',dirty);if(response.error)throw response.error;let remote=new Map((response.data||[]).map(r=>[r.key,r.value]));dirty.forEach(key=>{let localRaw=localStorage.getItem(key);if(localRaw==null)return;let merged=SupabaseSync.mergeValue(key,localRaw,remote.get(key));SupabaseSync.setLocalOnly(key,SupabaseSync.stringifyValue(merged));SupabaseSync.pending.set(key,{key:key,value:merged,updated_at:new Date().toISOString()});});await SupabaseSync.flush();if(SupabaseSync.getDirtyKeys().size)throw new Error('Cambios pendientes');}}let changed=typeof syncCurrentUserFromCloud==='function'?await syncCurrentUserFromCloud({silent:true}):false;if(changed&&typeof renderPage==='function')renderPage();if(!window.erpLastSyncOk||Date.now()-window.erpLastSyncOk>30000)showToast('Datos del teléfono enviados a la web','success');window.erpLastSyncOk=Date.now();}catch(e){console.warn('Sincronización automática pendiente',e);if(!window.erpLastSyncWarning||Date.now()-window.erpLastSyncWarning>30000)showToast('Los datos siguen guardados; se reintentará automáticamente','warning');window.erpLastSyncWarning=Date.now();}finally{window.erpAutoSyncRunning=false;}};" +
                    "window.addEventListener('offline',function(){window.erpNetworkChanged(false);});" +
                    "window.addEventListener('online',function(){window.erpNetworkChanged(true);});" +
                    "})();";
                view.evaluateJavascript(js, null);
                pageReady = true;
                notifyWebNetwork(networkValidated);
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), FILE_CHOOSER); }
                catch (Exception e) { fileCallback = null; Toast.makeText(MainActivity.this, "No se pudo abrir el selector", Toast.LENGTH_SHORT).show(); }
                return true;
            }
        });
        webView.setDownloadListener((url, userAgent, disposition, mime, length) -> {
            if (url.startsWith("http")) {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType(mime);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "erp_descarga");
                ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
            }
        });
        webView.loadUrl("file:///android_asset/index.html");
        startNetworkMonitoring();
        autoSyncHandler.postDelayed(autoSyncRetry, 5000);
        requestBluetoothPermission();
    }

    private void startNetworkMonitoring() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) { refreshNativeNetworkState(); }
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                updateNativeNetworkState(capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
            }
            @Override public void onLost(Network network) { refreshNativeNetworkState(); }
        };
        connectivityManager.registerDefaultNetworkCallback(networkCallback);
        refreshNativeNetworkState();
    }

    private void refreshNativeNetworkState() {
        if (connectivityManager == null) return;
        Network active = connectivityManager.getActiveNetwork();
        NetworkCapabilities caps = active == null ? null : connectivityManager.getNetworkCapabilities(active);
        updateNativeNetworkState(caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
    }

    private void updateNativeNetworkState(boolean online) {
        boolean changed = networkValidated != online;
        networkValidated = online;
        if (changed || online) notifyWebNetwork(online);
    }

    private void notifyWebNetwork(boolean online) {
        if (!pageReady || webView == null) return;
        runOnUiThread(() -> webView.evaluateJavascript(
            "if(window.erpNetworkChanged)window.erpNetworkChanged(" + (online ? "true" : "false") + ");", null));
    }

    @Override protected void onDestroy() {
        autoSyncHandler.removeCallbacksAndMessages(null);
        if (connectivityManager != null && networkCallback != null) {
            try { connectivityManager.unregisterNetworkCallback(networkCallback); } catch (Exception ignored) {}
        }
        super.onDestroy();
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
        }
    }

    @Override public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }

    private boolean trustedPage() {
        return trustedContent;
    }

    private boolean hasBluetoothPermission() {
        return Build.VERSION.SDK_INT < 31 || (
            checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
        );
    }

    private void requestBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= 31 && !hasBluetoothPermission()) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN}, BLUETOOTH_PERMISSION);
        }
    }

    private void jsToast(String message, String type) {
        String safe = message.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ");
        runOnUiThread(() -> webView.evaluateJavascript("if(window.showToast)showToast('" + safe + "','" + type + "');", null));
    }

    public class BluetoothBridge {
        @JavascriptInterface public void selectPrinter() {
            if (!trustedPage()) return;
            runOnUiThread(() -> {
                if (!hasBluetoothPermission()) {
                    requestBluetoothPermission();
                    Toast.makeText(MainActivity.this, "Acepta el permiso Bluetooth y vuelve a buscar", Toast.LENGTH_LONG).show();
                    return;
                }
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null) { jsToast("Este teléfono no tiene Bluetooth", "error"); return; }
                if (!adapter.isEnabled()) {
                    startActivity(new Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS));
                    Toast.makeText(MainActivity.this, "Enciende y empareja la impresora", Toast.LENGTH_LONG).show();
                    return;
                }
                Set<BluetoothDevice> bonded = adapter.getBondedDevices();
                if (bonded.isEmpty()) {
                    startActivity(new Intent(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS));
                    Toast.makeText(MainActivity.this, "Empareja primero la impresora", Toast.LENGTH_LONG).show();
                    return;
                }
                ArrayList<BluetoothDevice> devices = new ArrayList<>(bonded);
                String[] names = new String[devices.size()];
                for (int i = 0; i < devices.size(); i++) names[i] = devices.get(i).getName() + "\n" + devices.get(i).getAddress();
                new AlertDialog.Builder(MainActivity.this)
                    .setTitle("Selecciona la impresora")
                    .setItems(names, (dialog, which) -> {
                        BluetoothDevice chosen = devices.get(which);
                        getPreferences(MODE_PRIVATE).edit().putString("printer_mac", chosen.getAddress()).apply();
                        jsToast("Impresora seleccionada: " + chosen.getName(), "success");
                    }).setNegativeButton("Cancelar", null).show();
            });
        }

        @JavascriptInterface public String printBase64(String encoded) {
            if (!trustedPage()) return "Página no autorizada";
            if (!hasBluetoothPermission()) { runOnUiThread(() -> requestBluetoothPermission()); return "Acepta el permiso Bluetooth"; }
            String mac = getPreferences(MODE_PRIVATE).getString("printer_mac", "");
            if (mac.isEmpty()) return "Primero pulsa Buscar Bluetooth y selecciona la impresora";
            BluetoothSocket socket = null;
            try {
                byte[] bytes = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null || !adapter.isEnabled()) return "Enciende el Bluetooth";
                adapter.cancelDiscovery();
                BluetoothDevice device = adapter.getRemoteDevice(mac);
                socket = connectClassic(device);
                if (socket != null) {
                    OutputStream output = socket.getOutputStream();
                    output.write(bytes);
                    output.flush();
                    try { Thread.sleep(350); } catch (InterruptedException ignored) {}
                    return "ok";
                }
                return printBle(device, bytes) ? "ok" : "No se pudo abrir el canal SPP ni BLE de la impresora";
            } catch (Exception error) {
                return "No se pudo imprimir por Bluetooth directo: " + error.getClass().getSimpleName();
            } finally {
                if (socket != null) try { socket.close(); } catch (Exception ignored) {}
            }
        }

        private BluetoothSocket connectClassic(BluetoothDevice device) {
            BluetoothSocket candidate = null;
            try {
                candidate = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                candidate.connect();
                return candidate;
            } catch (Exception ignored) { if (candidate != null) try { candidate.close(); } catch (Exception closeIgnored) {} }
            try {
                candidate = device.createRfcommSocketToServiceRecord(SPP_UUID);
                candidate.connect();
                return candidate;
            } catch (Exception ignored) { if (candidate != null) try { candidate.close(); } catch (Exception closeIgnored) {} }
            try {
                Method method = device.getClass().getMethod("createRfcommSocket", int.class);
                candidate = (BluetoothSocket) method.invoke(device, 1);
                candidate.connect();
                return candidate;
            } catch (Exception ignored) { if (candidate != null) try { candidate.close(); } catch (Exception closeIgnored) {} }
            return null;
        }

        private boolean printBle(BluetoothDevice device, byte[] bytes) {
            CountDownLatch ready = new CountDownLatch(1);
            AtomicReference<BluetoothGattCharacteristic> writable = new AtomicReference<>();
            AtomicReference<CountDownLatch> writeDone = new AtomicReference<>();
            BluetoothGattCallback callback = new BluetoothGattCallback() {
                @Override public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                    if (newState == BluetoothProfile.STATE_CONNECTED) gatt.discoverServices();
                    else if (newState == BluetoothProfile.STATE_DISCONNECTED) ready.countDown();
                }
                @Override public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                    String[] preferred = {
                        "0000ffe1-0000-1000-8000-00805f9b34fb",
                        "0000ff02-0000-1000-8000-00805f9b34fb",
                        "0000fff2-0000-1000-8000-00805f9b34fb",
                        "49535343-8841-43f4-a8d4-ecbe34729bb3"
                    };
                    for (String wanted : preferred) {
                        for (BluetoothGattService service : gatt.getServices()) {
                            for (BluetoothGattCharacteristic characteristic : service.getCharacteristics()) {
                                if (wanted.equalsIgnoreCase(characteristic.getUuid().toString())) {
                                    int properties = characteristic.getProperties();
                                    if ((properties & (BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE)) != 0) {
                                        writable.set(characteristic);
                                        ready.countDown();
                                        return;
                                    }
                                }
                            }
                        }
                    }
                    for (BluetoothGattService service : gatt.getServices()) {
                        for (BluetoothGattCharacteristic characteristic : service.getCharacteristics()) {
                            int properties = characteristic.getProperties();
                            if ((properties & (BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE)) != 0) {
                                writable.set(characteristic);
                                ready.countDown();
                                return;
                            }
                        }
                    }
                    ready.countDown();
                }
                @Override public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
                    CountDownLatch latch = writeDone.get();
                    if (latch != null) latch.countDown();
                }
            };

            BluetoothGatt gatt = null;
            try {
                gatt = Build.VERSION.SDK_INT >= 23
                    ? device.connectGatt(MainActivity.this, false, callback, BluetoothDevice.TRANSPORT_LE)
                    : device.connectGatt(MainActivity.this, false, callback);
                if (!ready.await(12, TimeUnit.SECONDS) || writable.get() == null) return false;
                BluetoothGattCharacteristic characteristic = writable.get();
                int writeType = (characteristic.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
                    ? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE : BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT;
                characteristic.setWriteType(writeType);
                for (int offset = 0; offset < bytes.length; offset += 180) {
                    int length = Math.min(180, bytes.length - offset);
                    byte[] chunk = new byte[length];
                    System.arraycopy(bytes, offset, chunk, 0, length);
                    CountDownLatch latch = new CountDownLatch(1);
                    writeDone.set(latch);
                    boolean started;
                    if (Build.VERSION.SDK_INT >= 33) {
                        started = gatt.writeCharacteristic(characteristic, chunk, writeType) == android.bluetooth.BluetoothStatusCodes.SUCCESS;
                    } else {
                        characteristic.setValue(chunk);
                        started = gatt.writeCharacteristic(characteristic);
                    }
                    if (!started) return false;
                    latch.await(1500, TimeUnit.MILLISECONDS);
                    try { Thread.sleep(35); } catch (InterruptedException ignored) {}
                }
                return true;
            } catch (Exception ignored) {
                return false;
            } finally {
                if (gatt != null) { try { gatt.disconnect(); } catch (Exception ignored) {} try { gatt.close(); } catch (Exception ignored) {} }
            }
        }
    }

    public class PrintBridge {
        @JavascriptInterface public void printHtml(String encodedHtml) {
            if (!trustedPage()) return;
            try {
                String html = new String(android.util.Base64.decode(encodedHtml, android.util.Base64.DEFAULT), java.nio.charset.StandardCharsets.UTF_8);
                runOnUiThread(() -> {
                    activePrintWebView = new WebView(MainActivity.this);
                    WebSettings settings = activePrintWebView.getSettings();
                    settings.setJavaScriptEnabled(true);
                    settings.setAllowFileAccess(true);
                    activePrintWebView.setWebViewClient(new WebViewClient() {
                        @Override public void onPageFinished(WebView view, String url) {
                            PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                            PrintDocumentAdapter adapter = view.createPrintDocumentAdapter("Recibo ERP Materiales");
                            manager.print("Recibo ERP Materiales", adapter, null);
                        }
                    });
                    activePrintWebView.loadDataWithBaseURL("file:///android_asset/", html, "text/html", "UTF-8", null);
                });
            } catch (Exception error) {
                jsToast("No se pudo preparar el documento para imprimir", "error");
            }
        }
    }

}
