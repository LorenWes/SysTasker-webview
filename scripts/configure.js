#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

/**
 * ============================================================================
 * configure.js —— WebView 空壳 APK 构建参数注入
 * ----------------------------------------------------------------------------
 *  在构建 APK 前运行，把四个核心参数写进 Android 工程：
 *    APP_NAME        APP 名称（桌面图标下的名字）
 *    PACKAGE_NAME    APK 包名 / applicationId
 *    ICON_URL        APP 图标图片地址（http(s) 或本地路径；留空用仓库 icon-source.png）
 *    DEFAULT_URL     默认访问链接（启动后直接加载的地址）
 *
 *  另外可选：
 *    VERSION_NAME    版本名，默认 1.0
 *    VERSION_CODE    版本号，默认 1
 *    SPLASH_BG       启动图背景色，默认 #FFFFFF
 *
 *  用法：
 *    node scripts/configure.js
 *    APP_NAME=测试 PACKAGE_NAME=cn.test.app node scripts/configure.js
 *
 *  依赖：sharp（生成图标位图）。
 * ============================================================================
 */

var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');
var sharp = require('sharp');

var ROOT = path.resolve(__dirname, '..');
var ANDROID_DIR = path.join(ROOT, 'android');
var APP_DIR = path.join(ANDROID_DIR, 'app');
var JAVA_DIR = path.join(APP_DIR, 'src', 'main', 'java');
var RES_DIR = path.join(APP_DIR, 'src', 'main', 'res');
var CAP_CONFIG = path.join(ROOT, 'capacitor.config.json');
var GRADLE_FILE = path.join(APP_DIR, 'build.gradle');
var STRINGS_FILE = path.join(RES_DIR, 'values', 'strings.xml');
var ICON_FALLBACK = path.join(ROOT, 'icon-source.png');

var DOWNLOAD_TIMEOUT = parseInt(process.env.ICON_TIMEOUT || '30000', 10);

var cfg = {
    appName: str(process.env.APP_NAME, 'SysTasker'),
    packageName: str(process.env.PACKAGE_NAME, 'com.systasker.app'),
    iconUrl: str(process.env.ICON_URL, ''),
    defaultUrl: normalizeUrl(str(process.env.DEFAULT_URL, 'https://m2.task.wloren.cn')),
    versionName: str(process.env.VERSION_NAME, '1.0'),
    versionCode: str(process.env.VERSION_CODE, '1'),
    splashBg: str(process.env.SPLASH_BG, '#FFFFFF')
};

// 图标位图规格
var MIPMAP_SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
// 自适应图标：108dp 画布（各密度像素），内容占约 62%（安全区 66dp）
var ADAPTIVE_SIZES = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
var ADAPTIVE_INNER_RATIO = 0.62;
// 启动图：竖屏 / 横屏像素尺寸
var SPLASH_SIZES = {
    port: { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] },
    land: { mdpi: [480, 320], hdpi: [800, 480], xhdpi: [1280, 720], xxhdpi: [1600, 960], xxxhdpi: [1920, 1280] }
};
var SPLASH_FALLBACK = [1280, 1920];
var SPLASH_ICON_RATIO = 0.3;

function str(v, def) {
    var s = (v === undefined || v === null) ? '' : String(v).trim();
    return s === '' ? def : s;
}

function normalizeUrl(url) {
    var u = url.trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u.replace(/\/+$/, '');
}

function xmlEscape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function parseHexColor(hex) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) throw new Error('SPLASH_BG 需要是十六进制颜色（如 #FFFFFF / #1A1A1A），当前：' + hex);
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), alpha: 1 };
}

function validate() {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(cfg.packageName)) {
        throw new Error('PACKAGE_NAME 不合法：' + cfg.packageName +
            '（需形如 com.example.app，每段以字母开头，仅含字母/数字/下划线，至少两段）');
    }
    if (!/^https?:\/\/[^\s]+$/i.test(cfg.defaultUrl)) {
        throw new Error('DEFAULT_URL 不合法：' + cfg.defaultUrl);
    }
    if (!/^\d+$/.test(cfg.versionCode)) {
        throw new Error('VERSION_CODE 需要是整数，当前：' + cfg.versionCode);
    }
    if (!/^[0-9A-Za-z._-]+$/.test(cfg.versionName)) {
        throw new Error('VERSION_NAME 含非法字符：' + cfg.versionName);
    }
}

