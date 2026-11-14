# ตั้งค่า Shortcut ส่งสลิปอัตโนมัติ (K PLUS)

หลังโอนเงินใน K PLUS แล้วปิดแอป iPhone จะหาสลิปใหม่ในอัลบั้ม `K PLUS` อ่านข้อความบนเครื่อง แล้วส่งเฉพาะข้อความไปที่บริการของเรา (ไม่ส่งรูป) พอเปิดแอปบันทึกรายจ่าย สลิปจะเข้ามาเป็นรายการให้เอง

> repo นี้เป็นสาธารณะ คู่มือจึงใช้ค่าตัวอย่างเท่านั้น
> - `<ที่อยู่บริการ>` = ที่อยู่เดียวกับที่ใส่ในแอป (ตั้งค่า → ราคาอัตโนมัติ) เช่น `https://ชื่อบริการ.vercel.app`
> - `<SLIP_TOKEN>` = ค่าที่ตั้งไว้ใน Vercel อย่าใช้ token ราคาตัวเดิม

ใช้เวลาราว 15 นาที ทำครั้งเดียว

---

## 1. เตรียม

1. ใน K PLUS ให้บันทึกสลิปลงรูปภาพทุกครั้งหลังโอน ถ้าอัลบั้ม `K PLUS` ในแอป Photos มีสลิปใหม่ๆ อยู่แล้ว แปลว่าเปิดไว้แล้ว
2. ในแอปบันทึกรายจ่าย ไปที่ **ตั้งค่า → สลิปอัตโนมัติ** แล้วเปิดสวิตช์ ต้องตั้ง `ราคาอัตโนมัติ` ไว้ก่อน
3. เก็บ `<SLIP_TOKEN>` ไว้ใน Notes ชั่วคราว จะได้คัดลอกมาวางได้ ตั้งเสร็จแล้วลบโน้ตทิ้ง

---

## 2. สร้าง Shortcut `ส่งสลิป`

เปิดแอป **Shortcuts** → **+** → ตั้งชื่อ `ส่งสลิป` แล้วเพิ่ม action ตามลำดับนี้ ชื่อ action เป็นภาษาอังกฤษตามที่ iPhone แสดง ถ้าเครื่องตั้งภาษาไทย ให้พิมพ์ชื่อนี้ในช่องค้นหา

### ก. อ่านเวลาของสลิปใบล่าสุดที่ส่งแล้ว

1. **Get File**
   - แตะลูกศรขยาย → ปิด **Show Document Picker**
   - **File Path** = `slip-last-kplus.txt`
   - ปิด **Error If Not Found**
   - (ไฟล์นี้อยู่ใน iCloud Drive › Shortcuts)
2. **If** → input = **File** → **has any value**
   1. **Get Dates from Input** → input = **File**
   2. **Set Variable** → ชื่อ `since`
3. **Otherwise**
   1. **Date** → **Current Date**
   2. **Adjust Date** → **Subtract** `10` **minutes**
   3. **Set Variable** → ชื่อ `since`
4. **End If**

### ข. หาสลิปใหม่

5. **Find Photos**
   - **Add Filter** → **Album** · **is** · `K PLUS`
   - **Add Filter** → **Date Created** · **is after** → แตะช่องวันที่ แล้วเลือกตัวแปร `since`
   - **Sort by** = **Date Created**, **Order** = **Oldest First**
   - เปิด **Limit** = `5`
6. **Count** → input = **Photos**
7. **If** → **Count** · **is** · `0`
   1. **Stop This Shortcut**
8. **End If**

### ค. ส่งทีละใบ

9. **Repeat with Each** → input = **Photos** (จาก Find Photos)
   1. **Extract Text from Image** → input = **Repeat Item**
   2. **Get Details of Images** → **Date Created** → input = **Repeat Item**
   3. **Format Date** → input = **Date Created**
      - **Date Format** = **ISO 8601**, เปิด **Include ISO 8601 Time**
   4. **Get Contents of URL**
      - URL = `<ที่อยู่บริการ>/api/slip`
      - แตะลูกศรขยาย → **Method** = **POST**
      - **Headers** → **Add new header** 2 แถว:
        - `Authorization` = `Bearer <SLIP_TOKEN>` (มีเว้นวรรค 1 ช่องหลัง Bearer)
        - `Content-Type` = `application/json`
      - **Request Body** = **JSON** → **Add new field** 3 ช่อง (ทั้งหมดเป็น **Text**):
        - `source` = `kplus`
        - `text` = ตัวแปร **Text** (จาก Extract Text from Image)
        - `photo_at` = ตัวแปร **Formatted Date**
   5. **Get Dictionary Value** → **Value** for `ok` in **Contents of URL**
   6. **If** → **Dictionary Value** (จากข้อ 5 ไม่ใช่ Contents of URL เพราะ server ตอบกลับทุกครั้ง แม้ตอนส่งไม่ผ่าน) · **does not have any value**
      1. **Stop This Shortcut**
      - ข้อนี้ทำให้ถ้าส่งไม่ผ่าน (ไม่มีเน็ต, server ล่ม) ระบบจะไม่จดเวลา รอบหน้าจะส่งใบนั้นใหม่เอง
   7. **End If**
   8. **Adjust Date** → **Add** `1` **seconds** → input = **Date Created**
      - บวก 1 วินาที จะได้ไม่หยิบใบเดิมซ้ำในรอบถัดไป
   9. **Format Date** → input = **Adjusted Date**
      - **Date Format** = **ISO 8601**, เปิด **Include ISO 8601 Time**
      - ห้ามใช้ Custom `yyyy-…` เพราะ iPhone ที่ตั้งปฏิทินพุทธจะเขียนปีเป็น 2569 แล้วอ่านกลับผิด
   10. **Save File** → input = **Formatted Date** (ตัวล่าสุด)
       - แตะลูกศรขยาย → ปิด **Ask Where to Save**
       - **Destination Path** = `slip-last-kplus.txt`
       - เปิด **Overwrite If File Exists**
