# CAMERAFORM — คู่มือทดสอบบนเครื่องจริง (Windows + Android)

คู่มือนี้พาตั้งแต่เครื่องเปล่าจนเห็นแอปรันบนมือถือ Android ของคุณ

> **ใช้ได้ทั้ง PowerShell และ Command Prompt (cmd)** — คำสั่งส่วนใหญ่เหมือนกัน ยกเว้นการตั้ง Environment Variables ซึ่งมี 2 แบบในขั้นตอนที่ 1

---

## สิ่งที่ต้องมีก่อนเริ่ม

คุณมีแล้ว:
- Node.js 18+
- Android Studio + Android SDK

ยังต้องทำ:
- เปิด USB Debugging บนมือถือ
- เชื่อมโทรศัพท์ผ่านสาย USB

> **หมายเหตุเรื่องแผนที่:** แอปนี้ใช้ **OpenStreetMap + Leaflet** แสดงผ่าน WebView — **ไม่ต้องขอ API key** และ **ไม่ต้องเปิดบัญชี Google Cloud / Billing** ใด ๆ ทั้งสิ้น

---

## ขั้นตอนที่ 1 — ตั้ง Environment Variables

### ตัวเลือก A — ผ่าน Command Prompt (cmd)

เปิด cmd **Run as Administrator** แล้วรัน (แก้ path ถ้า Android SDK ของคุณอยู่ที่อื่น):

```cmd
setx ANDROID_HOME "%LOCALAPPDATA%\Android\Sdk"
setx PATH "%PATH%;%LOCALAPPDATA%\Android\Sdk\platform-tools"
```

### ตัวเลือก B — ผ่าน PowerShell

```powershell
[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
$path = [System.Environment]::GetEnvironmentVariable('Path','User')
[System.Environment]::SetEnvironmentVariable('Path', "$path;$env:LOCALAPPDATA\Android\Sdk\platform-tools", 'User')
```

### ตัวเลือก C — ผ่าน GUI (ง่ายที่สุดถ้าไม่ชอบพิมพ์)

1. กด Win → พิมพ์ "environment variables" → เปิด "Edit the system environment variables"
2. คลิก **Environment Variables...**
3. ใน **User variables** → คลิก **New...**
   - Variable name: `ANDROID_HOME`
   - Variable value: `C:\Users\YOU\AppData\Local\Android\Sdk`
4. Double-click ที่ `Path` → **New** → ใส่ `%LOCALAPPDATA%\Android\Sdk\platform-tools`
5. OK ทุกอัน

---

**ปิด terminal แล้วเปิดใหม่** เพื่อให้ค่าใหม่มีผล จากนั้นตรวจสอบ:

```cmd
adb --version
```

ต้องได้ output ประมาณ `Android Debug Bridge version 1.0.41`

ถ้ายังใช้ `adb` ไม่ได้ แปลว่า path ยังไม่ถูก — เปิด Android Studio → **More Actions → SDK Manager** → ดู path ของ **Android SDK Location** แล้วเอา path นั้นแทน

---

## ขั้นตอนที่ 2 — เปิด USB Debugging บนมือถือ

1. ไปที่ **ตั้งค่า → เกี่ยวกับโทรศัพท์**
2. กด **หมายเลขบิลด์ (Build number)** 7 ครั้ง จนขึ้นว่า "คุณเป็นนักพัฒนาแล้ว"
3. กลับไปที่ **ตั้งค่า → ระบบ → ตัวเลือกสำหรับนักพัฒนา**
4. เปิด **USB debugging**
5. ต่อสาย USB → บนมือถือจะมี popup ถามสิทธิ์ → กด **Allow**

ทดสอบการเชื่อมต่อ (ใช้ได้ทั้ง cmd และ PowerShell):

```cmd
adb devices
```

ต้องเห็นเครื่องของคุณ เช่น:

```
List of devices attached
R58M12ABCDE     device
```

ถ้าขึ้น `unauthorized` → กด Allow บนมือถืออีกครั้ง
ถ้าไม่ขึ้นอะไรเลย → ลองเปลี่ยนสาย USB / เปลี่ยนพอร์ต / ติดตั้ง OEM USB driver ของยี่ห้อมือถือคุณ

---

## ขั้นตอนที่ 3 — รัน Bootstrap Script