/** 按正则替换且要求命中，否则报错（避免静默失败） */
function replaceOnce(text, regex, replacement, label) {
    if (!regex.test(text)) throw new Error('未找到需要替换的内容：' + label);
    return text.replace(regex, replacement);
}

function readFile(p) {
    return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

function writeFile(p, content) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
}

// ---------------------------------------------------------------- 配置注入

function writeCapacitorConfig() {
    var conf = JSON.parse(readFile(CAP_CONFIG));
    conf.appId = cfg.packageName;
    conf.appName = cfg.appName;
    conf.webDir = conf.webDir || 'public';
    conf.server = conf.server || {};
    conf.server.url = cfg.defaultUrl;
    if (!Array.isArray(conf.server.allowNavigation) || conf.server.allowNavigation.length === 0) {
        conf.server.allowNavigation = ['https://*/*', 'http://*/*'];
    }
    writeFile(CAP_CONFIG, JSON.stringify(conf, null, 2) + '\n');
    console.log('  ✓ capacitor.config.json  appId / appName / server.url');
}

function patchGradle() {
    var g = readFile(GRADLE_FILE);
    g = replaceOnce(g, /namespace\s*=\s*"[^"]*"/, 'namespace = "' + cfg.packageName + '"', 'namespace');
    g = replaceOnce(g, /applicationId\s+"[^"]*"/, 'applicationId "' + cfg.packageName + '"', 'applicationId');
    g = replaceOnce(g, /versionCode\s+\d+/, 'versionCode ' + cfg.versionCode, 'versionCode');
    g = replaceOnce(g, /versionName\s+"[^"]*"/, 'versionName "' + cfg.versionName + '"', 'versionName');
    writeFile(GRADLE_FILE, g);
    console.log('  ✓ app/build.gradle      namespace / applicationId / versionCode / versionName');
}

function patchStrings() {
    var xml = readFile(STRINGS_FILE);
    var values = {
        app_name: cfg.appName,
        title_activity_main: cfg.appName,
        package_name: cfg.packageName,
        custom_url_scheme: cfg.packageName,
        default_url: cfg.defaultUrl,
        dialog_url_hint: '例如: ' + cfg.defaultUrl
    };
    Object.keys(values).forEach(function (key) {
        var re = new RegExp('(<string name="' + key + '"[^>]*>)([\\s\\S]*?)(</string>)');
        xml = replaceOnce(xml, re, function (m, open, _old, close) {
            return open + xmlEscape(values[key]) + close;
        }, 'strings.xml → ' + key);
    });
    writeFile(STRINGS_FILE, xml);
    console.log('  ✓ res/values/strings.xml  app_name / default_url 等 6 项');
}

/** 把 java 源码搬到新包路径下，并改写 package 声明 */
function relocateJava() {
    var moved = [];
    ['main', 'test', 'androidTest'].forEach(function (srcSet) {
        var base = path.join(APP_DIR, 'src', srcSet, 'java');
        if (!fs.existsSync(base)) return;
        walk(base).forEach(function (file) {
            if (!file.endsWith('.java')) return;
            var code = readFile(file);
            var pkgMatch = /^\s*package\s+([a-zA-Z0-9_.]+);/m.exec(code);
            if (!pkgMatch) return;
            var code2 = code.replace(/^(\s*package\s+)[a-zA-Z0-9_.]+;/m, '$1' + cfg.packageName + ';');
            var target = path.join(base, cfg.packageName.split('.').join('/'), path.basename(file));
            if (path.resolve(file) !== path.resolve(target)) {
                writeFile(target, code2);
                fs.unlinkSync(file);
                moved.push(path.relative(ROOT, target));
            } else if (code2 !== code) {
                writeFile(file, code2);
            }
        });
        // 清理搬迁后留下的空目录
        pruneEmptyDirs(base);
    });
    return moved;
}

function walk(dir) {
    var out = [];
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
        var full = path.join(dir, e.name);
        if (e.isDirectory()) out = out.concat(walk(full));
        else out.push(full);
    });
    return out;
}

function pruneEmptyDirs(dir) {
    if (!fs.existsSync(dir)) return false;
    var entries = fs.readdirSync(dir);
    entries.forEach(function (name) {
        var full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) pruneEmptyDirs(full);
    });
    if (fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
        return true;
    }
    return false;
}

// ---------------------------------------------------------------- 图标资源

