import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './User.css';

export const UserProfile: React.FC = () => {
    const { user, usage, settings, updateProfile, logout } = useAuth();
    const [isEditing, setIsEditing] = useState(false);
    const [name, setName] = useState(user?.name || '');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (newPassword && newPassword !== confirmPassword) {
            setError('New passwords do not match');
            return;
        }

        setIsLoading(true);

        try {
            await updateProfile({
                name: name || undefined,
                currentPassword: currentPassword || undefined,
                newPassword: newPassword || undefined
            });
            setSuccess('Profile updated successfully!');
            setIsEditing(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            setError(err.message || 'Failed to update profile');
        } finally {
            setIsLoading(false);
        }
    };

    const getRoleBadgeClass = (role: string) => {
        switch (role) {
            case 'admin': return 'role-badge-admin';
            case 'premium': return 'role-badge-premium';
            default: return 'role-badge-user';
        }
    };

    const getRoleIcon = (role: string) => {
        switch (role) {
            case 'admin': return '👑';
            case 'premium': return '⭐';
            default: return '👤';
        }
    };

    if (!user) return null;

    return (
        <div className="user-profile-container">
            <div className="user-profile-card">
                {/* Header */}
                <div className="profile-header">
                    <div className="profile-avatar">
                        {getRoleIcon(user.role)}
                    </div>
                    <div>
                        <h2 className="profile-name">{user.name || 'User'}</h2>
                        <p className="profile-email">{user.email}</p>
                        <span className={`role-badge ${getRoleBadgeClass(user.role)}`}>
                            {user.role.toUpperCase()}
                        </span>
                    </div>
                </div>

                {/* Stats */}
                <div className="profile-stats">
                    <div className="stat-card">
                        <div className="stat-value">{usage?.totalCrawls || 0}</div>
                        <div className="stat-label">Total Crawls</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{usage?.totalAudits || 0}</div>
                        <div className="stat-label">Audits</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{usage?.totalAeoAnalyses || 0}</div>
                        <div className="stat-label">AEO Analyses</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value">{settings?.maxCrawlsPerDay || 10}</div>
                        <div className="stat-label">Daily Limit</div>
                    </div>
                </div>

                {/* Edit Form */}
                {isEditing ? (
                    <form onSubmit={handleSubmit} className="profile-form">
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

                        <div className="form-group">
                            <label className="form-label">Full Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="form-input"
                                placeholder="Your name"
                                disabled={isLoading}
                            />
                        </div>

                        <div className="form-divider">Change Password (optional)</div>

                        <div className="form-group">
                            <label className="form-label">Current Password</label>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="form-input"
                                placeholder="••••••••"
                                disabled={isLoading}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">New Password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="form-input"
                                placeholder="••••••••"
                                disabled={isLoading}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Confirm New Password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="form-input"
                                placeholder="••••••••"
                                disabled={isLoading}
                            />
                        </div>

                        <div className="form-actions">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEditing(false);
                                    setError('');
                                    setSuccess('');
                                }}
                                className="btn btn-secondary"
                                disabled={isLoading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={isLoading}
                            >
                                {isLoading ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="profile-actions">
                        <button
                            onClick={() => setIsEditing(true)}
                            className="btn btn-primary"
                        >
                            Edit Profile
                        </button>
                        <button
                            onClick={logout}
                            className="btn btn-danger"
                        >
                            Logout
                        </button>
                    </div>
                )}

                {/* Account Info */}
                <div className="account-info">
                    <div className="info-row">
                        <span className="info-label">Member Since:</span>
                        <span className="info-value">
                            {new Date(user.createdAt).toLocaleDateString()}
                        </span>
                    </div>
                    {user.lastLogin && (
                        <div className="info-row">
                            <span className="info-label">Last Login:</span>
                            <span className="info-value">
                                {new Date(user.lastLogin).toLocaleString()}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