Bootstrap สคริปต์จะ:
- สร้างโฟลเดอร์ `android/` และ `ios/` จาก React Native template
- ติดตั้ง npm dependencies ทั้งหมด
- Patch `AndroidManifest.xml` เพิ่ม permissions ที่จำเป็น
- Patch `build.gradle` ให้รองรับ `vision-camera`

### ผ่าน Command Prompt (cmd) — แนะนำ

เปิด cmd ที่โฟลเดอร์ `D:\APP\CAMERAFORM` แล้วรัน:

```cmd
scripts\bootstrap.bat
```

> `bootstrap.bat` เป็น wrapper ที่เรียก PowerShell ให้อัตโนมัติ (bypass ExecutionPolicy ให้เรียบร้อย ไม่ต้องตั้งอะไรเพิ่ม)

### ผ่าน PowerShell

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\bootstrap.ps1
```

### ผ่าน Double-click

เปิด File Explorer ไปที่ `D:\APP\CAMERAFORM\scripts\` แล้ว **double-click** ที่ `bootstrap.bat` ได้เลย

---

ใช้เวลา **5–15 นาที** (ขึ้นกับความเร็วเน็ต เพราะต้องดาวน์โหลด node_modules ขนาด ~500MB)

---

## ขั้นตอนที่ 4 — รันแอป

เปิด 2 terminal:

**Terminal 1** (Metro bundler — ปล่อยรันค้างไว้):

```powershell
npm start
```

**Terminal 2** (build + push ไปยังมือถือ):

```powershell
npm run android
```

ครั้งแรกจะใช้เวลา **10–20 นาที** เพราะ Gradle ต้องดาวน์โหลด dependencies ทั้งหมด ครั้งถัด ๆ ไปจะเร็วเหลือ 30 วินาที – 2 นาที

เมื่อ build สำเร็จ แอปจะเปิดขึ้นบนมือถือคุณอัตโนมัติ

---

## การ Debug

**ดู log แบบ real-time:**
```powershell
npx react-native log-android
```

**เขย่าเครื่องหรือกด `r` 2 ครั้งในหน้า Metro** เพื่อ reload
**กด `d`** ในหน้า Metro เพื่อเปิด Dev Menu
**กด `j`** เพื่อเปิด Chrome DevTools สำหรับ debug JS

---

## ปัญหาที่พบบ่อย (Troubleshooting)

| ปัญหา | วิธีแก้ |
|---|---|
| `adb: command not found` | ตั้ง `ANDROID_HOME` + `Path` ให้ถูก (ขั้นตอนที่ 1) |
| `SDK location not found` | สร้างไฟล์ `android/local.properties` เพิ่ม `sdk.dir=C:\\Users\\YOU\\AppData\\Local\\Android\\Sdk` |
| Gradle build ค้าง / OOM | เพิ่ม memory ใน `android/gradle.properties`: `org.gradle.jvmargs=-Xmx4096m` |
| แผนที่ไม่ขึ้น (จอขาว / จอดำ) | เช็คอินเทอร์เน็ต (tiles มาจาก tile.openstreetmap.org) และ AndroidManifest ต้องมี `android.permission.INTERNET` |
| กล้องขึ้นจอดำ | ยังไม่ได้กด Allow ตอน request permission — ถอนแอปแล้ว install ใหม่ |
| Error: duplicate class kotlin.* | เพิ่มใน `android/build.gradle` block `buildscript { ext { kotlinVersion = "1.9.24" } }` |
| `Unable to load script from assets` | Metro ไม่ได้รัน — เปิด `npm start` แล้วลองใหม่ |
| มือถือไม่ขึ้นใน `adb devices` | ลองเปลี่ยนสาย USB / ลง USB driver ของยี่ห้อ / เปิด USB debugging ใหม่ |
| `Could not move temporary workspace to immutable location` | Antivirus (Sophos/SentinelOne/Defender) ล็อกไฟล์ Gradle cache — ดูหัวข้อถัดไป |

---

## Troubleshooting: Sophos / SentinelOne / Defender ล็อกไฟล์

ถ้าเจอ error:

```
Could not move temporary workspace (D:\.gradle\caches\8.8\transforms\xxx-yyy)
  to immutable location (D:\.gradle\caches\8.8\transforms\xxx)
