import Database from 'better-sqlite3';
import { Logger } from '../logging/Logger.js';

export interface CrawlSession {
    id: number;
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    mode: string;
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
    timestamp: string;
}

export class DatabaseService {
    private db: Database.Database;
    private logger: Logger;

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
                timestamp TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES crawl_sessions (id),
                FOREIGN KEY (page_id) REFERENCES pages (id)
            )
        `);

        // Create indexes for better performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_pages_session_id ON pages (session_id);
            CREATE INDEX IF NOT EXISTS idx_pages_url ON pages (url);
            CREATE INDEX IF NOT EXISTS idx_pages_timestamp ON pages (timestamp);
            CREATE INDEX IF NOT EXISTS idx_resources_session_id ON resources (session_id);
            CREATE INDEX IF NOT EXISTS idx_resources_page_id ON resources (page_id);
            CREATE INDEX IF NOT EXISTS idx_resources_type ON resources (resource_type);
            CREATE INDEX IF NOT EXISTS idx_resources_url ON resources (url);
        `);

        this.logger.info('Database tables initialized');
    }

    // Crawl Session Methods
    createCrawlSession(data: Omit<CrawlSession, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO crawl_sessions 
            (start_url, allow_subdomains, max_concurrency, mode, started_at, completed_at, total_pages, total_resources, duration, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            data.startUrl,
            data.allowSubdomains ? 1 : 0,
            data.maxConcurrency,
            data.mode,
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
            allowSubdomains: Boolean(result.allow_subdomains)
        } as CrawlSession;
    }

    getLatestCrawlSession(): CrawlSession | null {
        const stmt = this.db.prepare('SELECT * FROM crawl_sessions ORDER BY started_at DESC LIMIT 1');
        const result = stmt.get() as any;
        if (!result) return null;
        
        return {
            ...result,
            allowSubdomains: Boolean(result.allow_subdomains)
        } as CrawlSession;
    }

    // Page Methods
    insertPage(data: Omit<Page, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO pages 
            (session_id, url, title, description, content_type, last_modified, status_code, response_time, timestamp, success, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            data.timestamp,
            data.success ? 1 : 0,
            data.errorMessage
        );
        
        return result.lastInsertRowid as number;
    }

    insertResource(data: Omit<Resource, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO resources 
            (session_id, page_id, url, resource_type, title, description, content_type, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            data.sessionId,
            data.pageId,
            data.url,
            data.resourceType,
            data.title,
            data.description,
            data.contentType,
            data.timestamp
        );
        
        return result.lastInsertRowid as number;
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
        this.db.exec('DELETE FROM resources');
        this.db.exec('DELETE FROM pages');
        this.db.exec('DELETE FROM crawl_sessions');
        this.logger.info('All data cleared from database');
    }

    deleteCrawlSession(sessionId: number): void {
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

    close(): void {
        this.db.close();
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
