import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  AccessDeniedScreen,
  NetworkStatusBanner,
  isRoleAllowed,
  useColors,
  useLogout,
  useSession,
  useSessionExpiryWatcher,
} from '@transport/shared';
import { ControllerScreen } from '../screens/ControllerScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { linkingConfig } from './linking';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  Settings: undefined;
  Controller: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator(): JSX.Element {
  const c = useColors();
  const { session, isLoading } = useSession();
  const { logout, isPending: loggingOut } = useLogout();
  // 401 від будь-якого запиту = токен мертвий -> повертаємось на екран входу.
  useSessionExpiryWatcher();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={{ color: c.textMuted, fontSize: 14 }}>Завантаження…</Text>
      </View>
    );
  }

  // Збережена сесія теж проходить перевірку ролі: роль могли змінити в
  // адмінці вже після логіну, а застосунок живе місяцями без перелогіну.
  if (session && !isRoleAllowed(session.role, 'driver')) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AccessDeniedScreen
          role={session.role}
          app="driver"
          displayName={session.display_name}
          isLoggingOut={loggingOut}
          onLogout={() => void logout()}
        />
        <NetworkStatusBanner />
      </View>
    );
  }

  const isAuthenticated = !!session;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <NavigationContainer linking={linkingConfig}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: c.primary },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: c.background },
          }}
        >
          {!isAuthenticated ? (
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          ) : (
            <>
              <Stack.Screen
                name="Home"
                component={HomeScreen}
                options={{ title: 'Мій маршрут' }}
              />
              <Stack.Screen
                name="Settings"
                component={SettingsScreen}
                options={{ title: 'Налаштування' }}
              />
              <Stack.Screen
                name="Controller"
                component={ControllerScreen}
                options={{ title: 'Контролер' }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <NetworkStatusBanner />
    </View>
  );
}
