import express from 'express';
import { AuditScheduler } from '../audits/AuditScheduler.js';
import { Logger } from '../logging/Logger.js';
import { authenticateUser } from '../auth/authMiddleware.js';

const router = express.Router();
const logger = Logger.getInstance();

// Initialize audit scheduler
const auditScheduler = new AuditScheduler();

// Start the audit scheduler when the module loads
auditScheduler.start();

// Get all audit schedules
router.get('/schedules', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const allSchedules = auditScheduler.getAllSchedules();
        
        // Filter by user (admins can see all)
        const schedules = req.user!.role === 'admin'
            ? allSchedules
            : allSchedules.filter((s: any) => s.userId === userId);
        
        res.json(schedules);
    } catch (error) {
        logger.error('Error fetching audit schedules', error as Error);
        res.status(500).json({ error: 'Failed to fetch audit schedules' });
    }
});

// Get a specific audit schedule
router.get('/schedules/:id', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const id = parseInt(req.params.id);
        const schedule = auditScheduler.getSchedule(id) as any;
        
        if (!schedule) {
            return res.status(404).json({ error: 'Audit schedule not found' });
        }
        
        // Check ownership (admins can view all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        res.json(schedule);
    } catch (error) {
        logger.error('Error fetching audit schedule', error as Error);
        res.status(500).json({ error: 'Failed to fetch audit schedule' });
    }
});

// Create a new audit schedule
router.post('/schedules', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const { name, description, urls, device, cronExpression, enabled = true } = req.body;
        
        // Validate required fields
        if (!name || !description || !urls || !Array.isArray(urls) || urls.length === 0 || !device || !cronExpression) {
            return res.status(400).json({ 
                error: 'Missing required fields: name, description, urls (array), device, cronExpression' 
            });
        }
        
        // Validate device
        if (!['mobile', 'desktop'].includes(device)) {
            return res.status(400).json({ error: 'Device must be either "mobile" or "desktop"' });
        }
        
        // Validate URLs
        const urlPattern = /^https?:\/\/.+/;
        for (const url of urls) {
            if (!urlPattern.test(url)) {
                return res.status(400).json({ error: `Invalid URL format: ${url}` });
            }
        }
        
        const scheduleId = auditScheduler.createSchedule({
            name,
            description,
            urls,
            device,
            cronExpression,
            enabled,
            userId
        });
        
        res.status(201).json({ 
            id: scheduleId, 
            message: 'Audit schedule created successfully' 
        });
    } catch (error) {
        logger.error('Error creating audit schedule', error as Error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// Update an audit schedule
router.put('/schedules/:id', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const id = parseInt(req.params.id);
        const schedule = auditScheduler.getSchedule(id) as any;
        
        if (!schedule) {
            return res.status(404).json({ error: 'Audit schedule not found' });
        }
        
        // Check ownership (admins can update all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        const updates = req.body;
        
        // Validate device if provided
        if (updates.device && !['mobile', 'desktop'].includes(updates.device)) {
            return res.status(400).json({ error: 'Device must be either "mobile" or "desktop"' });
        }
        
        // Validate URLs if provided
        if (updates.urls && Array.isArray(updates.urls)) {
            const urlPattern = /^https?:\/\/.+/;
            for (const url of updates.urls) {
                if (!urlPattern.test(url)) {
                    return res.status(400).json({ error: `Invalid URL format: ${url}` });
                }
            }
        }
        
        auditScheduler.updateSchedule(id, updates);
        res.json({ message: 'Audit schedule updated successfully' });
    } catch (error) {
        logger.error('Error updating audit schedule', error as Error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// Delete an audit schedule
router.delete('/schedules/:id', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const id = parseInt(req.params.id);
        const schedule = auditScheduler.getSchedule(id) as any;
        
        if (!schedule) {
            return res.status(404).json({ error: 'Audit schedule not found' });
        }
        
        // Check ownership (admins can delete all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        auditScheduler.deleteSchedule(id);
        res.json({ message: 'Audit schedule deleted successfully' });
    } catch (error) {
        logger.error('Error deleting audit schedule', error as Error);
        res.status(500).json({ error: 'Failed to delete audit schedule' });
    }
});

// Toggle audit schedule enabled/disabled
router.patch('/schedules/:id/toggle', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const id = parseInt(req.params.id);
        const schedule = auditScheduler.getSchedule(id) as any;
        
        if (!schedule) {
            return res.status(404).json({ error: 'Audit schedule not found' });
        }
        
        // Check ownership (admins can toggle all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        auditScheduler.toggleSchedule(id);
        res.json({ message: 'Audit schedule toggled successfully' });
    } catch (error) {
        logger.error('Error toggling audit schedule', error as Error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// Manually trigger an audit schedule
router.post('/schedules/:id/trigger', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const id = parseInt(req.params.id);
        const schedule = auditScheduler.getSchedule(id) as any;
        
        if (!schedule) {
            return res.status(404).json({ error: 'Audit schedule not found' });
        }
        
        // Check ownership (admins can trigger all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }
        
        await auditScheduler.triggerSchedule(id);
        res.json({ message: 'Audit schedule triggered successfully' });
    } catch (error) {
        logger.error('Error triggering audit schedule', error as Error);
        res.status(500).json({ error: (error as Error).message });
    }
});

// Get execution history for a schedule
router.get('/schedules/:id/executions', authenticateUser, (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const limit = parseInt(req.query.limit as string) || 50;
        const executions = auditScheduler.getExecutionHistory(id, limit);
        res.json(executions);
    } catch (error) {
        logger.error('Error fetching audit executions', error as Error);
        res.status(500).json({ error: 'Failed to fetch audit executions' });
    }
});

// Get all audit executions
router.get('/executions', authenticateUser, (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 100;
        const executions = auditScheduler.getAllExecutions(limit);
        res.json(executions);
    } catch (error) {
        logger.error('Error fetching all audit executions', error as Error);
        res.status(500).json({ error: 'Failed to fetch audit executions' });
    }
});

// Get audit scheduler status
router.get('/status', authenticateUser, (req, res) => {
    try {
        const status = auditScheduler.getStatus();
        res.json(status);
    } catch (error) {
        logger.error('Error fetching audit scheduler status', error as Error);
        res.status(500).json({ error: 'Failed to fetch audit scheduler status' });
    }
});

// Start audit scheduler
router.post('/start', authenticateUser, (req, res) => {
    try {
        auditScheduler.start();
        res.json({ message: 'Audit scheduler started successfully' });
    } catch (error) {
        logger.error('Error starting audit scheduler', error as Error);
        res.status(500).json({ error: 'Failed to start audit scheduler' });
    }
});

// Stop audit scheduler
router.post('/stop', authenticateUser, (req, res) => {
    try {
        auditScheduler.stop();
        res.json({ message: 'Audit scheduler stopped successfully' });
    } catch (error) {
        logger.error('Error stopping audit scheduler', error as Error);
        res.status(500).json({ error: 'Failed to stop audit scheduler' });
    }
});

export default router;
