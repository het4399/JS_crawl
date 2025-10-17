import express, { Request, Response } from 'express';
import { getAuthService } from '../auth/AuthService.js';
import { getDatabase } from '../database/DatabaseService.js';
import { authenticateUser } from '../auth/authMiddleware.js';
import { Logger } from '../logging/Logger.js';

const router = express.Router();
const authService = getAuthService();
const db = getDatabase();
const logger = Logger.getInstance();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { email, password, name } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Missing required fields', 
                message: 'Email and password are required' 
            });
        }

        // Validate email format
        if (!authService.isValidEmail(email)) {
            return res.status(400).json({ 
                error: 'Invalid email', 
                message: 'Please provide a valid email address' 
            });
        }

        // Validate password strength
        const passwordValidation = authService.isValidPassword(password);
        if (!passwordValidation.valid) {
            return res.status(400).json({ 
                error: 'Weak password', 
                message: 'Password does not meet requirements',
                errors: passwordValidation.errors 
            });
        }

        // Check if user already exists
        const existingUser = db.getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({ 
                error: 'User exists', 
                message: 'A user with this email already exists' 
            });
        }

        // Hash password
        const passwordHash = await authService.hashPassword(password);

        // Create user
        const userId = db.createUser({
            email,
            passwordHash,
            name: name || null,
            isActive: true,
            role: 'user'
        });

        // Generate tokens
        const tokens = authService.generateTokens({
            id: userId,
            email,
            role: 'user'
        });

        // Set refresh token as HTTP-only cookie
        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        logger.info('User registered successfully', { userId, email });

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: userId,
                email,
                name: name || null,
                role: 'user'
            },
            accessToken: tokens.accessToken
        });
    } catch (error) {
        logger.error('Registration error', error as Error);
        res.status(500).json({ 
            error: 'Registration failed', 
            message: 'An error occurred during registration' 
        });
    }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ 
                error: 'Missing credentials', 
                message: 'Email and password are required' 
            });
        }

        // Find user
        const user = db.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({ 
                error: 'Invalid credentials', 
                message: 'Email or password is incorrect' 
            });
        }

        // Check if user is active
        if (!user.isActive) {
            return res.status(403).json({ 
                error: 'Account disabled', 
                message: 'Your account has been disabled. Please contact support.' 
            });
        }

        // Verify password
        const isPasswordValid = await authService.verifyPassword(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({ 
                error: 'Invalid credentials', 
                message: 'Email or password is incorrect' 
            });
        }

        // Update last login
        db.updateUserLastLogin(user.id);

        // Generate tokens
        const tokens = authService.generateTokens({
            id: user.id,
            email: user.email,
            role: user.role
        });

        // Set refresh token as HTTP-only cookie
        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        logger.info('User logged in successfully', { userId: user.id, email: user.email });

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                lastLogin: user.lastLogin
            },
            accessToken: tokens.accessToken
        });
    } catch (error) {
        logger.error('Login error', error as Error);
        res.status(500).json({ 
            error: 'Login failed', 
            message: 'An error occurred during login' 
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout user by clearing refresh token cookie
 */
router.post('/logout', authenticateUser, (req: Request, res: Response) => {
    try {
        // Clear refresh token cookie
        res.clearCookie('refreshToken');

        logger.info('User logged out', { userId: req.user?.userId });

        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        logger.error('Logout error', error as Error);
        res.status(500).json({ 
            error: 'Logout failed', 
            message: 'An error occurred during logout' 
        });
    }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', (req: Request, res: Response) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({ 
                error: 'No refresh token', 
                message: 'Refresh token not found' 
            });
        }

        // Verify refresh token
        const payload = authService.verifyRefreshToken(refreshToken);
        if (!payload) {
            res.clearCookie('refreshToken');
            return res.status(401).json({ 
                error: 'Invalid refresh token', 
                message: 'Refresh token is invalid or expired' 
            });
        }

        // Check if user still exists and is active
        const user = db.getUserById(payload.userId);
        if (!user || !user.isActive) {
            res.clearCookie('refreshToken');
            return res.status(401).json({ 
                error: 'User not found', 
                message: 'User no longer exists or is disabled' 
            });
        }

        // Generate new tokens
        const tokens = authService.generateTokens({
            id: user.id,
            email: user.email,
            role: user.role
        });

        // Update refresh token cookie
        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({
            success: true,
            accessToken: tokens.accessToken
        });
    } catch (error) {
        logger.error('Token refresh error', error as Error);
        res.status(500).json({ 
            error: 'Token refresh failed', 
            message: 'An error occurred while refreshing token' 
        });
    }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticateUser, (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const user = db.getUserById(req.user.userId);
        if (!user) {
            return res.status(404).json({ 
                error: 'User not found', 
                message: 'User profile not found' 
            });
        }

        const settings = db.getUserSettings(user.id);
        const usageStats = db.getUserUsageStats(user.id);

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin,
                isActive: user.isActive
            },
            settings: settings ? {
                maxCrawlsPerDay: settings.maxCrawlsPerDay,
                emailNotifications: settings.emailNotifications,
                hasOpenaiApiKey: !!settings.openaiApiKey,
                hasPsiApiKey: !!settings.psiApiKey
            } : null,
            usage: usageStats
        });
    } catch (error) {
        logger.error('Get profile error', error as Error);
        res.status(500).json({ 
            error: 'Failed to get profile', 
            message: 'An error occurred while fetching profile' 
        });
    }
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authenticateUser, async (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { name, currentPassword, newPassword } = req.body;
        const userId = req.user.userId;

        // Update name if provided
        if (name !== undefined) {
            db.updateUser(userId, { name });
        }

        // Update password if provided
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({ 
                    error: 'Current password required', 
                    message: 'Please provide your current password to change it' 
                });
            }

            // Verify current password
            const user = db.getUserById(userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const isPasswordValid = await authService.verifyPassword(currentPassword, user.passwordHash);
            if (!isPasswordValid) {
                return res.status(401).json({ 
                    error: 'Invalid password', 
                    message: 'Current password is incorrect' 
                });
            }

            // Validate new password
            const passwordValidation = authService.isValidPassword(newPassword);
            if (!passwordValidation.valid) {
                return res.status(400).json({ 
                    error: 'Weak password', 
                    message: 'New password does not meet requirements',
                    errors: passwordValidation.errors 
                });
            }

            // Hash and update password
            const newPasswordHash = await authService.hashPassword(newPassword);
            db.updateUser(userId, { passwordHash: newPasswordHash });
        }

        logger.info('User profile updated', { userId });

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        logger.error('Update profile error', error as Error);
        res.status(500).json({ 
            error: 'Failed to update profile', 
            message: 'An error occurred while updating profile' 
        });
    }
});

