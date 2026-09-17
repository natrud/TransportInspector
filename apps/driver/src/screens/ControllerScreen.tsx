import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  type ColorPalette,
  CONTENT_MAX_WIDTH,
  type ControllerCall,
  type ReadersCommandResult,
  type RouteInspection,
  ReadersBlockCard,
  formatRelative,
  formatTime,
  minutesUntil,
  useActiveTrip,
  useCallController,
  useCancelControllerCall,
  useCloseRouteInspection,
  useColors,
  useMyControllerCalls,
  useRouteInspection,
  useRouteReaderControls,
  useRoutes,
  useSession,
} from '@transport/shared';
import type { RootStackParamList } from '../app/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Controller'>;

const CALL_STATUS_LABEL: Record<string, string> = {
  pending: 'Очікує',
  accepted: 'Прийнято',
  completed: 'Завершено',
  cancelled: 'Скасовано',
};

export function ControllerScreen({ navigation }: Props): JSX.Element {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { session } = useSession();
  const { trip } = useActiveTrip(session?.serial_number);
  const routeNumber = trip?.route_id ?? session?.assigned_route_id ?? null;
  const vehicleNumber = session?.assigned_vehicle_number ?? null;
  const { routes } = useRoutes({ withValidator: true });
  const routeLabel = useMemo(
    () => routes.find((r) => r.id === routeNumber)?.name ?? routeNumber,
    [routes, routeNumber],
  );

  const { calls, activeCall, isLoading, refetch } = useMyControllerCalls(20);
  const { data: inspection, isFetching, refetch: refetchInsp } = useRouteInspection(
    routeNumber,
    vehicleNumber,
  );
  const { call: placeCall, isPending: calling } = useCallController();
  const { cancel, isPending: cancelling } = useCancelControllerCall();
  const { close: closeInspection, isPending: closing } = useCloseRouteInspection();
  const { setBlocked: setReadersBlocked, isPending: readersPending } = useRouteReaderControls();

  const onRefresh = (): void => {
    void refetch();
    void refetchInsp();
  };

  const onCall = async (): Promise<void> => {
    if (!session || !routeNumber) {
      Alert.alert('Спершу оберіть маршрут', 'Поверніться на головний екран і оберіть маршрут.');
      return;
    }
    try {
      await placeCall({ driverSerial: session.serial_number, routeId: routeNumber, reason: 'driver_request' });
      await refetch();
    } catch (err) {
      Alert.alert('Не вдалося викликати контролера', err instanceof Error ? err.message : 'unknown');
    }
  };

  const onCancel = (): void => {
    if (!activeCall) return;
    Alert.alert('Скасувати виклик?', 'Контролер більше не побачить цей виклик.', [
      { text: 'Ні', style: 'cancel' },
      {
        text: 'Скасувати виклик',
        style: 'destructive',
        onPress: () => void cancel(activeCall.id).then(() => refetch()),
      },
    ]);
  };

  const onCloseInspection = (): void => {
    if (!routeNumber) return;
    Alert.alert('Завершити перевірку?', 'Якщо контролер уже зійшов, а перевірка досі активна.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Завершити',
        style: 'destructive',
        onPress: () =>
          void closeInspection({ routeNumber, vehicleNumber })
            .then(() => onRefresh())
            .catch(() => Alert.alert('Помилка', 'Не вдалося завершити перевірку.')),
      },
    ]);
  };

  // Резервне керування зчитувачами. Звичайний шлях — автоматика на старті
  // перевірки; ці кнопки потрібні, якщо у контролера щось не спрацювало.
  const readers = inspection?.readers ?? null;

  const applyReaders = (blocked: boolean, route: string, vehicle: string): void => {
    void setReadersBlocked({ blocked, routeNumber: route, vehicleNumber: vehicle })
      .then((res: ReadersCommandResult) => {
        onRefresh();
        Alert.alert(
          res.ok ? (blocked ? 'Зчитувачі заблоковано' : 'Зчитувачі розблоковано') : 'Увага',
          res.message,
        );
      })
      .catch((err: unknown) =>
        Alert.alert(
          'Команда не пройшла',
          err instanceof Error ? err.message : 'Валідатор недоступний. Спробуйте ще раз.',
        ),
      );
  };

  const onReadersCommand = (blocked: boolean): void => {
    if (!routeNumber) {
      Alert.alert('Спершу оберіть маршрут', 'Поверніться на головний екран і оберіть маршрут.');
      return;
    }
    if (!vehicleNumber) {
      Alert.alert(
        'Спершу оберіть транспортний засіб',
        'Без номера ТЗ команда пішла б на всі машини маршруту. Оберіть свій ТЗ на головному екрані.',
      );
      return;
    }
    const scope = `маршрут ${routeNumber} · ТЗ ${vehicleNumber}`;
    if (blocked) {
      Alert.alert(
        'Увага!',
        `Ця команда заблокує валідатори на маршруті (${scope}).\n\n` +
          'Пасажири не зможуть оплатити проїзд, доки зчитувачі не розблокують. ' +
          'Використовуйте, лише якщо цього не зробила автоматика перевірки.',
        [
          { text: 'Скасувати', style: 'cancel' },
          {
            text: 'Заблокувати',
            style: 'destructive',
            onPress: () => applyReaders(true, routeNumber, vehicleNumber),
          },
        ],
      );
      return;
    }
    Alert.alert(
      'Розблокувати зчитувачі?',
      `Валідація на ${scope} відновиться одразу.\n\n` +
        'Якщо контролер ще перевіряє квитки — не розблоковуйте.',
      [
        { text: 'Скасувати', style: 'cancel' },
        { text: 'Розблокувати', onPress: () => applyReaders(false, routeNumber, vehicleNumber) },
      ],
    );
  };

  const busy = calling || cancelling || closing;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isFetching || isLoading} onRefresh={onRefresh} />}
    >
      <Text style={styles.routeLine}>
        Маршрут: <Text style={styles.routeStrong}>{routeLabel ?? 'не обрано'}</Text>
        {vehicleNumber ? ` · ТЗ ${vehicleNumber}` : ''}
      </Text>

      <Hero
        call={activeCall}
        lastCall={calls[0] ?? null}
        inspection={inspection}
        busy={busy}
        onCall={() => void onCall()}
        onCancel={onCancel}
        onCloseInspection={onCloseInspection}
        styles={styles}
      />

      {activeCall?.status === 'accepted' || inspection?.state === 'active' ? (
        <ContactCard call={activeCall ?? calls[0] ?? null} styles={styles} />
      ) : null}

      {inspection && inspection.state !== 'none' ? (
        <StatsCard inspection={inspection} styles={styles} />
      ) : null}

      <Text style={styles.sectionLabel}>Зчитувачі у транспорті</Text>
      <ReadersBlockCard readers={readers} audience="driver" showWhenNormal>
        <View style={styles.readersRow}>
          <Pressable
            style={[styles.readersBtn, styles.readersBtnBlock, readersPending && styles.readersBtnDisabled]}
            onPress={() => onReadersCommand(true)}
            disabled={readersPending}
          >
            {readersPending ? (
              <ActivityIndicator color={c.danger} />
            ) : (
              <Text style={styles.readersBtnBlockLabel}>Заблокувати</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.readersBtn, styles.readersBtnUnblock, readersPending && styles.readersBtnDisabled]}
            onPress={() => onReadersCommand(false)}
            disabled={readersPending}
          >
            <Text style={styles.readersBtnUnblockLabel}>Розблокувати</Text>
          </Pressable>
        </View>
        <Text style={styles.readersHint}>
          Резервні кнопки. Зазвичай зчитувачі блокуються самі, щойно контролер починає
          перевірку, і розблоковуються, коли він її завершує.
        </Text>
      </ReadersBlockCard>

      <Text style={styles.sectionLabel}>Історія викликів</Text>
      {calls.length === 0 ? (
        <Text style={styles.hint}>Ви ще не викликали контролера.</Text>
      ) : (
        calls.map((call) => <CallRow key={call.id} call={call} styles={styles} />)
      )}

      <Pressable style={styles.backLink} onPress={() => navigation.goBack()}>
        <Text style={styles.backLinkLabel}>‹ На головний екран</Text>
      </Pressable>
    </ScrollView>
  );
}

