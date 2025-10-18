import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './User.css';

export const UserSettings: React.FC = () => {
    const { settings: userSettings, updateSettings } = useAuth();
    const [emailNotifications, setEmailNotifications] = useState(userSettings?.emailNotifications || false);
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    if (!userSettings) return null;

    const handleToggleNotifications = async () => {
        setIsLoading(true);
        setError('');
        setSuccess('');
        
        try {
            const newValue = !emailNotifications;
            await updateSettings({ emailNotifications: newValue });
            setEmailNotifications(newValue);
            setSuccess('Email notification settings updated!');
        } catch (err: any) {
            setError(err.message || 'Failed to update settings');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="user-settings-container">
            <div className="settings-card">
                <div className="settings-header">
                    <h2 className="settings-title">⚙️ Settings</h2>
                    <p className="settings-subtitle">
                        Manage your account preferences
                    </p>
                </div>

                <div className="settings-form">
                    {success && (
                        <div className="alert alert-success">
                            <span className="success-icon">✓</span>
                            <span>{success}</span>
                        </div>
                    )}
                    
                    {error && (
                        <div className="alert alert-error">
                            <span className="error-icon">⚠️</span>
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Email Notifications */}
                    <div className="settings-section">
                        <h3 className="section-title">Email Notifications</h3>
                        <p className="section-description">
                            Receive email updates when your crawls start and complete
                        </p>
                        <div className="notification-toggle">
                            <label className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={emailNotifications}
                                    onChange={handleToggleNotifications}
                                    disabled={isLoading}
                                />
                                <span className="toggle-slider"></span>
                            </label>
                            <span className="toggle-label">
                                {emailNotifications ? '📧 Enabled' : '🔕 Disabled'}
                            </span>
                        </div>
                        <p className="section-hint">
                            ℹ️ You'll receive emails when crawls start, complete, or fail
                        </p>
                    </div>

                    {/* Account Limits */}
                    <div className="settings-section">
                        <h3 className="section-title">Account Limits</h3>
                        <div className="limit-info">
                            <div className="limit-row">
                                <span className="limit-label">Daily Crawl Limit:</span>
                                <span className="limit-value">{userSettings.maxCrawlsPerDay} crawls/day</span>
                            </div>
                        </div>
                        <p className="section-hint">
                            💡 Upgrade to Premium for 5x higher limits and priority support
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
