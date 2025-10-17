import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './Auth.css';

interface LoginProps {
    onSwitchToRegister?: () => void;
    onSuccess?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onSwitchToRegister, onSuccess }) => {
    const { login } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await login(email, password);
            onSuccess?.();
        } catch (err: any) {
            setError(err.message || 'Login failed. Please check your credentials.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h2 className="auth-title">Welcome Back</h2>
                    <p className="auth-subtitle">Sign in to your Contentlytics account</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && (
                        <div className="auth-error">
                            <span className="error-icon">⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

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
                            autoComplete="current-password"
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
                                <span>Signing in...</span>
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                {onSwitchToRegister && (
                    <div className="auth-footer">
                        <p className="auth-footer-text">
                            Don't have an account?{' '}
                            <button
                                type="button"
                                onClick={onSwitchToRegister}
                                className="auth-link"
                                disabled={isLoading}
                            >
                                Create Account
                            </button>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

