#import <React/RCTBridgeModule.h>

/**
 * ExifReader — native iOS module ที่อ่าน EXIF GPS จาก image file
 * ใช้ ImageIO framework (CGImageSource + kCGImagePropertyGPSDictionary)
 *
 * พฤติกรรมเดียวกับฝั่ง Android (ExifReaderModule.kt) — return
 * {latitude, longitude, dateTimeOriginal?} หรือ null ถ้าไม่มี GPS
 */
@interface ExifReader : NSObject <RCTBridgeModule>
@end