function fetchBufferOnce(url, depth) {
    depth = depth || 0;
    return new Promise(function (resolve, reject) {
        if (depth > 5) return reject(new Error('重定向次数过多：' + url));
        var mod = /^http:\/\//i.test(url) ? http : https;
        var req = mod.get(url, {
            headers: { 'User-Agent': 'curl/7.81.0', 'Accept': 'image/*,*/*' },
            timeout: DOWNLOAD_TIMEOUT
        }, function (res) {
            if ([301, 302, 303, 307, 308].indexOf(res.statusCode) >= 0 && res.headers.location) {
                res.resume();
                resolve(fetchBufferOnce(new URL(res.headers.location, url).href, depth + 1));
                return;
            }
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error('HTTP ' + res.statusCode));
                return;
            }
            var chunks = [];
            res.on('data', function (c) { chunks.push(c); });
            res.on('end', function () { resolve(Buffer.concat(chunks)); });
        });
        req.on('timeout', function () { req.destroy(new Error('下载超时（' + DOWNLOAD_TIMEOUT + 'ms）')); });
        req.on('error', reject);
    });
}

/** 下载图标：node 原生请求重试 3 次，仍失败则降级系统 curl */
async function fetchBuffer(url) {
    var lastErr = null;
    for (var i = 1; i <= 3; i++) {
        try {
            return await fetchBufferOnce(url);
        } catch (e) {
            lastErr = e;
            console.log('    ↻ 第 ' + i + ' 次下载失败（' + e.message + '）' + (i < 3 ? '，2s 后重试…' : ''));
            if (i < 3) await new Promise(function (r) { setTimeout(r, 2000); });
        }
    }
    var tmp = path.join(require('os').tmpdir(), 'shell-icon-' + Date.now());
    try {
        console.log('    ↻ 改用系统 curl 重试…');
        require('child_process').execFileSync('curl', [
            '-fsSL', '--max-time', String(Math.round(DOWNLOAD_TIMEOUT / 1000)),
            '-A', 'curl/7.81.0', '-o', tmp, url
        ], { stdio: ['ignore', 'ignore', 'pipe'] });
        var buf = fs.readFileSync(tmp);
        fs.unlinkSync(tmp);
        return buf;
    } catch (e) {
        throw new Error('图标下载失败：' + lastErr.message + '（curl 兜底也失败：' + e.message + '）');
    }
}

async function loadIcon() {
    if (cfg.iconUrl) {
        if (/^https?:\/\//i.test(cfg.iconUrl)) {
            console.log('  · 下载图标：' + cfg.iconUrl);
            return fetchBuffer(cfg.iconUrl);
        }
        var local = path.resolve(ROOT, cfg.iconUrl);
        console.log('  · 读取本地图标：' + cfg.iconUrl);
        return fs.readFileSync(local);
    }
    if (!fs.existsSync(ICON_FALLBACK)) {
        throw new Error('未提供 ICON_URL，且仓库里没有默认图标 icon-source.png');
    }
    console.log('  · 未提供 ICON_URL，使用仓库默认图标 icon-source.png');
    return fs.readFileSync(ICON_FALLBACK);
}

/** 解码校验：拿不到尺寸就说明不是有效图片 */
async function decodeIcon(buf, label) {
    var meta;
    try {
        meta = await sharp(buf).metadata();
    } catch (e) {
        throw new Error('图标不是有效图片（' + label + '）：' + e.message + '，请使用 png / jpg / webp / svg');
    }
    if (!meta.width || !meta.height) {
        throw new Error('图标不是有效图片（' + label + '）：无法读取尺寸');
    }
    return meta;
}

/** 生成透明背景的方形图标（保持比例，不裁切） */
function resizeContain(buf, size) {
    return sharp(buf)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png();
}

function circleMask(size) {
    return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '">' +
        '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + size / 2 + '" fill="#fff"/></svg>');
}

