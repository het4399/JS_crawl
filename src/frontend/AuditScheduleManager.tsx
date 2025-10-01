import React, { useState, useEffect } from 'react';
import './AuditScheduleManager.css';

interface AuditSchedule {
  id: number;
  name: string;
  description: string;
  urls: string[];
  device: 'mobile' | 'desktop';
  cronExpression: string;
  enabled: boolean;
  createdAt: string;
  lastRun?: string;
  nextRun?: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
}

interface AuditExecution {
  id: number;
  scheduleId: number;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  errorMessage?: string;
  urlsProcessed: number;
  urlsSuccessful: number;
  urlsFailed: number;
  duration: number;
}

export default function AuditScheduleManager() {
  const [schedules, setSchedules] = useState<AuditSchedule[]>([]);
  const [executions, setExecutions] = useState<AuditExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<AuditSchedule | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    urls: '',
    device: 'desktop' as 'mobile' | 'desktop',
    cronExpression: '0 0 * * *', // Daily at midnight
    enabled: true
  });

  useEffect(() => {
    loadSchedules();
    loadExecutions();
  }, []);

  const loadSchedules = async () => {
    try {
      const response = await fetch('/api/audit-schedules/schedules');
      if (!response.ok) throw new Error('Failed to load schedules');
      const data = await response.json();
      setSchedules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  };

  const loadExecutions = async () => {
    try {
      const response = await fetch('/api/audit-schedules/executions?limit=50');
      if (!response.ok) throw new Error('Failed to load executions');
      const data = await response.json();
      setExecutions(data);
    } catch (err) {
      console.error('Failed to load executions:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const urls = formData.urls.split('\n').filter(url => url.trim());
      if (urls.length === 0) {
        setError('Please provide at least one URL');
        return;
      }

      const payload = {
        ...formData,
        urls
      };

      const url = editingSchedule 
        ? `/api/audit-schedules/schedules/${editingSchedule.id}`
        : '/api/audit-schedules/schedules';
      
      const method = editingSchedule ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save schedule');
      }

      await loadSchedules();
      setShowForm(false);
      setEditingSchedule(null);
      setFormData({
        name: '',
        description: '',
        urls: '',
        device: 'desktop',
        cronExpression: '0 0 * * *',
        enabled: true
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save schedule');
    }
  };

  const handleEdit = (schedule: AuditSchedule) => {
    setEditingSchedule(schedule);
    setFormData({
      name: schedule.name,
      description: schedule.description,
      urls: schedule.urls.join('\n'),
      device: schedule.device,
      cronExpression: schedule.cronExpression,
      enabled: schedule.enabled
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this audit schedule?')) return;
    
    try {
      const response = await fetch(`/api/audit-schedules/schedules/${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete schedule');
      
      await loadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete schedule');
    }
  };

  const handleToggle = async (id: number) => {
    try {
      const response = await fetch(`/api/audit-schedules/schedules/${id}/toggle`, {
        method: 'PATCH'
      });
      
      if (!response.ok) throw new Error('Failed to toggle schedule');
      
      await loadSchedules();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle schedule');
    }
  };

  const handleTrigger = async (id: number) => {
    try {
      const response = await fetch(`/api/audit-schedules/schedules/${id}/trigger`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to trigger schedule');
      
      await loadExecutions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger schedule');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'failed': return '#F44336';
      case 'running': return '#FF9800';
      default: return '#9E9E9E';
    }
  };

  if (loading) {
    return <div className="audit-schedule-manager">Loading...</div>;
  }

  return (
    <div className="audit-schedule-manager">
      <div className="header">
        <h2>Audit Schedule Manager</h2>
        <button 
          className="btn btn-primary"
          onClick={() => setShowForm(true)}
        >
          Create New Schedule
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {showForm && (
        <div className="form-overlay">
          <div className="form-container">
            <h3>{editingSchedule ? 'Edit' : 'Create'} Audit Schedule</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  required
                />
              </div>
              
              <div className="form-group">
                <label>URLs (one per line)</label>
                <textarea
                  value={formData.urls}
                  onChange={(e) => setFormData({...formData, urls: e.target.value})}
                  placeholder="https://example.com&#10;https://example.com/page1&#10;https://example.com/page2"
                  required
                  rows={5}
                />
              </div>
              
              <div className="form-group">
                <label>Device</label>
                <select
                  value={formData.device}
                  onChange={(e) => setFormData({...formData, device: e.target.value as 'mobile' | 'desktop'})}
                >
                  <option value="desktop">Desktop</option>
                  <option value="mobile">Mobile</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Cron Expression</label>
                <input
                  type="text"
                  value={formData.cronExpression}
                  onChange={(e) => setFormData({...formData, cronExpression: e.target.value})}
                  placeholder="0 0 * * * (daily at midnight)"
                  required
                />
                <small>Format: minute hour day month weekday</small>
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({...formData, enabled: e.target.checked})}
                  />
                  Enabled
                </label>
              </div>
              
              <div className="form-actions">
                <button type="submit" className="btn btn-primary">
                  {editingSchedule ? 'Update' : 'Create'} Schedule
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowForm(false);
                    setEditingSchedule(null);
                    setFormData({
                      name: '',
                      description: '',
                      urls: '',
                      device: 'desktop',
                      cronExpression: '0 0 * * *',
                      enabled: true
                    });
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="schedules-section">
        <h3>Audit Schedules ({schedules.length})</h3>
        {schedules.length === 0 ? (
          <p>No audit schedules found. Create one to get started.</p>
        ) : (
          <div className="schedules-grid">
            {schedules.map(schedule => (
              <div key={schedule.id} className="schedule-card">
                <div className="schedule-header">
                  <h4>{schedule.name}</h4>
                  <div className="schedule-actions">
                    <button 
                      className="btn btn-sm"
                      onClick={() => handleToggle(schedule.id)}
                    >
                      {schedule.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button 
                      className="btn btn-sm btn-primary"
                      onClick={() => handleTrigger(schedule.id)}
                    >
                      Run Now
                    </button>
                    <button 
                      className="btn btn-sm"
                      onClick={() => handleEdit(schedule)}
                    >
                      Edit
                    </button>
                    <button 
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(schedule.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                
                <p className="schedule-description">{schedule.description}</p>
                
                <div className="schedule-details">
                  <div><strong>Device:</strong> {schedule.device}</div>
                  <div><strong>Cron:</strong> {schedule.cronExpression}</div>
                  <div><strong>URLs:</strong> {schedule.urls.length}</div>
                  <div><strong>Status:</strong> 
                    <span className={`status ${schedule.enabled ? 'enabled' : 'disabled'}`}>
                      {schedule.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
                
                <div className="schedule-stats">
                  <div>Total Runs: {schedule.totalRuns}</div>
                  <div>Successful: {schedule.successfulRuns}</div>
                  <div>Failed: {schedule.failedRuns}</div>
                  {schedule.lastRun && (
                    <div>Last Run: {formatDate(schedule.lastRun)}</div>
                  )}
                  {schedule.nextRun && (
                    <div>Next Run: {formatDate(schedule.nextRun)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="executions-section">
        <h3>Recent Executions</h3>
        {executions.length === 0 ? (
          <p>No executions found.</p>
        ) : (
          <div className="executions-table">
            <table>
              <thead>
                <tr>
                  <th>Schedule ID</th>
                  <th>Started</th>
                  <th>Status</th>
                  <th>URLs Processed</th>
                  <th>Success Rate</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {executions.map(execution => (
                  <tr key={execution.id}>
                    <td>{execution.scheduleId}</td>
                    <td>{formatDate(execution.startedAt)}</td>
                    <td>
                      <span 
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(execution.status) }}
                      >
                        {execution.status}
                      </span>
                    </td>
                    <td>{execution.urlsProcessed}</td>
                    <td>
                      {execution.urlsProcessed > 0 
                        ? `${Math.round((execution.urlsSuccessful / execution.urlsProcessed) * 100)}%`
                        : 'N/A'
                      }
                    </td>
                    <td>{Math.round(execution.duration / 1000)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
