pluginManagement {
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Lynx Android artifacts.
        maven { url = uri("https://nexus.tiktok.com/repository/maven-public/") }
    }
}

rootProject.name = "OpenMusic"
include(":app")