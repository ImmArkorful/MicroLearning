import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';

const RootNavigator: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();

  // Debug logging for navigation changes
  React.useEffect(() => {
    console.log('🧭 RootNavigator: Navigation state changed', {
      isAuthenticated,
      isLoading,
      currentScreen: isAuthenticated ? 'MainNavigator' : 'AuthNavigator'
    });
  }, [isAuthenticated, isLoading]);

  if (isLoading) {
    return null; // Loading is handled by App.tsx
  }

  return (
    <NavigationContainer>
      {isAuthenticated ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

export default RootNavigator;