function Hero({
  call,
  lastCall,
  inspection,
  busy,
  onCall,
  onCancel,
  onCloseInspection,
  styles,
}: {
  call: ControllerCall | null;
  lastCall: ControllerCall | null;
  inspection: RouteInspection | null;
  busy: boolean;
  onCall: () => void;
  onCancel: () => void;
  onCloseInspection: () => void;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  const state = inspection?.state ?? 'none';
  const mins = inspection ? Math.max(0, Math.floor(inspection.durationSeconds / 60)) : 0;
  const autoCloseMins = minutesUntil(inspection?.autoCloseAt);

  // 1. Контролер на рейсі — головний стан.
  if (state === 'active') {
    return (
      <View style={[styles.hero, styles.heroActive]}>
        <Text style={styles.heroEyebrow}>● КОНТРОЛЕР ПРАЦЮЄ НА РЕЙСІ</Text>
        <Text style={styles.heroTitle}>{inspection?.inspectorName ?? 'Контролер на маршруті'}</Text>
        <Text style={styles.heroMeta}>
          {mins} хв на рейсі · перевірка триває
          {autoCloseMins != null
            ? `\nЗавершиться сама через ${autoCloseMins} хв, якщо контролер не закриє її раніше.`
            : ''}
        </Text>
        <Pressable
          style={[styles.heroBtn, styles.heroBtnDanger, busy && styles.heroBtnDisabled]}
          onPress={onCloseInspection}
          disabled={busy}
        >
          <Text style={styles.heroBtnDangerLabel}>Завершити перевірку</Text>
        </Pressable>
      </View>
    );
  }

  if (state === 'recently_ended') {
    return (
      <View style={[styles.hero, styles.heroDone]}>
        <Text style={styles.heroEyebrow}>🏁 ПЕРЕВІРКУ ЗАВЕРШЕНО</Text>
        <Text style={styles.heroTitle}>{inspection?.inspectorName ?? 'Контролер'}</Text>
        <Text style={styles.heroMeta}>
          Тривала {mins} хв · перевірено {inspection?.checkedTotal ?? 0} · постанов{' '}
          {inspection?.finesCount ?? 0}
        </Text>
      </View>
    );
  }

  // 2. Виклик у процесі.
  if (call?.status === 'pending') {
    return (
      <View style={[styles.hero, styles.heroPending]}>
        <Text style={styles.heroEyebrow}>⏳ ОЧІКУЄМО ПІДТВЕРДЖЕННЯ</Text>
        <Text style={styles.heroTitle}>Виклик надіслано контролерам</Text>
        <Text style={styles.heroMeta}>
          Надіслано о {formatTime(call.createdAt)}. Щойно хтось прийме — побачите контакти тут.
        </Text>
        <Pressable
          style={[styles.heroBtn, styles.heroBtnGhost, busy && styles.heroBtnDisabled]}
          onPress={onCancel}
          disabled={busy}
        >
          <Text style={styles.heroBtnGhostLabel}>Скасувати виклик</Text>
        </Pressable>
      </View>
    );
  }

  if (call?.status === 'accepted') {
    return (
      <View style={[styles.hero, styles.heroDone]}>
        <Text style={styles.heroEyebrow}>✓ ВИКЛИК ПРИЙНЯТО</Text>
        <Text style={styles.heroTitle}>Контролер прямує на маршрут</Text>
        <Text style={styles.heroMeta}>
          {call.acceptedAt ? `Прийнято о ${formatTime(call.acceptedAt)}. ` : ''}
          Коли контролер провалідується на рейсі — тут з'явиться статистика.
        </Text>
        <Pressable
          style={[styles.heroBtn, styles.heroBtnGhost, busy && styles.heroBtnDisabled]}
          onPress={onCancel}
          disabled={busy}
        >
          <Text style={styles.heroBtnGhostLabel}>Скасувати виклик</Text>
        </Pressable>
      </View>
    );
  }

  // 3. Нема активного виклику. Показуємо результат останнього, якщо свіжий.
  const lastDone =
    lastCall && (lastCall.status === 'completed' || lastCall.status === 'cancelled')
      ? lastCall
      : null;

  return (
    <View style={[styles.hero, styles.heroIdle]}>
      <Text style={styles.heroEyebrow}>ВИКЛИК КОНТРОЛЕРА</Text>
      <Text style={styles.heroTitle}>
        {lastDone?.status === 'completed'
          ? 'Попередній виклик завершено'
          : lastDone?.status === 'cancelled'
            ? 'Попередній виклик скасовано'
            : 'Контролера не викликано'}
      </Text>
      <Text style={styles.heroMeta}>
        Виклик контролера на ваш рейс. Він підтвердить, приїде, і ви бачитимете його роботу в реальному часі.
      </Text>
      <Pressable
        style={[styles.heroBtn, styles.heroBtnPrimary, busy && styles.heroBtnDisabled]}
        onPress={onCall}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.heroBtnPrimaryLabel}>Викликати контролера</Text>
        )}
      </Pressable>
    </View>
  );
}

