/**
 * Leaflet HTML template สำหรับใช้ใน WebView
 * - โหลด Leaflet จาก CDN (unpkg)
 * - ใช้ OpenStreetMap tiles (ฟรี ไม่ต้อง API key)
 * - เปิดช่องทางสื่อสารสองทางกับ React Native ผ่าน window.ReactNativeWebView.postMessage
 *
 * Protocol messages (RN -> WebView via injectJavaScript):
 *   setCenter({lat, lng, zoom})            — เลื่อนแผนที่
 *   setUserLocation({lat, lng, accuracy})  — จุดสีฟ้าแสดงตำแหน่ง user
 *   setMarkers([{id, lat, lng, title, description}])  — set หมุดทั้งหมด
 *   drawPath([{lat,lng}, ...])             — วาด polyline
 *   clearPath()
 *
 * Protocol messages (WebView -> RN via postMessage):
 *   {type: 'ready'}
 *   {type: 'markerClick', id}
 *   {type: 'mapClick', lat, lng}
 */
export const LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>CAMERAFORM Map</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
    body { font-family: -apple-system, system-ui, sans-serif; }
    .user-dot {
      width: 16px; height: 16px; border-radius: 50%;
      background: #1976d2; border: 3px solid #fff;
      box-shadow: 0 0 0 2px rgba(25,118,210,0.4);
    }
    .user-dot-icon { background: transparent; border: none; }
    .leaflet-popup-content { margin: 10px 12px; font-size: 13px; }
    .popup-title { font-weight: 700; font-size: 14px; margin-bottom: 4px; }
    .popup-sub { color: #555; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
  <script>
    (function() {
      var rn = window.ReactNativeWebView;
      function send(obj) { if (rn) rn.postMessage(JSON.stringify(obj)); }

      // Bangkok default center
      var map = L.map('map', { zoomControl: true }).setView([13.7563, 100.5018], 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(map);

      map.on('click', function(e) {
        send({type: 'mapClick', lat: e.latlng.lat, lng: e.latlng.lng});
      });

      var userMarker = null;
      var accuracyCircle = null;
      var markers = {};
      var pathLine = null;

      function setUserLocation(lat, lng, accuracy) {
        if (!userMarker) {
          var icon = L.divIcon({className: 'user-dot-icon', html: '<div class="user-dot"></div>', iconSize: [16,16]});
          userMarker = L.marker([lat, lng], {icon: icon, zIndexOffset: 1000}).addTo(map);
        } else {
          userMarker.setLatLng([lat, lng]);
        }
        if (accuracy) {
          if (!accuracyCircle) {
            accuracyCircle = L.circle([lat, lng], {
              radius: accuracy, color: '#1976d2', weight: 1, fillOpacity: 0.1
            }).addTo(map);
          } else {
            accuracyCircle.setLatLng([lat, lng]);
            accuracyCircle.setRadius(accuracy);
          }
        }
      }

      function setMarkers(list) {
        // ลบของเก่า
        Object.keys(markers).forEach(function(k) { map.removeLayer(markers[k]); });
        markers = {};
        list.forEach(function(m) {
          var marker = L.marker([m.lat, m.lng]).addTo(map);
          var html = '<div class="popup-title">' + escapeHtml(m.title || '') + '</div>' +
                     '<div class="popup-sub">' + escapeHtml(m.description || '') + '</div>';
          marker.bindPopup(html);
          marker.on('click', function() { send({type: 'markerClick', id: m.id}); });
          markers[m.id] = marker;
        });
      }

      function setCenter(lat, lng, zoom) {
        map.setView([lat, lng], zoom || map.getZoom());
      }

      function drawPath(points) {
        if (pathLine) map.removeLayer(pathLine);
        pathLine = L.polyline(points.map(function(p){return [p.lat, p.lng];}), {
          color: '#1976d2', weight: 4, opacity: 0.8
        }).addTo(map);
      }

      function clearPath() {
        if (pathLine) { map.removeLayer(pathLine); pathLine = null; }
      }

      function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function(c) {
          return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
        });
      }

      // expose ให้ React Native เรียกผ่าน injectJavaScript
      window.CF = {
        setUserLocation: setUserLocation,
        setMarkers: setMarkers,
        setCenter: setCenter,
        drawPath: drawPath,
        clearPath: clearPath
      };

      send({type: 'ready'});
    })();
  </script>
</body>
</html>`;
