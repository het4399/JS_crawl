# Crawl Logs Persistence Fix

## 🐛 **Problem**
When selecting a history item, the live logs from that specific crawl were not being restored. The logs tab would show logs from the last crawl or be empty.

### Root Cause
Logs were only sent as real-time Server-Sent Events (SSE) during crawling but were **never saved to the database**. Once the crawl completed, all logs were lost forever.

---

## ✅ **Solution Implemented**

### 1. **Created Crawl Logs Table**
**File:** `src/database/DatabaseService.ts`

```sql
CREATE TABLE IF NOT EXISTS crawl_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    level TEXT DEFAULT 'info',  -- 'info', 'warning', 'error'
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES crawl_sessions (id)
);

-- Indexes for performance
CREATE INDEX idx_crawl_logs_session_id ON crawl_logs (session_id);
CREATE INDEX idx_crawl_logs_timestamp ON crawl_logs (timestamp);
```

---

### 2. **Added Database Methods**
**File:** `src/database/DatabaseService.ts`

```typescript
// Save a log entry
saveCrawlLog(sessionId: number, message: string, level: string = 'info'): number {
    const stmt = this.db.prepare(`
        INSERT INTO crawl_logs (session_id, message, level, timestamp)
        VALUES (?, ?, ?, ?)
    `);
    
    return stmt.run(
        sessionId,
        message,
        level,
        new Date().toISOString()
    ).lastInsertRowid as number;
}

// Retrieve logs for a session
getCrawlLogs(sessionId: number, limit: number = 1000): Array<{
    id: number;
    sessionId: number;
    message: string;
    level: string;
    timestamp: string;
}> {
    const stmt = this.db.prepare(`
        SELECT * FROM crawl_logs
        WHERE session_id = ?
        ORDER BY timestamp ASC
        LIMIT ?
    `);
    
    const rows = stmt.all(sessionId, limit);
    return rows.map(row => ({
        id: row.id,
        sessionId: row.session_id,
        message: row.message,
        level: row.level,
        timestamp: row.timestamp
    }));
}
```

---

### 3. **Updated Crawler to Save Logs**
**File:** `src/crawler.ts`

Added a helper function after session creation:

```typescript
// Helper function to log and save to database
const logAndSave = (message: string, level: string = 'info') => {
    onLog?.(message);  // Send to SSE (real-time)
    try {
        db.saveCrawlLog(sessionId, message, level);  // Save to DB (persistence)
    } catch (error) {
        logger.error('Failed to save log to database', error as Error);
    }
};

// Now use logAndSave() instead of onLog()
logAndSave('Discovering sitemaps...');
logAndSave('Discovered 50 URLs from 2 sitemaps');
logAndSave('Crawl complete! Found 234 pages', 'info');
```

**Benefits:**
- ✅ Logs sent in real-time via SSE (existing behavior)
- ✅ Logs saved to database for later retrieval (NEW!)
- ✅ Logs survive browser refresh and logout
- ✅ Historical crawl logs can be viewed anytime

---

### 4. **Enhanced API Endpoint**
**File:** `src/routes/monitoring.routes.ts`

```typescript
// GET /api/data/list?sessionId=123

// Before:
res.json({
  data: [...],
  totalPages: 234,
  session: {...}
});

// After:
let logs: any[] = [];
if (sessionId) {
  logs = db.getCrawlLogs(sessionId);  // ← Fetch logs from DB
}

res.json({
  data: [...],
  totalPages: 234,
  session: {...},
  logs: logs  // ← Include logs in response
});
```

---

### 5. **Updated Frontend to Restore Logs**
**File:** `src/frontend/AppWithAuth.tsx`

```typescript
const handleSelectCrawl = async (crawlUrl: string, sessionId: number, aeoResult: any) => {
  try {
    // Fetch session data including logs
    const sessionData = await apiService.getSessionData(sessionId);
    
    // Restore pages
    setPages(sessionPages);
    setPageCount(sessionData.totalPages);
    
    // Restore logs ✅ NEW!
    if (sessionData.logs && sessionData.logs.length > 0) {
      const logMessages = sessionData.logs.map((log: any) => log.message);
      setLogs(logMessages);  // ← Restore historical logs!
    } else {
      // Fallback if no logs in database (for old crawls)
      setLogs([
        `📜 Crawl completed for ${crawlUrl}`,
        `Total pages: ${sessionData.totalPages}`
      ]);
    }
    
    // ... restore other data
  } catch (error) {
    // Handle error
  }
};
```

---

## 🔄 **Complete Flow**

