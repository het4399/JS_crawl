import express from 'express';
import { getDatabase } from '../database/DatabaseService.js';

const router = express.Router();

function getPythonApiBase(): string {
    const base = process.env.PY_API_BASE || 'http://localhost:8000';
    return base.replace(/\/$/, '');
}

router.get('/api/seo/health', async (_req, res) => {
    try {
        const base = getPythonApiBase();
        const r = await fetch(`${base}/health`);
        const body = await r.text().catch(() => '');
        res.status(r.status).send(body);
    } catch (err) {
        res.status(500).json({ error: 'Python API health check failed', details: (err as Error).message });
    }
});

router.post('/api/seo/extract', async (req, res) => {
    try {
        const { url, html, status_code, final_url, fetched_at } = req.body ?? {};
        if (!url && !html) {
            return res.status(400).json({ error: 'Provide url or html' });
        }

        const finalUrl = url || final_url;
        if (!finalUrl) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Check cache first
        const db = getDatabase();
        const cachedData = await db.getSeoData(finalUrl);
        
        if (cachedData && !cachedData.isExpired) {
            // Return cached data
            return res.json({
                url: finalUrl,
                language: cachedData.language,
                parent: cachedData.parentText ? { text: cachedData.parentText } : null,
                keywords: cachedData.keywords,
                cached: true
            });
        }

        // If html missing but url provided, live-fetch minimal HTML snapshot
        let resolvedHtml: string | undefined = html;
        let resolvedStatus = typeof status_code === 'number' ? status_code : undefined;
        let resolvedFinalUrl = typeof final_url === 'string' ? final_url : url;
        if (!resolvedHtml && url) {
            try {
                const resp = await fetch(url, {
                    redirect: 'follow' as RequestRedirect,
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEO-Extractor/1.0)' }
                });
                resolvedStatus = resp.status;
                resolvedFinalUrl = resp.url || url;
                // Always read text body; Python service will parse/clean
                const raw = await resp.text();
                resolvedHtml = raw || '';
            } catch (e) {
                return res.status(502).json({ error: 'Failed to fetch URL HTML', details: (e as Error).message });
            }
        }

        // Validate we have non-empty HTML to avoid Python-side None errors
        if (!resolvedHtml || resolvedHtml.trim().length === 0) {
            return res.status(422).json({ error: 'No HTML content retrieved for the URL', hint: 'Ensure the URL returns HTML, or pass html explicitly.' });
        }

        const payload = {
            url: url || resolvedFinalUrl || '',
            final_url: resolvedFinalUrl || url || '',
            status_code: typeof resolvedStatus === 'number' ? resolvedStatus : 200,
            html: resolvedHtml || '',
            fetched_at: fetched_at || new Date().toISOString(),
        };

        const base = getPythonApiBase();
        const r = await fetch(`${base}/extract_html`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await r.json().catch(async () => ({ error: await r.text().catch(() => 'Unknown error') }));
        if (!r.ok) {
            return res.status(r.status).json({ error: 'Python extraction failed', details: data });
        }

        // Cache the result
        if (data && data.keywords) {
            await db.cacheSeoData(finalUrl, {
                parentText: data.parent?.text,
                keywords: data.keywords,
                language: data.language
            });
        }

        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: 'Extraction proxy error', details: (err as Error).message });
    }
});

// Cache management endpoints
router.get('/api/seo/cache/stats', async (req, res) => {
    try {
        const db = getDatabase();
        const stats = await db.getSeoCacheStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get cache stats', details: (err as Error).message });
    }
});

router.post('/api/seo/cache/clear-expired', async (req, res) => {
    try {
        const db = getDatabase();
        const deletedCount = await db.clearExpiredSeoCache();
        res.json({ message: `Cleared ${deletedCount} expired entries` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear expired cache', details: (err as Error).message });
    }
});

router.get('/api/seo/cache/:url', async (req, res) => {
    try {
        const { url } = req.params;
        const db = getDatabase();
        const cachedData = await db.getSeoData(url);
        
        if (!cachedData) {
            return res.status(404).json({ error: 'URL not found in cache' });
        }
        
        res.json({
            url,
            ...cachedData,
            cached: !cachedData.isExpired
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to get cached data', details: (err as Error).message });
    }
});

router.delete('/api/seo/cache/:url', async (req, res) => {
    try {
        const { url } = req.params;
        const db = getDatabase();
        
        // Use raw database access to delete specific URL
        const stmt = db.getDb().prepare('DELETE FROM seo_cache WHERE url = ?');
        const result = stmt.run(url);
        
        if (result.changes === 0) {
            return res.status(404).json({ error: 'URL not found in cache' });
        }
        
        res.json({ message: 'Cache entry deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete cache entry', details: (err as Error).message });
    }
});

export default router;


