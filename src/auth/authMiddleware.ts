import { Request, Response, NextFunction } from 'express';
import { getAuthService } from './AuthService.js';
import { getDatabase } from '../database/DatabaseService.js';
import { Logger } from '../logging/Logger.js';

// Extend Express Request to include user information
declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: number;
                email: string;
                role: 'user' | 'admin' | 'premium';
            };
        }
    }
}

const authService = getAuthService();
const db = getDatabase();
const logger = Logger.getInstance();

/**
 * Middleware to authenticate requests using JWT tokens
 */
export const authenticateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        // Extract token from Authorization header or cookies
        let token: string | null = null;
        
        // Try Authorization header first
        const authHeader = req.headers.authorization;
        if (authHeader) {
            token = authService.extractTokenFromHeader(authHeader);
        }
        
        // Fallback to cookie
        if (!token && req.cookies?.accessToken) {
            token = req.cookies.accessToken;
        }

        if (!token) {
            res.status(401).json({ 
                error: 'Authentication required', 
                message: 'No access token provided' 
            });
            return;
        }

        // Verify token
        const payload = authService.verifyAccessToken(token);
        if (!payload) {
            res.status(401).json({ 
                error: 'Invalid token', 
                message: 'Access token is invalid or expired' 
            });
            return;
        }

        // Check if user still exists and is active
        const user = db.getUserById(payload.userId);
        if (!user) {
            res.status(401).json({ 
                error: 'User not found', 
                message: 'The user associated with this token no longer exists' 
            });
            return;
        }

        if (!user.isActive) {
            res.status(403).json({ 
                error: 'Account disabled', 
                message: 'Your account has been disabled' 
            });
            return;
        }

        // Attach user info to request
        req.user = {
            userId: user.id,
            email: user.email,
            role: user.role
        };

        next();
    } catch (error) {
        logger.error('Authentication middleware error', error as Error);
        res.status(500).json({ 
            error: 'Authentication failed', 
            message: 'An error occurred during authentication' 
        });
    }
};

/**
 * Middleware to check if user has admin role
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
        res.status(401).json({ 
            error: 'Authentication required', 
            message: 'You must be logged in to access this resource' 
        });
        return;
    }

    if (req.user.role !== 'admin') {
        res.status(403).json({ 
            error: 'Forbidden', 
            message: 'Admin access required' 
        });
        return;
    }

    next();
};

/**
 * Middleware to check if user has premium or admin role
 */
export const requirePremium = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
        res.status(401).json({ 
            error: 'Authentication required', 
            message: 'You must be logged in to access this resource' 
        });
        return;
    }

    if (req.user.role !== 'premium' && req.user.role !== 'admin') {
        res.status(403).json({ 
            error: 'Premium required', 
            message: 'This feature requires a premium subscription' 
        });
        return;
    }

    next();
};

/**
 * Middleware to check usage limits for the user
 */
export const checkUsageLimit = (actionType: string) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            if (!req.user) {
                res.status(401).json({ 
                    error: 'Authentication required' 
                });
                return;
            }

            const settings = db.getUserSettings(req.user.userId);
            if (!settings) {
                // Allow if no settings found (shouldn't happen)
                next();
                return;
            }

            const todayUsage = db.getTodayUsageCount(req.user.userId, actionType);
            
            // Admin has unlimited usage
            if (req.user.role === 'admin') {
                next();
                return;
            }

            // Premium users get 5x the limit
            const limit = req.user.role === 'premium' 
                ? settings.maxCrawlsPerDay * 5 
                : settings.maxCrawlsPerDay;

            if (todayUsage >= limit) {
                res.status(429).json({ 
                    error: 'Usage limit exceeded', 
                    message: `You have reached your daily limit of ${limit} ${actionType}s. Please upgrade or try again tomorrow.`,
                    limit,
                    usage: todayUsage
                });
                return;
            }

            next();
        } catch (error) {
            logger.error('Usage limit check error', error as Error);
            next(); // Allow request to proceed on error
        }
    };
};

/**
 * Optional authentication - attaches user if token is valid, but doesn't require it
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        let token: string | null = null;
        
        const authHeader = req.headers.authorization;
        if (authHeader) {
            token = authService.extractTokenFromHeader(authHeader);
        }
        
        if (!token && req.cookies?.accessToken) {
            token = req.cookies.accessToken;
        }

        if (token) {
            const payload = authService.verifyAccessToken(token);
            if (payload) {
                const user = db.getUserById(payload.userId);
                if (user && user.isActive) {
                    req.user = {
                        userId: user.id,
                        email: user.email,
                        role: user.role
                    };
                }
            }
        }

        next();
    } catch (error) {
        // Silently fail and continue without authentication
        next();
    }
};

