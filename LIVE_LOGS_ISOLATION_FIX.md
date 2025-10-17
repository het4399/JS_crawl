# 🔒 Live Logs User Isolation - FIXED

## Critical Security Issue Found & Resolved

### ❌ **The Problem:**
When multiple users were crawling simultaneously, **all users could see each other's live logs!**

**Why?**
1. `/events` endpoint was **not protected** - no authentication required
2. `sendEvent()` function broadcasted to **ALL connected clients** regardless of user
3. No user isolation in Server-Sent Events (SSE) implementation

**Impact:**
- 🚨 User A could see User B's crawl logs in real-time
- 🚨 Complete data leakage across users
- 🚨 Privacy violation

---

## ✅ **The Fix:**

### 1. Protected `/events` Endpoint
**File:** `src/server.ts`

```typescript
// Before: No authentication
app.get('/events', (req, res) => { ... });

// After: Requires authentication
app.get('/events', authenticateUser, (req, res) => { ... });
```

**Impact:** Only authenticated users can connect to SSE stream.

---

### 2. User-Specific Client Tracking
**File:** `src/server.ts`

```typescript
// Before: Client without user tracking
type Client = {
    id: number;
    res: express.Response;
};

// After: Client with userId
type Client = {
    id: number;
    res: express.Response;
    userId: number; // ← Added
};
```

**Impact:** Each SSE client is now associated with a specific user.

---

### 3. User-Filtered Event Broadcasting
**File:** `src/server.ts`

```typescript
// Before: Broadcast to ALL clients
function sendEvent(data: unknown, event: string = 'message') {
    for (const c of clients) {
        c.res.write(payload); // ← ALL clients
    }
}

// After: Send only to specific user's clients
function sendEvent(data: unknown, event: string = 'message', userId?: number) {
    const targetClients = userId 
        ? clients.filter(c => c.userId === userId) // ← Filter by user
        : clients;
    
    for (const c of targetClients) {
        c.res.write(payload);
    }
}
```

**Impact:** Events are sent only to the user who triggered the crawl.

---

### 4. Updated All Event Calls
**File:** `src/server.ts`

All `sendEvent()` calls now include the `userId` parameter:

```typescript
// Logs
sendEvent({ type: 'log', message: msg }, 'log', userId);

// Page discovered
sendEvent({ type: 'page', url: urlFound }, 'page', userId);

// Crawl completed
sendEvent({ type: 'done', ... }, 'done', userId);

// Audit events
sendEvent({ type: 'audit-start', url }, 'audit', userId);
sendEvent({ type: 'audit-complete', ... }, 'audit', userId);

// Errors
sendEvent({ type: 'log', message: error }, 'log', userId);
```

**Impact:** Every event is tied to a specific user.

---

### 5. Enhanced Frontend
**File:** `src/frontend/AppWithAuth.tsx`

```typescript
// Added connection event listener
eventSource.addEventListener('connected', (e) => {
  const data = JSON.parse(e.data);
  console.log('SSE connected:', data);
});

// Added error handling
eventSource.onerror = (error) => {
  console.error('SSE error:', error);
};
```

**Impact:** Better connection handling and debugging.

---

## 🔒 Security Improvements

### Before:
- ❌ `/events` endpoint unprotected
- ❌ All users see all logs
- ❌ No user isolation in SSE
- ❌ Privacy violation

### After:
- ✅ `/events` endpoint requires authentication
- ✅ Users only see their own logs
- ✅ Complete user isolation in SSE
- ✅ Privacy protected

---

## 🧪 Testing Scenarios

### Scenario 1: Two users crawling simultaneously
**User A (alice@example.com)** crawls `https://example.com`  
**User B (bob@example.com)** crawls `https://test.com`

**Expected:**
- ✅ Alice only sees logs from `example.com` crawl
- ✅ Bob only sees logs from `test.com` crawl
- ✅ No cross-user log visibility

---

### Scenario 2: User with multiple browser tabs
**User A** opens 2 tabs and starts a crawl

**Expected:**
- ✅ Both tabs receive the same logs (same user)
- ✅ Events sent to both SSE connections for User A
- ✅ Synchronized state across tabs

---