function ContactCard({
  call,
  styles,
}: {
  call: ControllerCall | null;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element | null {
  if (!call?.acceptedByDisplayName && !call?.acceptedBySerial) return null;
  return (
    <View style={styles.contactCard}>
      <Text style={styles.contactLabel}>КОНТРОЛЕР</Text>
      <Text style={styles.contactName}>{call.acceptedByDisplayName ?? "Ім'я не вказано"}</Text>
      <Text style={styles.contactMeta}>№ {call.acceptedBySerial ?? '—'}</Text>
      <Pressable
        onPress={() => {
          if (call.acceptedByPhone) void Linking.openURL(`tel:${call.acceptedByPhone}`);
        }}
        disabled={!call.acceptedByPhone}
      >
        <Text style={styles.contactPhone}>
          {call.acceptedByPhone ?? 'Номер телефону не задано'}
        </Text>
      </Pressable>
    </View>
  );
}

function StatsCard({
  inspection,
  styles,
}: {
  inspection: RouteInspection;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  return (
    <View style={styles.statsCard}>
      <Text style={styles.statsLabel}>ДІЇ КОНТРОЛЕРА ЗА ПЕРЕВІРКУ</Text>
      <View style={styles.statsRow}>
        <Stat value={inspection.checkedTotal} label="Перевірено" styles={styles} />
        <Stat value={inspection.validCount} label="Валідних" styles={styles} />
        <Stat value={inspection.invalidCount} label="Невалідних" styles={styles} />
        <Stat value={inspection.finesCount} label="Постанов" styles={styles} />
      </View>
    </View>
  );
}

function Stat({
  value,
  label,
  styles,
}: {
  value: number;
  label: string;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CallRow({
  call,
  styles,
}: {
  call: ControllerCall;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  return (
    <View style={styles.callRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.callRoute}>
          {call.routeId ? `Маршрут ${call.routeId}` : 'Маршрут не вказано'}
        </Text>
        <Text style={styles.callMeta}>
          {formatTime(call.createdAt)} · {formatRelative(call.createdAt)}
        </Text>
      </View>
      <Text
        style={[
          styles.callStatus,
          call.status === 'cancelled' && styles.callStatusMuted,
        ]}
      >
        {CALL_STATUS_LABEL[call.status] ?? call.status}
      </Text>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, gap: 12, paddingBottom: 40, width: '100%', alignSelf: 'center', maxWidth: CONTENT_MAX_WIDTH },

    routeLine: { color: c.textMuted, fontSize: 13 },
    routeStrong: { color: c.text, fontWeight: '800' },

    hero: { borderRadius: 18, borderWidth: 1, padding: 18, gap: 6 },
    heroIdle: { backgroundColor: c.primarySoft, borderColor: c.primary },
    heroPending: { backgroundColor: c.warningSoft, borderColor: c.warning },
    heroDone: { backgroundColor: c.surface, borderColor: c.border },
    heroActive: { backgroundColor: c.successSoft, borderColor: c.success },
    heroEyebrow: { color: c.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
    heroTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
    heroMeta: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    heroBtn: { marginTop: 10, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
    heroBtnDisabled: { opacity: 0.5 },
    heroBtnPrimary: { backgroundColor: c.primary },
    heroBtnPrimaryLabel: { color: '#fff', fontWeight: '800', fontSize: 15 },
    heroBtnDanger: { backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.danger },
    heroBtnDangerLabel: { color: c.danger, fontWeight: '800', fontSize: 15 },
    heroBtnGhost: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    heroBtnGhostLabel: { color: c.textMuted, fontWeight: '700', fontSize: 14 },

    contactCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
      padding: 14,
      gap: 2,
    },
    contactLabel: { color: c.primary, fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
    contactName: { color: c.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
    contactMeta: { color: c.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
    contactPhone: { color: c.primary, fontSize: 15, fontWeight: '800', marginTop: 6 },

    statsCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      padding: 14,
      gap: 8,
    },
    statsLabel: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    statsRow: { flexDirection: 'row', gap: 6 },
    stat: {
      flex: 1,
      backgroundColor: c.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 10,
      alignItems: 'center',
      gap: 2,
    },
    statValue: { color: c.text, fontSize: 22, fontWeight: '900' },
    statLabel: { color: c.textMuted, fontSize: 10, fontWeight: '600' },

    readersRow: { flexDirection: 'row', gap: 8 },
    readersBtn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    readersBtnDisabled: { opacity: 0.5 },
    readersBtnBlock: { backgroundColor: c.surface, borderColor: c.danger },
    readersBtnBlockLabel: { color: c.danger, fontWeight: '800', fontSize: 14 },
    readersBtnUnblock: { backgroundColor: c.surface, borderColor: c.borderStrong },
    readersBtnUnblockLabel: { color: c.text, fontWeight: '800', fontSize: 14 },
    readersHint: { color: c.textMuted, fontSize: 12, lineHeight: 17 },

    sectionLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 6,
    },
    hint: { fontSize: 13, color: c.textMuted, lineHeight: 19 },
    callRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
    },
    callRoute: { color: c.text, fontWeight: '700', fontSize: 14 },
    callMeta: { color: c.textMuted, fontSize: 11, marginTop: 2 },
    callStatus: { color: c.primary, fontWeight: '800', fontSize: 12 },
    callStatusMuted: { color: c.textSoft },

    backLink: { paddingVertical: 14, alignItems: 'center' },
    backLinkLabel: { color: c.textMuted, fontWeight: '700', fontSize: 14 },
  });
}
