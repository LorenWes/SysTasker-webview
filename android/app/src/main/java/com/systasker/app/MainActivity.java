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
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import androidx.appcompat.app.AlertDialog;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "SysTasker";
    private static final String PREFS_NAME = "systasker_prefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String DEFAULT_URL = "https://m.task.wloren.cn";

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

        // 允许混合内容（HTTPS页面 -> HTTP请求）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            Log.d(TAG, "Mixed content mode: ALWAYS_ALLOW");
        }

        // 允许 JS
        settings.setJavaScriptEnabled(true);

        // 允许来自任意来源的内容
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setAllowFileAccessFromFileURLs(true);

        // DOM Storage
        settings.setDomStorageEnabled(true);

        // 调试（release 可移除）
        WebView.setWebContentsDebuggingEnabled(true);

        Log.d(TAG, "WebView configured. UA: " + settings.getUserAgentString());

        // 暴露 JS 接口，供前端调用以修改 URL 设置
        webView.addJavascriptInterface(new Object() {
            @android.webkit.JavascriptInterface
            public void openUrlSettings() {
                runOnUiThread(() -> showUrlInputDialog(false));
            }

            @android.webkit.JavascriptInterface
            public String getCurrentUrl() {
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                return prefs.getString(KEY_SERVER_URL, DEFAULT_URL);
            }
        }, "SysTaskerNative");

        // 检查是否有保存的自定义 URL
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String savedUrl = prefs.getString(KEY_SERVER_URL, null);

        if (savedUrl != null && !savedUrl.isEmpty()) {
            // 已有保存的 URL，直接覆盖加载
            webView.loadUrl(savedUrl);
            Log.d(TAG, "Loading saved URL: " + savedUrl);
        } else {
            // 首次启动，弹出 URL 输入对话框
            showUrlInputDialog(true);
        }
    }

    /**
     * 弹出 URL 输入对话框
     * @param isFirstLaunch true=首次启动（不可取消），false=设置中修改（可取消）
     */
    public void showUrlInputDialog(boolean isFirstLaunch) {
        AlertDialog.Builder builder = new AlertDialog.Builder(this, R.style.SysTaskerDialog);
        builder.setTitle(R.string.dialog_url_title);

        // 输入框
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint(R.string.dialog_url_hint);
        input.setText(DEFAULT_URL);
        input.setSelection(input.getText().length());
        input.setPadding(48, 32, 48, 32);
        input.setTextColor(Color.BLACK);
        input.setHintTextColor(Color.GRAY);
        builder.setView(input);

        // 确认按钮
        builder.setPositiveButton(R.string.dialog_confirm, new DialogInterface.OnClickListener() {
            @Override
            public void onClick(DialogInterface dialog, int which) {
                String url = input.getText().toString().trim();
                if (url.isEmpty()) {
                    url = DEFAULT_URL;
                }
                // 自动补全协议
                if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    url = "https://" + url;
                }
                // 保存到 SharedPreferences
                SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                prefs.edit().putString(KEY_SERVER_URL, url).apply();
                Log.d(TAG, "URL saved: " + url);
                // 加载 URL
                WebView webView = bridge.getWebView();
                if (webView != null) {
                    webView.loadUrl(url);
                }
            }
        });

        // 取消按钮（仅非首次启动时可用）
        if (!isFirstLaunch) {
            builder.setNegativeButton(R.string.dialog_cancel, null);
        } else {
            // 首次启动不可取消
            builder.setCancelable(false);
        }

        AlertDialog dialog = builder.create();
        dialog.show();

        // 设置按钮颜色为 JD 红
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(Color.parseColor("#DA291C"));
        if (!isFirstLaunch) {
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setTextColor(Color.parseColor("#DA291C"));
        }
    }

    /** 处理返回键 */
    private void handleBackPressed() {
        WebView webView = this.bridge.getWebView();

        if (webView != null && webView.canGoBack()) {
            // WebView 有历史记录，返回上一页
            webView.goBack();
            Log.d(TAG, "handleBackPressed: going back in WebView history");
        } else {
            // 已在首页/根页面，需要按两次返回才退出
            long currentTime = System.currentTimeMillis();
            if (currentTime - lastBackPressTime < DOUBLE_BACK_PRESS_INTERVAL) {
                finish();
            } else {
                lastBackPressTime = currentTime;
                Toast.makeText(this, "再按一次返回键退出应用", Toast.LENGTH_SHORT).show();
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
