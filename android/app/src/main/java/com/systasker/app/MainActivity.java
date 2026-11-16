package com.systasker.app;

import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import androidx.appcompat.app.AlertDialog;

import com.getcapacitor.BridgeActivity;

/**
 * WebView 空壳：不自带任何前端页面，启动后直接加载「默认访问链接」。
 *
 * 默认地址的唯一定义处是 strings.xml 里的 default_url
 * （由 scripts/configure.js 按构建参数写入），本类不再硬编码。
 * 用户在应用内改过地址后写入 SharedPreferences，后续启动优先使用用户设置。
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "WebViewShell";
    private static final String PREFS_NAME = "webview_prefs";
    private static final String KEY_SERVER_URL = "server_url";

    private long lastBackPressTime = 0;
    private static final int DOUBLE_BACK_PRESS_INTERVAL = 2000;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Android 13+ 预测性返回
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    () -> handleBackPressed());
        }

        WebView webView = this.bridge.getWebView();
        WebSettings settings = webView.getSettings();

        // 允许混合内容（HTTPS 页面内的 HTTP 请求）
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // 允许 JS 与跨源访问
        settings.setJavaScriptEnabled(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setAllowFileAccessFromFileURLs(true);

        // DOM Storage
        settings.setDomStorageEnabled(true);

        // 调试（release 可移除）
        WebView.setWebContentsDebuggingEnabled(true);

        // 暴露 JS 接口，供远程页面调用以修改地址设置
        webView.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void openUrlSettings() {
                runOnUiThread(() -> showUrlInputDialog(false));
            }

            @android.webkit.JavascriptInterface
            public String getCurrentUrl() {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                return prefs.getString(KEY_SERVER_URL, defaultUrl());
            }
        }, "WebViewShellNative");

        // 用户改过地址就用用户的，否则直接加载构建时配置的默认地址
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String savedUrl = prefs.getString(KEY_SERVER_URL, null);
        String target = (savedUrl != null && !savedUrl.isEmpty()) ? savedUrl : defaultUrl();

        Log.d(TAG, "Loading URL: " + target);
        webView.loadUrl(target);
    }

    /** 构建时写入的默认访问链接（strings.xml → default_url） */
    private String defaultUrl() {
        return getString(R.string.default_url);
    }

    /**
     * 弹出 URL 输入对话框（仅由远程页面的 JS 接口调用）
     */
    public void showUrlInputDialog(final boolean isFirstLaunch) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this, R.style.ShellDialog);
        builder.setTitle(R.string.dialog_url_title);

        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint(R.string.dialog_url_hint);
        input.setText(defaultUrl());
        input.setSelection(input.getText().length());
        input.setPadding(48, 32, 48, 32);
        input.setTextColor(Color.BLACK);
        input.setHintTextColor(Color.GRAY);
        builder.setView(input);

        builder.setPositiveButton(R.string.dialog_confirm, new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                String url = input.getText().toString().trim();
                if (url.isEmpty()) {
                    url = defaultUrl();
                }
                // 自动补全协议
                if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    url = "https://" + url;
                }
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                prefs.edit().putString(KEY_SERVER_URL, url).apply();
                Log.d(TAG, "URL saved: " + url);

                WebView webView = bridge.getWebView();
                if (webView != null) {
                    webView.loadUrl(url);
                }
            }
        });

        builder.setNegativeButton(R.string.dialog_cancel, null);

        AlertDialog dialog = builder.create();
        dialog.show();
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(Color.parseColor("#DA291C"));
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(Color.parseColor("#DA291C"));
    }

    /** 处理返回键：优先回退 WebView 历史，到首页后双击退出 */
    private void handleBackPressed() {
        WebView webView = this.bridge.getWebView();

        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            Log.d(TAG, "handleBackPressed: going back in WebView history");
        } else {
            long currentTime = System.currentTimeMillis();
            if (currentTime - lastBackPressTime < DOUBLE_BACK_PRESS_INTERVAL) {
                finish();
            } else {
                lastBackPressTime = currentTime;
                Toast.makeText(this, R.string.press_again_to_exit, Toast.LENGTH_SHORT).show();
                Log.d(TAG, "handleBackPressed: first press at home page, waiting for second press");
            }
        }
    }

    @Override
    public void onBackPressed() {
        // Android 12 以下兼容路径
        handleBackPressed();
    }
}
