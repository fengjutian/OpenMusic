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

    // Lynx runtime. Version must match `@lynx-js/react` on the JS side —
    // see docs/platform-capability-matrix.md.
    implementation("org.lynxsdk.lynx:lynx:4.1.0")
    implementation("org.lynxsdk.lynx:lynx-jsi:4.1.0")
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