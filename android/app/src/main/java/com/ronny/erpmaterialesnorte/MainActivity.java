package com.ronny.erpmaterialesnorte;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
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

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private static final int FILE_CHOOSER = 101;
    private static final int BLUETOOTH_PERMISSION = 102;
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private volatile boolean trustedContent = false;

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
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                trustedContent = url != null && url.startsWith("file:///android_asset/");
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
                String js = "(function(){if(!window.AndroidBluetooth||typeof BluetoothPrinter==='undefined')return;" +
                    "BluetoothPrinter.selectDevice=async function(){AndroidBluetooth.selectPrinter();return{name:'Impresora Android'};};" +
                    "BluetoothPrinter.connect=async function(){return true;};" +
                    "BluetoothPrinter.writeBytes=async function(bytes){let s='';for(let i=0;i<bytes.length;i+=8192){s+=String.fromCharCode.apply(null,bytes.slice(i,i+8192));}let result=AndroidBluetooth.printBase64(btoa(s));if(result!=='ok')throw new Error(result||'No se pudo imprimir');};" +
                    "window.searchBluetoothPrinter=async function(){AndroidBluetooth.selectPrinter();let t=document.getElementById('configPrinterType');let m=document.getElementById('configBluetoothPrintMode');if(t)t.value='bluetooth';if(m&&!m.value)m.value='thermal_80';if(window.updatePrinterOptions)updatePrinterOptions();showToast('Selecciona una impresora emparejada');};" +
                    "})();";
                view.evaluateJavascript(js, null);
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
        requestBluetoothPermission();
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
        return Build.VERSION.SDK_INT < 31 || checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= 31 && !hasBluetoothPermission()) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, BLUETOOTH_PERMISSION);
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

                Exception lastError = null;
                try {
                    socket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                    socket.connect();
                } catch (Exception first) {
                    lastError = first;
                    if (socket != null) try { socket.close(); } catch (Exception ignored) {}
                    try {
                        socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                        socket.connect();
                    } catch (Exception second) {
                        lastError = second;
                        if (socket != null) try { socket.close(); } catch (Exception ignored) {}
                        Method method = device.getClass().getMethod("createRfcommSocket", int.class);
                        socket = (BluetoothSocket) method.invoke(device, 1);
                        socket.connect();
                    }
                }

                OutputStream output = socket.getOutputStream();
                output.write(bytes);
                output.flush();
                try { Thread.sleep(250); } catch (InterruptedException ignored) {}
                return "ok";
            } catch (Exception error) {
                return "No se pudo conectar con RPP300. Apágala, enciéndela y vuelve a emparejarla";
            } finally {
                if (socket != null) try { socket.close(); } catch (Exception ignored) {}
            }
        }
    }

}
