import express from 'express';
import { getDatabase } from '../database/DatabaseService.js';
import { authenticateUser } from '../auth/authMiddleware.js';

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

router.post('/api/seo/extract', authenticateUser, async (req, res) => {
    try {
        const { url, final_url } = req.body ?? {};
        
        const finalUrl = url || final_url;
        if (!finalUrl) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Only return cached data - no fetching or processing
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

        // No cached data available
        return res.status(404).json({ 
            error: 'No cached data available for this URL',
            url: finalUrl,
            hint: 'This endpoint only serves cached data. Process the URL first to generate keywords.'
        });
    } catch (err) {
        return res.status(500).json({ error: 'Cache retrieval error', details: (err as Error).message });
    }
});

export default router;


