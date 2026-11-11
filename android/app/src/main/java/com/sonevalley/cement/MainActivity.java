package com.sonevalley.cement;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.SystemClock;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {
    private static final long BACK_EXIT_WINDOW_MS = 2000L;
    private static final int REQUEST_STORAGE_PERMISSION = 1001;
    private static final Pattern DISPOSITION_FILENAME =
        Pattern.compile("filename\\*?=(?:UTF-8'')?\"?([^\";]+)\"?", Pattern.CASE_INSENSITIVE);

    private long lastBackPressedAt = 0L;
    private String pendingUrl;
    private String pendingUserAgent;
    private String pendingDisposition;
    private String pendingMimeType;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setupBackNavigation();
        setupDownloadHandler();
    }

    private void setupBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = (bridge != null) ? bridge.getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }

                long now = SystemClock.elapsedRealtime();
                if (now - lastBackPressedAt <= BACK_EXIT_WINDOW_MS) {
                    finish();
                    return;
                }

                lastBackPressedAt = now;
                Toast.makeText(MainActivity.this, "Press back again to exit", Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void setupDownloadHandler() {
        WebView webView = (bridge != null) ? bridge.getWebView() : null;
        if (webView == null) {
            return;
        }

        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            if (url == null || (!url.startsWith("http://") && !url.startsWith("https://"))) {
                Toast.makeText(this, "Unsupported download link", Toast.LENGTH_SHORT).show();
                return;
            }

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
                ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                pendingUrl = url;
                pendingUserAgent = userAgent;
                pendingDisposition = contentDisposition;
                pendingMimeType = mimetype;
                ActivityCompat.requestPermissions(
                    this,
                    new String[] { Manifest.permission.WRITE_EXTERNAL_STORAGE },
                    REQUEST_STORAGE_PERMISSION
                );
                return;
            }

            enqueueDownload(url, userAgent, contentDisposition, mimetype);
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_STORAGE_PERMISSION && pendingUrl != null) {
            String url = pendingUrl;
            String ua = pendingUserAgent;
            String disp = pendingDisposition;
            String mime = pendingMimeType;
            pendingUrl = null;
            pendingUserAgent = null;
            pendingDisposition = null;
            pendingMimeType = null;

            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                enqueueDownload(url, ua, disp, mime);
            } else {
                Toast.makeText(this, "Storage permission needed to save file", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private void enqueueDownload(String url, String userAgent, String contentDisposition, String mimetype) {
        try {
            String normalizedMime = normalizeMimeType(mimetype);
            String fileName = resolveFileName(url, contentDisposition, normalizedMime);

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            if (normalizedMime != null && !normalizedMime.isEmpty()) {
                request.setMimeType(normalizedMime);
            }

            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null && !cookies.isEmpty()) {
                request.addRequestHeader("Cookie", cookies);
            }
            if (userAgent != null && !userAgent.isEmpty()) {
                request.addRequestHeader("User-Agent", userAgent);
            }

            request.setTitle(fileName);
            request.setDescription("Downloading from Sonevalley");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (dm != null) {
                dm.enqueue(request);
                Toast.makeText(this, "Downloading " + fileName + " to Downloads", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "Download manager unavailable", Toast.LENGTH_SHORT).show();
            }
        } catch (Exception ex) {
            Toast.makeText(this, "Download failed: " + ex.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private static String normalizeMimeType(String mimetype) {
        if (mimetype == null) {
            return null;
        }
        int semi = mimetype.indexOf(';');
        String base = (semi >= 0 ? mimetype.substring(0, semi) : mimetype).trim();
        return base.isEmpty() ? null : base;
    }

    private static String resolveFileName(String url, String contentDisposition, String normalizedMime) {
        String name = null;
        if (contentDisposition != null) {
            Matcher m = DISPOSITION_FILENAME.matcher(contentDisposition);
            if (m.find() && m.group(1) != null) {
                name = m.group(1).trim();
            }
        }
        if (name == null || name.isEmpty()) {
            name = URLUtil.guessFileName(url, contentDisposition, normalizedMime);
        }
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (name.isEmpty() || "downloadfile.bin".equals(name)) {
            name = "sonevalley-export.csv";
        }
        return name;
    }
}
