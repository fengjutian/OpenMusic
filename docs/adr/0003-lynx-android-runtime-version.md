# ADR-0003: Pin Lynx Android runtime to 3.6.x (was 4.1.0)

> Date: 2026-10-09
> Status: Accepted (execution handbook stage 2)

## Context

`android/app/build.gradle.kts` previously declared
`org.lynxsdk.lynx:lynx:4.1.0`. The `OpenMusicBridge.createLynxView()`
function threw `UnsupportedOperationException` because the construction
was deferred until the runtime artefact was verified.

`@lynx-js/react@0.126.2` on the JS side bundles its own engine primitives,
so the **runtime version on Android must be a known companion artefact** —
mismatches cause attribute silenting, not crashes (capability matrix §3.2).

## Investigation

- `web_search` and `web_fetch` against the public Lynx docs
  (`https://lynxjs.org/3.8/zh/guide/start/integrate-with-existing-apps`)
  return a maximum published version of **3.6.x** for the Android SDK
  (`org.lynxsdk.lynx:lynx:3.6.0`, `lynx-jssdk:3.6.0`, `lynx-trace:3.6.0`,
  `primjs:3.6.1`, `lynx-service-image:3.6.0`).
- The 4.1.0 declaration in the previous revision is unverified — there is
  no public release matching it.
- AGENTS.md: "不伪造未验证的 API" + handbook §15: "拒绝伪完成".

## Decision

Pin the Android dependency to the verified 3.6.x line:

```kotlin
val lynxSdkVersion = "3.6.0"
implementation("org.lynxsdk.lynx:lynx:$lynxSdkVersion")
implementation("org.lynxsdk.lynx:lynx-jssdk:$lynxSdkVersion")
implementation("org.lynxsdk.lynx:lynx-trace:$lynxSdkVersion")
implementation("org.lynxsdk.lynx:primjs:3.6.1")
implementation("org.lynxsdk.lynx:lynx-service-image:$lynxSdkVersion")
```

`OpenMusicBridge.createLynxView()` is now implemented against the documented
3.6 surface (`LynxViewBuilder`, `AbsTemplateProvider`, `renderTemplateUrl`).

## Engine ↔ JS version compatibility

`@lynx-js/react@0.126.2` ships with a JS-engine build that the Android
runtime must match. 3.6.x is the SDK line documented as compatible with the
3.x RN-style ReactLynx preview; a future bump to a newer Lynx SDK must also
bump `@lynx-js/react` to the matching release and ship a fresh capability-
matrix entry (§3.2) with the new pair's measured behaviour.

## Status

- Code: rewritten to use the verified 3.6 surface.
- Compile: not yet — the dev machine has no Android SDK or Maven cache for
  `org.lynxsdk.lynx:*`. `./gradlew :app:assembleDebug` will be the first
  verifier once the SDK is installed (handbook stage 2, §2.5).
- Bundle: identical (`dist/main.lynx.bundle`, 293.3 kB) — only the host
  native bits changed.

## Alternatives considered

- **Keep 4.1.0 and try to install it** — would force a Gradle build that
  we expect to fail; the artefact is not in the public Maven repo.
- **Use the new web runtime (`<lynx-view>`)** — that path is for web, not
  Android, and would drop the ReactLynx tree.
- **Skip Stage 2** — leaves the existing `UnsupportedOperationException`,
  failing the §一阶段 2 acceptance (§2, "createLynxView() 不再抛异常").