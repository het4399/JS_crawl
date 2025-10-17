import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../database/DatabaseService.js';

export interface JWTPayload {
    userId: number;
    email: string;
    role: 'user' | 'admin' | 'premium';
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}

export class AuthService {
    private readonly JWT_SECRET: string;
    private readonly JWT_REFRESH_SECRET: string;
    private readonly SALT_ROUNDS = 10;
    private readonly ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
    private readonly REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

    constructor() {
        // In production, these should be in environment variables
        this.JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        this.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production';

        if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
            console.warn('⚠️  WARNING: Using default JWT secrets. Set JWT_SECRET and JWT_REFRESH_SECRET in production!');
        }
    }

    /**
     * Hash a password using bcrypt
     */
    async hashPassword(password: string): Promise<string> {
        return await bcrypt.hash(password, this.SALT_ROUNDS);
    }

    /**
     * Verify a password against a hash
     */
    async verifyPassword(password: string, hash: string): Promise<boolean> {
        return await bcrypt.compare(password, hash);
    }

    /**
     * Generate access and refresh tokens for a user
     */
    generateTokens(user: Pick<User, 'id' | 'email' | 'role'>): TokenPair {
        const payload: JWTPayload = {
            userId: user.id,
            email: user.email,
            role: user.role
        };

        const accessToken = jwt.sign(payload, this.JWT_SECRET, {
            expiresIn: this.ACCESS_TOKEN_EXPIRY
        });

        const refreshToken = jwt.sign(payload, this.JWT_REFRESH_SECRET, {
            expiresIn: this.REFRESH_TOKEN_EXPIRY
        });

        return { accessToken, refreshToken };
    }

    /**
     * Verify an access token
     */
    verifyAccessToken(token: string): JWTPayload | null {
        try {
            const decoded = jwt.verify(token, this.JWT_SECRET) as JWTPayload;
            return decoded;
        } catch (error) {
            return null;
        }
    }

    /**
     * Verify a refresh token
     */
    verifyRefreshToken(token: string): JWTPayload | null {
        try {
            const decoded = jwt.verify(token, this.JWT_REFRESH_SECRET) as JWTPayload;
            return decoded;
        } catch (error) {
            return null;
        }
    }

    /**
     * Validate email format
     */
    isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validate password strength
     */
    isValidPassword(password: string): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (password.length < 8) {
            errors.push('Password must be at least 8 characters long');
        }

        if (!/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        }

        if (!/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        }

        if (!/[0-9]/.test(password)) {
            errors.push('Password must contain at least one number');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Extract token from Authorization header
     */
    extractTokenFromHeader(authHeader: string | undefined): string | null {
        if (!authHeader) return null;
        
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return null;
        }
        
        return parts[1];
    }
}

// Singleton instance
let authServiceInstance: AuthService | null = null;

export function getAuthService(): AuthService {
    if (!authServiceInstance) {
        authServiceInstance = new AuthService();
    }
    return authServiceInstance;
}

