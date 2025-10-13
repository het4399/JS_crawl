import express from 'express';

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
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: 'Extraction proxy error', details: (err as Error).message });
    }
});

export default router;


