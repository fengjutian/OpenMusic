# Android 宿主（OpenMusic）

> **验证状态：未编译。** 本仓库的开发机没有 Android SDK / Gradle，
> 因此 `android/` 下的所有 Kotlin 代码**没有经过一次 Gradle 构建**。
> 详见 [`../docs/platform-capability-matrix.md`](../docs/platform-capability-matrix.md)。

## 这个目录负责什么

它是 `src/domain/ports.ts` 里原生能力的**实现侧**，不包含任何业务规则。
业务规则全部在 TypeScript 侧，两个平台共享。

| 端口（TS） | Android 实现 | 状态 |
|---|---|---|
| `PlatformBridgePort.safeAreaInsets` | `OpenMusicBridge.updateInsets` | 未编译 |
| `PlatformBridgePort.onMediaButton` | `PlaybackService`（Media3 `MediaSessionService`） | 未编译 |
| `PlatformBridgePort.onAudioFocusChange` | ExoPlayer `handleAudioFocus = true` + `setHandleAudioBecomingNoisy` | 未编译 |
| `MediaScannerPort` | `MediaStoreScanner` | 未编译 + 未真机验证 |
| `MetadataReaderPort` | `MetadataReaderImpl` | 未编译 + 未真机验证 |
| `SqlDriver`（迁移器） | `SqliteDriver` | 未编译 |
| `SecureStoragePort` | `KeystoreSecretStore` | 未编译 |
| `AudioEnginePort` | 尚未实现（当前由 `FakeAudioEngine` 驱动） | 未实现 |

## 本地构建步骤

前置：JDK 17、Android SDK 35、Gradle 8.9+。

```powershell
# 1. 先产出 JS bundle（宿主会把它拷进 assets）
cd ..
npm install
npm run build:android          # OPENMUSIC_PLATFORM=android

# 2. 再编译原生壳
cd android
$env:ANDROID_HOME = "<你的 SDK 路径>"
.\gradlew.bat :app:assembleDebug
.\gradlew.bat :app:installDebug
```

## 上线前必须完成的验证

以下每一项都会改变产品承诺，因此**没有实测结论前不得写入界面文案**：

1. **Lynx 运行时版本对齐** — `org.lynxsdk.lynx:lynx` 必须与 `@lynx-js/react` 的引擎版本匹配，
   否则 JS 与原生属性/事件会对不上。核对方式见官方 release notes。
2. **安全区** — 刘海屏、手势导航、小白条在 minSdk 26 与 targetSdk 35 上的实际 inset。
3. **音频格式** — `MediaStoreScanner.isSupported()` 里的 MIME 白名单必须与 ExoPlayer
   在目标机型上实测可解码的格式一致，不一致就删，不要留“理论上支持”。
4. **后台播放** — 息屏、切应用、进程被回收后能否恢复当前曲目与进度。
5. **音频焦点** — 来电、其他应用抢占、拔耳机。
6. **MediaStore 权限** — API 26–32 与 33+ 行为不同，需要在最低版和当前主流版各测一次。

## 明确不做的事

- **不写回音频标签。** 首期元数据编辑只写 OpenMusic 数据库，原文件默认只读
  （产品需求 §16.3 / §20）。
- **不删除源文件。** “从资料库移除”只删索引。
- **不扫描未授权目录。** 权限在触发对应功能时才申请（§20 权限最小化）。