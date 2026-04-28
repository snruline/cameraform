package com.cameraform.exif

import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.io.File
import java.io.FileInputStream
import java.io.InputStream

/**
 * ExifReader — native Android module ที่อ่าน EXIF GPS ผ่าน
 * androidx.exifinterface.ExifInterface ตรง ๆ
 *
 * ทำไมต้องเขียน native: piexifjs (JS lib) อ่านได้แค่จาก base64 ของไฟล์
 * แต่ภาพจาก content:// URI / Photo Picker ของ Android 13+ EXIF GPS โดน
 * strip ตอน copy → JS อ่านไม่เห็น GPS เลย
 *
 * ExifInterface ใช้ ContentResolver.openInputStream() อ่าน byte stream ตรง
 * จาก URI ก่อนที่ระบบจะ strip — ทำให้ได้ GPS ครบ
 */
class ExifReaderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "ExifReader"

    /**
     * อ่าน GPS + DateTimeOriginal จากไฟล์ภาพ
     *
     * @param uriString URI ของภาพ — รองรับ content://, file://, หรือ absolute path
     * @return WritableMap with {latitude, longitude, dateTimeOriginal?} หรือ null ถ้าไม่มี GPS
     */
    @ReactMethod
    fun readGps(uriString: String, promise: Promise) {
        var inputStream: InputStream? = null
        try {
            // เปิด InputStream — รองรับ 3 รูปแบบ URI
            //   content:// → ใช้ ContentResolver.openInputStream()
            //   file:// → strip prefix แล้วเปิดเป็น File ตรง ๆ
            //   absolute path (e.g. /storage/...) → เปิดเป็น File
            inputStream =
                when {
                    uriString.startsWith("content://") -> {
                        val uri = Uri.parse(uriString)
                        reactApplicationContext.contentResolver.openInputStream(uri)
                    }
                    uriString.startsWith("file://") -> {
                        FileInputStream(File(uriString.removePrefix("file://")))
                    }
                    else -> {
                        FileInputStream(File(uriString))
                    }
                }

            if (inputStream == null) {
                promise.resolve(null)
                return
            }

            val exif = ExifInterface(inputStream)

            // getLatLong() คืน DoubleArray(2) ของ [lat, lng] ที่จัด ref (N/S, E/W)
            // เป็น signed value ให้แล้ว — return null ถ้าไม่มี GPS หรือ malformed
            val latLng = exif.latLong
            if (latLng == null || latLng.size < 2) {
                promise.resolve(null)
                return
            }

            val latitude = latLng[0]
            val longitude = latLng[1]

            // Validate range + ตัด Null Island (0,0) ที่บางภาพเก็บแบบ default ก่อน
            // มีตำแหน่งจริง
            if (!latitude.isFinite() || !longitude.isFinite()) {
                promise.resolve(null)
                return
            }
            if (Math.abs(latitude) > 90.0 || Math.abs(longitude) > 180.0) {
                promise.resolve(null)
                return
            }
            if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) {
                promise.resolve(null)
                return
            }

            val result: WritableMap = Arguments.createMap()
            result.putDouble("latitude", latitude)
            result.putDouble("longitude", longitude)

            // DateTimeOriginal: "YYYY:MM:DD HH:MM:SS" — ส่งกลับเป็น raw string
            // ให้ JS แปลงเป็น ISO เอง (เพื่อให้ logic เดียวกับ piexif fallback)
            val dto = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)
            if (dto != null) {
                result.putString("dateTimeOriginal", dto)
            }

            promise.resolve(result)
        } catch (e: Throwable) {
            // ไม่ reject — ให้ JS ทำต่อกับภาพอื่นได้
            // คืน null = "อ่าน GPS ไม่ได้" (จะ skip รูปนี้)
            promise.resolve(null)
        } finally {
            try {
                inputStream?.close()
            } catch (_: Throwable) {}
        }
    }
}
