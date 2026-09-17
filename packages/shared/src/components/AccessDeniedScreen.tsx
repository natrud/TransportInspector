import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type AppKind, APP_TITLES, accessDeniedMessage, formatRole } from '../lib/app-access';
import type { AppRole } from '../types/ticket';
import type { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/useColors';

interface Props {
  role: AppRole | null | undefined;
  app: AppKind;
  displayName?: string | null;
  onLogout: () => void;
  isLoggingOut?: boolean;
}

/**
 * Екран «не ваш застосунок». Показується, коли роль акаунта не входить у
 * дозволені для цієї збірки — і при вході, і для вже збереженої сесії
 * (роль могли змінити в адмінці вже після логіну).
 */
export function AccessDeniedScreen({
  role,
  app,
  displayName,
  onLogout,
  isLoggingOut = false,
}: Props): JSX.Element {
  const c = useColors();
  const styles = makeStyles(c);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>Доступ заборонено</Text>
        <Text style={styles.subtitle}>{APP_TITLES[app]}</Text>

        {displayName ? (
          <Text style={styles.account}>
            {displayName} · {formatRole(role)}
          </Text>
        ) : null}

        <Text style={styles.message}>{accessDeniedMessage(role, app)}</Text>

        <Pressable
          style={[styles.button, isLoggingOut && styles.buttonDisabled]}
          disabled={isLoggingOut}
          onPress={onLogout}
        >
          {isLoggingOut ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonLabel}>Увійти іншим акаунтом</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: c.background },
    content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    card: {
      backgroundColor: c.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.danger,
      padding: 24,
      gap: 10,
      alignItems: 'center',
    },
    icon: { fontSize: 44 },
    title: { color: c.danger, fontSize: 22, fontWeight: '900', textAlign: 'center' },
    subtitle: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    account: { color: c.text, fontSize: 15, fontWeight: '700', textAlign: 'center', marginTop: 4 },
    message: { color: c.text, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 4 },
    button: {
      marginTop: 10,
      alignSelf: 'stretch',
      backgroundColor: c.primary,
      paddingVertical: 16,
      borderRadius: 16,
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.6 },
    buttonLabel: { color: '#fff', fontWeight: '800', fontSize: 15 },
  });
}
