import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './Auth.css';

interface RegisterProps {
    onSwitchToLogin?: () => void;
    onSuccess?: () => void;
}

export const Register: React.FC<RegisterProps> = ({ onSwitchToLogin, onSuccess }) => {
    const { register } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const validatePassword = (pwd: string): string[] => {
        const errors: string[] = [];
        if (pwd.length < 8) errors.push('at least 8 characters');
        if (!/[A-Z]/.test(pwd)) errors.push('one uppercase letter');
        if (!/[a-z]/.test(pwd)) errors.push('one lowercase letter');
        if (!/[0-9]/.test(pwd)) errors.push('one number');
        return errors;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Validate passwords match
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        // Validate password strength
        const passwordErrors = validatePassword(password);
        if (passwordErrors.length > 0) {
            setError(`Password must contain ${passwordErrors.join(', ')}`);
            return;
        }

        setIsLoading(true);

        try {
            await register(email, password, name || undefined);
            onSuccess?.();
        } catch (err: any) {
            setError(err.message || 'Registration failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h2 className="auth-title">Create Account</h2>
                    <p className="auth-subtitle">Start optimizing your content for AI search engines</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && (
                        <div className="auth-error">
                            <span className="error-icon">⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="form-group">
                        <label htmlFor="name" className="form-label">
                            Full Name <span className="optional-label">(optional)</span>
                        </label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="John Doe"
                            className="form-input"
                            autoComplete="name"
                            disabled={isLoading}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="email" className="form-label">
                            Email Address
                        </label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="form-input"
                            required
                            autoComplete="email"
                            disabled={isLoading}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password" className="form-label">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className="form-input"
                            required
                            autoComplete="new-password"
                            disabled={isLoading}
                        />
                        <p className="form-hint">
                            Must be at least 8 characters with uppercase, lowercase, and number
                        </p>
                    </div>

                    <div className="form-group">
                        <label htmlFor="confirmPassword" className="form-label">
                            Confirm Password
                        </label>
                        <input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            className="form-input"
                            required
                            autoComplete="new-password"
                            disabled={isLoading}
                        />
                    </div>

                    <button
                        type="submit"
                        className="auth-button"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <div className="spinner" />
                                <span>Creating account...</span>
                            </>
                        ) : (
                            'Create Account'
                        )}
                    </button>
                </form>

                {onSwitchToLogin && (
                    <div className="auth-footer">
                        <p className="auth-footer-text">
                            Already have an account?{' '}
                            <button
                                type="button"
                                onClick={onSwitchToLogin}
                                className="auth-link"
                                disabled={isLoading}
                            >
                                Sign In
                            </button>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

