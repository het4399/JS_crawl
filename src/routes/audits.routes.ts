import { Router } from 'express';
import { listRecent, getById } from '../audits/reader.js';
import auditSchedulerRoutes from './audit.routes.js';
import { authenticateUser } from '../auth/authMiddleware.js';

export const auditsRoutes = Router();

auditsRoutes.get('/audits', authenticateUser, (req, res) => {
    try {
        const device = (req.query.device as string) || 'all';
        const limit = Math.min(500, Number(req.query.limit) || 100);
        const items = listRecent(device === 'mobile' || device === 'desktop' ? (device as any) : 'all', limit);
        res.json({ items });
    } catch (e) {
        res.status(500).json({ error: 'Failed to list audits' });
    }
});

auditsRoutes.get('/audits/:id', authenticateUser, (req, res) => {
    try {
        const id = req.params.id;
        const data = getById(id);
        if (!data) return res.status(404).json({ error: 'Not found' });
        res.json({ data });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load audit' });
    }
});

// Add audit scheduler routes
auditsRoutes.use('/audit-schedules', auditSchedulerRoutes);

