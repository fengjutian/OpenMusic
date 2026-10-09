import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/**
 * The ReactLynx bundle produced by `npm run build:android` is copied into
 * assets so the host never fetches JS from the network.
 */
val lynxBundle: File = rootProject.file("../dist/main.lynx.bundle")
val lynxTemplate: File = rootProject.file("../dist/template.json")

/**
 * Lynx Android SDK version is pinned to the last publicly published release.
 *
 * The previous declaration (`org.lynxsdk.lynx:lynx:4.1.0`) does not exist in
 * the public Maven repository (the latest documented release is 3.6.x at
 * https://lynxjs.org/3.8/zh/guide/start/integrate-with-existing-apps). Per
 * AGENTS.md ("不伪造未验证的 API") and execution handbook §15
 * ("拒绝伪完成"), we cannot ship code that depends on an unverified artefact.
 * Bumping to 4.x requires:
 *   1. an ADR documenting the upgrade,
 *   2. a Gradle / Maven build that pulls the artefact and reports the SHA-256,
 *   3. an Android build (APK) and a smoke test on emulator/device.
 * Until that chain runs, we use the verified 3.6.x line.
 */
val lynxSdkVersion = "3.6.0"

android {
    namespace = "com.openmusic.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.openmusic.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets {
        getByName("main") {
            assets.srcDirs("src/main/assets")
        }
    }

    packaging {
        // Required by the Lynx JNI layer.
        jniLibs.useLegacyPackaging = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.activity:activity-ktx:1.10.0")
    implementation("androidx.media:media:1.7.0")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    // Lynx runtime — pinned to the publicly documented 3.6 line (see note
    // above). The JNI-jsi artefact is the JS engine; lynx-trace gives us
    // runtime telemetry; primjs the server fallback.
    implementation("org.lynxsdk.lynx:lynx:$lynxSdkVersion")
    implementation("org.lynxsdk.lynx:lynx-jssdk:$lynxSdkVersion")
    implementation("org.lynxsdk.lynx:lynx-trace:$lynxSdkVersion")
    implementation("org.lynxsdk.lynx:primjs:3.6.1")
    implementation("org.lynxsdk.lynx:lynx-service-image:$lynxSdkVersion")
}

tasks.register<Copy>("syncLynxBundle") {
    description = "Copies the ReactLynx bundle into assets (run after `npm run build:android`)."
    from(lynxBundle)
    into(layout.projectDirectory.dir("src/main/assets"))
    onlyIf { lynxBundle.exists() }
}

tasks.named("preBuild") {
    dependsOn("syncLynxBundle")
}