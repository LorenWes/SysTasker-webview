package com.systasker.app;

import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "SysTasker";
    private long lastBackPressTime = 0;
    private static final int DOUBLE_BACK_PRESS_INTERVAL = 2000; // 2秒内按两次返回才退出

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = this.bridge.getWebView();
        WebSettings settings = webView.getSettings();

        // ✅ 关键修复：允许混合内容（HTTPS页面→HTTP请求）
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
    }

    @Override
    public void onBackPressed() {
        WebView webView = this.bridge.getWebView();

        if (webView != null && webView.canGoBack()) {
            // WebView 有历史记录，返回上一页
            webView.goBack();
            Log.d(TAG, "onBackPressed: going back in WebView history");
        } else {
            // 已在首页/根页面，需要按两次返回才退出
            long currentTime = System.currentTimeMillis();
            if (currentTime - lastBackPressTime < DOUBLE_BACK_PRESS_INTERVAL) {
                // 第二次按下返回键，退出APP
                super.onBackPressed();
            } else {
                // 第一次按下返回键，提示用户
                lastBackPressTime = currentTime;
                Toast.makeText(this, "再按一次返回键退出应用", Toast.LENGTH_SHORT).show();
                Log.d(TAG, "onBackPressed: first press at home page, waiting for second press");
            }
        }
    }
}
