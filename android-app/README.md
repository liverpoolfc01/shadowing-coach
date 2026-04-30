# Shadowing Coach Android

这是一个 Android WebView 壳应用，启动后加载线上练习页：

`https://liverpoolfc01.github.io/shadowing-coach/`

## 打包方式

1. 用 Android Studio 打开 `android-app` 文件夹。
2. 等 Gradle Sync 完成。
3. 连接安卓手机，点 Run 直接安装测试。
4. 要生成安装包：`Build > Generate Signed Bundle / APK`。

## 权限

应用已声明：

- `INTERNET`：加载 GitHub Pages 网页和音频。
- `RECORD_AUDIO`：支持跟读录音、语音识别和声音回放。

第一次点“开始跟读”时，安卓会弹麦克风权限，需要允许。

## 修改网址

如果网页地址以后变了，改这里：

`app/src/main/java/com/liverpoolfc01/shadowingcoach/MainActivity.java`

里面的 `APP_URL`。
