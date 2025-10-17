import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './User.css';

export const UserSettings: React.FC = () => {
    const { settings: userSettings, updateSettings } = useAuth();
    const [openaiApiKey, setOpenaiApiKey] = useState('');
    const [psiApiKey, setPsiApiKey] = useState('');
    const [showOpenaiKey, setShowOpenaiKey] = useState(false);
    const [showPsiKey, setShowPsiKey] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setIsLoading(true);

        try {
            await updateSettings({
                // Only send keys if they were entered
                ...(openaiApiKey && { openaiApiKey }),
                ...(psiApiKey && { psiApiKey })
            });
            setSuccess('API keys updated successfully!');
            setOpenaiApiKey('');
            setPsiApiKey('');
        } catch (err: any) {
            setError(err.message || 'Failed to update settings');
        } finally {
            setIsLoading(false);
        }
    };

    if (!userSettings) return null;

    return (
        <div className="user-settings-container">
            <div className="settings-card">
                <div className="settings-header">
                    <h2 className="settings-title">⚙️ Settings</h2>
                    <p className="settings-subtitle">
                        Configure your API keys and preferences
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="settings-form">
                    {error && (
                        <div className="alert alert-error">
                            <span className="error-icon">⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="alert alert-success">
                            <span className="success-icon">✓</span>
                            <span>{success}</span>
                        </div>
                    )}

                    {/* API Keys Section */}
                    <div className="settings-section">
                        <h3 className="section-title">API Keys</h3>
                        <p className="section-description">
                            Use your own API keys for AI analysis and performance audits
                        </p>

                        {/* OpenAI API Key */}
                        <div className="form-group">
                            <label className="form-label">
                                OpenAI API Key
                                {userSettings.hasOpenaiApiKey && (
                                    <span className="badge badge-success">✓ Configured</span>
                                )}
                            </label>
                            <div className="input-with-toggle">
                                <input
                                    type={showOpenaiKey ? 'text' : 'password'}
                                    value={openaiApiKey}
                                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                                    className="form-input"
                                    placeholder={
                                        userSettings.hasOpenaiApiKey
                                            ? '••••••••••••••••••••••••'
                                            : 'sk-...'
                                    }
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                                    className="toggle-visibility-btn"
                                    disabled={isLoading}
                                >
                                    {showOpenaiKey ? '👁️' : '🔒'}
                                </button>
                            </div>
                            <p className="form-hint">
                                Get your API key from{' '}
                                <a
                                    href="https://platform.openai.com/api-keys"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="link"
                                >
                                    OpenAI Platform
                                </a>
                            </p>
                        </div>

                        {/* PSI API Key */}
                        <div className="form-group">
                            <label className="form-label">
                                PageSpeed Insights API Key
                                {userSettings.hasPsiApiKey && (
                                    <span className="badge badge-success">✓ Configured</span>
                                )}
                            </label>
                            <div className="input-with-toggle">
                                <input
                                    type={showPsiKey ? 'text' : 'password'}
                                    value={psiApiKey}
                                    onChange={(e) => setPsiApiKey(e.target.value)}
                                    className="form-input"
                                    placeholder={
                                        userSettings.hasPsiApiKey
                                            ? '••••••••••••••••••••••••'
                                            : 'AIza...'
                                    }
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPsiKey(!showPsiKey)}
                                    className="toggle-visibility-btn"
                                    disabled={isLoading}
                                >
                                    {showPsiKey ? '👁️' : '🔒'}
                                </button>
                            </div>
                            <p className="form-hint">
                                Get your API key from{' '}
                                <a
                                    href="https://developers.google.com/speed/docs/insights/v5/get-started"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="link"
                                >
                                    Google Cloud Console
                                </a>
                            </p>
                        </div>
                    </div>

                    {/* Account Limits */}
                    <div className="settings-section">
                        <h3 className="section-title">Account Limits</h3>
                        <div className="limit-info">
                            <div className="limit-row">
                                <span className="limit-label">Daily Crawl Limit:</span>
                                <span className="limit-value">{userSettings.maxCrawlsPerDay} crawls/day</span>
                            </div>
                            <div className="limit-row">
                                <span className="limit-label">Email Notifications:</span>
                                <span className="limit-value">
                                    {userSettings.emailNotifications ? 'Enabled' : 'Disabled'}
                                </span>
                            </div>
                        </div>
                        <p className="section-hint">
                            💡 Upgrade to Premium for 5x higher limits and priority support
                        </p>
                    </div>

                    <div className="form-actions">
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={isLoading || (!openaiApiKey && !psiApiKey)}
                        >
                            {isLoading ? 'Saving...' : 'Save API Keys'}
                        </button>
                    </div>
                </form>

                {/* Security Notice */}
                <div className="security-notice">
                    <span className="security-icon">🔒</span>
                    <div>
                        <strong>Security:</strong> Your API keys are encrypted and securely stored.
                        They are only used for your analysis requests and never shared.
                    </div>
                </div>
            </div>
        </div>
    );
};

