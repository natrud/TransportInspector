import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  type ColorPalette,
  CONTENT_MAX_WIDTH,
  ReadersBlockCard,
  minutesUntil,
  useColors,
  useCurrentInspection,
  useInspectorQr,
  useInspectionReaderControls,
} from '@transport/shared';
import { useMaxScreenBrightness } from '../hooks/useMaxScreenBrightness';

// 1.5 cm at the React Native baseline density (160 dpi) is 94 dp.  We keep a
// small margin below that limit because the white quiet zone is outside this
// value as well.
const VALIDATOR_QR_SIZE = 88;

export function InspectorQrScreen(): JSX.Element {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  // Зчитувач у салоні читає код з екрана — тримаємо максимальну яскравість,
  // поки цей екран відкритий (як у застосунку пасажира).
  useMaxScreenBrightness();
  const { credential, isLoading, error } = useInspectorQr();
  const { inspection, close, isClosing, isFetching } = useCurrentInspection(2_000);
  const { setBlocked: setReadersBlocked, isPending: readersPending } = useInspectionReaderControls();
  const [now, setNow] = useState(() => Date.now());
  const previousInspectionId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Вебхук від валідатора не може напряму намалювати UI на телефоні.  Поки цей
  // екран відкритий, status запитується раз на 2 секунди; зміна показується і
  // зеленою карткою, і системним повідомленням.
  useEffect(() => {
    const currentId = inspection?.id ?? null;
    const previousId = previousInspectionId.current;
    previousInspectionId.current = currentId;

    if (previousId === undefined || previousId === currentId) return;
    const startAutoCloseMinutes = minutesUntil(inspection?.auto_close_at);
    if (currentId) {
      Alert.alert(
        'Перевірку розпочато',
        `Маршрут ${inspection?.route_number ?? '—'} · ТЗ ${inspection?.vehicle_number ?? '—'}\n\n` +
          'Зчитувачі цього транспорту блокуються автоматично — стан побачите нижче.\n\n' +
          // Строк автозавершення задає адміністратор, тому число беремо з
          // відповіді сервера, а не з тексту в коді.
          (startAutoCloseMinutes != null
            ? `Перевірка завершиться сама через ${startAutoCloseMinutes} хв, якщо не закінчити її раніше повторним прикладанням QR.`
            : 'Перевірка завершиться сама, якщо не закінчити її раніше повторним прикладанням QR.'),
      );
    } else {
      Alert.alert(
        'Перевірку завершено',
        'Зчитувачі повертаються у звичайний режим — пасажири знову оплачують проїзд.',
      );
    }
  }, [inspection?.id, inspection?.route_number, inspection?.vehicle_number]);

  const durationMinutes = inspection
    ? Math.max(0, Math.floor((now - Date.parse(inspection.started_at)) / 60_000))
    : 0;
  // `now` тикає раз на 30 с — відлік автозавершення живий без окремого таймера.
  const autoCloseMinutes = inspection ? minutesUntil(inspection.auto_close_at, now) : null;

  const readers = inspection?.readers ?? null;
  // Автоматика вже мала заблокувати зчитувачі на старті перевірки. Кнопка
  // потрібна лише тоді, коли команда не пройшла (прилад був офлайн).
  const needsReadersRetry =
    !!inspection && !!readers && (!!readers.error || readers.state !== 'blocked');

  const retryReadersBlock = (): void => {
    void setReadersBlocked(true)
      .then((res) => Alert.alert(res.ok ? 'Готово' : 'Увага', res.message))
      .catch((err: unknown) =>
        Alert.alert(
          'Команда не пройшла',
          err instanceof Error ? err.message : 'Валідатор недоступний. Спробуйте ще раз.',
        ),
      );
  };

  const confirmClose = (): void => {
    Alert.alert(
      'Завершити перевірку?',
      'Використовуйте ручне завершення, лише якщо неможливо повторно прикласти QR до валідатора.',
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Завершити',
          style: 'destructive',
          onPress: () => void close().catch(() => Alert.alert('Помилка', 'Не вдалося завершити перевірку.')),
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={[styles.statusCard, inspection ? styles.statusActive : styles.statusInactive]}>
        <Text style={styles.statusEyebrow}>{inspection ? '● ПЕРЕВІРКА ТРИВАЄ' : 'ПЕРЕВІРКА НЕ РОЗПОЧАТА'}</Text>
        {inspection ? (
          <>
            <Text style={styles.statusTitle}>Маршрут {inspection.route_number} · ТЗ {inspection.vehicle_number}</Text>
            <Text style={styles.statusMeta}>
              {durationMinutes} хв · перевірено {inspection.checked_total} · постанов {inspection.fines_count}
            </Text>
            {autoCloseMinutes != null ? (
              <Text style={styles.statusCountdown}>
                ⏱ Автозавершення через {autoCloseMinutes} хв — потім зчитувачі відкриються
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.statusTitle}>Прикладіть цей QR до валідатора при вході</Text>
        )}
      </View>

      {inspection ? (
        <ReadersBlockCard readers={readers} audience="controller" showWhenNormal>
          {needsReadersRetry ? (
            <Pressable
              style={[styles.readersRetry, readersPending && styles.disabled]}
              disabled={readersPending}
              onPress={retryReadersBlock}
            >
              <Text style={styles.readersRetryText}>
                {readersPending ? 'Відправляємо команду…' : 'Заблокувати зчитувачі ще раз'}
              </Text>
            </Pressable>
          ) : null}
        </ReadersBlockCard>
      ) : null}

      <View style={styles.qrCard}>
        <Text style={styles.heading}>Особистий QR контролера</Text>
        <Text style={styles.hint}>
          Перше прикладання розпочинає перевірку. Повторне прикладання у цьому транспорті завершує її.
          Якщо не завершити — перевірка закриється сама, і зчитувачі відкриються.
        </Text>
        <View style={styles.qrBox}>
          {isLoading ? <ActivityIndicator size="large" color={c.primary} /> : null}
          {!isLoading && credential ? (
            <QRCode
              value={credential.qr_code}
              size={VALIDATOR_QR_SIZE}
              backgroundColor="#ffffff"
              color="#101828"
            />
          ) : null}
          {!isLoading && !credential ? (
            <Text style={styles.error}>{error?.message ?? 'QR поки недоступний'}</Text>
          ) : null}
        </View>
        {credential ? <Text style={styles.code}>{credential.masked_code}</Text> : null}
        <Text style={styles.scanState}>
          {isFetching ? 'Перевіряємо валідатор…' : 'Очікуємо сканування валідатором'}
        </Text>
        <Text style={styles.securityHint}>Не передавайте та не фотографуйте цей QR для інших осіб.</Text>
      </View>

      {inspection ? (
        <Pressable
          style={[styles.closeButton, isClosing && styles.disabled]}
          disabled={isClosing}
          onPress={confirmClose}
        >
          <Text style={styles.closeButtonText}>{isClosing ? 'Завершення…' : 'Завершити вручну'}</Text>
        </Pressable>
      ) : null}

    </ScrollView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, gap: 14, paddingBottom: 32, width: '100%', alignSelf: 'center', maxWidth: CONTENT_MAX_WIDTH },
    statusCard: { borderRadius: 18, padding: 18, borderWidth: 1, gap: 6 },
    statusActive: { backgroundColor: c.successSoft, borderColor: c.success },
    statusInactive: { backgroundColor: c.primarySoft, borderColor: c.primary },
    statusEyebrow: { color: c.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
    statusTitle: { color: c.text, fontSize: 19, fontWeight: '800' },
    statusMeta: { color: c.textMuted, fontSize: 13 },
    statusCountdown: { color: c.warning, fontSize: 13, fontWeight: '700' },
    qrCard: {
      backgroundColor: c.surface,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 22,
      padding: 20,
      alignItems: 'center',
      gap: 12,
    },
    heading: { color: c.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
    hint: { color: c.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    qrBox: {
      width: 112,
      height: 112,
      borderRadius: 18,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    code: { color: c.text, fontFamily: 'Menlo', fontWeight: '800', fontSize: 15 },
    scanState: { color: c.textMuted, fontSize: 12, textAlign: 'center' },
    securityHint: { color: c.warning, fontSize: 12, textAlign: 'center' },
    error: { color: c.danger, padding: 18, textAlign: 'center' },
    closeButton: {
      backgroundColor: c.dangerSoft,
      borderColor: c.danger,
      borderWidth: 1,
      paddingVertical: 15,
      borderRadius: 15,
      alignItems: 'center',
    },
    closeButtonText: { color: c.danger, fontSize: 15, fontWeight: '800' },
    readersRetry: {
      backgroundColor: c.surface,
      borderColor: c.danger,
      borderWidth: 1,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
    },
    readersRetryText: { color: c.danger, fontSize: 14, fontWeight: '800' },
    disabled: { opacity: 0.55 },
  });
}
