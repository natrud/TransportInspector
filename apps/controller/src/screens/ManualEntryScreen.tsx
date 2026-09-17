import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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
  parseQrPayload,
  useColors,
  useCurrentInspection,
  useSession,
  useTicketValidate,
} from '@transport/shared';
import type { RootStackParamList } from '../app/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'ManualEntry'>;

export function ManualEntryScreen({ navigation }: Props): JSX.Element {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { session } = useSession();
  const { inspection } = useCurrentInspection();
  const { validate, isPending } = useTicketValidate();
  const [ticketId, setTicketId] = useState('');
  const [hash, setHash] = useState('');
  const [showHash, setShowHash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (): Promise<void> => {
    const trimmedId = ticketId.trim();
    if (!trimmedId) {
      setError('Введіть ID квитка');
      return;
    }
    setError(null);
    const rawQr = hash.trim() ? `${trimmedId}:${hash.trim()}` : trimmedId;
    const qr = parseQrPayload(rawQr);
    if (!qr) {
      setError('ID не схожий на ID квитка системи (5–16 символів)');
      return;
    }
    try {
      const res = await validate({
        qr,
        serialNumber: session?.serial_number ?? 'UNKNOWN',
        routeId: inspection?.route_number ?? session?.assigned_route_id ?? null,
        doorNumber: 0,
        rawQr,
        inspectionSessionId: inspection?.id ?? null,
        manual: true,
      });
      navigation.replace('TicketResult', { result: res, rawQr });
    } catch (err) {
      // Немає звʼязку / бекенд недоступний — спробу вже записано в офлайн-журнал
      // (useTicketValidate), користувачу показуємо зрозуміле повідомлення.
      setError(
        err instanceof Error && err.message
          ? `Не вдалося перевірити квиток: ${err.message}`
          : 'Немає звʼязку — квиток не перевірено. Спробуйте ще раз.',
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Перевірити квиток вручну</Text>
        <Text style={styles.subtitle}>
          Якщо QR порваний, забруднений або несканується, введи ID квитка вручну.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>ID квитка</Text>
          <TextInput
            style={styles.input}
            value={ticketId}
            onChangeText={setTicketId}
            placeholder="напр. tkt0002issued"
            placeholderTextColor={c.textSoft}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={16}
            autoFocus
          />

          {showHash ? (
            <>
              <Text style={[styles.label, { marginTop: 18 }]}>Hash</Text>
              <TextInput
                style={styles.input}
                value={hash}
                onChangeText={setHash}
                placeholder="hash-tkt0002-paid"
                placeholderTextColor={c.textSoft}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={64}
              />
              <Pressable style={styles.hashToggle} onPress={() => setShowHash(false)}>
                <Text style={styles.hashToggleLabel}>Прибрати hash</Text>
              </Pressable>
            </>
          ) : (
            <Pressable style={styles.hashToggle} onPress={() => setShowHash(true)}>
              <Text style={styles.hashToggleLabel}>+ Додати hash (опційно)</Text>
            </Pressable>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          style={[styles.submitButton, isPending && styles.submitButtonDisabled]}
          onPress={() => void onSubmit()}
          disabled={isPending}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitLabel}>Перевірити</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.background },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 32, width: '100%', alignSelf: 'center', maxWidth: CONTENT_MAX_WIDTH },
    title: { fontSize: 22, fontWeight: '800', color: c.text },
    subtitle: { color: c.textMuted, marginTop: 6, marginBottom: 18, lineHeight: 20 },

    card: {
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 6,
    },
    input: {
      backgroundColor: c.surfaceMuted,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 16,
      paddingVertical: 18,
      color: c.text,
      fontSize: 20,
      fontFamily: 'Menlo',
    },
    hashToggle: { marginTop: 10, alignSelf: 'flex-start' },
    hashToggleLabel: { color: c.primary, fontWeight: '700', fontSize: 13 },
    error: { color: c.danger, marginTop: 12, fontSize: 13, fontWeight: '600' },

    bottomBar: {
      backgroundColor: c.background,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 18,
    },
    submitButton: {
      backgroundColor: c.primary,
      paddingVertical: 18,
      borderRadius: 14,
      alignItems: 'center',
    },
    submitButtonDisabled: { opacity: 0.6 },
    submitLabel: { color: '#fff', fontWeight: '800', fontSize: 17 },
  });
}
