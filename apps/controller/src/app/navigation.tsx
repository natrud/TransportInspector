import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import {
  AccessDeniedScreen,
  NetworkStatusBanner,
  isRoleAllowed,
  useColors,
  useControllerCalls,
  useLogout,
  useOfflineSync,
  useInspectorQr,
  useSession,
  useSessionExpiryWatcher,
  registerPreLogoutTask,
  type FineReason,
  type ValidationResult,
} from '@transport/shared';
import {
  unregisterPushToken,
  usePushRegistration,
} from '@transport/shared/lib/push-notifications';
import { CallsScreen } from '../screens/CallsScreen';
import { FineReceiptScreen } from '../screens/FineReceiptScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { InspectorQrScreen } from '../screens/InspectorQrScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ManualEntryScreen } from '../screens/ManualEntryScreen';
import { RecentScansScreen } from '../screens/RecentScansScreen';
import { RecordFineScreen } from '../screens/RecordFineScreen';
import { ScannerScreen } from '../screens/ScannerScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { TicketResultScreen } from '../screens/TicketResultScreen';
import { linkingConfig } from './linking';

export type MainTabsParamList = {
  HomeTab: undefined;
  JournalTab: undefined;
  CallsTab: undefined;
  SettingsTab: undefined;
};

const navigationRef = createNavigationContainerRef<RootStackParamList>();

function navigateToCalls(): void {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Main', { screen: 'CallsTab' } as never);
}

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Scanner: { routeId?: string } | undefined;
  TicketResult: { result: ValidationResult; rawQr?: string };
  ManualEntry: undefined;
  RecordFine:
    | {
        ticketId?: string;
        routeId?: string;
        reason?: FineReason;
        /** Ціна перевіреного квитка у ГРИВНЯХ (Ticket.price) — база для штрафу 20×. */
        ticketPrice?: number;
      }
    | undefined;
  FineReceipt: { fineId: string };
  InspectorQr: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabsParamList>();

function MainTabs(): JSX.Element {
  const c = useColors();
  const { calls } = useControllerCalls();
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: c.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSoft,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          height: 64,
          paddingTop: 6,
          paddingBottom: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          title: 'Контролер',
          tabBarLabel: 'Головна',
          tabBarIcon: ({ color, size }) => <TabIcon glyph="⌂" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="JournalTab"
        component={RecentScansScreen}
        options={{
          title: 'Журнал',
          tabBarLabel: 'Журнал',
          tabBarIcon: ({ color, size }) => <TabIcon glyph="☰" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="CallsTab"
        component={CallsScreen}
        options={{
          title: 'Виклики',
          tabBarLabel: 'Виклики',
          tabBarBadge: calls.length > 0 ? calls.length : undefined,
          tabBarIcon: ({ color, size }) => <TabIcon glyph="☎" color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          title: 'Налаштування',
          tabBarLabel: 'Налаштування',
          tabBarIcon: ({ color, size }) => <TabIcon glyph="⚙" color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  );
}

function TabIcon({ glyph, color, size }: { glyph: string; color: string; size: number }): JSX.Element {
  return (
    <Text style={{ color, fontSize: size + 2, lineHeight: size + 4, fontWeight: '900' }}>
      {glyph}
    </Text>
  );
}

export function AppNavigator(): JSX.Element {
  const c = useColors();
  const { session, isLoading } = useSession();
  const { logout, isPending: loggingOut } = useLogout();
  // 401 від будь-якого запиту = токен мертвий -> повертаємось на екран входу.
  useSessionExpiryWatcher();
  const hasAccess = !!session && isRoleAllowed(session.role, 'controller');
  const isAuthenticated = hasAccess;

  // On the first successful login of any staff account this request creates
  // its permanent personal QR; later launches simply receive the same QR.
  useInspectorQr();
  usePushRegistration();
  useOfflineSync();

  // Зняти push-токен при виході, поки JWT ще живий. Реєструємо саме тут:
  // модуль push тягне нативний expo-notifications, тому його нема в барелі
  // пакета і hooks/useSession не може імпортувати його напряму.
  useEffect(() => registerPreLogoutTask(unregisterPushToken), []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string } | undefined;
      if (data?.type === 'controller_call') {
        navigateToCalls();
      }
    });

    // Холодний старт — застосунок відкрито тапом по сповіщенню, поки він був закритий.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification.request.content.data as { type?: string } | undefined;
      if (data?.type === 'controller_call') {
        navigateToCalls();
      }
    });

    return () => sub.remove();
  }, [isAuthenticated]);

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

  // Роль перевіряємо і для збереженої сесії — її могли змінити в адмінці
  // після логіну, а токен лежить у SecureStore місяцями.
  if (session && !hasAccess) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <AccessDeniedScreen
          role={session.role}
          app="controller"
          displayName={session.display_name}
          isLoggingOut={loggingOut}
          onLogout={() => void logout()}
        />
        <NetworkStatusBanner />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <NavigationContainer ref={navigationRef} linking={linkingConfig}>
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
              <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
              <Stack.Screen
                name="Scanner"
                component={ScannerScreen}
                options={{ title: 'Сканування QR' }}
              />
              <Stack.Screen
                name="TicketResult"
                component={TicketResultScreen}
                options={{ title: 'Результат перевірки' }}
              />
              <Stack.Screen
                name="ManualEntry"
                component={ManualEntryScreen}
                options={{ title: 'Ввід вручну' }}
              />
              <Stack.Screen
                name="RecordFine"
                component={RecordFineScreen}
                options={{ title: 'Видати постанову' }}
              />
              <Stack.Screen
                name="FineReceipt"
                component={FineReceiptScreen}
                options={{ title: 'Квитанція' }}
              />
              <Stack.Screen
                name="InspectorQr"
                component={InspectorQrScreen}
                options={{ title: 'Особистий QR' }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <NetworkStatusBanner />
    </View>
  );
}
