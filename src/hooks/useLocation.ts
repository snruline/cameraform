import {useEffect, useRef, useState} from 'react';
// ใช้ @react-native-community/geolocation (ใช้ Android LocationManager ตรง ๆ)
// แทน react-native-geolocation-service ที่พึ่ง Google Play Services' FusedLocationProvider
// (FusedLocation มีปัญหา "Could not invoke RNFusedLocation.startObserving null"
//  บนบางเครื่อง/สภาพแวดล้อมที่ GPS ยังไม่พร้อม หรือ Play Services version mismatch)
import Geolocation from '@react-native-community/geolocation';
import {Platform, PermissionsAndroid} from 'react-native';
import {GeoLocation} from '../types';

/**
 * Hook ขอ location แบบ realtime (watchPosition)
 * จัดการ permission ของ Android ให้อัตโนมัติ
 * ถ้าพลาด — ไม่ crash JS, แค่ set error
 */
export function useLocation(enabled: boolean = true) {
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;

    const start = async () => {
      try {
        if (Platform.OS === 'android') {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Location permission',
              message:
                'This app uses your location to embed GPS into captured photos.',
              buttonPositive: 'Allow',
              buttonNegative: 'Deny',
            },
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            if (active) setError('Location permission denied');
            return;
          }
        } else {
          // iOS — community/geolocation ใช้ Info.plist + requestAuthorization
          try {
            Geolocation.requestAuthorization();
          } catch {
            /* ignore — จะ fail ตอน watchPosition แทน */
          }
        }

        // ห่อ watchPosition ด้วย try/catch เพราะถ้า native module throw synchronously
        // (เช่น module ไม่ถูก link, หรือ GPS hardware fail) จะไม่ crash JS
        try {
          watchId.current = Geolocation.watchPosition(
            pos => {
              if (!active) return;
              setLocation({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                altitude: pos.coords.altitude ?? undefined,
                heading: pos.coords.heading ?? undefined,
                speed: pos.coords.speed ?? undefined,
                timestamp: pos.timestamp,
              });
              setError(null);
            },
            err => {
              if (active) setError(err.message || 'Could not read location');
            },
            {
              enableHighAccuracy: true,
              distanceFilter: 2,
              interval: 2000,
              fastestInterval: 1000,
            },
          );
        } catch (watchErr: any) {
          if (active) {
            setError(
              watchErr?.message ??
                'Could not start location updates (is GPS on?)',
            );
          }
        }
      } catch (e: any) {
        if (active) setError(e?.message ?? 'Permission request failed');
      }
    };

    start();
    return () => {
      active = false;
      if (watchId.current !== null) {
        try {
          Geolocation.clearWatch(watchId.current);
        } catch {
          /* ignore */
        }
        watchId.current = null;
      }
    };
  }, [enabled]);

  return {location, error};
}