```

แปลว่า **antivirus แตะไฟล์ระหว่างที่ Gradle กำลังทำ atomic rename** → rename fail → build fail

**ถ้าไม่มีสิทธิ์ admin (ไม่สามารถ exclude folder ใน AV ได้)** ให้ใช้ 3 เทคนิคนี้ร่วมกัน:

### 1) โปรเจคนี้ตั้ง `gradle.properties` ไว้แล้วให้ทนกับ AV

ใน `android/gradle.properties` มีบรรทัดเหล่านี้อยู่แล้ว (ถ้าหายให้เพิ่มกลับมา):

```properties
org.gradle.vfs.watch=false
org.gradle.parallel=false
org.gradle.workers.max=1
org.gradle.configuration-cache=false
systemProp.org.gradle.internal.file.retries=10
systemProp.org.gradle.internal.file.retry.interval=1000
```

ค่าพวกนี้จะ:
- ปิด file-system watching → ไม่ถือ handle ไว้ให้ AV ชน
- รัน serial ทีละอย่าง → ลด race condition
- Retry rename 10 รอบ (ห่างกัน 1 วินาที) ก่อนยอมแพ้

### 2) ใช้ retry-build script

```cmd
scripts\android-retry.bat
```

สคริปต์นี้จะลอง `npm run android` ซ้ำสูงสุด **5 รอบ** (รอ 5 วินาทีระหว่างรอบ + kill gradle daemon ทุกรอบ) เพราะ rename fail เป็น transient — ส่วนใหญ่รอบ 2-3 ผ่าน

### 3) Clean cache ก่อน build ครั้งแรกของวัน

```cmd
scripts\clean.bat
scripts\android-retry.bat
```

### ถ้ายังไม่ผ่านอีก — ทางออกสำหรับองค์กรที่เข้มจริง ๆ

**ขอ IT exclude folder** (เป็น standard dev request):
- `D:\APP\CAMERAFORM\`
- `D:\.gradle\` (หรือ `%USERPROFILE%\.gradle\`)
- `%USERPROFILE%\.npm\`
- `C:\Users\<you>\AppData\Local\Android\Sdk\build-tools\` (ถ้า AV scan .dex files)

> Template email: "เพื่อพัฒนา Android app ภายในองค์กร ขอ whitelist path ที่ toolchain (Gradle/NPM) ใช้เก็บ dependency cache ซึ่งต้องทำ atomic file operation ที่ SentinelOne/Sophos แตะระหว่างทำงาน ส่งผลให้ build fail ไม่ต่อเนื่อง — folder เหล่านี้เป็นแค่ cache, ไม่มี executable ที่รัน"

**ทางเลือกอื่น ๆ:**
- **WSL2 (Ubuntu on Windows)** — ดูหัวข้อ "Build ผ่าน WSL2" ด้านล่าง (**แนะนำถ้ามี WSL อยู่แล้ว**)
- **Build บนเครื่องอื่น** — laptop ส่วนตัวที่ไม่มี corporate AV แล้วโอน APK มาลงเครื่องทดสอบ
- **Cloud build** — EAS Build, GitHub Actions, Bitrise รัน build บน cloud แล้วโหลด APK มาลง

---

## Build ผ่าน WSL2 (แนะนำสำหรับเครื่อง corporate)

Sophos / SentinelOne / Defender **ไม่ scan ข้างใน WSL ext4 filesystem** (เป็น virtualized disk) → Gradle build ผ่านทุกครั้ง

### เช็คว่ามี WSL ในเครื่อง

```cmd
wsl --list --verbose
```

ถ้าเห็น `Ubuntu-22.04` (หรือรุ่นอื่น) = ใช้ได้เลย
ถ้าไม่เห็น → ต้องขอ IT เปิด WSL ให้ (ไม่ต้อง admin ถ้าองค์กรเปิด Store ให้)

### ขั้นตอนที่ WSL-1 — Setup dev environment (ครั้งเดียว ~15 นาที)

```cmd
wsl -d Ubuntu-22.04
```

แล้วข้างใน WSL:

```bash
bash /mnt/d/APP/CAMERAFORM/scripts/wsl-setup.sh
```

สคริปต์จะลง JDK 17 + Node 20 (via nvm) + Android SDK cmdline-tools + platform-tools ให้อัตโนมัติ
(จะถาม `sudo password` — เป็นรหัสของ WSL ของคุณ **ไม่ใช่** Windows admin)

### ขั้นตอนที่ WSL-2 — Copy โปรเจคเข้า WSL filesystem

**สำคัญ:** ต้อง copy เข้า `~/` ไม่ใช่ build ที่ `/mnt/d/...` เพราะ:
1. `/mnt/d/...` ช้ามาก (cross-filesystem I/O)
2. `/mnt/d/...` อยู่บน Windows drive → SentinelOne ยัง scan ได้

```bash
# ปิด WSL shell แล้วเปิดใหม่ก่อน เพื่อให้ ~/.bashrc load env vars ใหม่
cp -r /mnt/d/APP/CAMERAFORM ~/CAMERAFORM
cd ~/CAMERAFORM
rm -rf node_modules android/.gradle android/app/build android/build package-lock.json
npm install
```

### ขั้นตอนที่ WSL-3 — เชื่อม adb กับมือถือผ่าน Wi-Fi ADB

WSL2 ไม่เห็น USB device โดยตรง (ต้องใช้ `usbipd-win` + admin) — **ใช้ Wi-Fi ADB ง่ายกว่า**
(Android 11+ รองรับ — ส่วนใหญ่มือถือปัจจุบันได้หมด)

**บนมือถือ:**
1. เปิด **Developer Options → Wireless debugging → เปิด**
2. กด **Pair device with pairing code** → จะเห็น `IP:PORT` + **6-digit code**

**บน WSL:**
```bash
# 1. Pair (ใช้ครั้งเดียวต่อเครื่อง)
adb pair 192.168.x.x:YYYYY
# → ใส่ 6-digit code ที่มือถือแสดง

