# CAMERAFORM — ระบบส่งคำคู่ความรูปแบบใหม่

แอปมือถือ React Native ชื่อ **CAMERAFORM** สำหรับเจ้าหน้าที่ส่งคำคู่ความ ประกอบด้วย 2 หน้าหลัก:

1. **หน้าถ่ายภาพ** — ถ่ายภาพพร้อมฝังพิกัด GPS + ข้อมูลฟอร์มใน EXIF (เข้ารหัส AES-256 เฉพาะฟิลด์ที่เลือก)
2. **หน้าแผนที่** — แสดงจุดหมายที่ต้องไปส่ง บนแผนที่ **OpenStreetMap + Leaflet** (ผ่าน WebView — ไม่ต้องใช้ API key) และส่งต่อไปนำทางด้วย Google Maps / Apple Maps ผ่าน `geo:` URI

## คุณสมบัติหลัก

- **Dynamic Form Builder** แบบ Google Form — เพิ่ม/แก้ฟิลด์ได้เอง
- **Selective Encryption** — เลือกเข้ารหัสเฉพาะฟิลด์ที่ sensitive (PDPA-friendly)
- **Autocomplete จาก SQLite** — รองรับข้อมูลนับหมื่นรายการจาก CSV
- **EXIF Metadata** — ฝัง GPS + JSON ฟอร์ม (public + ciphertext) ในภาพ
- **Keychain/Keystore** — เก็บ AES master key ในชั้นฮาร์ดแวร์
- **Viewer** — เปิดอ่านภาพต้องใส่ passphrase ก่อน

## โครงสร้างโฟลเดอร์

```
cameraform/
├── App.tsx                          # Root: init DB + Key + Navigation
├── index.js                         # Entry
├── src/
│   ├── components/
│   │   ├── FormBuilder.tsx          # UI สร้างฟอร์ม
│   │   └── DynamicFormRenderer.tsx  # Render ฟอร์มจาก schema
│   ├── config/
│   │   └── defaultForm.ts           # ฟอร์มตัวอย่างเริ่มต้น
│   ├── database/
│   │   ├── db.ts                    # เปิด SQLite + migration
│   │   ├── formConfigs.ts           # CRUD FormConfigs
│   │   ├── masterData.ts            # CRUD MasterData (autocomplete)
│   │   └── jobHistory.ts            # CRUD Jobs / JobPhotos
│   ├── hooks/
│   │   ├── useLocation.ts
│   │   └── useCameraPermission.ts
│   ├── navigation/
│   │   └── AppNavigator.tsx         # Bottom tabs
│   ├── screens/
│   │   ├── CameraScreen.tsx         # หน้าหลัก #1
│   │   ├── MapScreen.tsx            # หน้าหลัก #2 (WebView + Leaflet)
│   │   ├── mapHtml.ts               # Leaflet HTML template ที่ inject เข้า WebView
│   │   ├── FormBuilderScreen.tsx
│   │   └── ViewerScreen.tsx
│   ├── security/
│   │   ├── keyManager.ts            # Keychain/Keystore
│   │   ├── encryption.ts            # AES-256-CBC + processFormData
│   │   └── exif.ts                  # ฝัง/อ่าน EXIF UserComment + GPS
│   ├── services/
│   │   ├── csvImport.ts             # Import CSV → MasterData
│   │   └── targetRepo.ts            # รายการเป้าหมายที่ต้องส่ง
│   ├── types/
│   │   ├── form.ts
│   │   └── job.ts
│   └── utils/
│       ├── id.ts                    # uuid
│       └── datetime.ts              # Thai-friendly date
├── android/AndroidManifest.snippet.xml
├── ios/Info.plist.snippet.xml
├── babel.config.js
├── metro.config.js
├── tsconfig.json
├── package.json
└── .env.example
```

## การติดตั้ง (Bootstrap ให้เป็น native project)

ต้อง bootstrap native project เอง (scaffold นี้ยังไม่มีโฟลเดอร์ `android/` กับ `ios/` ครบ) โดย:

```bash
# 1. สร้าง RN CLI project ตัวจริงชั่วคราว แล้ว copy โฟลเดอร์ native มา
npx @react-native-community/cli@latest init CameraForm \
  --version 0.75.4 --skip-install --skip-git-init

cp -R CameraForm/android ./android
cp -R CameraForm/ios ./ios
rm -rf CameraForm

# 2. ติดตั้ง dependencies
npm install
cd ios && pod install && cd ..

# 3. เติม snippet ใน AndroidManifest.xml / Info.plist ตามไฟล์ .snippet
#    (ไม่ต้องมี Google Maps API key — แผนที่ใช้ OSM + Leaflet ผ่าน WebView)
```

> **Windows:** ดูขั้นตอนที่ง่ายกว่านี้ในไฟล์ [`SETUP.md`](./SETUP.md) — มี `scripts/bootstrap.bat` ช่วยทำทั้งหมดให้อัตโนมัติ

## การใช้งาน

```bash
npm run android       # รันบน Android
npm run ios           # รันบน iOS
npm run typecheck     # ตรวจ TypeScript
npm run lint
```

## แผนการพัฒนา (Roadmap)

**เฟส 1 — Form Builder** ✅ scaffold เสร็จ
- UI เพิ่ม/ลบ field พร้อม toggle encrypt
- Import CSV → SQLite
- Autocomplete จาก MasterData

**เฟส 2 — Camera & Map** ✅ scaffold เสร็จ
- vision-camera + GPS overlay real-time
- OpenStreetMap + Leaflet ผ่าน WebView (ไม่ใช้ API key)
- Navigation ผ่าน `geo:` URI intent (ส่งต่อ Google Maps / Apple Maps / อื่น ๆ ตามที่ user เลือก)

**เฟส 3 — Security & PDPA** ✅ scaffold เสร็จ
- AES-256 ผ่าน `react-native-aes-crypto`
- Master key ใน Keychain/Keystore
- Viewer ขอ passphrase

**เฟสต่อไป (ยังไม่ได้ทำ)**
- Directions API (route ตามถนนจริง)
- Sync JobHistory ขึ้น backend
- Unit tests + E2E
- Biometric unlock

## หมายเหตุด้านความปลอดภัย

- AES-256-CBC + IV สุ่มทุกครั้ง (ห้ามใช้ IV ซ้ำ)
- Master key สุ่มจาก `Aes.randomKey(32)` และเก็บใน Keychain/Keystore ที่ hardware-backed
- Ciphertext ถูกฝังใน EXIF `UserComment` → ถ้า user copy ภาพออกไป ก็ยังถอดไม่ได้โดยไม่มี key
- ถ้าต้องการ **เปลี่ยน key** ภายหลัง ต้องทำ re-encrypt ภาพทุกใบ (ยังไม่ implement)

## License

Internal use only.
