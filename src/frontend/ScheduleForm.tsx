import React, { useState, useEffect } from 'react';
import './ScheduleForm.css';

interface Schedule {
    id: number;
    name: string;
    description: string;
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    mode: string;
    cronExpression: string;
    enabled: boolean;
}

interface ScheduleFormProps {
    schedule?: Schedule | null;
    onClose: () => void;
}

const ScheduleForm: React.FC<ScheduleFormProps> = ({ schedule, onClose }) => {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        startUrl: '',
        allowSubdomains: false,
        maxConcurrency: 5,
        mode: 'html',
        cronExpression: '0 9 * * *',
        enabled: true
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cronValidation, setCronValidation] = useState<{
        isValid: boolean;
        error?: string;
        description?: string;
    } | null>(null);

    useEffect(() => {
        if (schedule) {
            setFormData({
                name: schedule.name,
                description: schedule.description,
                startUrl: schedule.startUrl,
                allowSubdomains: schedule.allowSubdomains,
                maxConcurrency: schedule.maxConcurrency,
                mode: schedule.mode,
                cronExpression: schedule.cronExpression,
                enabled: schedule.enabled
            });
        }
    }, [schedule]);

    const validateCron = async (cronExpression: string) => {
        try {
            const response = await fetch('/api/scheduler/validate-cron', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ cronExpression })
            });
            
            if (!response.ok) {
                throw new Error('Failed to validate cron expression');
            }
            
            const data = await response.json();
            setCronValidation(data.validation);
        } catch (err) {
            setCronValidation({
                isValid: false,
                error: 'Failed to validate cron expression'
            });
        }
    };

    useEffect(() => {
        if (formData.cronExpression) {
            validateCron(formData.cronExpression);
        }
    }, [formData.cronExpression]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const url = schedule 
                ? `/api/schedules/${schedule.id}`
                : '/api/schedules';
            const method = schedule ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save schedule');
            }

            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save schedule');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const checked = (e.target as HTMLInputElement).checked;
        
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const cronPresets = [
        { value: '0 9 * * *', label: 'Daily at 9:00 AM' },
        { value: '0 0 * * 0', label: 'Weekly on Sunday' },
        { value: '0 0 1 * *', label: 'Monthly on 1st' },
        { value: '*/15 * * * *', label: 'Every 15 minutes' },
        { value: '0 */6 * * *', label: 'Every 6 hours' },
        { value: '0 9 * * 1-5', label: 'Weekdays at 9 AM' }
    ];

    return (
        <div className="schedule-form">
            <div className="form-header">
                <div className="header-content">
                    <h2>{schedule ? 'Edit Schedule' : 'Create New Schedule'}</h2>
                    <p className="form-subtitle">
                        {schedule ? 'Update your scheduled crawl settings' : 'Set up automated crawling for your website'}
                    </p>
                </div>
                <button className="close-btn" onClick={onClose} title="Close">
                    <span>×</span>
                </button>
            </div>

            <form onSubmit={handleSubmit} className="schedule-form-content">
                {error && (
                    <div className="error-message">
                        <span className="error-icon">⚠️</span>
                        {error}
                    </div>
                )}

                <div className="form-section">
                    <h3 className="section-title">📝 Basic Information</h3>
                    
                    <div className="form-group">
                        <label htmlFor="name" className="form-label">
                            Schedule Name *
                            <span className="label-help">Give your schedule a descriptive name</span>
                        </label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            required
                            placeholder="e.g., Daily Site Crawl"
                            className="form-input"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="description" className="form-label">
                            Description
                            <span className="label-help">Optional description of what this schedule does</span>
                        </label>
                        <textarea
                            id="description"
                            name="description"
                            value={formData.description}
                            onChange={handleInputChange}
                            placeholder="Describe what this schedule does..."
                            rows={3}
                            className="form-textarea"
                        />
                    </div>
                </div>

                <div className="form-section">
                    <h3 className="section-title">🌐 Crawl Settings</h3>
                    
                    <div className="form-group">
                        <label htmlFor="startUrl" className="form-label">
                            Start URL *
                            <span className="label-help">The URL where crawling should begin</span>
                        </label>
                        <input
                            type="url"
                            id="startUrl"
                            name="startUrl"
                            value={formData.startUrl}
                            onChange={handleInputChange}
                            required
                            placeholder="https://example.com"
                            className="form-input"
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="mode" className="form-label">
                                Crawl Mode
                                <span className="label-help">Choose how to crawl the website</span>
                            </label>
                            <select
                                id="mode"
                                name="mode"
                                value={formData.mode}
                                onChange={handleInputChange}
                                className="form-select"
                            >
                                <option value="html">HTML Only (Fast)</option>
                                <option value="js">JavaScript (Playwright)</option>
                                <option value="auto">Auto (Smart)</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="maxConcurrency" className="form-label">
                                Max Concurrency
                                <span className="label-help">Number of parallel requests (1-20)</span>
                            </label>
                            <input
                                type="number"
                                id="maxConcurrency"
                                name="maxConcurrency"
                                value={formData.maxConcurrency}
                                onChange={handleInputChange}
                                min="1"
                                max="20"
                                className="form-input"
                            />
                        </div>
                    </div>

                    <div className="form-group checkbox-group">
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                name="allowSubdomains"
                                checked={formData.allowSubdomains}
                                onChange={handleInputChange}
                                className="checkbox-input"
                            />
                            <span className="checkbox-custom"></span>
                            <span className="checkbox-text">
                                Allow Subdomains
                                <span className="checkbox-help">Include subdomains in the crawl</span>
                            </span>
                        </label>
                    </div>
                </div>

                <div className="form-section">
                    <h3 className="section-title">⏰ Schedule Settings</h3>
                    
                    <div className="form-group">
                        <label htmlFor="cronExpression" className="form-label">
                            Cron Expression *
                            <span className="label-help">When should this crawl run? (minute hour day month dayOfWeek)</span>
                        </label>
                        <div className="cron-input-group">
                            <input
                                type="text"
                                id="cronExpression"
                                name="cronExpression"
                                value={formData.cronExpression}
                                onChange={handleInputChange}
                                required
                                placeholder="0 9 * * *"
                                className={`form-input ${cronValidation && !cronValidation.isValid ? 'error' : ''}`}
                            />
                            {cronValidation && (
                                <div className={`cron-validation ${cronValidation.isValid ? 'valid' : 'invalid'}`}>
                                    {cronValidation.isValid ? (
                                        <span className="valid-text">
                                            <span className="validation-icon">✓</span>
                                            {cronValidation.description || 'Valid cron expression'}
                                        </span>
                                    ) : (
                                        <span className="error-text">
                                            <span className="validation-icon">✗</span>
                                            {cronValidation.error || 'Invalid cron expression'}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        <div className="cron-presets">
                            <label className="presets-label">Quick Presets:</label>
                            <div className="preset-buttons">
                                {cronPresets.map((preset) => (
                                    <button
                                        key={preset.value}
                                        type="button"
                                        className={`preset-btn ${formData.cronExpression === preset.value ? 'active' : ''}`}
                                        onClick={() => setFormData(prev => ({ ...prev, cronExpression: preset.value }))}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="form-group checkbox-group">
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                name="enabled"
                                checked={formData.enabled}
                                onChange={handleInputChange}
                                className="checkbox-input"
                            />
                            <span className="checkbox-custom"></span>
                            <span className="checkbox-text">
                                Enable Schedule
                                <span className="checkbox-help">Start this schedule immediately</span>
                            </span>
                        </label>
                    </div>
                </div>

                <div className="form-actions">
                    <button type="button" onClick={onClose} className="btn btn-secondary">
                        <span className="btn-icon">↩️</span>
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        className="btn btn-primary"
                        disabled={loading || Boolean(cronValidation && !cronValidation.isValid)}
                    >
                        <span className="btn-icon">
                            {loading ? '⏳' : (schedule ? '💾' : '✨')}
                        </span>
                        {loading ? 'Saving...' : (schedule ? 'Update Schedule' : 'Create Schedule')}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ScheduleForm;