### During Crawl (Real-time):
```
1. Crawl starts → sessionId created in database
2. Log message generated: "Discovering sitemaps..."
   ↓
3. logAndSave() called:
   ├─→ Send to SSE (user sees immediately) ✅
   └─→ Save to database (persisted) ✅
4. More logs generated and saved throughout crawl
5. Crawl completes → All logs saved in database
```

### Restoring From History:
```
1. User clicks history card
   ↓
2. Frontend calls: GET /api/data/list?sessionId=123
   ↓
3. Backend fetches:
   - Pages from database
   - Session stats
   - Logs from crawl_logs table ✅
   ↓
4. Frontend restores:
   - Pages array ✅
   - Stats ✅
   - Logs array ✅ (NEW!)
   ↓
5. User sees logs tab with historical logs!
```

---

## 📊 **What's Logged**

### Log Levels:
- `info` - Normal progress messages
- `warning` - Non-critical issues (e.g., sitemap errors)
- `error` - Critical errors during crawl

### Example Logs Saved:
```
[2025-10-18 14:23:15] Discovering sitemaps...
[2025-10-18 14:23:16] Discovered 50 URLs from 2 sitemaps
[2025-10-18 14:23:20] Queue prepared: pending=50, handled=0
[2025-10-18 14:25:45] 🎉 Crawl complete! Found 234 items (234 pages, 0 resources)
[2025-10-18 14:25:46] 🔍 Starting performance audits for all 234 crawled URLs (desktop)...
[2025-10-18 14:28:30] ✓ Audit completed for https://example.com - LCP: 1250ms, TBT: 150ms
[2025-10-18 14:30:00] 📊 Audit Results: 230/234 successful (98.3% success rate)
```

---

## 🎯 **Before vs After**

### Before Fix:
| Action | Logs Visible? |
|--------|---------------|
| **During crawl** | ✅ Yes (SSE real-time) |
| **After logout/refresh** | ❌ Lost forever |
| **Restore from history** | ❌ Empty |

### After Fix:
| Action | Logs Visible? |
|--------|---------------|
| **During crawl** | ✅ Yes (SSE real-time) |
| **After logout/refresh** | ✅ Persisted in DB |
| **Restore from history** | ✅ Fully restored |

---

## 📦 **Files Modified**

1. ✅ `src/database/DatabaseService.ts` - Added crawl_logs table and methods
2. ✅ `src/crawler.ts` - Added logAndSave() helper to persist logs
3. ✅ `src/routes/monitoring.routes.ts` - Return logs in API response
4. ✅ `src/frontend/AppWithAuth.tsx` - Restore logs when selecting history
5. ✅ `src/frontend/api.ts` - Updated TypeScript interface

---

## 🧪 **Testing**

### Test Scenario 1: New Crawl
1. Start a new crawl
2. Watch logs appear in real-time ✅
3. Complete the crawl
4. Check database: `SELECT * FROM crawl_logs WHERE session_id = X` ✅
5. Should see all log messages saved

### Test Scenario 2: Restore from History
1. Perform a crawl (logs will be saved)
2. Log out
3. Log back in
4. Go to History tab
5. Click on the crawl card
6. Click "Crawler" tab
7. ✅ Should see all the original logs from that crawl

### Test Scenario 3: Multiple Crawls
1. Perform 3 different crawls
2. Each should have its own logs in database
3. Restore each crawl from history
4. ✅ Each should show its own specific logs (not mixed)

---

## ⚠️ **Important Notes**

### Log Retention:
- Logs are stored indefinitely (no auto-cleanup yet)
- Each crawl session can have ~100-1000 log entries
- Consider adding a cleanup policy for old crawls

### Performance:
- Logs are fetched with `LIMIT 1000` to prevent huge queries
- Indexed by `session_id` for fast retrieval
- Ordered by `timestamp` ASC (chronological)

### Backwards Compatibility:
- Old crawl sessions (before this fix) won't have logs in DB
- Frontend handles this gracefully with fallback messages
- New crawls will have full log persistence

---

## 🚀 **Result**

**Problem SOLVED!** ✅

When you restore a crawl from history:
- ✅ Pages are restored
- ✅ Stats are restored
- ✅ **Logs are now restored too!**

You can now review the complete history of any crawl, including all log messages, anytime after the crawl completes - even after logging out and back in!

---

## 🔮 **Future Enhancements**

### Potential Improvements:
1. **Log Filtering** - Filter by log level (info/warning/error)
2. **Log Search** - Search within logs
3. **Log Export** - Download logs as text file
4. **Colorized Logs** - Show different colors for different log levels
5. **Cleanup Policy** - Auto-delete logs older than 30 days
6. **Log Streaming** - Stream logs for running crawls from DB + SSE


