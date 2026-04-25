import {useEffect, useState} from 'react';
import {Camera, CameraPermissionStatus} from 'react-native-vision-camera';

export function useCameraPermission() {
  const [status, setStatus] = useState<CameraPermissionStatus>('not-determined');

  useEffect(() => {
    let alive = true;
    (async () => {
      const current = await Camera.getCameraPermissionStatus();
      if (current === 'granted') {
        if (alive) setStatus('granted');
        return;
      }
      const next = await Camera.requestCameraPermission();
      if (alive) setStatus(next);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return status;
}
