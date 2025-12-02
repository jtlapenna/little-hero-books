# 🔧 Update Your `.env.local` File

**Action Required**: Update `back-end/.env.local` with production credentials

---

## 📝 **Instructions**

Open `/Users/johncapogna/Sites/little-hero-books/back-end/.env.local` and update these lines:

---

## 🔄 **Find and Replace**

### **1. Update Client ID**

**OLD**:
```bash
AMZ_APP_CLIENT_ID=amzn1.application-oa2-client.a887d49ebbd946829959d149f9b4320
```

**NEW**:
```bash
AMZ_APP_CLIENT_ID=amzn1.application-oa2-client.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

---

### **2. Update Client Secret**

**OLD**:
```bash
AMZ_APP_CLIENT_SECRET=amzn1.oa2-cs.v1.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**NEW**:
```bash
AMZ_APP_CLIENT_SECRET=amzn1.oa2-cs.v1.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

---

### **3. Update Refresh Token**

**OLD**:
```bash
AMZ_REFRESH_TOKEN=Atzr|IwEBILZjWRXEj0bKGcvPKOTqfhKOIRYBWjxLN6fZSVkLRkhj03Sn4ibtO7220dcbA8SVYZtdSM-6-411xe9sYZG95caDYBSr-RqY7CTip0vM6BcRjHdQ2KO6eKt8CyRGHw7cw38nhYEATmexfz0_mtIcjUZVicoSfk-YWQFGZJ8fdaHik62LSkugX_EwltJGyOCPo8fUfUyroln7tjlIB4z6UEwG9rhbZj8awfEAU5oyCKgAIn2KWp4kkBB4-w_EckK14bObZfORcng74MONIgd1wc4RBekZBxX-mcu0nlWMQFdPw4-ke_U3ZqNrvb8
```

**NEW**:
```bash
AMZ_REFRESH_TOKEN=Atzr|IwEBIMo5pIff5_Sg8W4I8XORxGzSryiKYoWsAEwgr-utyd7TPuXLRkhj03Sn4ibtO7220dcbA8SVYZtdSM-6-411xe9sYZG95caDYBSr-RqY7CTip0vM6BcRjHdQ2KO6eKt8CyRGHw7cw38nhYEATmexfz0_mtIcjUZVicoSfk-YWQFGZJ8fdaHik62LSkugX_EwltJGyOCPo8fUfUyroln7tjlIB4z6UEwG9rhbZj8awfEAU5oyCKgAIn2KWp4kkBB4-w_EckK14bObZfORcng74MONIgd1wc4RBekZBxX-mcu0nlWMQFdPw4-ke_U3ZqNrvb8
```

---

### **4. Update Sandbox Mode**

**OLD**:
```bash
AMAZON_SANDBOX_MODE=true
```

**NEW**:
```bash
AMAZON_SANDBOX_MODE=false
```

---

## ✅ **After Updating**

### **1. Restart Backend Server**

If your backend is running, restart it:

```bash
cd /Users/johncapogna/Sites/little-hero-books/back-end
# Press Ctrl+C to stop the current server
npm run dev
```

### **2. Verify Changes**

Check that the new credentials are loaded:

```bash
cd /Users/johncapogna/Sites/little-hero-books/back-end
grep "AMAZON_SANDBOX_MODE" .env.local
```

Should show:
```
AMAZON_SANDBOX_MODE=false
```

---

## 🎯 **What This Does**

- ✅ Switches from **sandbox** to **production** Amazon SP-API
- ✅ Enables sending messages to **real Amazon customers**
- ✅ Allows processing **live orders** from US, Canada, Mexico
- ✅ Ready for **Phase 1 and Phase 2 testing**

---

## 🚨 **Important**

- **DO NOT commit** `.env.local` to Git (it's already in `.gitignore`)
- **Keep credentials secure** - these are production credentials
- **Restart backend** after making changes

---

**Status**: Ready to update! 🚀