10. **End Repeat**

---

## 3. รันครั้งแรกด้วยมือ

1. กด ▶️ ใน Shortcut
2. iPhone จะถามสิทธิ์ทีละอย่าง เลือก **Always Allow** ทุกครั้ง:
   - เข้าถึงรูปภาพ
   - เข้าถึงไฟล์
   - ส่งข้อมูลไปที่อยู่บริการ
3. รอบแรกยังไม่มีไฟล์จดเวลา Shortcut จะหาเฉพาะสลิปใน 10 นาทีที่ผ่านมา ถ้าไม่มี ก็จะหยุดเงียบๆ ถือว่าปกติ
4. ลองโอนเงินจริงสักรายการเล็กๆ แล้วกด ▶️ อีกครั้ง
5. เปิดแอปบันทึกรายจ่าย ควรเห็นรายการใหม่ในการ์ด `สลิปรอตรวจ`

ถ้ากด ▶️ ซ้ำทันที จะไม่มีอะไรถูกส่ง เพราะระบบจดเวลาไว้แล้ว ถ้าเผลอส่งซ้ำจริง ทั้ง server และแอปจะตัดใบซ้ำออกให้เอง

---

## 4. ตั้งให้รันเองทุกครั้งที่ปิด K PLUS

1. แอป **Shortcuts** → แท็บ **Automation** → **+**
2. เลือก **App** → **Choose** → **K PLUS**
3. ติ๊ก **Is Closed** อย่างเดียว (เอา Is Opened ออก)
4. เลือก **Run Immediately** และปิด **Notify When Run**
5. **Next** → เลือก Shortcut `ส่งสลิป` → **Done**

ทดสอบ: โอนเงิน → ปิด K PLUS → รอสักครู่ → เปิดแอปบันทึกรายจ่าย

---

## แก้ปัญหา

| อาการ | สาเหตุที่เป็นไปได้ |
|---|---|
| ไม่มีอะไรเข้ามาเลย | ยังไม่ได้เปิดสวิตช์สลิปอัตโนมัติในแอป หรือ Automation ยังเป็น Ask Before Running |
| Shortcut หยุดตรง Get Contents of URL | ไม่มีเน็ต หรือที่อยู่บริการผิด รอบหน้าระบบจะส่งใหม่เอง |
| แอปขึ้น `อ่านสลิปไม่ออก` ทุกใบ | ใช้ **Get Text from Input** (ไอคอนเหลือง) แทน **Extract Text from Image** ระบบเลยส่งชื่อไฟล์ `IMG_…` ไปแทนข้อความ หรือช่อง `text` ใน Request Body ไม่ได้เลือกผลของ Extract Text from Image |
| ได้ `unauthorized` | token ใน Header ไม่ตรงกับใน Vercel ลบค่าเดิม พิมพ์ `Bearer ` แล้ววาง token ใหม่ ระวังเว้นวรรคหรือบรรทัดว่างติดท้าย |
| ไฟล์จดเวลาเขียนปีเป็น 2569 | ข้อ 9.9 ยังเป็น Custom ให้เปลี่ยนเป็น ISO 8601 |
| ส่งใบเดิมซ้ำทุกครั้ง | ข้อ 9.8 ยังไม่ได้บวก 1 วินาที หรือ Save File ยังไม่ได้เปิด Overwrite |
| สลิปเก่าเข้ามาทีละเยอะ | ไฟล์ `slip-last-kplus.txt` หาย ทำให้เริ่มนับใหม่ ลบสลิปที่ไม่ต้องการได้ในแอป |
| ขึ้น `อ่านสลิปไม่ออก` | รูปไม่ใช่สลิป หรือข้อความเพี้ยน กด `จดเอง` แล้วจดรายการเองได้ |

ไฟล์ `slip-last-kplus.txt` เก็บแค่วันเวลาของสลิปใบล่าสุดที่ส่งสำเร็จ เปิดดูได้ในแอป Files › iCloud Drive › Shortcuts
