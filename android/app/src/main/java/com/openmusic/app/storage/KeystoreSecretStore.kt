package com.openmusic.app.storage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Keystore-backed `SecureStoragePort`.
 *
 * Product spec §20: "密钥和令牌使用平台安全存储，不写入日志、源码或普通配置文件".
 * Values are AES-GCM encrypted with a key that never leaves the hardware-backed
 * Keystore.
 *
 * UNVERIFIED: no device test has been run. `setUserAuthenticationRequired` is
 * deliberately NOT enabled — background playback must not be blocked on an
 * unlock prompt. Revisit if the product later requires at-rest re-auth.
 */
class KeystoreSecretStore(context: Context) {

    private val prefs = context.getSharedPreferences("openmusic.secure", Context.MODE_PRIVATE)

    fun put(key: String, value: String) {
        val cipher = encryptCipher()
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        prefs.edit()
            .putString("$key.iv", cipher.iv.toHex())
            .putString("$key.data", encrypted.toHex())
            .apply()
    }

    fun get(key: String): String? {
        val iv = prefs.getString("$key.iv", null)?.fromHex() ?: return null
        val data = prefs.getString("$key.data", null)?.fromHex() ?: return null
        return runCatching {
            val cipher = decryptCipher()
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(data), Charsets.UTF_8)
        }.getOrNull()
    }

    fun remove(key: String) {
        prefs.edit().remove("$key.iv").remove("$key.data").apply()
    }

    private fun encryptCipher(): Cipher =
        Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, secretKey()) }

    private fun decryptCipher(): Cipher = Cipher.getInstance(TRANSFORMATION)

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE).apply {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build(),
            )
        }.generateKey()
    }

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

    private fun String.fromHex(): ByteArray =
        chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    companion object {
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "openmusic.master"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}