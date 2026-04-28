#import "ExifReader.h"
#import <ImageIO/ImageIO.h>
#import <Photos/Photos.h>

@implementation ExifReader

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

/**
 * อ่าน GPS + DateTimeOriginal จากไฟล์ภาพ
 *
 * รองรับ URI:
 *   - file:// (absolute path)
 *   - /absolute/path (no scheme)
 *   - assets-library:// / ph:// (Photos framework — แปลงผ่าน PHAsset)
 */
RCT_EXPORT_METHOD(readGps:(NSString *)uriString
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (uriString == nil || uriString.length == 0) {
    resolve([NSNull null]);
    return;
  }

  // Strip file:// prefix ถ้ามี — CGImageSource ใช้ได้ทั้ง URL และ path
  // แต่ถ้าเป็น ph:// (Photos framework URI) ต้องดึง asset ผ่าน PHAsset ก่อน
  NSURL *imageURL = nil;

  if ([uriString hasPrefix:@"ph://"]) {
    // Photos URI: ดึง localIdentifier จาก ph://<identifier>
    NSString *localId = [uriString substringFromIndex:5];
    PHFetchResult *assets =
        [PHAsset fetchAssetsWithLocalIdentifiers:@[localId] options:nil];
    PHAsset *asset = assets.firstObject;
    if (asset == nil) {
      resolve([NSNull null]);
      return;
    }
    // ถ้าได้ PHAsset เลย — ใช้ asset.location เร็วกว่าอ่าน EXIF
    if (asset.location != nil) {
      double lat = asset.location.coordinate.latitude;
      double lng = asset.location.coordinate.longitude;
      if ([self isValidCoordinate:lat lng:lng]) {
        NSMutableDictionary *result = [NSMutableDictionary dictionary];
        result[@"latitude"] = @(lat);
        result[@"longitude"] = @(lng);
        if (asset.creationDate != nil) {
          NSDateFormatter *df = [[NSDateFormatter alloc] init];
          df.dateFormat = @"yyyy:MM:dd HH:mm:ss";
          result[@"dateTimeOriginal"] = [df stringFromDate:asset.creationDate];
        }
        resolve(result);
        return;
      }
    }
    // ถ้า asset.location ไม่มี — ลองอ่าน EXIF จาก image data
    PHImageRequestOptions *opts = [[PHImageRequestOptions alloc] init];
    opts.synchronous = YES;
    opts.networkAccessAllowed = NO;
    __block NSDictionary *result = nil;
    [[PHImageManager defaultManager]
        requestImageDataAndOrientationForAsset:asset
                                       options:opts
                                 resultHandler:^(NSData *_Nullable imageData,
                                                 NSString *_Nullable dataUTI,
                                                 CGImagePropertyOrientation orientation,
                                                 NSDictionary *_Nullable info) {
          if (imageData != nil) {
            result = [self extractGpsFromImageData:imageData];
          }
        }];
    resolve(result ?: [NSNull null]);
    return;
  } else if ([uriString hasPrefix:@"file://"]) {
    imageURL = [NSURL URLWithString:uriString];
  } else if ([uriString hasPrefix:@"/"]) {
    imageURL = [NSURL fileURLWithPath:uriString];
  } else {
    // ลองตีความเป็น URL ทั่วไป
    imageURL = [NSURL URLWithString:uriString];
    if (imageURL == nil) {
      imageURL = [NSURL fileURLWithPath:uriString];
    }
  }

  if (imageURL == nil) {
    resolve([NSNull null]);
    return;
  }

  NSDictionary *result = [self extractGpsFromURL:imageURL];
  resolve(result ?: [NSNull null]);
}

#pragma mark - Helpers

- (BOOL)isValidCoordinate:(double)lat lng:(double)lng {
  if (!isfinite(lat) || !isfinite(lng)) return NO;
  if (fabs(lat) > 90.0 || fabs(lng) > 180.0) return NO;
  // Reject Null Island (0,0) — ภาพไม่มี GPS จริงมักเก็บแบบนี้
  if (fabs(lat) < 0.0001 && fabs(lng) < 0.0001) return NO;
  return YES;
}

- (NSDictionary *)extractGpsFromMetadata:(NSDictionary *)metadata {
  if (metadata == nil) return nil;

  NSDictionary *gps = metadata[(NSString *)kCGImagePropertyGPSDictionary];
  if (gps == nil) return nil;

  NSNumber *latObj = gps[(NSString *)kCGImagePropertyGPSLatitude];
  NSNumber *lngObj = gps[(NSString *)kCGImagePropertyGPSLongitude];
  if (latObj == nil || lngObj == nil) return nil;

  double lat = latObj.doubleValue;
  double lng = lngObj.doubleValue;

  // Apply hemisphere refs (S = negative lat, W = negative lng)
  NSString *latRef = gps[(NSString *)kCGImagePropertyGPSLatitudeRef];
  NSString *lngRef = gps[(NSString *)kCGImagePropertyGPSLongitudeRef];
  if ([latRef isEqualToString:@"S"]) lat = -lat;
  if ([lngRef isEqualToString:@"W"]) lng = -lng;

  if (![self isValidCoordinate:lat lng:lng]) return nil;

  NSMutableDictionary *result = [NSMutableDictionary dictionary];
  result[@"latitude"] = @(lat);
  result[@"longitude"] = @(lng);

  // DateTimeOriginal จาก EXIF dictionary
  NSDictionary *exif = metadata[(NSString *)kCGImagePropertyExifDictionary];
  NSString *dto = exif[(NSString *)kCGImagePropertyExifDateTimeOriginal];
  if (dto != nil) {
    result[@"dateTimeOriginal"] = dto;
  }

  return result;
}

- (NSDictionary *)extractGpsFromURL:(NSURL *)imageURL {
  CGImageSourceRef source = CGImageSourceCreateWithURL((CFURLRef)imageURL, NULL);
  if (source == NULL) return nil;
  NSDictionary *metadata =
      (__bridge_transfer NSDictionary *)CGImageSourceCopyPropertiesAtIndex(source, 0, NULL);
  CFRelease(source);
  return [self extractGpsFromMetadata:metadata];
}

- (NSDictionary *)extractGpsFromImageData:(NSData *)data {
  CGImageSourceRef source = CGImageSourceCreateWithData((CFDataRef)data, NULL);
  if (source == NULL) return nil;
  NSDictionary *metadata =
      (__bridge_transfer NSDictionary *)CGImageSourceCopyPropertiesAtIndex(source, 0, NULL);
  CFRelease(source);
  return [self extractGpsFromMetadata:metadata];
}

@end
