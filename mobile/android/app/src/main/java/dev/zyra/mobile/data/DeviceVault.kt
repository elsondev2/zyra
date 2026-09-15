package dev.zyra.mobile.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class DeviceVault(context: Context) {
    private val prefs = context.getSharedPreferences("paired-devices", Context.MODE_PRIVATE)
    private val alias = "zyra-pairing-v1"
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    @Synchronized fun load(): List<Machine> {
        val encoded = prefs.getString("sealed", null) ?: return emptyList()
        val raw = Base64.decode(encoded, Base64.NO_WRAP)
        require(raw.size > 12) { "Device storage is damaged." }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, raw.copyOfRange(0, 12)))
        val array = JSONArray(String(cipher.doFinal(raw.copyOfRange(12, raw.size)), Charsets.UTF_8))
        return (0 until array.length()).map { Machine.parse(array.getJSONObject(it)) }
    }
    @Synchronized fun save(machines: List<Machine>) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val array = JSONArray().apply { machines.forEach { put(it.json()) } }
        val ciphertext = cipher.iv + cipher.doFinal(array.toString().toByteArray(Charsets.UTF_8))
        check(prefs.edit().putString("sealed", Base64.encodeToString(ciphertext, Base64.NO_WRAP)).commit()) { "Could not save paired devices." }
    }
}