async function generateIcons(buf) {
    // 1) 传统 mipmap 图标（方形 + 圆形）
    for (var density of Object.keys(MIPMAP_SIZES)) {
        var size = MIPMAP_SIZES[density];
        var dir = path.join(RES_DIR, 'mipmap-' + density);
        await resizeContain(buf, size).toFile(path.join(dir, 'ic_launcher.png'));
        await sharp(await resizeContain(buf, size).toBuffer())
            .composite([{ input: circleMask(size), blend: 'dest-in' }])
            .png()
            .toFile(path.join(dir, 'ic_launcher_round.png'));
    }
    console.log('  ✓ mipmap-*              ic_launcher / ic_launcher_round（5 档密度）');

    // 2) 自适应图标前景（108dp 画布，内容居中留白）+ 背景色
    for (var d2 of Object.keys(ADAPTIVE_SIZES)) {
        var canvas = ADAPTIVE_SIZES[d2];
        var inner = Math.round(canvas * ADAPTIVE_INNER_RATIO);
        var pad = Math.round((canvas - inner) / 2);
        var fg = await sharp(buf)
            .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .extend({ top: pad, bottom: canvas - inner - pad, left: pad, right: canvas - inner - pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
        var fgDir = path.join(RES_DIR, 'mipmap-' + d2);
        fs.mkdirSync(fgDir, { recursive: true });
        fs.writeFileSync(path.join(fgDir, 'ic_launcher_foreground.png'), fg);
    }
    var adaptiveXml = '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n' +
        '    <background android:drawable="@drawable/ic_launcher_background" />\n' +
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n' +
        '</adaptive-icon>\n';
    var anydpi = path.join(RES_DIR, 'mipmap-anydpi-v26');
    writeFile(path.join(anydpi, 'ic_launcher.xml'), adaptiveXml);
    writeFile(path.join(anydpi, 'ic_launcher_round.xml'), adaptiveXml);
    writeFile(path.join(RES_DIR, 'drawable', 'ic_launcher_background.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n' +
        '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n' +
        '    <solid android:color="' + cfg.splashBg + '" />\n' +
        '</shape>\n');
    console.log('  ✓ mipmap-anydpi-v26     自适应图标（前景 + ' + cfg.splashBg + ' 背景）');

    // 3) 启动图：图标居中 + 背景色
    var bg = parseHexColor(cfg.splashBg);
    async function splashTo(file, w, h) {
        var iconSize = Math.round(Math.min(w, h) * SPLASH_ICON_RATIO);
        var icon = await sharp(buf)
            .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        await sharp({ create: { width: w, height: h, channels: 4, background: bg } })
            .composite([{ input: icon, gravity: 'center' }])
            .png()
            .toFile(file);
    }
    await splashTo(path.join(RES_DIR, 'drawable', 'splash.png'), SPLASH_FALLBACK[0], SPLASH_FALLBACK[1]);
    for (var d3 of Object.keys(SPLASH_SIZES.port)) {
        var p = SPLASH_SIZES.port[d3];
        var l = SPLASH_SIZES.land[d3];
        await splashTo(path.join(RES_DIR, 'drawable-port-' + d3, 'splash.png'), p[0], p[1]);
        await splashTo(path.join(RES_DIR, 'drawable-land-' + d3, 'splash.png'), l[0], l[1]);
    }
    console.log('  ✓ drawable-*          启动图 splash（竖屏/横屏 × 5 档密度）');
}

// ---------------------------------------------------------------- 主流程

async function main() {
    console.log('配置 WebView 空壳 APK');
    console.log('  应用名称 : ' + cfg.appName);
    console.log('  包名     : ' + cfg.packageName);
    console.log('  默认地址 : ' + cfg.defaultUrl);
    console.log('  版本     : ' + cfg.versionName + ' (' + cfg.versionCode + ')');
    console.log('  图标     : ' + (cfg.iconUrl || 'icon-source.png（仓库默认）'));
    console.log('');

    validate();

    // 先把图标拿到手并确认能解析，避免参数写了一半才发现图片是坏的
    console.log('[1/4] 准备图标');
    var icon = await loadIcon();
    var iconMeta = await decodeIcon(icon, cfg.iconUrl || 'icon-source.png');
    console.log('  · 源图 ' + iconMeta.width + '×' + iconMeta.height);

    console.log('[2/4] 写入构建配置');
    writeCapacitorConfig();
    patchGradle();
    patchStrings();

    console.log('[3/4] 迁移 Java 包路径');
    var moved = relocateJava();
    if (moved.length) {
        moved.forEach(function (m) { console.log('  ✓ ' + m); });
    } else {
        console.log('  · 包路径已是 ' + cfg.packageName + '，无需迁移');
    }

    console.log('[4/4] 生成图标与启动图');
    await generateIcons(icon);

    console.log('\n完成，接着执行 npx cap sync android 即可打包');
}

main().catch(function (e) {
    console.error('\n✗ 配置失败：' + e.message);
    process.exit(1);
});
