import Database from 'better-sqlite3';
import { Logger } from '../logging/Logger.js';

export interface CrawlSession {
    id: number;
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    mode: string;
    scheduleId?: number;
    startedAt: string;
    completedAt?: string;
    totalPages: number;
    totalResources: number;
    duration: number;
    status: 'running' | 'completed' | 'failed';
}

export interface Page {
    id: number;
    sessionId: number;
    url: string;
    title: string;
    description: string;
    contentType: string;
    lastModified: string | null;
    statusCode: number;
    responseTime: number;
    wordCount: number;
    timestamp: string;
    success: boolean;
    errorMessage: string | null;
}

export interface Resource {
    id: number;
    sessionId: number;
    pageId: number | null;
    url: string;
    resourceType: 'css' | 'js' | 'image' | 'external';
    title: string;
    description: string;
    contentType: string;
    statusCode?: number | null;
    responseTime?: number | null;
    timestamp: string;
}

export interface SitemapDiscovery {
    id: number;
    sessionId: number;
    sitemapUrl: string;
    discoveredUrls: number;
    lastModified: string;
    success: boolean;
    errorMessage: string | null;
}

export interface SitemapUrl {
    id: number;
    sessionId: number;
    url: string;
    lastModified: string | null;
    changeFrequency: string | null;
    priority: string | null;
    discoveredAt: string;
    crawled: boolean;
}

export interface CrawlSchedule {
    id: number;
    name: string;
    description: string;
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    mode: 'html' | 'js' | 'auto';
    cronExpression: string;
    enabled: boolean;
    createdAt: string;
    lastRun?: string;
    nextRun?: string;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
}

export interface ScheduleExecution {
    id: number;
    scheduleId: number;
    sessionId: number;
    startedAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed';
    errorMessage?: string;
    pagesCrawled: number;
    resourcesFound: number;
    duration: number;
}

export interface AuditSchedule {
    id: number;
    name: string;
    description: string;
    urls: string; // JSON string of URLs array
    device: 'mobile' | 'desktop';
    cronExpression: string;
    enabled: boolean;
    createdAt: string;
    lastRun?: string;
    nextRun?: string;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
}

export interface AuditExecution {
    id: number;
    scheduleId: number;
    startedAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed';
    errorMessage?: string;
    urlsProcessed: number;
    urlsSuccessful: number;
    urlsFailed: number;
    duration: number;
}

export class DatabaseService {
    private db: Database.Database;
    private logger: Logger;
    
    /** Ensure we only persist real HTTP/HTTPS URLs in resources */
    private isHttpUrl(u: string): boolean {
        try {
            const parsed = new URL(u);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }

    constructor(dbPath: string = 'storage/crawler.db') {
        this.logger = Logger.getInstance();
        this.db = new Database(dbPath);
        this.initializeTables();
    }

    private initializeTables() {
        // Create crawl_sessions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS crawl_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                start_url TEXT NOT NULL,
                allow_subdomains INTEGER NOT NULL,
                max_concurrency INTEGER NOT NULL,
                mode TEXT NOT NULL,
                schedule_id INTEGER,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                total_pages INTEGER DEFAULT 0,
                total_resources INTEGER DEFAULT 0,
                duration INTEGER DEFAULT 0,
                status TEXT DEFAULT 'running'
            )
        `);

        // Create pages table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS pages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                content_type TEXT NOT NULL,
                last_modified TEXT,
                status_code INTEGER NOT NULL,
                response_time INTEGER NOT NULL,
                word_count INTEGER NOT NULL DEFAULT 0,
                timestamp TEXT NOT NULL,
                success INTEGER NOT NULL,
                error_message TEXT,
                FOREIGN KEY (session_id) REFERENCES crawl_sessions (id)
            )
        `);

