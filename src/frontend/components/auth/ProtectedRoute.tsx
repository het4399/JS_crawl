import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
    requireRole?: 'user' | 'premium' | 'admin';
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
    children, 
    fallback,
    requireRole 
}) => {
    const { isAuthenticated, isLoading, user } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-300 text-lg">Loading...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        if (fallback) {
            return <>{fallback}</>;
        }
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-4">
                <div className="bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full border border-gray-700">
                    <div className="text-center">
                        <div className="text-6xl mb-4">🔒</div>
                        <h2 className="text-2xl font-bold text-white mb-2">Authentication Required</h2>
                        <p className="text-gray-400 mb-6">
                            You need to be logged in to access this feature.
                        </p>
                        <button
                            onClick={() => window.location.href = '/login'}
                            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 font-medium shadow-lg transition-all"
                        >
                            Go to Login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Check role if required
    if (requireRole && user) {
        const roleHierarchy = { user: 1, premium: 2, admin: 3 };
        const userLevel = roleHierarchy[user.role];
        const requiredLevel = roleHierarchy[requireRole];

        if (userLevel < requiredLevel) {
            return (
                <div className="min-h-screen bg-black flex items-center justify-center p-4">
                    <div className="bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full border border-gray-700">
                        <div className="text-center">
                            <div className="text-6xl mb-4">⭐</div>
                            <h2 className="text-2xl font-bold text-white mb-2">
                                {requireRole === 'premium' ? 'Premium' : 'Admin'} Required
                            </h2>
                            <p className="text-gray-400 mb-2">
                                This feature requires a {requireRole} account.
                            </p>
                            <p className="text-sm text-gray-500 mb-6">
                                Current role: <span className="text-purple-400 font-semibold">{user.role}</span>
                            </p>
                            <button
                                onClick={() => window.location.href = '/settings'}
                                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white rounded-lg hover:from-purple-700 hover:to-purple-800 font-medium shadow-lg transition-all"
                            >
                                Upgrade Account
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
    }

    return <>{children}</>;
};

