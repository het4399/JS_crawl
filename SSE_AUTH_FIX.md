# 🔧 SSE Authentication Fix

## 🚨 Problem: "Authentication required" error after login

Even after successful login, the SSE connection was failing with:
```json
{"error":"Authentication required","message":"No access token provided"}
```

---

## 🔍 Root Cause Analysis

### The Authentication Flow:

1. **User logs in** → Server generates tokens
2. **Server response**:
   - ❌ `accessToken` sent in **response body only**
   - ✅ `refreshToken` set as **HTTP-only cookie**
3. **Frontend tries to connect SSE** (`EventSource`)
4. **EventSource sends request to `/events`**
   - Automatically includes cookies (✅ refreshToken sent)
   - Does NOT send Authorization header
   - ❌ `accessToken` cookie missing!
5. **Server `authenticateUser` middleware checks**:
   - Authorization header? ❌ Not sent by EventSource
   - `accessToken` cookie? ❌ **Not set!**
6. **Result**: 401 Unauthorized ⛔

---

## ✅ Solution: Set Access Token as Cookie

### Before (Broken):
```typescript
// Login endpoint
const tokens = authService.generateTokens({ ... });

// Only set refreshToken as cookie
res.cookie('refreshToken', tokens.refreshToken, { ... });

// AccessToken only in response body
res.json({
    accessToken: tokens.accessToken  // ← Not accessible to EventSource!
});
```

### After (Fixed):
```typescript
// Login endpoint
const tokens = authService.generateTokens({ ... });

// Set BOTH tokens as cookies
res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000  // 15 minutes
});

res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
});

// Still send in response body for API calls
res.json({
    accessToken: tokens.accessToken
});
```

---

## 📝 All Endpoints Updated

### 1. **Register** (`POST /api/auth/register`)
- ✅ Sets `accessToken` cookie
- ✅ Sets `refreshToken` cookie

### 2. **Login** (`POST /api/auth/login`)
- ✅ Sets `accessToken` cookie
- ✅ Sets `refreshToken` cookie

### 3. **Refresh** (`POST /api/auth/refresh`)
- ✅ Sets new `accessToken` cookie
- ✅ Sets new `refreshToken` cookie

### 4. **Logout** (`POST /api/auth/logout`)
- ✅ Clears `accessToken` cookie
- ✅ Clears `refreshToken` cookie

---

## 🔐 Security Benefits

### HttpOnly Cookies:
```typescript
httpOnly: true  // ← JavaScript cannot access these cookies
```
- ✅ Protected from XSS attacks
- ✅ Cannot be stolen via `document.cookie`
- ✅ Automatically sent with requests

### SameSite Protection:
```typescript
sameSite: 'strict'  // ← Only sent to same-origin requests
```
- ✅ Protected from CSRF attacks
- ✅ Cookies not sent to third-party sites

### Secure in Production:
```typescript
secure: process.env.NODE_ENV === 'production'  // ← HTTPS only
```
- ✅ Encrypted in transit in production
- ✅ Can use HTTP in development

---

## ⏱️ Token Expiration

| Token | Lifetime | Purpose |
|-------|----------|---------|
| **Access Token** | 15 minutes | Short-lived for security |
| **Refresh Token** | 7 days | Long-lived for UX |

**Why different lifetimes?**
- Access tokens are used frequently → Short lifetime limits damage if compromised
- Refresh tokens are used rarely → Longer lifetime for better UX
- If access token expires, refresh endpoint gets new one automatically

---

## 🧪 Testing the Fix

### Test 1: Fresh Login
```bash
# 1. Login
POST /api/auth/login
Body: { "email": "user@example.com", "password": "password" }

# 2. Check cookies in response
Set-Cookie: accessToken=eyJhbG...; HttpOnly; SameSite=Strict
Set-Cookie: refreshToken=eyJhbG...; HttpOnly; SameSite=Strict

# 3. Connect SSE (automatically sends cookies)
GET /events
→ ✅ Connection successful!
```

### Test 2: After Token Refresh
```bash
# 1. Refresh token (after 15 minutes)
POST /api/auth/refresh
Cookie: refreshToken=...

# 2. New cookies set
Set-Cookie: accessToken=newToken...; HttpOnly
Set-Cookie: refreshToken=newToken...; HttpOnly

# 3. SSE continues working with new token
GET /events
→ ✅ Still connected!
```

### Test 3: After Logout
```bash
# 1. Logout
POST /api/auth/logout

# 2. Cookies cleared
Set-Cookie: accessToken=; Max-Age=0
Set-Cookie: refreshToken=; Max-Age=0

# 3. SSE fails (as expected)
GET /events
→ ❌ 401 Unauthorized (correct!)
```

---

## 🔄 How EventSource Uses Cookies

EventSource (Server-Sent Events) automatically sends cookies:

```typescript
// Frontend
const eventSource = new EventSource('/events');
// ↑ Automatically includes ALL cookies for this domain
```

**What gets sent:**
```http
GET /events HTTP/1.1
Host: localhost:3000
Cookie: accessToken=eyJhbG...; refreshToken=eyJhbG...
```

**Why this works:**
- Browser automatically manages cookies
- No manual header manipulation needed
- Works with HttpOnly cookies (JavaScript can't access)
- Perfect for SSE authentication!

---

## 📊 Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| Access token location | Response body only | Cookie + Response body |
| SSE authentication | ❌ Failed | ✅ Works |
| Manual token handling | Required | Automatic |
| Security | Partial | Full (HttpOnly) |
| User experience | Broken | Seamless |

---

## ✅ Result

**SSE now works immediately after login!**

- ✅ No more "Authentication required" errors
- ✅ Live logs stream correctly
- ✅ Multi-user isolation works
- ✅ Secure token handling
- ✅ Clean logout behavior

---

## 🎯 Key Takeaway

**For SSE authentication, use cookies, not Authorization headers!**

EventSource cannot set custom headers, so cookie-based authentication is the standard approach for SSE endpoints.

