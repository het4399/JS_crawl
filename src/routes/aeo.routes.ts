import express from 'express';
import { Logger } from '../logging/Logger.js';

const router = express.Router();
const logger = Logger.getInstance();

// AEO API base URL - should match the aeo-api service
const AEO_API_BASE_URL = process.env.AEO_API_BASE_URL || 'http://localhost:8000';

// Proxy AEO analysis requests to FastAPI
router.post('/analyze', async (req, res) => {
    try {
        logger.info('Proxying AEO analysis request to FastAPI');
        
        const response = await fetch(`${AEO_API_BASE_URL}/api/aeo/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`FastAPI AEO analysis failed: ${response.status} - ${errorText}`);
            return res.status(response.status).json({ 
                error: 'AEO analysis failed', 
                details: errorText 
            });
        }

        const data = await response.json();
        logger.info('AEO analysis completed successfully');
        res.json(data);
    } catch (error) {
        logger.error('AEO analysis proxy error:', error);
        res.status(500).json({ 
            error: 'AEO analysis service unavailable', 
            details: (error as Error).message 
        });
    }
});

// Proxy AEO health check requests to FastAPI
router.get('/health', async (req, res) => {
    try {
        logger.info('Proxying AEO health check to FastAPI');
        
        const response = await fetch(`${AEO_API_BASE_URL}/api/aeo/health`);

        if (!response.ok) {
            logger.error(`FastAPI AEO health check failed: ${response.status}`);
            return res.status(response.status).json({ 
                error: 'AEO service unhealthy', 
                status: 'unhealthy' 
            });
        }

        const data = await response.json();
        logger.info('AEO health check completed');
        res.json(data);
    } catch (error) {
        logger.error('AEO health check proxy error:', error);
        res.status(500).json({ 
            error: 'AEO service unavailable', 
            status: 'unhealthy',
            details: (error as Error).message 
        });
    }
});

export default router;
