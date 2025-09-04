import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService } from '../services/authService';
import { User, LoginCredentials, RegisterCredentials } from '../types/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user is authenticated on app start
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const { token, user: storedUser } = await authService.getStoredAuthData();
      if (token && storedUser) {
        setUser(storedUser);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await authService.login(credentials);
      await authService.storeAuthData(response.token, response.user);
      setUser(response.user);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Login failed';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (credentials: RegisterCredentials) => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('🔄 AuthContext: Starting registration...');
      
      const response = await authService.register(credentials);
      console.log('✅ AuthContext: Registration successful, setting user state');
      
      await authService.storeAuthData(response.token, response.user);
      setUser(response.user);
    } catch (error: any) {
      console.log('❌ AuthContext: Registration failed, staying on registration page');
      const errorMessage = error.response?.data?.error || 'Registration failed';
      setError(errorMessage);
      
      // Ensure user state remains null for failed registrations
      setUser(null);
      
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authService.clearAuthData();
      setUser(null);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  const clearError = () => {
    setError(null);
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
    error,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