# 2. Connect (ทำทุกครั้งที่เริ่ม session ใหม่)
#    ใช้ IP:PORT หลักที่หน้า Wireless debugging (คนละ PORT กับ pairing)
adb connect 192.168.x.x:ZZZZZ

# 3. ตรวจ
adb devices
# ควรเห็น: 192.168.x.x:ZZZZZ   device
```

### ขั้นตอนที่ WSL-4 — Build

```bash
cd ~/CAMERAFORM
npm run android
```

ครั้งแรกนานหน่อย (10-15 นาที โหลด Gradle dependencies) ครั้งถัดไปเหลือ 30 วินาที - 2 นาที

### Workflow ประจำวัน

```bash
# เปิด WSL
wsl -d Ubuntu-22.04
cd ~/CAMERAFORM

# Connect มือถือ (ทุกครั้งที่เริ่ม — pair ไม่ต้องทำซ้ำ)
adb connect 192.168.x.x:ZZZZZ

# Terminal 1 — Metro
npm start

# Terminal 2 — Build + install
npm run android
```

### แก้ไขโค้ดได้ทั้งสองฝั่ง

- **แก้บน Windows (VS Code):** เปิด `\\wsl.localhost\Ubuntu-22.04\home\<user>\CAMERAFORM` หรือใช้ **VS Code Remote - WSL** extension (แนะนำ — เร็วกว่ามาก)
- **แก้บน WSL (nano/vim):** ใช้ปกติ
- **Sync กลับ Windows (ถ้าอยากดู):** `cp -r ~/CAMERAFORM/src /mnt/d/APP/CAMERAFORM/src` หรือใช้ git push/pull

---

## หน้าจอที่ควรเห็นเมื่อเปิดแอปได้

- แท็บล่างมี 4 ปุ่ม: **แผนที่ / ถ่ายภาพ / ตั้งค่าฟอร์ม / เปิดอ่าน**
- แท็บ **แผนที่** จะแสดง marker ตัวอย่าง 2 จุดที่กรุงเทพ
- แท็บ **ถ่ายภาพ** จะขอสิทธิ์ Camera + Location → เห็น preview กล้อง + overlay GPS
- ลองกดปุ่มถ่าย → มี form popup ให้กรอกเลขคดี → กดบันทึก → ภาพจะเก็บใน storage ของแอป พร้อม EXIF ที่เข้ารหัสแล้ว

---

## ทางเลือก: EAS Build (ไม่ต้อง build เอง)

ถ้าไม่อยากตั้ง Android Studio local toolchain ลงลึก สามารถใช้ **EAS Build** (cloud service) สร้าง APK ให้ฟรี (บางระดับ) แล้วโหลดมาลงมือถือ — ถ้าสนใจบอกได้ครับ