        // Create resources table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS resources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                page_id INTEGER,
                url TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                content_type TEXT NOT NULL,
                status_code INTEGER,
                response_time INTEGER,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES crawl_sessions (id),
                FOREIGN KEY (page_id) REFERENCES pages (id)
            )
        `);

        // Create sitemap_discoveries table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sitemap_discoveries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                sitemap_url TEXT NOT NULL,
                discovered_urls INTEGER NOT NULL,
                last_modified TEXT NOT NULL,
                success INTEGER NOT NULL,
                error_message TEXT,
                FOREIGN KEY (session_id) REFERENCES crawl_sessions (id)
            )
        `);

        // Create sitemap_urls table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sitemap_urls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                url TEXT NOT NULL,
                last_modified TEXT,
                change_frequency TEXT,
                priority TEXT,
                discovered_at TEXT NOT NULL,
                crawled INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (session_id) REFERENCES crawl_sessions (id)
            )
        `);

        // Create crawl_schedules table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS crawl_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                start_url TEXT NOT NULL,
                allow_subdomains INTEGER NOT NULL,
                max_concurrency INTEGER NOT NULL,
                mode TEXT NOT NULL,
                cron_expression TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                last_run TEXT,
                next_run TEXT,
                total_runs INTEGER DEFAULT 0,
                successful_runs INTEGER DEFAULT 0,
                failed_runs INTEGER DEFAULT 0
            )
        `);

        // Create schedule_executions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS schedule_executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                schedule_id INTEGER NOT NULL,
                session_id INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                status TEXT NOT NULL DEFAULT 'running',
                error_message TEXT,
                pages_crawled INTEGER DEFAULT 0,
                resources_found INTEGER DEFAULT 0,
                duration INTEGER DEFAULT 0,
                FOREIGN KEY (schedule_id) REFERENCES crawl_schedules (id),
                FOREIGN KEY (session_id) REFERENCES crawl_sessions (id)
            )
        `);

        // Create audit schedules table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS audit_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                urls TEXT NOT NULL,
                device TEXT NOT NULL,
                cron_expression TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                last_run TEXT,
                next_run TEXT,
                total_runs INTEGER DEFAULT 0,
                successful_runs INTEGER DEFAULT 0,
                failed_runs INTEGER DEFAULT 0
            )
        `);

        // Create audit executions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS audit_executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                schedule_id INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                status TEXT NOT NULL DEFAULT 'running',
                error_message TEXT,
                urls_processed INTEGER DEFAULT 0,
                urls_successful INTEGER DEFAULT 0,
                urls_failed INTEGER DEFAULT 0,
                duration INTEGER DEFAULT 0,
                FOREIGN KEY (schedule_id) REFERENCES audit_schedules (id)
            )
        `);

        // Best-effort additive migrations for existing DBs (ignore errors if columns already exist)
        try { this.db.exec('ALTER TABLE resources ADD COLUMN status_code INTEGER'); } catch {}
        try { this.db.exec('ALTER TABLE resources ADD COLUMN response_time INTEGER'); } catch {}
        try { this.db.exec('ALTER TABLE pages ADD COLUMN word_count INTEGER DEFAULT 0'); } catch {}
        try { this.db.exec('ALTER TABLE crawl_sessions ADD COLUMN schedule_id INTEGER'); } catch {}

        // Create indexes for better performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_pages_session_id ON pages (session_id);
            CREATE INDEX IF NOT EXISTS idx_pages_url ON pages (url);
            CREATE INDEX IF NOT EXISTS idx_pages_timestamp ON pages (timestamp);
            CREATE INDEX IF NOT EXISTS idx_resources_session_id ON resources (session_id);
            CREATE INDEX IF NOT EXISTS idx_resources_page_id ON resources (page_id);
            CREATE INDEX IF NOT EXISTS idx_resources_type ON resources (resource_type);
            CREATE INDEX IF NOT EXISTS idx_resources_url ON resources (url);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_session_url ON resources (session_id, url);
            CREATE INDEX IF NOT EXISTS idx_sitemap_discoveries_session_id ON sitemap_discoveries (session_id);
            CREATE INDEX IF NOT EXISTS idx_sitemap_urls_session_id ON sitemap_urls (session_id);
            CREATE INDEX IF NOT EXISTS idx_sitemap_urls_url ON sitemap_urls (url);
            CREATE INDEX IF NOT EXISTS idx_sitemap_urls_crawled ON sitemap_urls (crawled);
            CREATE INDEX IF NOT EXISTS idx_crawl_schedules_enabled ON crawl_schedules (enabled);
            CREATE INDEX IF NOT EXISTS idx_schedule_executions_schedule_id ON schedule_executions (schedule_id);
            CREATE INDEX IF NOT EXISTS idx_schedule_executions_status ON schedule_executions (status);
        `);

        this.logger.info('Database tables initialized');
    }

    // Crawl Session Methods
    createCrawlSession(data: Omit<CrawlSession, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO crawl_sessions 
            (start_url, allow_subdomains, max_concurrency, mode, schedule_id, started_at, completed_at, total_pages, total_resources, duration, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            data.startUrl,
            data.allowSubdomains ? 1 : 0,
            data.maxConcurrency,
            data.mode,
            data.scheduleId ?? null,
            data.startedAt,
            data.completedAt ?? null,
            data.totalPages,
            data.totalResources,
            data.duration,
            data.status
        );
        
        return result.lastInsertRowid as number;
    }

    updateCrawlSession(id: number, updates: Partial<CrawlSession>): void {
        const fields = Object.keys(updates).filter(key => key !== 'id');
        if (fields.length === 0) return;

        // Map TS field names to DB column names
        const columnMap: Record<string, string> = {
            startUrl: 'start_url',
            allowSubdomains: 'allow_subdomains',
            maxConcurrency: 'max_concurrency',
            mode: 'mode',
            scheduleId: 'schedule_id',
            startedAt: 'started_at',
            completedAt: 'completed_at',
            totalPages: 'total_pages',
            totalResources: 'total_resources',
            duration: 'duration',
            status: 'status',
        };

        const setClause = fields
            .map(field => `${columnMap[field] ?? field} = ?`)
            .join(', ');

        const values = fields.map(field => {
            const value = updates[field as keyof CrawlSession];
            if (value === undefined) return null;
            if (field === 'allowSubdomains' && typeof value === 'boolean') {
                return value ? 1 : 0;
            }
            return value as unknown;
        });
        
        const stmt = this.db.prepare(`UPDATE crawl_sessions SET ${setClause} WHERE id = ?`);
        stmt.run(...values, id);
    }

    getCrawlSession(id: number): CrawlSession | null {
        const stmt = this.db.prepare('SELECT * FROM crawl_sessions WHERE id = ?');
        const result = stmt.get(id) as any;
        if (!result) return null;
        
        return {
            ...result,
            scheduleId: result.schedule_id ?? undefined,
            allowSubdomains: Boolean(result.allow_subdomains)
        } as CrawlSession;
    }

    getLatestCrawlSession(): CrawlSession | null {
        const stmt = this.db.prepare('SELECT * FROM crawl_sessions ORDER BY started_at DESC LIMIT 1');
        const result = stmt.get() as any;
        if (!result) return null;
        
        return {
            ...result,
            scheduleId: result.schedule_id ?? undefined,
            allowSubdomains: Boolean(result.allow_subdomains)
        } as CrawlSession;
    }

    getCrawlSessions(limit: number = 50, offset: number = 0, scheduleId?: number): CrawlSession[] {
        let query = 'SELECT * FROM crawl_sessions';
        const params: any[] = [];
        if (typeof scheduleId === 'number') {
            query += ' WHERE schedule_id = ?';
            params.push(scheduleId);
        }
        query += ' ORDER BY started_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const stmt = this.db.prepare(query);
        const rows = stmt.all(...params) as any[];
        return rows.map(row => ({
            id: row.id,
            startUrl: row.start_url,
            allowSubdomains: row.allow_subdomains === 1,
            maxConcurrency: row.max_concurrency,
            mode: row.mode,
            scheduleId: row.schedule_id ?? undefined,
            startedAt: row.started_at,
            completedAt: row.completed_at ?? undefined,
            totalPages: row.total_pages,
            totalResources: row.total_resources,
            duration: row.duration,
            status: row.status
        })) as CrawlSession[];
    }

    // New helpers for status lookup by URL
    getLatestSessionByUrl(startUrl: string): CrawlSession | null {
        const stmt = this.db.prepare('SELECT * FROM crawl_sessions WHERE start_url = ? ORDER BY started_at DESC LIMIT 1');
        const row = stmt.get(startUrl) as any;
        if (!row) return null;
        return { ...row, scheduleId: row.schedule_id ?? undefined, allowSubdomains: Boolean(row.allow_subdomains) } as CrawlSession;
    }

    getRunningSessionByUrl(startUrl: string): CrawlSession | null {
        const stmt = this.db.prepare("SELECT * FROM crawl_sessions WHERE start_url = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1");
        const row = stmt.get(startUrl) as any;
        if (!row) return null;
        return { ...row, scheduleId: row.schedule_id ?? undefined, allowSubdomains: Boolean(row.allow_subdomains) } as CrawlSession;
    }

    getAverageDurationForUrl(startUrl: string): number | null {
        const stmt = this.db.prepare("SELECT AVG(duration) as avgDuration FROM crawl_sessions WHERE start_url = ? AND status = 'completed'");
        const row = stmt.get(startUrl) as any;
        if (!row || row.avgDuration == null) return null;
        return Math.floor(row.avgDuration as number);
    }

    // Page Methods
    insertPage(data: Omit<Page, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO pages 
            (session_id, url, title, description, content_type, last_modified, status_code, response_time, word_count, timestamp, success, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            data.sessionId,
            data.url,
            data.title,
            data.description,
            data.contentType,
            data.lastModified,
            data.statusCode,
            data.responseTime,
            data.wordCount ?? 0,
            data.timestamp,
            data.success ? 1 : 0,
            data.errorMessage
        );
        
        return result.lastInsertRowid as number;
    }

    insertResource(data: Omit<Resource, 'id'>): number {
        // Skip non-HTTP(S) resources like mailto:, javascript:, tel:
        if (!this.isHttpUrl(data.url)) {
            return 0 as unknown as number;
        }
        const stmt = this.db.prepare(`
            INSERT INTO resources 
            (session_id, page_id, url, resource_type, title, description, content_type, status_code, response_time, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            data.sessionId,
            data.pageId,
            data.url,
            data.resourceType,
            data.title,
            data.description,
            data.contentType,
            data.statusCode ?? null,
            data.responseTime ?? null,
            data.timestamp
        );
        
        return result.lastInsertRowid as number;
    }

    upsertResource(data: Omit<Resource, 'id'>): void {
        // Skip non-HTTP(S) resources like mailto:, javascript:, tel:
        if (!this.isHttpUrl(data.url)) {
            return;
        }
        const stmt = this.db.prepare(`
            INSERT INTO resources (session_id, page_id, url, resource_type, title, description, content_type, status_code, response_time, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, url) DO UPDATE SET
                page_id=excluded.page_id,
                resource_type=excluded.resource_type,
                title=excluded.title,
                description=excluded.description,
                content_type=excluded.content_type,
                status_code=excluded.status_code,
                response_time=excluded.response_time,
                timestamp=excluded.timestamp
        `);
        stmt.run(
            data.sessionId,
            data.pageId,
            data.url,
            data.resourceType,
            data.title,
            data.description,
            data.contentType,
            data.statusCode ?? null,
            data.responseTime ?? null,
            data.timestamp
        );
    }

    // Query Methods
    getPages(sessionId?: number, limit: number = 1000, offset: number = 0): Page[] {
        let query = 'SELECT * FROM pages';
        const params: any[] = [];
        
        if (sessionId) {
            query += ' WHERE session_id = ?';
            params.push(sessionId);
        }
        
        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const stmt = this.db.prepare(query);
        const results = stmt.all(...params) as any[];
        
        return results.map(row => ({
            id: row.id,
            sessionId: row.session_id,
            url: row.url,
            title: row.title,
            description: row.description,
            contentType: row.content_type,
            lastModified: row.last_modified,
            statusCode: row.status_code,
            responseTime: row.response_time,
            wordCount: row.word_count ?? 0,
            timestamp: row.timestamp,
            success: Boolean(row.success),
            errorMessage: row.error_message,
        })) as Page[];
    }

    getResources(sessionId?: number, resourceType?: string, limit: number = 1000, offset: number = 0): Resource[] {
        let query = 'SELECT * FROM resources';
        const conditions: string[] = [];
        const params: any[] = [];
        
        if (sessionId) {
            conditions.push('session_id = ?');
            params.push(sessionId);
        }
        
        if (resourceType) {
            conditions.push('resource_type = ?');
            params.push(resourceType);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const stmt = this.db.prepare(query);
        const rows = stmt.all(...params) as any[];
        return rows.map(row => ({
            id: row.id,
            sessionId: row.session_id,
            pageId: row.page_id,
            url: row.url,
            resourceType: row.resource_type,
            title: row.title,
            description: row.description,
            contentType: row.content_type,
            statusCode: row.status_code ?? null,
            responseTime: row.response_time ?? null,
            timestamp: row.timestamp,
        })) as Resource[];
    }

    getPageCount(sessionId?: number): number {
        let query = 'SELECT COUNT(*) as count FROM pages';
        const params: any[] = [];
        
        if (sessionId) {
            query += ' WHERE session_id = ?';
            params.push(sessionId);
        }
        
        const stmt = this.db.prepare(query);
        const result = stmt.get(...params) as { count: number };
        return result.count;
    }

    getResourceCount(sessionId?: number): number {
        let query = 'SELECT COUNT(*) as count FROM resources';
        const params: any[] = [];
        
        if (sessionId) {
            query += ' WHERE session_id = ?';
            params.push(sessionId);
        }
        
        const stmt = this.db.prepare(query);
        const result = stmt.get(...params) as { count: number };
        return result.count;
    }

    getResourceTypeStats(sessionId?: number): Array<{ resource_type: string; count: number }> {
        let query = 'SELECT resource_type, COUNT(*) as count FROM resources';
        const params: any[] = [];
        
        if (sessionId) {
            query += ' WHERE session_id = ?';
            params.push(sessionId);
        }
        
        query += ' GROUP BY resource_type ORDER BY count DESC';
        
        const stmt = this.db.prepare(query);
        return stmt.all(...params) as Array<{ resource_type: string; count: number }>;
    }

    // Search Methods
    searchPages(searchTerm: string, sessionId?: number, limit: number = 1000, offset: number = 0): Page[] {
        let query = `
            SELECT * FROM pages 
            WHERE (url LIKE ? OR title LIKE ? OR description LIKE ?)
        `;
        const params: any[] = [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`];
        
        if (sessionId) {
            query += ' AND session_id = ?';
            params.push(sessionId);
        }
        
        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const stmt = this.db.prepare(query);
        return stmt.all(...params) as Page[];
    }

    // Cleanup Methods
    clearAllData(): void {
        // Delete in order to respect foreign key constraints
        this.db.exec('DELETE FROM audit_executions');
        this.db.exec('DELETE FROM audit_schedules');
        this.db.exec('DELETE FROM schedule_executions');
        this.db.exec('DELETE FROM sitemap_urls');
        this.db.exec('DELETE FROM sitemap_discoveries');
        this.db.exec('DELETE FROM resources');
        this.db.exec('DELETE FROM pages');
        this.db.exec('DELETE FROM crawl_sessions');
        this.db.exec('DELETE FROM crawl_schedules');
        this.logger.info('All data cleared from database (including audit data)');
    }

    deleteCrawlSession(sessionId: number): void {
        // Delete in order to respect foreign key constraints
        this.db.prepare('DELETE FROM schedule_executions WHERE session_id = ?').run(sessionId);
        this.db.prepare('DELETE FROM sitemap_urls WHERE session_id = ?').run(sessionId);
        this.db.prepare('DELETE FROM sitemap_discoveries WHERE session_id = ?').run(sessionId);
        this.db.prepare('DELETE FROM resources WHERE session_id = ?').run(sessionId);
        this.db.prepare('DELETE FROM pages WHERE session_id = ?').run(sessionId);
        this.db.prepare('DELETE FROM crawl_sessions WHERE id = ?').run(sessionId);
        this.logger.info(`Crawl session ${sessionId} deleted`);
    }

    // Export Methods
    exportData(format: 'json' | 'csv' = 'json'): string {
        const pages = this.getPages(undefined, 10000, 0);
        const resources = this.getResources(undefined, undefined, 10000, 0);
        
        const data = {
            pages,
            resources,
            exportedAt: new Date().toISOString()
        };
        
        if (format === 'csv') {
            return this.convertToCSV([...pages, ...resources]);
        }
        
        return JSON.stringify(data, null, 2);
    }

    private convertToCSV(data: any[]): string {
        if (data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];
        
        for (const row of data) {
            const values = headers.map(header => {
                const value = row[header];
                if (value === null || value === undefined) return '';
                const stringValue = String(value);
                return stringValue.includes(',') ? `"${stringValue}"` : stringValue;
            });
            csvRows.push(values.join(','));
        }
        
        return csvRows.join('\n');
    }

    // Sitemap Methods
    insertSitemapDiscovery(data: Omit<SitemapDiscovery, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO sitemap_discoveries 
            (session_id, sitemap_url, discovered_urls, last_modified, success, error_message)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            data.sessionId,
            data.sitemapUrl,
            data.discoveredUrls,
            data.lastModified,
            data.success ? 1 : 0,
            data.errorMessage
        );
        
        return result.lastInsertRowid as number;
    }

    insertSitemapUrl(data: Omit<SitemapUrl, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO sitemap_urls 
            (session_id, url, last_modified, change_frequency, priority, discovered_at, crawled)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            data.sessionId,
            data.url,
            data.lastModified,
            data.changeFrequency,
            data.priority,
            data.discoveredAt,
            data.crawled ? 1 : 0
        );
        
        return result.lastInsertRowid as number;
    }

    getSitemapUrls(sessionId: number): SitemapUrl[] {
        const stmt = this.db.prepare(`
            SELECT * FROM sitemap_urls WHERE session_id = ? ORDER BY discovered_at DESC
        `);
        
        const rows = stmt.all(sessionId) as any[];
        return rows.map(row => ({
            id: row.id,
            sessionId: row.session_id,
            url: row.url,
            lastModified: row.last_modified,
            changeFrequency: row.change_frequency,
            priority: row.priority,
            discoveredAt: row.discovered_at,
            crawled: row.crawled === 1
        }));
    }

    getSitemapDiscoveries(sessionId: number): SitemapDiscovery[] {
        const stmt = this.db.prepare(`
            SELECT * FROM sitemap_discoveries WHERE session_id = ? ORDER BY last_modified DESC
        `);
        
        const rows = stmt.all(sessionId) as any[];
        return rows.map(row => ({
            id: row.id,
            sessionId: row.session_id,
            sitemapUrl: row.sitemap_url,
            discoveredUrls: row.discovered_urls,
            lastModified: row.last_modified,
            success: row.success === 1,
            errorMessage: row.error_message
        }));
    }

    markSitemapUrlAsCrawled(sessionId: number, url: string): void {
        const stmt = this.db.prepare(`
            UPDATE sitemap_urls SET crawled = 1 WHERE session_id = ? AND url = ?
        `);
        stmt.run(sessionId, url);
    }

    getUncrawledSitemapUrls(sessionId: number): SitemapUrl[] {
        const stmt = this.db.prepare(`
            SELECT * FROM sitemap_urls 
            WHERE session_id = ? AND crawled = 0 
            ORDER BY priority DESC, discovered_at ASC
        `);
        
        const rows = stmt.all(sessionId) as any[];
        return rows.map(row => ({
            id: row.id,
            sessionId: row.session_id,
            url: row.url,
            lastModified: row.last_modified,
            changeFrequency: row.change_frequency,
            priority: row.priority,
            discoveredAt: row.discovered_at,
            crawled: row.crawled === 1
        }));
    }

    // Schedule Methods
    insertCrawlSchedule(data: Omit<CrawlSchedule, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO crawl_schedules 
            (name, description, start_url, allow_subdomains, max_concurrency, mode, cron_expression, enabled, created_at, last_run, next_run, total_runs, successful_runs, failed_runs)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            data.name,
            data.description,
            data.startUrl,
            data.allowSubdomains ? 1 : 0,
            data.maxConcurrency,
            data.mode,
            data.cronExpression,
            data.enabled ? 1 : 0,
            data.createdAt,
            data.lastRun || null,
            data.nextRun || null,
            data.totalRuns,
            data.successfulRuns,
            data.failedRuns
        );
        
        return result.lastInsertRowid as number;
    }

    updateCrawlSchedule(id: number, updates: Partial<CrawlSchedule>): void {
        const fields = [];
        const values = [];
        
        if (updates.name !== undefined) {
            fields.push('name = ?');
            values.push(updates.name);
        }
        if (updates.description !== undefined) {
            fields.push('description = ?');
            values.push(updates.description);
        }
        if (updates.startUrl !== undefined) {
            fields.push('start_url = ?');
            values.push(updates.startUrl);
        }
        if (updates.allowSubdomains !== undefined) {
            fields.push('allow_subdomains = ?');
            values.push(updates.allowSubdomains ? 1 : 0);
        }
        if (updates.maxConcurrency !== undefined) {
            fields.push('max_concurrency = ?');
            values.push(updates.maxConcurrency);
        }
        if (updates.mode !== undefined) {
            fields.push('mode = ?');
            values.push(updates.mode);
        }
        if (updates.cronExpression !== undefined) {
            fields.push('cron_expression = ?');
            values.push(updates.cronExpression);
        }
        if (updates.enabled !== undefined) {
            fields.push('enabled = ?');
            values.push(updates.enabled ? 1 : 0);
        }
        if (updates.lastRun !== undefined) {
            fields.push('last_run = ?');
            values.push(updates.lastRun);
        }
        if (updates.nextRun !== undefined) {
            fields.push('next_run = ?');
            values.push(updates.nextRun);
        }
        if (updates.totalRuns !== undefined) {
            fields.push('total_runs = ?');
            values.push(updates.totalRuns);
        }
        if (updates.successfulRuns !== undefined) {
            fields.push('successful_runs = ?');
            values.push(updates.successfulRuns);
        }
        if (updates.failedRuns !== undefined) {
            fields.push('failed_runs = ?');
            values.push(updates.failedRuns);
        }
        
        if (fields.length === 0) return;
        
        values.push(id);
        const stmt = this.db.prepare(`UPDATE crawl_schedules SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
    }

    deleteCrawlSchedule(id: number): void {
        // First delete related executions
        const deleteExecutionsStmt = this.db.prepare('DELETE FROM schedule_executions WHERE schedule_id = ?');
        deleteExecutionsStmt.run(id);
        
        // Then delete the schedule
        const stmt = this.db.prepare('DELETE FROM crawl_schedules WHERE id = ?');
        stmt.run(id);
    }

    getCrawlSchedule(id: number): CrawlSchedule | null {
        const stmt = this.db.prepare('SELECT * FROM crawl_schedules WHERE id = ?');
        const row = stmt.get(id) as any;
        
        if (!row) return null;
        
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            startUrl: row.start_url,
            allowSubdomains: row.allow_subdomains === 1,
            maxConcurrency: row.max_concurrency,
            mode: row.mode,
            cronExpression: row.cron_expression,
            enabled: row.enabled === 1,
            createdAt: row.created_at,
            lastRun: row.last_run,
            nextRun: row.next_run,
            totalRuns: row.total_runs,
            successfulRuns: row.successful_runs,
            failedRuns: row.failed_runs
        };
    }

    getScheduleInfoForSession(sessionId: number): { scheduleId?: number; scheduleName?: string } {
        const session = this.getCrawlSession(sessionId);
        if (!session || !session.scheduleId) return {};
        const sched = this.getCrawlSchedule(session.scheduleId);
        return { scheduleId: session.scheduleId, scheduleName: sched?.name };
    }

    getAllCrawlSchedules(): CrawlSchedule[] {
        const stmt = this.db.prepare('SELECT * FROM crawl_schedules ORDER BY created_at DESC');
        const rows = stmt.all() as any[];
        
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            startUrl: row.start_url,
            allowSubdomains: row.allow_subdomains === 1,
            maxConcurrency: row.max_concurrency,
            mode: row.mode,
            cronExpression: row.cron_expression,
            enabled: row.enabled === 1,
            createdAt: row.created_at,
            lastRun: row.last_run,
            nextRun: row.next_run,
            totalRuns: row.total_runs,
            successfulRuns: row.successful_runs,
            failedRuns: row.failed_runs
        }));
    }

    getEnabledCrawlSchedules(): CrawlSchedule[] {
        const stmt = this.db.prepare('SELECT * FROM crawl_schedules WHERE enabled = 1 ORDER BY created_at DESC');
        const rows = stmt.all() as any[];
        
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            startUrl: row.start_url,
            allowSubdomains: row.allow_subdomains === 1,
            maxConcurrency: row.max_concurrency,
            mode: row.mode,
            cronExpression: row.cron_expression,
            enabled: row.enabled === 1,
            createdAt: row.created_at,
            lastRun: row.last_run,
            nextRun: row.next_run,
            totalRuns: row.total_runs,
            successfulRuns: row.successful_runs,
            failedRuns: row.failed_runs
        }));
    }

    insertScheduleExecution(data: Omit<ScheduleExecution, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO schedule_executions 
            (schedule_id, session_id, started_at, completed_at, status, error_message, pages_crawled, resources_found, duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            data.scheduleId,
            data.sessionId,
            data.startedAt,
            data.completedAt || null,
            data.status,
            data.errorMessage || null,
            data.pagesCrawled,
            data.resourcesFound,
            data.duration
        );
        
        return result.lastInsertRowid as number;
    }

    updateScheduleExecution(id: number, updates: Partial<ScheduleExecution>): void {
        const fields = [];
        const values = [];
        
        if (updates.sessionId !== undefined) {
            fields.push('session_id = ?');
            values.push(updates.sessionId);
        }
        if (updates.completedAt !== undefined) {
            fields.push('completed_at = ?');
            values.push(updates.completedAt);
        }
        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.errorMessage !== undefined) {
            fields.push('error_message = ?');
            values.push(updates.errorMessage);
        }
        if (updates.pagesCrawled !== undefined) {
            fields.push('pages_crawled = ?');
            values.push(updates.pagesCrawled);
        }
        if (updates.resourcesFound !== undefined) {
            fields.push('resources_found = ?');
            values.push(updates.resourcesFound);
        }
        if (updates.duration !== undefined) {
            fields.push('duration = ?');
            values.push(updates.duration);
        }
        
        if (fields.length === 0) return;
        
        values.push(id);
        const stmt = this.db.prepare(`UPDATE schedule_executions SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
    }

    getScheduleExecutions(scheduleId: number, limit: number = 50): ScheduleExecution[] {
        const stmt = this.db.prepare(`
            SELECT * FROM schedule_executions 
            WHERE schedule_id = ? 
            ORDER BY started_at DESC 
            LIMIT ?
        `);
        
        const rows = stmt.all(scheduleId, limit) as any[];
        
        return rows.map(row => ({
            id: row.id,
            scheduleId: row.schedule_id,
            sessionId: row.session_id,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            status: row.status,
            errorMessage: row.error_message,
            pagesCrawled: row.pages_crawled,
            resourcesFound: row.resources_found,
            duration: row.duration
        }));
    }

    getAllScheduleExecutions(limit: number = 100): ScheduleExecution[] {
        const stmt = this.db.prepare(`
            SELECT * FROM schedule_executions 
            ORDER BY started_at DESC 
            LIMIT ?
        `);
        
        const rows = stmt.all(limit) as any[];
        
        return rows.map(row => ({
            id: row.id,
            scheduleId: row.schedule_id,
            sessionId: row.session_id,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            status: row.status,
            errorMessage: row.error_message,
            pagesCrawled: row.pages_crawled,
            resourcesFound: row.resources_found,
            duration: row.duration
        }));
    }

    // Audit Schedule Methods
    insertAuditSchedule(data: Omit<AuditSchedule, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO audit_schedules 
            (name, description, urls, device, cron_expression, enabled, created_at, last_run, next_run, total_runs, successful_runs, failed_runs)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        // Normalize values for SQLite binding:
        // - Booleans to integers (1/0)
        // - undefined to null
        const normalizedEnabled = data.enabled ? 1 : 0;
        const normalizedDescription = data.description ?? null;
        const normalizedUrls = data.urls; // expected to be a JSON string already
        const normalizedLastRun = data.lastRun ?? null;
        const normalizedNextRun = data.nextRun ?? null;
        const normalizedTotalRuns = data.totalRuns ?? 0;
        const normalizedSuccessfulRuns = data.successfulRuns ?? 0;
        const normalizedFailedRuns = data.failedRuns ?? 0;

        const result = stmt.run(
            data.name,
            normalizedDescription,
            normalizedUrls,
            data.device,
            data.cronExpression,
            normalizedEnabled,
            data.createdAt,
            normalizedLastRun,
            normalizedNextRun,
            normalizedTotalRuns,
            normalizedSuccessfulRuns,
            normalizedFailedRuns
        );
        
        return result.lastInsertRowid as number;
    }

    updateAuditSchedule(id: number, updates: Partial<AuditSchedule>): void {
        const fields: string[] = [];
        const values: any[] = [];
        
        if (updates.name !== undefined) {
            fields.push('name = ?');
            values.push(updates.name);
        }
        if (updates.description !== undefined) {
            fields.push('description = ?');
            values.push(updates.description);
        }
        if (updates.urls !== undefined) {
            fields.push('urls = ?');
            values.push(updates.urls);
        }
        if (updates.device !== undefined) {
            fields.push('device = ?');
            values.push(updates.device);
        }
        if (updates.cronExpression !== undefined) {
            fields.push('cron_expression = ?');
            values.push(updates.cronExpression);
        }
        if (updates.enabled !== undefined) {
            fields.push('enabled = ?');
            values.push(updates.enabled);
        }
        if (updates.lastRun !== undefined) {
            fields.push('last_run = ?');
            values.push(updates.lastRun);
        }
        if (updates.nextRun !== undefined) {
            fields.push('next_run = ?');
            values.push(updates.nextRun);
        }
        if (updates.totalRuns !== undefined) {
            fields.push('total_runs = ?');
            values.push(updates.totalRuns);
        }
        if (updates.successfulRuns !== undefined) {
            fields.push('successful_runs = ?');
            values.push(updates.successfulRuns);
        }
        if (updates.failedRuns !== undefined) {
            fields.push('failed_runs = ?');
            values.push(updates.failedRuns);
        }
        
        if (fields.length === 0) return;
        
        values.push(id);
        const stmt = this.db.prepare(`UPDATE audit_schedules SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
    }

    deleteAuditSchedule(id: number): void {
        const stmt = this.db.prepare('DELETE FROM audit_schedules WHERE id = ?');
        stmt.run(id);
    }

    getAllAuditSchedules(): AuditSchedule[] {
        const stmt = this.db.prepare('SELECT * FROM audit_schedules ORDER BY created_at DESC');
        const rows = stmt.all() as any[];
        
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            urls: row.urls,
            device: row.device,
            cronExpression: row.cron_expression,
            enabled: row.enabled,
            createdAt: row.created_at,
            lastRun: row.last_run,
            nextRun: row.next_run,
            totalRuns: row.total_runs,
            successfulRuns: row.successful_runs,
            failedRuns: row.failed_runs
        }));
    }

    getAuditSchedule(id: number): AuditSchedule | null {
        const stmt = this.db.prepare('SELECT * FROM audit_schedules WHERE id = ?');
        const row = stmt.get(id) as any;
        
        if (!row) return null;
        
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            urls: row.urls,
            device: row.device,
            cronExpression: row.cron_expression,
            enabled: row.enabled,
            createdAt: row.created_at,
            lastRun: row.last_run,
            nextRun: row.next_run,
            totalRuns: row.total_runs,
            successfulRuns: row.successful_runs,
            failedRuns: row.failed_runs
        };
    }

    getEnabledAuditSchedules(): AuditSchedule[] {
        const stmt = this.db.prepare('SELECT * FROM audit_schedules WHERE enabled = 1 ORDER BY created_at DESC');
        const rows = stmt.all() as any[];
        
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            urls: row.urls,
            device: row.device,
            cronExpression: row.cron_expression,
            enabled: row.enabled,
            createdAt: row.created_at,
            lastRun: row.last_run,
            nextRun: row.next_run,
            totalRuns: row.total_runs,
            successfulRuns: row.successful_runs,
            failedRuns: row.failed_runs
        }));
    }

    // Audit Execution Methods
    insertAuditExecution(data: Omit<AuditExecution, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO audit_executions 
            (schedule_id, started_at, completed_at, status, error_message, urls_processed, urls_successful, urls_failed, duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            data.scheduleId,
            data.startedAt,
            data.completedAt,
            data.status,
            data.errorMessage,
            data.urlsProcessed,
            data.urlsSuccessful,
            data.urlsFailed,
            data.duration
        );
        
        return result.lastInsertRowid as number;
    }

    updateAuditExecution(id: number, updates: Partial<AuditExecution>): void {
        const fields: string[] = [];
        const values: any[] = [];
        
        if (updates.completedAt !== undefined) {
            fields.push('completed_at = ?');
            values.push(updates.completedAt);
        }
        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.errorMessage !== undefined) {
            fields.push('error_message = ?');
            values.push(updates.errorMessage);
        }
        if (updates.urlsProcessed !== undefined) {
            fields.push('urls_processed = ?');
            values.push(updates.urlsProcessed);
        }
        if (updates.urlsSuccessful !== undefined) {
            fields.push('urls_successful = ?');
            values.push(updates.urlsSuccessful);
        }
        if (updates.urlsFailed !== undefined) {
            fields.push('urls_failed = ?');
            values.push(updates.urlsFailed);
        }
        if (updates.duration !== undefined) {
            fields.push('duration = ?');
            values.push(updates.duration);
        }
        
        if (fields.length === 0) return;
        
        values.push(id);
        const stmt = this.db.prepare(`UPDATE audit_executions SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
    }

    getAuditExecutions(scheduleId: number, limit: number = 50): AuditExecution[] {
        const stmt = this.db.prepare(`
            SELECT * FROM audit_executions 
            WHERE schedule_id = ? 
            ORDER BY started_at DESC 
            LIMIT ?
        `);
        
        const rows = stmt.all(scheduleId, limit) as any[];
        
        return rows.map(row => ({
            id: row.id,
            scheduleId: row.schedule_id,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            status: row.status,
            errorMessage: row.error_message,
            urlsProcessed: row.urls_processed,
            urlsSuccessful: row.urls_successful,
            urlsFailed: row.urls_failed,
            duration: row.duration
        }));
    }

    getAllAuditExecutions(limit: number = 100): AuditExecution[] {
        const stmt = this.db.prepare(`
            SELECT * FROM audit_executions 
            ORDER BY started_at DESC 
            LIMIT ?
        `);
        
        const rows = stmt.all(limit) as any[];
        
        return rows.map(row => ({
            id: row.id,
            scheduleId: row.schedule_id,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            status: row.status,
            errorMessage: row.error_message,
            urlsProcessed: row.urls_processed,
            urlsSuccessful: row.urls_successful,
            urlsFailed: row.urls_failed,
            duration: row.duration
        }));
    }

    close(): void {
        this.db.close();
    }

    // Public method to access the database instance for raw queries
    getDb(): Database.Database {
        return this.db;
    }
}

// Singleton instance
let dbInstance: DatabaseService | null = null;

export function getDatabase(): DatabaseService {
    if (!dbInstance) {
        dbInstance = new DatabaseService();
    }
    return dbInstance;
}
