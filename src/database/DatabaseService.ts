import Database from 'better-sqlite3';
import { Logger } from '../logging/Logger.js';
import fs from 'fs';
import path from 'path';

export interface CrawlSession {
    id: number;
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    mode: string;
    scheduleId?: number;
    userId?: number;
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
    userId?: number;
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
    userId?: number;
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

export interface AEOSchedule {
    id: number;
    name: string;
    description: string;
    startUrl: string;
    allowSubdomains: boolean;
    runAudits: boolean;
    auditDevice: 'mobile' | 'desktop';
    captureLinkDetails: boolean;
    cronExpression: string;
    enabled: boolean;
    createdAt: string;
    lastRun?: string;
    nextRun?: string;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    lastAeoScore?: number;
    averageAeoScore?: number;
}

export interface AEOExecution {
    id: number;
    scheduleId: number;
    startedAt: string;
    completedAt?: string;
    status: 'running' | 'completed' | 'failed';
    pagesAnalyzed: number;
    averageAeoScore?: number;
    duration?: number;
    errorMessage?: string;
}

export interface User {
    id: number;
    email: string;
    passwordHash: string;
    name: string | null;
    createdAt: string;
    lastLogin: string | null;
    isActive: boolean;
    role: 'user' | 'admin' | 'premium';
}

export interface UserSettings {
    userId: number;
    openaiApiKey: string | null;
    psiApiKey: string | null;
    maxCrawlsPerDay: number;
    emailNotifications: boolean;
}

export interface UserUsage {
    id: number;
    userId: number;
    actionType: string; // 'crawl' | 'audit' | 'aeo_analysis'
    timestamp: string;
    creditsUsed: number;
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
        // Create users table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT,
                created_at TEXT NOT NULL,
                last_login TEXT,
                is_active INTEGER NOT NULL DEFAULT 1,
                role TEXT NOT NULL DEFAULT 'user'
            )
        `);

        // Create user_settings table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_settings (
                user_id INTEGER PRIMARY KEY,
                openai_api_key TEXT,
                psi_api_key TEXT,
                max_crawls_per_day INTEGER DEFAULT 10,
                email_notifications INTEGER DEFAULT 1,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        `);

        // Create user_usage table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                action_type TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                credits_used INTEGER DEFAULT 1,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        `);

        // Create crawl_sessions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS crawl_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                start_url TEXT NOT NULL,
                allow_subdomains INTEGER NOT NULL,
                max_concurrency INTEGER NOT NULL,
                mode TEXT NOT NULL,
                schedule_id INTEGER,
                user_id INTEGER,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                total_pages INTEGER DEFAULT 0,
                total_resources INTEGER DEFAULT 0,
                duration INTEGER DEFAULT 0,
                status TEXT DEFAULT 'running',
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `);

        // Create session_shares table - tracks users who access shared sessions
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS session_shares (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                accessed_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES crawl_sessions (id),
                FOREIGN KEY (user_id) REFERENCES users (id),
                UNIQUE(session_id, user_id)
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

        // Create SEO cache table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS seo_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL UNIQUE,
                parent_text TEXT,
                keywords TEXT NOT NULL,
                language TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
            )
        `);

        // Create AEO schedules table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS aeo_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                start_url TEXT NOT NULL,
                allow_subdomains INTEGER NOT NULL DEFAULT 1,
                run_audits INTEGER NOT NULL DEFAULT 0,
                audit_device TEXT NOT NULL DEFAULT 'desktop',
                capture_link_details INTEGER NOT NULL DEFAULT 0,
                cron_expression TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                last_run TEXT,
                next_run TEXT,
                total_runs INTEGER DEFAULT 0,
                successful_runs INTEGER DEFAULT 0,
                failed_runs INTEGER DEFAULT 0,
                last_aeo_score REAL,
                average_aeo_score REAL
            )
        `);

        // Create AEO executions table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS aeo_executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                schedule_id INTEGER NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                status TEXT NOT NULL DEFAULT 'running',
                pages_analyzed INTEGER DEFAULT 0,
                average_aeo_score REAL,
                duration INTEGER,
                error_message TEXT,
                FOREIGN KEY (schedule_id) REFERENCES aeo_schedules (id)
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

        // Create links table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                source_page_id INTEGER NOT NULL,
                source_url TEXT NOT NULL,
                target_url TEXT NOT NULL,
                target_page_id INTEGER,
                is_internal INTEGER NOT NULL,
                anchor_text TEXT,
                xpath TEXT,
                position TEXT,
                rel TEXT,
                nofollow INTEGER DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES crawl_sessions (id),
                FOREIGN KEY (source_page_id) REFERENCES pages (id),
                FOREIGN KEY (target_page_id) REFERENCES pages (id)
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

        // Create audit results table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS audit_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                device TEXT NOT NULL,
                run_at TEXT NOT NULL,
                lcp_ms INTEGER,
                tbt_ms INTEGER,
                cls REAL,
                fcp_ms INTEGER,
                ttfb_ms INTEGER,
                performance_score INTEGER,
                psi_report_url TEXT,
                metrics_json TEXT,
                raw_json TEXT,
                created_at TEXT NOT NULL,
                session_id INTEGER,
                status TEXT DEFAULT 'pending',
                progress INTEGER DEFAULT 0
            )
        `);

        // Create AEO analysis results table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS aeo_analysis_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER,
                url TEXT NOT NULL,
                user_id INTEGER,
                grade TEXT,
                grade_color TEXT,
                overall_score REAL,
                module_scores TEXT,
                module_weights TEXT,
                detailed_analysis TEXT,
                structured_data TEXT,
                recommendations TEXT,
                errors TEXT,
                warnings TEXT,
                analysis_timestamp TEXT NOT NULL,
                run_id TEXT,
                FOREIGN KEY (session_id) REFERENCES crawl_sessions (id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `);

        // Create crawl logs table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS crawl_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                level TEXT DEFAULT 'info',
                timestamp TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES crawl_sessions (id)
            )
        `);

        // Best-effort additive migrations for existing DBs (ignore errors if columns already exist)
        try { this.db.exec('ALTER TABLE resources ADD COLUMN status_code INTEGER'); } catch {}
        try { this.db.exec('ALTER TABLE resources ADD COLUMN response_time INTEGER'); } catch {}
        try { this.db.exec('ALTER TABLE pages ADD COLUMN word_count INTEGER DEFAULT 0'); } catch {}
        try { this.db.exec('ALTER TABLE crawl_sessions ADD COLUMN schedule_id INTEGER'); } catch {}
        
        // Add user_id columns to existing tables for multi-user support
        try { this.db.exec('ALTER TABLE crawl_sessions ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch {}
        try { this.db.exec('ALTER TABLE crawl_schedules ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch {}
        try { this.db.exec('ALTER TABLE audit_schedules ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch {}
        try { this.db.exec('ALTER TABLE aeo_schedules ADD COLUMN user_id INTEGER REFERENCES users(id)'); } catch {}

        // Add audit_results columns for session tracking and progress
        try { this.db.exec('ALTER TABLE audit_results ADD COLUMN session_id INTEGER'); } catch {}
        try { this.db.exec('ALTER TABLE audit_results ADD COLUMN status TEXT DEFAULT "pending"'); } catch {}
        try { this.db.exec('ALTER TABLE audit_results ADD COLUMN progress INTEGER DEFAULT 0'); } catch {}

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
            CREATE INDEX IF NOT EXISTS idx_links_session_id ON links (session_id);
            CREATE INDEX IF NOT EXISTS idx_links_source_page_id ON links (source_page_id);
            CREATE INDEX IF NOT EXISTS idx_links_target_url ON links (target_url);
            CREATE INDEX IF NOT EXISTS idx_links_target_page_id ON links (target_page_id);
            CREATE INDEX IF NOT EXISTS idx_links_is_internal ON links (is_internal);
            CREATE INDEX IF NOT EXISTS idx_sitemap_discoveries_session_id ON sitemap_discoveries (session_id);
            CREATE INDEX IF NOT EXISTS idx_sitemap_urls_session_id ON sitemap_urls (session_id);
            CREATE INDEX IF NOT EXISTS idx_sitemap_urls_url ON sitemap_urls (url);
            CREATE INDEX IF NOT EXISTS idx_sitemap_urls_crawled ON sitemap_urls (crawled);
            CREATE INDEX IF NOT EXISTS idx_crawl_schedules_enabled ON crawl_schedules (enabled);
            CREATE INDEX IF NOT EXISTS idx_schedule_executions_schedule_id ON schedule_executions (schedule_id);
            CREATE INDEX IF NOT EXISTS idx_schedule_executions_status ON schedule_executions (status);
            CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
            CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
            CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);
            CREATE INDEX IF NOT EXISTS idx_user_usage_user_id ON user_usage (user_id);
            CREATE INDEX IF NOT EXISTS idx_user_usage_timestamp ON user_usage (timestamp);
            CREATE INDEX IF NOT EXISTS idx_crawl_sessions_user_id ON crawl_sessions (user_id);
            CREATE INDEX IF NOT EXISTS idx_crawl_schedules_user_id ON crawl_schedules (user_id);
            CREATE INDEX IF NOT EXISTS idx_audit_schedules_user_id ON audit_schedules (user_id);
            CREATE INDEX IF NOT EXISTS idx_aeo_schedules_user_id ON aeo_schedules (user_id);
            CREATE INDEX IF NOT EXISTS idx_aeo_analysis_results_session_id ON aeo_analysis_results (session_id);
            CREATE INDEX IF NOT EXISTS idx_aeo_analysis_results_user_id ON aeo_analysis_results (user_id);
            CREATE INDEX IF NOT EXISTS idx_aeo_analysis_results_url ON aeo_analysis_results (url);
            CREATE INDEX IF NOT EXISTS idx_crawl_logs_session_id ON crawl_logs (session_id);
            CREATE INDEX IF NOT EXISTS idx_crawl_logs_timestamp ON crawl_logs (timestamp);
        `);

        this.logger.info('Database tables initialized');
    }

    // Crawl Session Methods
    createCrawlSession(data: Omit<CrawlSession, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO crawl_sessions 
            (start_url, allow_subdomains, max_concurrency, mode, schedule_id, user_id, started_at, completed_at, total_pages, total_resources, duration, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            data.startUrl,
            data.allowSubdomains ? 1 : 0,
            data.maxConcurrency,
            data.mode,
            data.scheduleId ?? null,
            data.userId ?? null,
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

    getCrawlSessions(limit: number = 50, offset: number = 0, scheduleId?: number, userId?: number): CrawlSession[] {
        let query = 'SELECT * FROM crawl_sessions';
        const params: any[] = [];
        const conditions: string[] = [];
        
        if (typeof scheduleId === 'number') {
            conditions.push('schedule_id = ?');
            params.push(scheduleId);
        }
        
        if (typeof userId === 'number') {
            conditions.push('user_id = ?');
            params.push(userId);
        }
        
        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
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
    getLatestSessionByUrl(startUrl: string, userId?: number): CrawlSession | null {
        let query = 'SELECT * FROM crawl_sessions WHERE start_url = ?';
        const params: any[] = [startUrl];
        
        if (typeof userId === 'number') {
            query += ' AND user_id = ?';
            params.push(userId);
        }
        
        query += ' ORDER BY started_at DESC LIMIT 1';
        const stmt = this.db.prepare(query);
        const row = stmt.get(...params) as any;
        if (!row) return null;
        return { ...row, scheduleId: row.schedule_id ?? undefined, allowSubdomains: Boolean(row.allow_subdomains) } as CrawlSession;
    }

    getRunningSessionByUrl(startUrl: string, userId?: number): CrawlSession | null {
        let query = "SELECT * FROM crawl_sessions WHERE start_url = ? AND status = 'running'";
        const params: any[] = [startUrl];
        
        if (typeof userId === 'number') {
            query += ' AND user_id = ?';
            params.push(userId);
        }
        
        query += ' ORDER BY started_at DESC LIMIT 1';
        const stmt = this.db.prepare(query);
        const row = stmt.get(...params) as any;
        if (!row) return null;
        return { ...row, scheduleId: row.schedule_id ?? undefined, allowSubdomains: Boolean(row.allow_subdomains) } as CrawlSession;
    }

    getAverageDurationForUrl(startUrl: string, userId?: number): number | null {
        let query = "SELECT AVG(duration) as avgDuration FROM crawl_sessions WHERE start_url = ? AND status = 'completed'";
        const params: any[] = [startUrl];
        
        if (typeof userId === 'number') {
            query += ' AND user_id = ?';
            params.push(userId);
        }
        
        const stmt = this.db.prepare(query);
        const row = stmt.get(...params) as any;
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
        // First delete child tables, then parent tables
        this.db.exec('DELETE FROM audit_executions');
        this.db.exec('DELETE FROM links'); // Links table references pages and sessions
        this.db.exec('DELETE FROM resources'); // Resources table references pages and sessions
        this.db.exec('DELETE FROM pages'); // Pages table references sessions
        this.db.exec('DELETE FROM sitemap_urls'); // Sitemap URLs reference sessions
        this.db.exec('DELETE FROM sitemap_discoveries'); // Sitemap discoveries reference sessions
        this.db.exec('DELETE FROM schedule_executions'); // Schedule executions reference sessions
        this.db.exec('DELETE FROM crawl_sessions'); // Sessions table (parent)
        this.db.exec('DELETE FROM audit_schedules');
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

    // Link analysis methods
    insertLinks(links: Array<{
        sessionId: number;
        sourcePageId: number;
        sourceUrl: string;
        targetUrl: string;
        targetPageId?: number;
        isInternal: boolean;
        anchorText?: string;
        xpath?: string;
        position?: string;
        rel?: string;
        nofollow?: boolean;
    }>): void {
        if (links.length === 0) return;

        const stmt = this.db.prepare(`
            INSERT INTO links 
            (session_id, source_page_id, source_url, target_url, target_page_id, is_internal, anchor_text, xpath, position, rel, nofollow, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const timestamp = new Date().toISOString();
        
        for (const link of links) {
            stmt.run(
                link.sessionId,
                link.sourcePageId,
                link.sourceUrl,
                link.targetUrl,
                link.targetPageId || null,
                link.isInternal ? 1 : 0,
                link.anchorText || null,
                link.xpath || null,
                link.position || null,
                link.rel || null,
                link.nofollow ? 1 : 0,
                timestamp
            );
        }
    }

    getLinksByPage(pageId: number, type: 'in' | 'out' = 'out', limit: number = 100): Array<{
        id: number;
        sourceUrl: string;
        targetUrl: string;
        anchorText: string;
        position: string;
        isInternal: boolean;
        rel: string;
        nofollow: boolean;
        xpath: string;
    }> {
        const whereClause = type === 'out' ? 'source_page_id = ?' : 'target_page_id = ? AND target_page_id IS NOT NULL';
        const stmt = this.db.prepare(`
            SELECT id, source_url, target_url, anchor_text, position, is_internal, rel, nofollow, xpath
            FROM links 
            WHERE ${whereClause}
            ORDER BY created_at DESC
            LIMIT ?
        `);
        
        const rows = stmt.all(pageId, limit) as any[];
        
        return rows.map(row => ({
            id: row.id,
            sourceUrl: row.source_url,
            targetUrl: row.target_url,
            anchorText: row.anchor_text || '',
            position: row.position || '',
            isInternal: Boolean(row.is_internal),
            rel: row.rel || '',
            nofollow: Boolean(row.nofollow),
            xpath: row.xpath || ''
        }));
    }

    getLinkStats(sessionId: number): {
        totalLinks: number;
        internalLinks: number;
        externalLinks: number;
        linksByPosition: Record<string, number>;
    } {
        const totalStmt = this.db.prepare(`
            SELECT COUNT(*) as total, 
                   SUM(CASE WHEN is_internal = 1 THEN 1 ELSE 0 END) as internal,
                   SUM(CASE WHEN is_internal = 0 THEN 1 ELSE 0 END) as external
            FROM links WHERE session_id = ?
        `);
        
        const positionStmt = this.db.prepare(`
            SELECT position, COUNT(*) as count
            FROM links 
            WHERE session_id = ? AND position IS NOT NULL
            GROUP BY position
        `);
        
        const totalResult = totalStmt.get(sessionId) as any;
        const positionResults = positionStmt.all(sessionId) as any[];
        
        const linksByPosition: Record<string, number> = {};
        for (const row of positionResults) {
            linksByPosition[row.position] = row.count;
        }
        
        return {
            totalLinks: totalResult.total || 0,
            internalLinks: totalResult.internal || 0,
            externalLinks: totalResult.external || 0,
            linksByPosition
        };
    }

    // Resolve target_page_id for internal links
    resolveTargetPageIds(sessionId: number): number {
        const stmt = this.db.prepare(`
            UPDATE links 
            SET target_page_id = (
                SELECT p.id 
                FROM pages p 
                WHERE p.session_id = ? 
                AND p.url = links.target_url
            )
            WHERE session_id = ? 
            AND is_internal = 1 
            AND target_page_id IS NULL
        `);
        
        const result = stmt.run(sessionId, sessionId);
        return result.changes;
    }

    // Get per-page link statistics
    getPageLinkStats(sessionId: number): Array<{
        pageId: number;
        url: string;
        title: string;
        outlinks: number;
        inlinks: number;
        externalOutlinks: number;
        internalOutlinks: number;
    }> {
        const stmt = this.db.prepare(`
            SELECT 
                p.id as page_id,
                p.url,
                p.title,
                COALESCE(outlink_stats.outlinks, 0) as outlinks,
                COALESCE(inlink_stats.inlinks, 0) as inlinks,
                COALESCE(outlink_stats.external_outlinks, 0) as external_outlinks,
                COALESCE(outlink_stats.internal_outlinks, 0) as internal_outlinks
            FROM pages p
            LEFT JOIN (
                SELECT 
                    source_page_id,
                    COUNT(*) as outlinks,
                    SUM(CASE WHEN is_internal = 0 THEN 1 ELSE 0 END) as external_outlinks,
                    SUM(CASE WHEN is_internal = 1 THEN 1 ELSE 0 END) as internal_outlinks
                FROM links 
                WHERE session_id = ?
                GROUP BY source_page_id
            ) outlink_stats ON p.id = outlink_stats.source_page_id
            LEFT JOIN (
                SELECT 
                    target_page_id,
                    COUNT(*) as inlinks
                FROM links 
                WHERE session_id = ? AND target_page_id IS NOT NULL
                GROUP BY target_page_id
            ) inlink_stats ON p.id = inlink_stats.target_page_id
            WHERE p.session_id = ?
            ORDER BY outlinks DESC, inlinks DESC
        `);
        
        const rows = stmt.all(sessionId, sessionId, sessionId) as any[];
        
        return rows.map(row => ({
            pageId: row.page_id,
            url: row.url,
            title: row.title,
            outlinks: row.outlinks,
            inlinks: row.inlinks,
            externalOutlinks: row.external_outlinks,
            internalOutlinks: row.internal_outlinks
        }));
    }

    // Get link relationships (which pages link to which pages)
    getLinkRelationships(sessionId: number, limit: number = 100): Array<{
        sourcePageId: number;
        sourceUrl: string;
        sourceTitle: string;
        targetPageId: number;
        targetUrl: string;
        targetTitle: string;
        linkCount: number;
        anchorTexts: string[];
    }> {
        const stmt = this.db.prepare(`
            SELECT 
                l.source_page_id,
                sp.url as source_url,
                sp.title as source_title,
                l.target_page_id,
                tp.url as target_url,
                tp.title as target_title,
                COUNT(*) as link_count,
                GROUP_CONCAT(l.anchor_text, '|') as anchor_texts
            FROM links l
            JOIN pages sp ON l.source_page_id = sp.id
            JOIN pages tp ON l.target_page_id = tp.id
            WHERE l.session_id = ? 
            AND l.is_internal = 1
            AND l.target_page_id IS NOT NULL
            GROUP BY l.source_page_id, l.target_page_id
            ORDER BY link_count DESC
            LIMIT ?
        `);
        
        const rows = stmt.all(sessionId, limit) as any[];
        
        return rows.map(row => ({
            sourcePageId: row.source_page_id,
            sourceUrl: row.source_url,
            sourceTitle: row.source_title,
            targetPageId: row.target_page_id,
            targetUrl: row.target_url,
            targetTitle: row.target_title,
            linkCount: row.link_count,
            anchorTexts: row.anchor_texts ? row.anchor_texts.split('|').filter(Boolean) : []
        }));
    }

    // SEO Cache Methods
    private loadSeoConfig(): { cacheExpirationHours: number } {
        const SEO_CONFIG_PATH = path.resolve(process.cwd(), 'config', 'seo.json');
        try {
            const config = JSON.parse(fs.readFileSync(SEO_CONFIG_PATH, 'utf-8'));
            return {
                cacheExpirationHours: config.cacheExpirationHours || 168 // Default to 7 days (168 hours)
            };
        } catch (error) {
            console.warn('SEO config not found, using default cache expiration of 168 hours (7 days)');
            return { cacheExpirationHours: 168 };
        }
    }

    async cacheSeoData(url: string, seoData: {
        parentText?: string;
        keywords: Array<{ text: string; score: number; intent?: string }>;
        language?: string;
    }): Promise<void> {
        const now = new Date().toISOString();
        const seoConfig = this.loadSeoConfig();
        const expiresAt = new Date(Date.now() + seoConfig.cacheExpirationHours * 60 * 60 * 1000).toISOString();
        
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO seo_cache 
            (url, parent_text, keywords, language, created_at, updated_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        stmt.run(
            url,
            seoData.parentText || null,
            JSON.stringify(seoData.keywords),
            seoData.language || null,
            now,
            now,
            expiresAt
        );
    }

    async getSeoData(url: string): Promise<{
        parentText?: string;
        keywords: Array<{ text: string; score: number; intent?: string }>;
        language?: string;
        isExpired: boolean;
    } | null> {
        const stmt = this.db.prepare(`
            SELECT parent_text, keywords, language, expires_at 
            FROM seo_cache 
            WHERE url = ?
        `);
        
        const row = stmt.get(url) as any;
        if (!row) return null;
        
        const isExpired = new Date(row.expires_at) < new Date();
        
        return {
            parentText: row.parent_text,
            keywords: JSON.parse(row.keywords || '[]'),
            language: row.language,
            isExpired
        };
    }

    async getSeoDataBatch(urls: string[]): Promise<Map<string, {
        parentText?: string;
        keywords: Array<{ text: string; score: number; intent?: string }>;
        language?: string;
        isExpired: boolean;
    }>> {
        if (urls.length === 0) return new Map();
        
        const placeholders = urls.map(() => '?').join(',');
        const stmt = this.db.prepare(`
            SELECT url, parent_text, keywords, language, expires_at 
            FROM seo_cache 
            WHERE url IN (${placeholders})
        `);
        
        const rows = stmt.all(...urls) as any[];
        const result = new Map();
        
        rows.forEach(row => {
            const isExpired = new Date(row.expires_at) < new Date();
            result.set(row.url, {
                parentText: row.parent_text,
                keywords: JSON.parse(row.keywords || '[]'),
                language: row.language,
                isExpired
            });
        });
        
        return result;
    }

    async clearExpiredSeoCache(): Promise<number> {
        const stmt = this.db.prepare(`
            DELETE FROM seo_cache 
            WHERE expires_at < ?
        `);
        
        const result = stmt.run(new Date().toISOString());
        return result.changes;
    }

    async getSeoCacheStats(): Promise<{
        totalEntries: number;
        expiredEntries: number;
        validEntries: number;
    }> {
        const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM seo_cache');
        const expiredStmt = this.db.prepare('SELECT COUNT(*) as count FROM seo_cache WHERE expires_at < ?');
        
        const total = totalStmt.get() as any;
        const expired = expiredStmt.get(new Date().toISOString()) as any;
        
        return {
            totalEntries: total.count,
            expiredEntries: expired.count,
            validEntries: total.count - expired.count
        };
    }

    // AEO Schedule Methods
    insertAEOSchedule(schedule: Omit<AEOSchedule, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO aeo_schedules 
            (name, description, start_url, allow_subdomains, run_audits, audit_device, capture_link_details, 
             cron_expression, enabled, created_at, last_run, next_run, total_runs, successful_runs, failed_runs)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            schedule.name,
            schedule.description,
            schedule.startUrl,
            schedule.allowSubdomains ? 1 : 0,
            schedule.runAudits ? 1 : 0,
            schedule.auditDevice,
            schedule.captureLinkDetails ? 1 : 0,
            schedule.cronExpression,
            schedule.enabled ? 1 : 0,
            schedule.createdAt,
            schedule.lastRun || null,
            schedule.nextRun || null,
            schedule.totalRuns,
            schedule.successfulRuns,
            schedule.failedRuns
        );
        
        return result.lastInsertRowid as number;
    }

    getAEOSchedules(): AEOSchedule[] {
        const stmt = this.db.prepare('SELECT * FROM aeo_schedules ORDER BY created_at DESC');
        const rows = stmt.all() as any[];
        
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            startUrl: row.start_url,
            allowSubdomains: Boolean(row.allow_subdomains),
            runAudits: Boolean(row.run_audits),
            auditDevice: row.audit_device,
            captureLinkDetails: Boolean(row.capture_link_details),
            cronExpression: row.cron_expression,
            enabled: Boolean(row.enabled),
            createdAt: row.created_at,
            lastRun: row.last_run,
            nextRun: row.next_run,
            totalRuns: row.total_runs,
            successfulRuns: row.successful_runs,
            failedRuns: row.failed_runs,
            lastAeoScore: row.last_aeo_score,
            averageAeoScore: row.average_aeo_score
        }));
    }

    getEnabledAEOSchedules(): AEOSchedule[] {
        const stmt = this.db.prepare('SELECT * FROM aeo_schedules WHERE enabled = 1 ORDER BY created_at DESC');
        const rows = stmt.all() as any[];
        
        return rows.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            startUrl: row.start_url,
            allowSubdomains: Boolean(row.allow_subdomains),
            runAudits: Boolean(row.run_audits),
            auditDevice: row.audit_device,
            captureLinkDetails: Boolean(row.capture_link_details),
            cronExpression: row.cron_expression,
            enabled: Boolean(row.enabled),
            createdAt: row.created_at,
            lastRun: row.last_run,
            nextRun: row.next_run,
            totalRuns: row.total_runs,
            successfulRuns: row.successful_runs,
            failedRuns: row.failed_runs,
            lastAeoScore: row.last_aeo_score,
            averageAeoScore: row.average_aeo_score
        }));
    }

    getAEOSchedule(id: number): AEOSchedule | null {
        const stmt = this.db.prepare('SELECT * FROM aeo_schedules WHERE id = ?');
        const row = stmt.get(id) as any;
        
        if (!row) return null;
        
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            startUrl: row.start_url,
            allowSubdomains: Boolean(row.allow_subdomains),
            runAudits: Boolean(row.run_audits),
            auditDevice: row.audit_device,
            captureLinkDetails: Boolean(row.capture_link_details),
            cronExpression: row.cron_expression,
            enabled: Boolean(row.enabled),
            createdAt: row.created_at,
            lastRun: row.last_run,
            nextRun: row.next_run,
            totalRuns: row.total_runs,
            successfulRuns: row.successful_runs,
            failedRuns: row.failed_runs,
            lastAeoScore: row.last_aeo_score,
            averageAeoScore: row.average_aeo_score
        };
    }

    updateAEOSchedule(id: number, updates: Partial<AEOSchedule>): void {
        const fields = [];
        const values = [];
        
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
        if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
        if (updates.startUrl !== undefined) { fields.push('start_url = ?'); values.push(updates.startUrl); }
        if (updates.allowSubdomains !== undefined) { fields.push('allow_subdomains = ?'); values.push(updates.allowSubdomains ? 1 : 0); }
        if (updates.runAudits !== undefined) { fields.push('run_audits = ?'); values.push(updates.runAudits ? 1 : 0); }
        if (updates.auditDevice !== undefined) { fields.push('audit_device = ?'); values.push(updates.auditDevice); }
        if (updates.captureLinkDetails !== undefined) { fields.push('capture_link_details = ?'); values.push(updates.captureLinkDetails ? 1 : 0); }
        if (updates.cronExpression !== undefined) { fields.push('cron_expression = ?'); values.push(updates.cronExpression); }
        if (updates.enabled !== undefined) { fields.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }
        if (updates.lastRun !== undefined) { fields.push('last_run = ?'); values.push(updates.lastRun); }
        if (updates.nextRun !== undefined) { fields.push('next_run = ?'); values.push(updates.nextRun); }
        if (updates.totalRuns !== undefined) { fields.push('total_runs = ?'); values.push(updates.totalRuns); }
        if (updates.successfulRuns !== undefined) { fields.push('successful_runs = ?'); values.push(updates.successfulRuns); }
        if (updates.failedRuns !== undefined) { fields.push('failed_runs = ?'); values.push(updates.failedRuns); }
        if (updates.lastAeoScore !== undefined) { fields.push('last_aeo_score = ?'); values.push(updates.lastAeoScore); }
        if (updates.averageAeoScore !== undefined) { fields.push('average_aeo_score = ?'); values.push(updates.averageAeoScore); }
        
        if (fields.length === 0) return;
        
        values.push(id);
        const stmt = this.db.prepare(`UPDATE aeo_schedules SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
    }

    deleteAEOSchedule(id: number): void {
        const stmt = this.db.prepare('DELETE FROM aeo_schedules WHERE id = ?');
        stmt.run(id);
    }

    insertAEOExecution(execution: Omit<AEOExecution, 'id'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO aeo_executions 
            (schedule_id, started_at, completed_at, status, pages_analyzed, average_aeo_score, duration, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            execution.scheduleId,
            execution.startedAt,
            execution.completedAt || null,
            execution.status,
            execution.pagesAnalyzed,
            execution.averageAeoScore || null,
            execution.duration || null,
            execution.errorMessage || null
        );
        
        return result.lastInsertRowid as number;
    }

    getAEOExecutionHistory(scheduleId: number, limit: number = 50): AEOExecution[] {
        const stmt = this.db.prepare(`
            SELECT * FROM aeo_executions 
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
            pagesAnalyzed: row.pages_analyzed,
            averageAeoScore: row.average_aeo_score,
            duration: row.duration,
            errorMessage: row.error_message
        }));
    }

    close(): void {
        this.db.close();
    }

    // Public method to access the database instance for raw queries
    getDb(): Database.Database {
        return this.db;
    }

    // ==================== User Management Methods ====================
    
    createUser(data: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): number {
        const stmt = this.db.prepare(`
            INSERT INTO users (email, password_hash, name, created_at, is_active, role)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            data.email,
            data.passwordHash,
            data.name || null,
            new Date().toISOString(),
            data.isActive ? 1 : 0,
            data.role
        );
        
        const userId = result.lastInsertRowid as number;
        
        // Create default user settings
        const settingsStmt = this.db.prepare(`
            INSERT INTO user_settings (user_id, max_crawls_per_day, email_notifications)
            VALUES (?, 10, 1)
        `);
        settingsStmt.run(userId);
        
        return userId;
    }

    getUserById(id: number): User | null {
        const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
        const row = stmt.get(id) as any;
        
        if (!row) return null;
        
        return {
            id: row.id,
            email: row.email,
            passwordHash: row.password_hash,
            name: row.name,
            createdAt: row.created_at,
            lastLogin: row.last_login,
            isActive: Boolean(row.is_active),
            role: row.role
        };
    }

    getUserByEmail(email: string): User | null {
        const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
        const row = stmt.get(email) as any;
        
        if (!row) return null;
        
        return {
            id: row.id,
            email: row.email,
            passwordHash: row.password_hash,
            name: row.name,
            createdAt: row.created_at,
            lastLogin: row.last_login,
            isActive: Boolean(row.is_active),
            role: row.role
        };
    }

    updateUser(id: number, updates: Partial<Omit<User, 'id' | 'createdAt'>>): void {
        const fields: string[] = [];
        const values: any[] = [];
        
        if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email); }
        if (updates.passwordHash !== undefined) { fields.push('password_hash = ?'); values.push(updates.passwordHash); }
        if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
        if (updates.lastLogin !== undefined) { fields.push('last_login = ?'); values.push(updates.lastLogin); }
        if (updates.isActive !== undefined) { fields.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }
        if (updates.role !== undefined) { fields.push('role = ?'); values.push(updates.role); }
        
        if (fields.length === 0) return;
        
        values.push(id);
        const stmt = this.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
    }

    updateUserLastLogin(userId: number): void {
        const stmt = this.db.prepare('UPDATE users SET last_login = ? WHERE id = ?');
        stmt.run(new Date().toISOString(), userId);
    }

    deleteUser(id: number): void {
        const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
        stmt.run(id);
    }

    getAllUsers(limit: number = 100, offset: number = 0): User[] {
        const stmt = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?');
        const rows = stmt.all(limit, offset) as any[];
        
        return rows.map(row => ({
            id: row.id,
            email: row.email,
            passwordHash: row.password_hash,
            name: row.name,
            createdAt: row.created_at,
            lastLogin: row.last_login,
            isActive: Boolean(row.is_active),
            role: row.role
        }));
    }

    // User Settings Methods
    getUserSettings(userId: number): UserSettings | null {
        const stmt = this.db.prepare('SELECT * FROM user_settings WHERE user_id = ?');
        const row = stmt.get(userId) as any;
        
        if (!row) return null;
        
        return {
            userId: row.user_id,
            openaiApiKey: row.openai_api_key,
            psiApiKey: row.psi_api_key,
            maxCrawlsPerDay: row.max_crawls_per_day,
            emailNotifications: Boolean(row.email_notifications)
        };
    }

    updateUserSettings(userId: number, updates: Partial<Omit<UserSettings, 'userId'>>): void {
        const fields: string[] = [];
        const values: any[] = [];
        
        if (updates.openaiApiKey !== undefined) { fields.push('openai_api_key = ?'); values.push(updates.openaiApiKey); }
        if (updates.psiApiKey !== undefined) { fields.push('psi_api_key = ?'); values.push(updates.psiApiKey); }
        if (updates.maxCrawlsPerDay !== undefined) { fields.push('max_crawls_per_day = ?'); values.push(updates.maxCrawlsPerDay); }
        if (updates.emailNotifications !== undefined) { fields.push('email_notifications = ?'); values.push(updates.emailNotifications ? 1 : 0); }
        
        if (fields.length === 0) return;
        
        values.push(userId);
        const stmt = this.db.prepare(`UPDATE user_settings SET ${fields.join(', ')} WHERE user_id = ?`);
        stmt.run(...values);
    }

    // User Usage Tracking Methods
    recordUserUsage(userId: number, actionType: string, creditsUsed: number = 1): void {
        const stmt = this.db.prepare(`
            INSERT INTO user_usage (user_id, action_type, timestamp, credits_used)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(userId, actionType, new Date().toISOString(), creditsUsed);
    }

    getUserUsage(userId: number, actionType?: string, limit: number = 100): UserUsage[] {
        let query = 'SELECT * FROM user_usage WHERE user_id = ?';
        const params: any[] = [userId];
        
        if (actionType) {
            query += ' AND action_type = ?';
            params.push(actionType);
        }
        
        query += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(limit);
        
        const stmt = this.db.prepare(query);
        const rows = stmt.all(...params) as any[];
        
        return rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            actionType: row.action_type,
            timestamp: row.timestamp,
            creditsUsed: row.credits_used
        }));
    }

    getUserUsageStats(userId: number, since?: string): {
        totalCrawls: number;
        totalAudits: number;
        totalAeoAnalyses: number;
        totalCredits: number;
    } {
        let query = `
            SELECT 
                SUM(CASE WHEN action_type = 'crawl' THEN 1 ELSE 0 END) as crawls,
                SUM(CASE WHEN action_type = 'audit' THEN 1 ELSE 0 END) as audits,
                SUM(CASE WHEN action_type = 'aeo_analysis' THEN 1 ELSE 0 END) as aeo_analyses,
                SUM(credits_used) as total_credits
            FROM user_usage
            WHERE user_id = ?
        `;
        const params: any[] = [userId];
        
        if (since) {
            query += ' AND timestamp >= ?';
            params.push(since);
        }
        
        const stmt = this.db.prepare(query);
        const result = stmt.get(...params) as any;
        
        return {
            totalCrawls: result.crawls || 0,
            totalAudits: result.audits || 0,
            totalAeoAnalyses: result.aeo_analyses || 0,
            totalCredits: result.total_credits || 0
        };
    }

    getTodayUsageCount(userId: number, actionType: string): number {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = today.toISOString();
        
        const stmt = this.db.prepare(`
            SELECT COUNT(*) as count
            FROM user_usage
            WHERE user_id = ? AND action_type = ? AND timestamp >= ?
        `);
        
        const result = stmt.get(userId, actionType, todayStr) as any;
        return result.count || 0;
    }

    // AEO Analysis Results Methods
    saveAeoAnalysisResult(data: {
        sessionId?: number;
        url: string;
        userId?: number;
        grade: string;
        gradeColor: string;
        overallScore: number;
        moduleScores?: any;
        moduleWeights?: any;
        detailedAnalysis?: any;
        structuredData?: any;
        recommendations?: string[];
        errors?: string[];
        warnings?: string[];
        analysisTimestamp: string;
        runId?: string;
    }): number {
        const stmt = this.db.prepare(`
            INSERT INTO aeo_analysis_results 
            (session_id, url, user_id, grade, grade_color, overall_score, module_scores, module_weights,
             detailed_analysis, structured_data, recommendations, errors, warnings, analysis_timestamp, run_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            data.sessionId ?? null,
            data.url,
            data.userId ?? null,
            data.grade,
            data.gradeColor,
            data.overallScore,
            data.moduleScores ? JSON.stringify(data.moduleScores) : null,
            data.moduleWeights ? JSON.stringify(data.moduleWeights) : null,
            data.detailedAnalysis ? JSON.stringify(data.detailedAnalysis) : null,
            data.structuredData ? JSON.stringify(data.structuredData) : null,
            data.recommendations ? JSON.stringify(data.recommendations) : null,
            data.errors ? JSON.stringify(data.errors) : null,
            data.warnings ? JSON.stringify(data.warnings) : null,
            data.analysisTimestamp,
            data.runId ?? null
        );
        
        return result.lastInsertRowid as number;
    }

    getAeoAnalysisResultBySessionId(sessionId: number): any | null {
        const stmt = this.db.prepare(`
            SELECT * FROM aeo_analysis_results
            WHERE session_id = ?
            ORDER BY analysis_timestamp DESC
            LIMIT 1
        `);
        
        const row = stmt.get(sessionId) as any;
        if (!row) return null;
        
        return this.parseAeoAnalysisResult(row);
    }

    getAeoAnalysisResultByUrl(url: string, userId?: number): any | null {
        let query = `
            SELECT * FROM aeo_analysis_results
            WHERE url = ?
        `;
        const params: any[] = [url];
        
        if (userId) {
            query += ' AND user_id = ?';
            params.push(userId);
        }
        
        query += ' ORDER BY analysis_timestamp DESC LIMIT 1';
        
        const stmt = this.db.prepare(query);
        const row = stmt.get(...params) as any;
        if (!row) return null;
        
        return this.parseAeoAnalysisResult(row);
    }

    getUserCrawlSessionsWithResults(userId: number, limit: number = 50, offset: number = 0): Array<{
        session: any;
        aeoResult: any | null;
        isReused?: boolean;
    }> {
        // Get sessions owned by user + sessions shared with user
        const stmt = this.db.prepare(`
            SELECT DISTINCT cs.*, 
                   CASE WHEN cs.user_id != ? THEN 1 ELSE 0 END as is_reused
            FROM crawl_sessions cs
            LEFT JOIN session_shares ss ON cs.id = ss.session_id AND ss.user_id = ?
            WHERE cs.user_id = ? OR ss.user_id = ?
            ORDER BY COALESCE(cs.completed_at, cs.started_at) DESC
            LIMIT ? OFFSET ?
        `);

        const rows = stmt.all(userId, userId, userId, userId, limit, offset) as any[];
        
        return rows.map(row => {
            const session = {
                id: row.id,
                startUrl: row.start_url,
                allowSubdomains: Boolean(row.allow_subdomains),
                maxConcurrency: row.max_concurrency,
                mode: row.mode,
                scheduleId: row.schedule_id,
                userId: row.user_id,
                startedAt: row.started_at,
                completedAt: row.completed_at,
                totalPages: row.total_pages,
                totalResources: row.total_resources,
                duration: row.duration,
                status: row.status
            };

            const aeoResult = this.getAeoAnalysisResultBySessionId(session.id);
            const isReused = Boolean(row.is_reused);

            return {
                session,
                aeoResult,
                isReused
            };
        });
    }

    private parseAeoAnalysisResult(row: any): any {
        return {
            id: row.id,
            sessionId: row.session_id,
            url: row.url,
            userId: row.user_id,
            grade: row.grade,
            gradeColor: row.grade_color,
            overallScore: row.overall_score,
            moduleScores: row.module_scores ? JSON.parse(row.module_scores) : null,
            moduleWeights: row.module_weights ? JSON.parse(row.module_weights) : null,
            detailedAnalysis: row.detailed_analysis ? JSON.parse(row.detailed_analysis) : null,
            structuredData: row.structured_data ? JSON.parse(row.structured_data) : null,
            recommendations: row.recommendations ? JSON.parse(row.recommendations) : null,
            errors: row.errors ? JSON.parse(row.errors) : null,
            warnings: row.warnings ? JSON.parse(row.warnings) : null,
            analysisTimestamp: row.analysis_timestamp,
            runId: row.run_id
        };
    }

    // Crawl Logs Methods
    saveCrawlLog(sessionId: number, message: string, level: string = 'info'): number {
        const stmt = this.db.prepare(`
            INSERT INTO crawl_logs (session_id, message, level, timestamp)
            VALUES (?, ?, ?, ?)
        `);
        
        const result = stmt.run(
            sessionId,
            message,
            level,
            new Date().toISOString()
        );
        
        return result.lastInsertRowid as number;
    }

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
        
        const rows = stmt.all(sessionId, limit) as any[];
        return rows.map(row => ({
            id: row.id,
            sessionId: row.session_id,
            message: row.message,
            level: row.level,
            timestamp: row.timestamp
        }));
    }

    // Audit Results Methods
    insertAuditResult(data: {
        url: string;
        device: 'mobile' | 'desktop';
        run_at: string;
        lcp_ms?: number;
        tbt_ms?: number;
        cls?: number;
        fcp_ms?: number;
        ttfb_ms?: number;
        performance_score?: number;
        psi_report_url?: string;
        metrics_json?: Record<string, unknown>;
        raw_json?: Record<string, unknown>;
        session_id?: number;
        status?: 'pending' | 'running' | 'completed' | 'failed';
        progress?: number;
    }): number {
        const stmt = this.db.prepare(`
            INSERT INTO audit_results 
            (url, device, run_at, lcp_ms, tbt_ms, cls, fcp_ms, ttfb_ms, performance_score, psi_report_url, metrics_json, raw_json, created_at, session_id, status, progress)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const timestamp = new Date().toISOString();
        const result = stmt.run(
            data.url,
            data.device,
            data.run_at,
            data.lcp_ms ?? null,
            data.tbt_ms ?? null,
            data.cls ?? null,
            data.fcp_ms ?? null,
            data.ttfb_ms ?? null,
            data.performance_score ?? null,
            data.psi_report_url ?? null,
            data.metrics_json ? JSON.stringify(data.metrics_json) : null,
            data.raw_json ? JSON.stringify(data.raw_json) : null,
            timestamp,
            data.session_id ?? null,
            data.status ?? 'pending',
            data.progress ?? 0
        );

        return result.lastInsertRowid as number;
    }

    updateAuditResult(auditId: number, data: {
        lcp_ms?: number;
        tbt_ms?: number;
        cls?: number;
        fcp_ms?: number;
        ttfb_ms?: number;
        performance_score?: number;
        psi_report_url?: string;
        metrics_json?: Record<string, unknown>;
        raw_json?: Record<string, unknown>;
        status?: 'pending' | 'running' | 'completed' | 'failed';
        progress?: number;
    }): void {
        const fields = [];
        const values = [];
        
        if (data.lcp_ms !== undefined) { fields.push('lcp_ms = ?'); values.push(data.lcp_ms); }
        if (data.tbt_ms !== undefined) { fields.push('tbt_ms = ?'); values.push(data.tbt_ms); }
        if (data.cls !== undefined) { fields.push('cls = ?'); values.push(data.cls); }
        if (data.fcp_ms !== undefined) { fields.push('fcp_ms = ?'); values.push(data.fcp_ms); }
        if (data.ttfb_ms !== undefined) { fields.push('ttfb_ms = ?'); values.push(data.ttfb_ms); }
        if (data.performance_score !== undefined) { fields.push('performance_score = ?'); values.push(data.performance_score); }
        if (data.psi_report_url !== undefined) { fields.push('psi_report_url = ?'); values.push(data.psi_report_url); }
        if (data.metrics_json !== undefined) { fields.push('metrics_json = ?'); values.push(JSON.stringify(data.metrics_json)); }
        if (data.raw_json !== undefined) { fields.push('raw_json = ?'); values.push(JSON.stringify(data.raw_json)); }
        if (data.status !== undefined) { fields.push('status = ?'); values.push(data.status); }
        if (data.progress !== undefined) { fields.push('progress = ?'); values.push(data.progress); }
        
        if (fields.length === 0) return;
        
        values.push(auditId);
        const stmt = this.db.prepare(`UPDATE audit_results SET ${fields.join(', ')} WHERE id = ?`);
        stmt.run(...values);
    }

    updateAuditProgress(auditId: number, status: 'pending' | 'running' | 'completed' | 'failed', progress: number = 0): void {
        const stmt = this.db.prepare(`
            UPDATE audit_results 
            SET status = ?, progress = ?
            WHERE id = ?
        `);
        stmt.run(status, progress, auditId);
    }

    getAuditProgressBySession(sessionId: number): {
        total: number;
        completed: number;
        failed: number;
        pending: number;
        running: number;
    } {
        const stmt = this.db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running
            FROM audit_results 
            WHERE session_id = ?
        `);
        
        const result = stmt.get(sessionId) as any;
        return {
            total: result.total || 0,
            completed: result.completed || 0,
            failed: result.failed || 0,
            pending: result.pending || 0,
            running: result.running || 0
        };
    }

    getAuditResults(device?: 'mobile' | 'desktop', limit: number = 100, offset: number = 0): Array<{
        id: number;
        url: string;
        device: 'mobile' | 'desktop';
        run_at: string;
        lcp_ms?: number;
        tbt_ms?: number;
        cls?: number;
        fcp_ms?: number;
        ttfb_ms?: number;
        performance_score?: number;
        psi_report_url?: string;
    }> {
        let query = 'SELECT id, url, device, run_at, lcp_ms, tbt_ms, cls, fcp_ms, ttfb_ms, performance_score, psi_report_url FROM audit_results';
        const params: any[] = [];

        if (device) {
            query += ' WHERE device = ?';
            params.push(device);
        }

        query += ' ORDER BY run_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const stmt = this.db.prepare(query);
        const rows = stmt.all(...params) as any[];

        return rows.map(row => ({
            id: row.id,
            url: row.url,
            device: row.device,
            run_at: row.run_at,
            lcp_ms: row.lcp_ms,
            tbt_ms: row.tbt_ms,
            cls: row.cls,
            fcp_ms: row.fcp_ms,
            ttfb_ms: row.ttfb_ms,
            performance_score: row.performance_score,
            psi_report_url: row.psi_report_url
        }));
    }

    getAuditResultById(id: number): any | null {
        const stmt = this.db.prepare('SELECT * FROM audit_results WHERE id = ?');
        return stmt.get(id);
    }

    getAuditResult(url: string, device: 'mobile' | 'desktop'): any | null {
        const stmt = this.db.prepare('SELECT * FROM audit_results WHERE url = ? AND device = ? ORDER BY created_at DESC LIMIT 1');
        return stmt.get(url, device);
    }

    getAuditResultsByUrl(url: string, device?: 'mobile' | 'desktop', limit: number = 10): Array<any> {
        let query = 'SELECT * FROM audit_results WHERE url = ?';
        const params: any[] = [url];

        if (device) {
            query += ' AND device = ?';
            params.push(device);
        }

        query += ' ORDER BY run_at DESC LIMIT ?';
        params.push(limit);

        const stmt = this.db.prepare(query);
        return stmt.all(...params) as any[];
    }

    // Session Sharing Methods
    getSessionByUrl(startUrl: string): CrawlSession | null {
        const query = `
            SELECT * FROM crawl_sessions 
            WHERE start_url = ? AND status = 'completed'
            ORDER BY completed_at DESC 
            LIMIT 1
        `;
        const stmt = this.db.prepare(query);
        const row = stmt.get(startUrl) as any;
        if (!row) return null;
        return {
            id: row.id,
            startUrl: row.start_url,
            allowSubdomains: Boolean(row.allow_subdomains),
            maxConcurrency: row.max_concurrency,
            mode: row.mode,
            scheduleId: row.schedule_id,
            userId: row.user_id,
            startedAt: row.started_at,
            completedAt: row.completed_at,
            totalPages: row.total_pages,
            totalResources: row.total_resources,
            duration: row.duration,
            status: row.status
        };
    }

    shareSessionWithUser(sessionId: number, userId: number): void {
        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO session_shares (session_id, user_id, accessed_at)
            VALUES (?, ?, ?)
        `);
        stmt.run(sessionId, userId, new Date().toISOString());
    }

    getUserCrawlHistoryWithOwner(userId: number, limit: number = 50, offset: number = 0): Array<{
        session: any;
        aeoResult: any | null;
    }> {
        // Get sessions owned by user + sessions shared with user
        const stmt = this.db.prepare(`
            SELECT DISTINCT cs.*
            FROM crawl_sessions cs
            LEFT JOIN session_shares ss ON cs.id = ss.session_id AND ss.user_id = ?
            WHERE cs.user_id = ? OR ss.user_id = ?
            ORDER BY COALESCE(cs.completed_at, cs.started_at) DESC
            LIMIT ? OFFSET ?
        `);

        const rows = stmt.all(userId, userId, userId, limit, offset) as any[];
        
        return rows.map(row => {
            const session = {
                id: row.id,
                startUrl: row.start_url,
                allowSubdomains: Boolean(row.allow_subdomains),
                maxConcurrency: row.max_concurrency,
                mode: row.mode,
                scheduleId: row.schedule_id,
                userId: row.user_id,
                startedAt: row.started_at,
                completedAt: row.completed_at,
                totalPages: row.total_pages,
                totalResources: row.total_resources,
                duration: row.duration,
                status: row.status
            };

            const aeoResult = this.getAeoAnalysisResultBySessionId(session.id);

            return {
                session,
                aeoResult
            };
        });
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
