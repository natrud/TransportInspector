import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  type ColorPalette,
  CONTENT_MAX_WIDTH,
  AccessDeniedError,
  consumeSessionExpired,
  useColors,
  useRealLogin,
} from '@transport/shared';

export function LoginScreen(): JSX.Element {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { login, isPending, error } = useRealLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Чи потрапили ми сюди через протухлий токен — показуємо це один раз,
  // інакше «раптовий» екран входу виглядає як збій застосунку.
  const [expired] = useState(consumeSessionExpired);

  const isDisabled = isPending || !email.trim() || !password;

  const onSignIn = async (): Promise<void> => {
    if (!email.trim() || !password) return;
    await login({
      email: email.trim().toLowerCase(),
      password,
      app: 'driver',
      routeId: null, // маршрут вибирається на головному екрані після входу
    }).catch(() => {
      // помилку показуємо нижче з `error` — тут глушимо unhandled rejection
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Транспортний водій</Text>
        <Text style={styles.subtitle}>
          Моніторинг валідованих квитків, лічильник пасажирів, виклик контролера.
        </Text>

        <View style={styles.card}>
          {expired && !error ? (
            <View style={styles.noticeBox}>
              <Text style={styles.notice}>
                Сесію завершено: термін дії входу минув або адміністратор змінив ваші права.
                Увійдіть ще раз.
              </Text>
            </View>
          ) : null}

          {error ? (
            <View style={error instanceof AccessDeniedError ? styles.deniedBox : undefined}>
              <Text style={styles.error}>{loginErrorText(error)}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="driver@example.com"
              placeholderTextColor={c.textSoft}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="next"
              editable={!isPending}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Пароль</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={c.textSoft}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={() => void onSignIn()}
              editable={!isPending}
            />
          </View>

          <Pressable
            style={[styles.primaryButton, isDisabled && styles.primaryButtonDisabled]}
            disabled={isDisabled}
            onPress={() => void onSignIn()}
          >
            {isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonLabel}>Увійти у зміну</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * 401/403 від /auth/login — це невірні дані. AccessDeniedError — логін пройшов,
 * але роль не пускає в застосунок водія; її текст уже написано для людини.
 */
function loginErrorText(error: Error): string {
  if (error instanceof AccessDeniedError) return error.message;
  if (error.message.includes('401') || error.message.includes('403')) {
    return 'Невірний email або пароль';
  }
  return error.message;
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: c.background,
      padding: 24,
      paddingTop: 60,
      width: '100%', alignSelf: 'center', maxWidth: CONTENT_MAX_WIDTH,
    },
    title: { fontSize: 26, fontWeight: '800', color: c.primary, marginBottom: 6 },
    subtitle: { fontSize: 14, color: c.textMuted, marginBottom: 28, lineHeight: 20 },
    card: {
      backgroundColor: c.surface,
      borderRadius: 20,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      gap: 16,
    },
    inputGroup: { gap: 6 },
    label: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    input: {
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: c.text,
    },
    primaryButton: {
      backgroundColor: c.primary,
      paddingVertical: 16,
      borderRadius: 16,
      alignItems: 'center',
      marginTop: 4,
    },
    primaryButtonDisabled: { opacity: 0.5 },
    primaryButtonLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },
    error: { color: c.danger, fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 19 },
    noticeBox: {
      backgroundColor: c.warningSoft,
      borderWidth: 1,
      borderColor: c.warning,
      borderRadius: 12,
      padding: 12,
    },
    notice: { color: c.text, fontSize: 13, fontWeight: '600', lineHeight: 19, textAlign: 'center' },
    deniedBox: {
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.danger,
      borderRadius: 12,
      padding: 12,
    },
  });
}
