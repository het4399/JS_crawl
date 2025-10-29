import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface User {
    id: number;
    email: string;
    name: string | null;
    role: 'user' | 'admin' | 'premium';
    createdAt: string;
    lastLogin: string | null;
}

export interface UserSettings {
    maxCrawlsPerDay: number;
    emailNotifications: boolean;
    hasOpenaiApiKey: boolean;
    hasPsiApiKey: boolean;
}

export interface UsageStats {
    totalCrawls: number;
    totalAudits: number;
    totalAeoAnalyses: number;
    totalCredits: number;
}

interface AuthContextType {
    user: User | null;
    settings: UserSettings | null;
    usage: UsageStats | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, name?: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshUser: () => Promise<void>;
    updateProfile: (updates: { name?: string; currentPassword?: string; newPassword?: string }) => Promise<void>;
    updateSettings: (updates: Partial<Pick<UserSettings, 'maxCrawlsPerDay' | 'emailNotifications'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Use relative URLs when in development to avoid CORS issues
const API_BASE = (import.meta as any).env?.VITE_API_URL || '';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [usage, setUsage] = useState<UsageStats | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(
        localStorage.getItem('accessToken')
    );
    const [isLoading, setIsLoading] = useState(true);

    // Load user on mount if token exists
    useEffect(() => {
        if (accessToken) {
            loadUser();
        } else {
            setIsLoading(false);
        }
    }, []);

    // Set up token refresh interval (every 10 minutes)
    useEffect(() => {
        if (accessToken) {
            const interval = setInterval(() => {
                refreshAccessToken();
            }, 10 * 60 * 1000); // 10 minutes

            return () => clearInterval(interval);
        }
    }, [accessToken]);

    const loadUser = async () => {
        if (!accessToken) {
            setIsLoading(false);
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setUser(data.user);
                setSettings(data.settings);
                setUsage(data.usage);
            } else {
                // Token invalid, clear and don't retry
                console.warn('Failed to load user, token may be invalid');
                setAccessToken(null);
                setUser(null);
                localStorage.removeItem('accessToken');
            }
        } catch (error) {
            console.error('Failed to load user:', error);
            setAccessToken(null);
            setUser(null);
            localStorage.removeItem('accessToken');
        } finally {
            setIsLoading(false);
        }
    };

    const refreshAccessToken = async () => {
        try {
            const response = await fetch(`${API_BASE}/api/auth/refresh`, {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                setAccessToken(data.accessToken);
                localStorage.setItem('accessToken', data.accessToken);
                // Don't call loadUser here to avoid infinite loop
                return true;
            } else {
                // Refresh failed, clear state
                setAccessToken(null);
                setUser(null);
                localStorage.removeItem('accessToken');
                return false;
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            setAccessToken(null);
            setUser(null);
            localStorage.removeItem('accessToken');
            return false;
        }
    };

    const login = async (email: string, password: string) => {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Login failed');
        }

        const data = await response.json();
        setAccessToken(data.accessToken);
        localStorage.setItem('accessToken', data.accessToken);
        
        // Load full profile with the new token
        const meResponse = await fetch(`${API_BASE}/api/auth/me`, {
            headers: {
                'Authorization': `Bearer ${data.accessToken}`
            },
            credentials: 'include'
        });

        if (meResponse.ok) {
            const meData = await meResponse.json();
            setUser(meData.user);
            setSettings(meData.settings);
            setUsage(meData.usage);
        }
    };

    const register = async (email: string, password: string, name?: string) => {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name }),
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Registration failed');
        }

        const data = await response.json();
        setAccessToken(data.accessToken);
        localStorage.setItem('accessToken', data.accessToken);
        
        // Load full profile with the new token
        const meResponse = await fetch(`${API_BASE}/api/auth/me`, {
            headers: {
                'Authorization': `Bearer ${data.accessToken}`
            },
            credentials: 'include'
        });

        if (meResponse.ok) {
            const meData = await meResponse.json();
            setUser(meData.user);
            setSettings(meData.settings);
            setUsage(meData.usage);
        }
    };

    const logout = async () => {
        try {
            await fetch(`${API_BASE}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                credentials: 'include'
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            setAccessToken(null);
            setUser(null);
            setSettings(null);
            setUsage(null);
            localStorage.removeItem('accessToken');
        }
    };

    const refreshUser = async () => {
        if (accessToken) {
            await loadUser();
        }
    };

    const updateProfile = async (updates: { name?: string; currentPassword?: string; newPassword?: string }) => {
        const response = await fetch(`${API_BASE}/api/auth/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates),
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Update failed');
        }

        await refreshUser();
    };

    const updateSettings = async (updates: Partial<Pick<UserSettings, 'maxCrawlsPerDay' | 'emailNotifications'>>) => {
        const response = await fetch(`${API_BASE}/api/auth/settings`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates),
            credentials: 'include'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Settings update failed');
        }

        await refreshUser();
    };

    const value: AuthContextType = {
        user,
        settings,
        usage,
        accessToken,
        isAuthenticated: !!user && !!accessToken,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
        updateProfile,
        updateSettings
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

