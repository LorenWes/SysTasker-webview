# WebView 空壳 APK

一个**不含任何内置页面**的 Android WebView 壳（基于 Capacitor 8）。安装后直接加载你指定的地址，
包名、应用名、桌面图标、默认访问链接全部由构建参数注入——同一个仓库可以产出任意多个不同品牌的 App。

## 构建参数

| 参数 | 环境变量 | 默认值 | 说明 |
|------|---------|--------|------|
| APP 名称 | `APP_NAME` | `SysTasker` | 桌面图标下显示的名字 |
| 包名 | `PACKAGE_NAME` | `com.systasker.app` | applicationId，形如 `com.example.app` |
| 默认访问链接 | `DEFAULT_URL` | `https://m.task.wloren.cn` | 启动后直接加载的地址，**不带协议会自动补 https** |
| 图标 | `ICON_URL` | 仓库内 `icon-source.png` | 图片地址（http/https/png/jpg/webp/svg），留空用仓库默认图 |
| 版本名 | `VERSION_NAME` | `1.0` | 展示给用户的版本，如 `1.0.0` |
| 版本号 | `VERSION_CODE` | `1` | 整数，每次发版递增，安卓用于判断升级 |
| 启动图底色 | `SPLASH_BG` | `#FFFFFF` | 同时用于自适应图标背景 |

## 用法一：GitHub Actions 构建（推荐）

仓库 → **Actions** → 左侧 `Build Android APK` → **Run workflow**，填上表参数，跑完在
Artifacts 里下载 APK。构建摘要会列出本次生效的全部参数，便于核对。

推送代码到 `main` 也会自动构建，此时使用仓库里的默认参数（即当前 `capacitor.config.json` 的值）。

## 用法二：本地构建

需要 Node 20+、JDK 21、Android SDK（compileSdk 36）。

```bash
npm install

# 注入参数（不传则用默认值，反复执行是幂等的）
APP_NAME="我的应用" \
PACKAGE_NAME=com.example.app \
DEFAULT_URL=https://example.com \
ICON_URL=https://example.com/logo.png \
VERSION_NAME=1.2.0 VERSION_CODE=12 \
node scripts/configure.js

npx cap sync android
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

也可以一条命令走完：`npm run build:android`。

## 脚本做了什么

`scripts/configure.js` 按参数改动以下位置（全部幂等，可反复执行）：

| 目标 | 改动 |
|------|------|
| `capacitor.config.json` | `appId` / `appName` / `server.url` |
| `android/app/build.gradle` | `namespace` / `applicationId` / `versionCode` / `versionName` |
| `res/values/strings.xml` | `app_name` / `title_activity_main` / `package_name` / `custom_url_scheme` / `default_url` |
| `src/main/java/<包名路径>/` | Java 源码自动搬到新包目录并改写 `package` 声明 |
| `res/mipmap-*` | 桌面图标：方形 + 圆形（自动裁圆），5 档密度 |
| `res/mipmap-anydpi-v26` | 自适应图标（前景 + `SPLASH_BG` 背景），Android 8+ 显示更规整 |
| `res/drawable-*` | 启动图：图标居中 + `SPLASH_BG` 底色，竖屏/横屏 × 5 档密度 |

图标下载失败会自动重试 3 次，再降级用系统 `curl` 重试；参数非法或图片无法解析会**直接报错退出**，
不会写出半套配置。

## 目录结构

```text
├── capacitor.config.json     # 壳的配置（appId / appName / server.url）
├── public/index.html         # 空壳占位页（未配置远程地址时的兜底，正常运行不展示）
├── icon-source.png           # 未传 ICON_URL 时使用的默认图标
├── scripts/configure.js      # 构建参数注入脚本
├── android/                  # Capacitor 生成的安卓工程
└── .github/workflows/build-apk.yml
```

## 应用内行为

- 启动直接加载「默认访问链接」；若用户改过地址（见下），优先用用户设置
- 返回键：优先回退网页历史，到首页后双击退出
- 网页可以通过 JS 桥 `WebViewShellNative` 调用原生能力：
  - `WebViewShellNative.getCurrentUrl()` → 返回当前配置的地址
  - `WebViewShellNative.openUrlSettings()` → 弹出地址修改对话框（写入本地设置）

改主题色：`res/values/colors.xml` 里的 `colorPrimary` / `colorAccent`（默认 `#DA291C`）。

## 与旧版差异

- **移除了内置的 Vue 前端页面**（`public/assets/**`、`android/app/src/main/assets/public/**`，约 3.6MB），
  壳启动后只加载远程地址；`public/index.html` 仅保留一个占位页满足 Capacitor 的 `webDir` 要求
- 首启不再强制弹「请输入服务器地址」，改为直接加载构建时配置的默认地址（地址修改入口移到 JS 桥）
- 删除了失效的图标脚本 `gen-icons.js` / `generate_icons.py`（后者写死 Windows 路径，输出到无用的根目录 `app/`）
  与 Capacitor 样板测试（断言的是 `com.getcapacitor.app`，与实际包名无关）

## 已验证

在本仓库状态下完整跑通 `node scripts/configure.js` → `npx cap sync android` → `./gradlew assembleDebug`
（Gradle 8.14.3 / AGP 8.13.0 / JDK 21 / compileSdk 36），**BUILD SUCCESSFUL**，并对产物 APK 逐一核对：

| 核对项 | 默认参数构建 | 自定义参数构建（APP_NAME=测试 应用 等） |
|--------|-------------|------------------------------------------|
| 包名 / versionCode / versionName | `com.systasker.app` / 1 / 1.0 | `cn.demo.shellapp` / 42 / 2.3.1 |
| 应用名 | `SysTasker` | `测试 应用`（中文正常） |
| 启动 Activity | `com.systasker.app.MainActivity` | `cn.demo.shellapp.MainActivity`（Java 包目录已迁移） |
| 默认地址 `default_url` | `https://m.task.wloren.cn` | `https://demo.example.com` |
| 图标 | mipmap 5 档 + 自适应前景 5 档 + 圆形裁切 | 同左，背景色 `#1A73E8` 生效 |
| 启动图 | 竖屏/横屏 × 5 档 + 兜底，共 11 张 | 同左 |
| 签名 | debug 证书（apksigner verify 通过） | 同左 |

自定义参数构建实测截图见交付的 `图标与启动图预览.png`。