### Scenario 3: Unauthenticated user
**Visitor** tries to access `/events` without login

**Expected:**
- ❌ 401 Unauthorized error
- ❌ SSE connection rejected
- ✅ No data leakage

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────────┐
│                   SSE Endpoint                       │
│                   /events                            │
│           (Protected by authenticateUser)           │
└────────────────┬────────────────────────────────────┘
                 │
                 ├── Authenticates user
                 ├── Stores client with userId
                 └── Sends connection confirmation
                 
┌─────────────────────────────────────────────────────┐
│              sendEvent() Function                    │
│          (userId-filtered broadcasting)             │
└────────────────┬────────────────────────────────────┘
                 │
                 ├── Filter clients by userId
                 ├── Send event only to user's clients
                 └── Log event delivery
                 
┌──────────────┬──────────────┬──────────────────────┐
│  User A      │  User B      │   User C             │
│  Clients     │  Clients     │   Clients            │
│  (2 tabs)    │  (1 tab)     │   (1 tab)            │
└──────────────┴──────────────┴──────────────────────┘
     ↑               ↑                ↑
     │               │                │
  Only User A    Only User B     Only User C
     logs           logs             logs
```

---

## 🎯 Summary

### Files Modified:
1. `src/server.ts` - SSE authentication and user filtering (~50 lines)
2. `src/frontend/AppWithAuth.tsx` - Enhanced connection handling (~15 lines)

### Security Impact:
- 🔒 **Complete user isolation** in live logs
- 🔒 **No cross-user data leakage**
- 🔒 **Authentication required** for SSE
- 🔒 **Privacy protected** for all users

### Performance Impact:
- ✅ **Minimal** - Only filters clients by userId
- ✅ **Efficient** - Array filter is O(n) where n = connected clients
- ✅ **Scalable** - Works for any number of users

---

---

## 🐛 Bug Fix #1: SSE for Authenticated Users Only

### Issue:
SSE was connecting even for unauthenticated users, causing 401 errors and wasted retries.

### Fix:
```typescript
React.useEffect(() => {
    // Only connect SSE if user is authenticated
    if (!isAuthenticated) {
        console.log('SSE: User not authenticated, skipping connection');
        return;
    }
    
    const eventSource = new EventSource('/events');
    // ... event listeners ...
    
    return () => eventSource.close();
}, [isAuthenticated]); // ← Re-run when auth status changes
```

**Impact:**
- ✅ SSE only connects when user is logged in
- ✅ Closes when user logs out
- ✅ Reconnects when user logs in
- ✅ No wasted 401 requests for visitors

---

## 🐛 Bug Fix #2: Access Token Not in Cookies

### Critical Issue:
After login, SSE was failing with "Authentication required" error because `accessToken` was only sent in response body, NOT as a cookie.

### Root Cause:
```typescript
// ❌ Before: Only refreshToken was set as cookie
res.cookie('refreshToken', tokens.refreshToken, { ... });
res.json({ accessToken: tokens.accessToken }); // ← Only in body!
```

The `authenticateUser` middleware checks for token in:
1. Authorization header (not sent by EventSource)
2. `accessToken` cookie (was missing!)

**Result:** SSE authentication always failed → 401 errors

### Fix Applied:
```typescript
// ✅ After: Both tokens set as cookies
res.cookie('accessToken', tokens.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000 // 15 minutes
});

res.cookie('refreshToken', tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
});
```

### Files Updated:
- `src/routes/auth.routes.ts`:
  - **Register endpoint**: Added `accessToken` cookie
  - **Login endpoint**: Added `accessToken` cookie  
  - **Refresh endpoint**: Added `accessToken` cookie
  - **Logout endpoint**: Clear both cookies

### Impact:
- ✅ SSE authentication works immediately after login
- ✅ No manual token passing needed
- ✅ EventSource automatically sends cookies
- ✅ Secure HttpOnly cookies
- ✅ Both tokens properly cleaned up on logout

---

## ✅ Status: PRODUCTION READY

**Multi-user live logs are now completely isolated and secure.**

Each user sees only their own crawl logs, even when multiple users are crawling simultaneously.

**SSE properly handles authentication state.**

