import express from 'express';
import { Logger } from '../logging/Logger.js';
import { authenticateUser, checkUsageLimit } from '../auth/authMiddleware.js';

const router = express.Router();
const logger = Logger.getInstance();

// AEO API base URL - should match the aeo-api service
const AEO_API_BASE_URL = process.env.AEO_API_BASE_URL || 'http://localhost:8000';

// Proxy AEO analysis requests to FastAPI
router.post('/analyze', 
    authenticateUser,
    checkUsageLimit('aeo_analysis'),
    async (req, res) => {
    try {
        const userId = req.user!.userId;
        const db = await import('../database/DatabaseService.js').then(m => m.getDatabase());
        
        logger.info('Proxying AEO analysis request to FastAPI', { userId });
        
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
        
        // Track user usage
        try {
            db.recordUserUsage(userId, 'aeo_analysis', 1);
        } catch (error) {
            logger.error('Failed to track AEO usage', error as Error);
        }
        
        // Save AEO analysis results to database
        if (data.success && data.results) {
            try {
                const result = data.results;
                const url = req.body.url;
                
                // Try to find associated session
                const latestSession = db.getLatestSessionByUrl(url, userId);
                
                db.saveAeoAnalysisResult({
                    sessionId: latestSession?.id,
                    url: url,
                    userId: userId,
                    grade: result.grade || 'N/A',
                    gradeColor: result.grade_color || '#666666',
                    overallScore: result.overall_score || 0,
                    moduleScores: result.module_scores,
                    moduleWeights: result.module_weights,
                    detailedAnalysis: result.detailed_analysis,
                    structuredData: result.structured_data,
                    recommendations: result.all_recommendations || result.recommendations,
                    errors: result.errors,
                    warnings: result.warnings,
                    analysisTimestamp: result.analysis_timestamp || new Date().toISOString(),
                    runId: result.run_id
                });
                
                logger.info('AEO analysis results saved to database', { userId, url });
            } catch (error) {
                logger.error('Failed to save AEO analysis results', error as Error);
            }
        }
        
        logger.info('AEO analysis completed successfully', { userId });
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