/**
 * GET /api/auth/usage
 * Get user usage statistics
 */
router.get('/usage', authenticateUser, (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { since } = req.query;
        const sinceDate = since ? String(since) : undefined;

        const stats = db.getUserUsageStats(req.user.userId, sinceDate);
        const history = db.getUserUsage(req.user.userId, undefined, 50);
        const settings = db.getUserSettings(req.user.userId);

        const todayCrawls = db.getTodayUsageCount(req.user.userId, 'crawl');
        const todayAudits = db.getTodayUsageCount(req.user.userId, 'audit');

        res.json({
            success: true,
            stats,
            history,
            today: {
                crawls: todayCrawls,
                audits: todayAudits,
                limit: settings?.maxCrawlsPerDay || 10
            }
        });
    } catch (error) {
        logger.error('Get usage error', error as Error);
        res.status(500).json({ 
            error: 'Failed to get usage', 
            message: 'An error occurred while fetching usage statistics' 
        });
    }
});

/**
 * PUT /api/auth/settings
 * Update user settings
 */
router.put('/settings', authenticateUser, (req: Request, res: Response) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { openaiApiKey, psiApiKey, maxCrawlsPerDay, emailNotifications } = req.body;
        const userId = req.user.userId;

        const updates: any = {};
        if (openaiApiKey !== undefined) updates.openaiApiKey = openaiApiKey;
        if (psiApiKey !== undefined) updates.psiApiKey = psiApiKey;
        if (maxCrawlsPerDay !== undefined) updates.maxCrawlsPerDay = maxCrawlsPerDay;
        if (emailNotifications !== undefined) updates.emailNotifications = emailNotifications;

        db.updateUserSettings(userId, updates);

        logger.info('User settings updated', { userId });

        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    } catch (error) {
        logger.error('Update settings error', error as Error);
        res.status(500).json({ 
            error: 'Failed to update settings', 
            message: 'An error occurred while updating settings' 
        });
    }
});

export default router;

