import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  type PassengerTapStats,
  type PaymentComparison,
  type RouteActivityEntry,
  type RouteInspection,
  ReadersBlockCard,
  TicketFareType,
  formatFareType,
  formatRelative,
  formatTicketPrice,
  formatTime,
  formatTransport,
  minutesUntil,
  tap as hapticTap,
  useActiveTrip,
  useColors,
  useLayout,
  useMyControllerCalls,
  usePassengerCounterActions,
  usePassengerStats,
  usePaymentComparison,
  useRouteActivity,
  useRouteInspection,
  useRoutes,
  useSelectRoute,
  useSelectVehicle,
  useSession,
  useSettings,
  useTripActions,
  useVehicles,
} from '@transport/shared';
import type { RootStackParamList } from '../app/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props): JSX.Element {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { session } = useSession();
  const { settings } = useSettings();
  const layout = useLayout();
  const routeId = session?.assigned_route_id ?? null;
  const vehicleNumber = session?.assigned_vehicle_number ?? null;
  const { routes, refetch: refetchRoutes } = useRoutes({ withValidator: true });
  const { selectRoute } = useSelectRoute();
  const { selectVehicle } = useSelectVehicle();
  const { trip, isLoading: tripLoading, refetch: refetchTrip } = useActiveTrip(session?.serial_number);
  // An old local session can have a vehicle but no selected route. An active
  // trip already stores the actual route, so it is the source of truth until
  // the trip is ended.
  const currentRouteId = trip?.route_id ?? routeId;
  const routeMeta = useMemo(
    () => routes.find((r) => r.id === currentRouteId) ?? null,
    [routes, currentRouteId],
  );
  const { start, end, isPending: tripPending } = useTripActions();
  const { stats: passengerStats } = usePassengerStats(trip?.id ?? null);
  const passengers = passengerStats.boarded;
  const {
    board,
    alight,
    undo,
    isPending: counterPending,
  } = usePassengerCounterActions(trip?.id ?? null);
  const tripStartedAt = trip?.started_at ?? null;
  const {
    data: activity,
    isLoading: activityLoading,
    isFetching,
    error: activityError,
    refetch: refetchActivity,
  } = useRouteActivity(currentRouteId, tripStartedAt, vehicleNumber);
  const { comparison } = usePaymentComparison({
    tripId: trip?.id ?? null,
    routeId: currentRouteId,
    sinceMs: tripStartedAt,
    vehicleNumber,
  });
  const { activeCall } = useMyControllerCalls(5);
  const { data: inspection } = useRouteInspection(currentRouteId, vehicleNumber);
  const controllerOnRoute = inspection?.state === 'active';
  const callPending = activeCall?.status === 'pending';
  const callAccepted = activeCall?.status === 'accepted';

  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState<'route' | 'vehicle'>('route');
  const [pendingRouteId, setPendingRouteId] = useState<string | null>(null);
  const { vehicles, refetch: refetchVehicles } = useVehicles(pendingRouteId ?? currentRouteId);

  const openPicker = (): void => {
    setPendingRouteId(null);
    setPickerStep('route');
    setRoutePickerOpen(true);
    // Список маршрутів кешується на 30 хв — при відкритті picker'а форсуємо
    // свіжий запит, щоб зміни адміна (новий route_number у валідаторі)
    // з'являлись без перезапуску застосунку.
    void refetchRoutes();
  };

  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (autoOpened || tripLoading || trip) return;
    if (!routeId && routes.length > 0) {
      setPickerStep('route');
      setRoutePickerOpen(true);
      setAutoOpened(true);
    } else if (routeId && !vehicleNumber && vehicles.length > 0) {
      setPendingRouteId(routeId);
      setPickerStep('vehicle');
      setRoutePickerOpen(true);
      setAutoOpened(true);
    }
  }, [autoOpened, routeId, routes.length, vehicleNumber, vehicles.length, trip, tripLoading]);

  const onPickRoute = async (id: string): Promise<void> => {
    await selectRoute(id);
    setPendingRouteId(id);
    setPickerStep('vehicle');
    void refetchVehicles();
  };

  const onPickVehicle = async (v: string): Promise<void> => {
    await selectVehicle(v);
    setRoutePickerOpen(false);
    setPickerStep('route');
    setPendingRouteId(null);
  };

  const [lastSeenCount, setLastSeenCount] = useState(0);
  useEffect(() => {
    if (!activity) return;
    if (activity.entries.length > lastSeenCount && lastSeenCount > 0) {
      hapticTap('new-activity');
    }
    setLastSeenCount(activity.entries.length);
  }, [activity, lastSeenCount]);

  const onStartTrip = async (): Promise<void> => {
    if (!session) return;
    // Без маршруту рейс стартувати нікуди. Раніше тап просто нічого не робив —
    // водій тиснув кнопку і не розумів, чому.
    if (!routeId) {
      Alert.alert(
        'Спершу оберіть маршрут',
        'Рейс привʼязується до маршруту й транспортного засобу — оберіть їх угорі екрана.',
        [
          { text: 'Скасувати', style: 'cancel' },
          { text: 'Обрати маршрут', onPress: openPicker },
        ],
      );
      return;
    }
    try {
      await start({ driverSerial: session.serial_number, routeId });
    } catch (err) {
      Alert.alert(
        'Не вдалося розпочати рейс',
        err instanceof Error ? err.message : 'Спробуйте ще раз.',
      );
    }
  };

  const onEndTrip = async (): Promise<void> => {
    if (!trip) return;
    Alert.alert(
      'Завершити рейс?',
      `Прийнято пасажирів: ${passengers}. Дані буде заархівовано і лічильник скинеться.`,
      [
        { text: 'Скасувати', style: 'cancel' },
        {
          text: 'Завершити',
          style: 'destructive',
          onPress: async () => {
            try {
              await end(trip.id);
            } catch (err) {
              Alert.alert(
                'Не вдалося завершити рейс',
                err instanceof Error ? err.message : 'Спробуйте ще раз.',
              );
            }
            await refetchTrip();
          },
        },
      ],
    );
  };

  // Кнопка у шапці — ВХІД У ПІДМЕНЮ «Контролер», а не сам виклик. Сам виклик
  // та решта дій живуть на екрані Controller; тут показуємо лише поточний
  // статус, щоб водій з головного екрана бачив: викликано / прийнято / на рейсі.
  const controllerStatus = controllerOnRoute
    ? { label: 'На рейсі', dot: styles.headerDotActive }
    : callAccepted
      ? { label: 'Прийнято', dot: styles.headerDotAccepted }
      : callPending
        ? { label: 'Очікує', dot: styles.headerDotPending }
        : { label: 'Не викликано', dot: styles.headerDotIdle };

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate('Controller')}
          hitSlop={10}
          style={styles.headerMenuBtn}
          accessibilityRole="button"
          accessibilityLabel={`Меню «Контролер». Статус: ${controllerStatus.label}`}
        >
          <View style={[styles.headerDot, controllerStatus.dot]} />
          <View>
            <Text style={styles.headerMenuLabel}>Контролер</Text>
            <Text style={styles.headerMenuStatus}>{controllerStatus.label}</Text>
          </View>
          <Text style={styles.headerMenuChevron}>›</Text>
        </Pressable>
      ),
    });
  }, [navigation, styles, controllerStatus.label, controllerStatus.dot]);

  const onRefresh = (): void => {
    if (currentRouteId) void refetchActivity();
    void refetchTrip();
  };

  // Широке вікно (планшет в альбомній) — дві колонки: ліворуч стан рейсу і
  // контролера, праворуч — те, з чим водій працює руками. У портреті та на
  // телефоні все лишається однією смугою.
  const twoColumns = layout.isWide;

  const statusColumn = (
    <>
      <Pressable style={styles.header} onPress={openPicker}>
        <Text style={styles.eyebrow}>Маршрут</Text>
        {routeMeta ? (
          <Text style={styles.title}>
            {routeMeta.code} · {routeMeta.name}
          </Text>
        ) : currentRouteId ? (
          <Text style={styles.titleMuted}>Маршрут активного рейсу</Text>
        ) : (
          <Text style={styles.titleMuted}>Маршрут не обрано</Text>
        )}
        <Text style={vehicleNumber ? styles.vehicleLine : styles.vehicleLineMuted}>
          {vehicleNumber ? `ТЗ ${vehicleNumber}` : 'ТЗ не обрано'}
        </Text>
        <Text style={styles.routeChangeHint}>
          {trip && !routeId ? 'маршрут взято з активного рейсу' : 'змінити ›'}
        </Text>
        <Text style={styles.driverName}>{session?.display_name ?? 'Гість'} · {session?.serial_number}</Text>
      </Pressable>

      <TripCard
        trip={trip}
        onStart={onStartTrip}
        onEnd={onEndTrip}
        pending={tripPending}
        styles={styles}
      />

      {/* Зчитувачі заблоковані — це перше, що має пояснити водієві, чому
          пасажири не можуть оплатити. Тап веде на екран керування. */}
      <ReadersBlockCard
        readers={inspection?.readers ?? null}
        audience="driver"
        onPress={() => navigation.navigate('Controller')}
      />

      {inspection && inspection.state !== 'none' ? (
        <Pressable onPress={() => navigation.navigate('Controller')}>
          <ControllerOnRouteCard inspection={inspection} styles={styles} />
        </Pressable>
      ) : callPending || callAccepted ? (
        <Pressable style={styles.callBanner} onPress={() => navigation.navigate('Controller')}>
          <Text style={styles.callBannerIcon}>{callAccepted ? '✓' : '⏳'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.callBannerTitle}>
              {callAccepted ? 'Контролер прийняв виклик' : 'Виклик контролера надіслано'}
            </Text>
            <Text style={styles.callBannerHint}>
              {callAccepted
                ? 'Прямує на маршрут. Деталі та контакт — тут.'
                : 'Очікуємо підтвердження. Тап — деталі.'}
            </Text>
          </View>
          <Text style={styles.callBannerChevron}>›</Text>
        </Pressable>
      ) : null}

    </>
  );

  const workColumn = (
    <>
      {comparison ? <PaymentComparisonCard comparison={comparison} styles={styles} /> : null}

      {settings.passengerCounterEnabled ? (
        <PassengerCounterCard
          stats={passengerStats}
          onBoard={() => void board()}
          onAlight={() => void alight()}
          onUndo={() => void undo()}
          pending={counterPending}
          disabled={!trip}
          styles={styles}
        />
      ) : null}

      {activity ? (
        <ActivityCard
          activity={activity}
          interval={settings.pollIntervalMs}
          initiallyCollapsed={!!trip}
          tripActive={!!trip}
          styles={styles}
        />
      ) : (
        <ActivityStateCard
          hasRoute={!!currentRouteId}
          loading={activityLoading || isFetching}
          error={activityError}
          color={c.primary}
          onPress={currentRouteId ? () => void refetchActivity() : openPicker}
          styles={styles}
        />
      )}

      <Pressable style={styles.settingsLink} onPress={() => navigation.navigate('Settings')}>
        <Text style={styles.settingsLinkLabel}>Налаштування</Text>
      </Pressable>
    </>
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        { maxWidth: layout.contentMaxWidth },
        twoColumns && styles.scrollContentWide,
      ]}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} />}
    >
      {twoColumns ? (
        <View style={styles.columnsRow}>
          <View style={styles.column}>{statusColumn}</View>
          <View style={styles.column}>{workColumn}</View>
        </View>
      ) : (
        <>
          {statusColumn}
          {workColumn}
        </>
      )}

      <Modal
        visible={routePickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setRoutePickerOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setRoutePickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            {pickerStep === 'route' ? (
              <>
                <Text style={styles.modalTitle}>Оберіть маршрут</Text>
                <ScrollView>
                  {routes.length === 0 ? (
                    <Text style={styles.modalEmptyHint}>
                      Ще немає жодного маршруту з валідатором. Зверніться до адміністратора —
                      потрібно вказати номер маршруту в картці валідатора.
                    </Text>
                  ) : (
                    routes.map((r) => (
                      <Pressable
                        key={r.id}
                        style={[styles.routePickerRow, currentRouteId === r.id && styles.routePickerRowActive]}
                        onPress={() => void onPickRoute(r.id)}
                      >
                        <Text style={styles.routePickerCode}>{r.code}</Text>
                        <Text style={styles.routePickerName}>{r.name}</Text>
                        {routeId === r.id ? <Text style={styles.routePickerCheck}>✓</Text> : null}
                      </Pressable>
                    ))
                  )}
                </ScrollView>
                <Pressable style={styles.modalCancel} onPress={() => setRoutePickerOpen(false)}>
                  <Text style={styles.modalCancelLabel}>Скасувати</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Оберіть транспортний номер</Text>
                <ScrollView>
                  {vehicles.length === 0 ? (
                    <Text style={styles.modalEmptyHint}>
                      Для цього маршруту не вказано транспортні номери.
                    </Text>
                  ) : (
                    vehicles.map((v) => (
                      <Pressable
                        key={v}
                        style={[styles.routePickerRow, vehicleNumber === v && styles.routePickerRowActive]}
                        onPress={() => void onPickVehicle(v)}
                      >
                        <Text style={styles.routePickerCode}>{v}</Text>
                        {vehicleNumber === v ? <Text style={styles.routePickerCheck}>✓</Text> : null}
                      </Pressable>
                    ))
                  )}
                </ScrollView>
                <Pressable
                  style={styles.modalBack}
                  onPress={() => {
                    setPickerStep('route');
                    setPendingRouteId(null);
                  }}
                >
                  <Text style={styles.modalBackLabel}>‹ Назад до маршруту</Text>
                </Pressable>
                <Pressable style={styles.modalCancel} onPress={() => setRoutePickerOpen(false)}>
                  <Text style={styles.modalCancelLabel}>Скасувати</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function TripCard({
  trip,
  onStart,
  onEnd,
  pending,
  styles,
}: {
  trip: { id: string; started_at: number } | null;
  onStart: () => Promise<void>;
  onEnd: () => Promise<void>;
  pending: boolean;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  if (!trip) {
    return (
      <Pressable
        style={[styles.tripCard, styles.tripCardStart, pending && styles.tripCardDisabled]}
        onPress={() => void onStart()}
        disabled={pending}
      >
        <Text style={styles.tripCardEyebrow}>Рейс</Text>
        <Text style={styles.tripCardTitle}>Розпочати рейс</Text>
        <Text style={styles.tripCardHint}>
          Стартує сесію, скидає лічильник пасажирів і починає журналити активність.
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      style={[styles.tripCard, styles.tripCardEnd, pending && styles.tripCardDisabled]}
      onPress={() => void onEnd()}
      disabled={pending}
    >
      <Text style={styles.tripCardEyebrow}>
        Рейс активний з {formatTime(new Date(trip.started_at).toISOString())}
      </Text>
      <Text style={styles.tripCardTitle}>Завершити рейс</Text>
      <Text style={styles.tripCardHint}>Зафіксує підсумок і вимкне лічильник до наступного рейсу.</Text>
    </Pressable>
  );
}

function ActivityStateCard({
  hasRoute,
  loading,
  error,
  color,
  onPress,
  styles,
}: {
  hasRoute: boolean;
  loading: boolean;
  error: Error | null;
  color: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  const title = !hasRoute
    ? 'Оберіть маршрут'
    : error
      ? 'Не вдалося завантажити активність'
      : 'Завантажуємо активність маршруту';
  const hint = !hasRoute
    ? 'Оберіть маршрут у верхній частині екрана, щоб побачити валідації.'
    : error
      ? 'Перевірте підключення до інтернету та повторіть спробу.'
      : 'Дані з’являться автоматично.';

  return (
    <View style={styles.activityStateCard}>
      {loading ? <ActivityIndicator color={color} /> : null}
      <Text style={styles.activityStateTitle}>{title}</Text>
      <Text style={styles.activityStateHint}>{hint}</Text>
      <Pressable style={styles.activityStateButton} onPress={onPress}>
        <Text style={styles.activityStateButtonLabel}>{hasRoute ? 'Оновити зараз' : 'Обрати маршрут'}</Text>
      </Pressable>
    </View>
  );
}

function PassengerCounterCard({
  stats,
  onBoard,
  onAlight,
  onUndo,
  pending,
  disabled,
  styles,
}: {
  stats: PassengerTapStats;
  onBoard: () => void;
  onAlight: () => void;
  onUndo: () => void;
  pending: boolean;
  disabled: boolean;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  // Плита поділена на три зони: ліворуч «вийшов» (−), праворуч «увійшов» (+),
  // посередині — лише інформація, без дії. Розділення по сторонах дозволяє
  // тапати наосліп, не дивлячись на екран.
  //
  // З порожнього салону виходити нікому — зона «вийшов» гасне. Інакше водій
  // тапає, число не змінюється, і незрозуміло чому.
  const salonEmpty = stats.onboard <= 0;
  const outDisabled = disabled || salonEmpty;

  return (
    <View style={styles.counterWrap}>
      <View style={[styles.counterTile, disabled && styles.counterTileDisabled]}>
        <Pressable
          style={[
            styles.counterZone,
            styles.counterZoneOut,
            outDisabled && styles.counterZoneMuted,
          ]}
          onPress={onAlight}
          disabled={outDisabled || pending}
          android_ripple={!outDisabled ? { color: 'rgba(0,0,0,0.08)' } : undefined}
          accessibilityRole="button"
          accessibilityState={{ disabled: outDisabled }}
          accessibilityLabel="Пасажир вийшов"
        >
          <Text
            style={[
              styles.counterSign,
              styles.counterSignOut,
              outDisabled && styles.counterTextMuted,
            ]}
          >
            −
          </Text>
          <Text style={[styles.counterZoneLabel, outDisabled && styles.counterTextMuted]}>
            ВИЙШОВ
          </Text>
          <Text style={[styles.counterZoneCount, outDisabled && styles.counterTextMuted]}>
            {stats.exited}
          </Text>
        </Pressable>

        {/* Середина — тільки інформація, тапи тут нічого не змінюють. */}
        <View style={styles.counterInfo}>
          <Text style={styles.counterInfoEyebrow}>У САЛОНІ</Text>
          <Text style={[styles.counterInfoValue, disabled && styles.counterTextMuted]}>
            {stats.onboard}
          </Text>
          <Text style={styles.counterInfoMeta}>
            {disabled ? 'рейс не розпочато' : `увійшло ${stats.boarded} · вийшло ${stats.exited}`}
          </Text>
        </View>

        <Pressable
          style={[styles.counterZone, styles.counterZoneIn, disabled && styles.counterZoneMuted]}
          onPress={onBoard}
          disabled={disabled || pending}
          android_ripple={!disabled ? { color: 'rgba(0,0,0,0.08)' } : undefined}
          accessibilityRole="button"
          accessibilityLabel="Пасажир увійшов"
        >
          <Text style={[styles.counterSign, styles.counterSignIn, disabled && styles.counterTextMuted]}>
            +
          </Text>
          <Text style={[styles.counterZoneLabel, disabled && styles.counterTextMuted]}>УВІЙШОВ</Text>
          <Text style={[styles.counterZoneCount, disabled && styles.counterTextMuted]}>
            {stats.boarded}
          </Text>
        </Pressable>
      </View>

      {!disabled ? (
        <Pressable
          style={[styles.counterUndo, (pending || stats.taps === 0) && styles.counterUndoDisabled]}
          onPress={onUndo}
          disabled={pending || stats.taps === 0}
        >
          <Text style={styles.counterUndoLabel}>Відмінити останній тап</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PaymentComparisonCard({
  comparison,
  styles,
}: {
  comparison: PaymentComparison;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  const windowMin = Math.round(comparison.windowMs / 60_000);
  // Колір підсумку за severity — щоб «зайці» читались без вчитування в текст.
  const messageTone =
    comparison.severity === 'danger'
      ? styles.compareMessageDanger
      : comparison.severity === 'warn'
        ? styles.compareMessageWarn
        : comparison.severity === 'ok'
          ? styles.compareMessageOk
          : null;
  return (
    <View style={styles.compareCard}>
      <Text style={styles.compareEyebrow}>КОНТРОЛЬ ОПЛАТИ ЗА {windowMin} ХВ</Text>
      <View style={styles.compareRow}>
        <ComparePiece value={comparison.entered} label="Увійшло" styles={styles} />
        <ComparePiece value={comparison.validated} label="Валідовано" styles={styles} lead />
        <ComparePiece
          value={comparison.diff > 0 ? `+${comparison.diff}` : `${comparison.diff}`}
          label="Різниця"
          styles={styles}
        />
      </View>
      <Text style={[styles.compareMessage, messageTone]}>{comparison.message}</Text>
    </View>
  );
}

function ComparePiece({
  value,
  label,
  styles,
  lead,
}: {
  value: number | string;
  label: string;
  styles: ReturnType<typeof makeStyles>;
  lead?: boolean;
}): JSX.Element {
  return (
    <View style={[styles.comparePiece, lead && styles.comparePieceLead]}>
      <Text style={[styles.comparePieceValue, lead && styles.comparePieceValueLead]}>{value}</Text>
      <Text style={[styles.comparePieceLabel, lead && styles.comparePieceLabelLead]}>{label}</Text>
    </View>
  );
}

function ControllerOnRouteCard({
  inspection,
  styles,
}: {
  inspection: RouteInspection;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  const active = inspection.state === 'active';
  const mins = Math.max(0, Math.floor(inspection.durationSeconds / 60));
  // Перевірка завершується сама — водій бачить той самий відлік, що й
  // контролер, і розуміє, коли відкриються зчитувачі.
  const autoCloseMins = minutesUntil(inspection.autoCloseAt);
  const readers = readersSummary(inspection.readers, styles);
  return (
    <View style={[styles.inspCard, active ? styles.inspCardActive : styles.inspCardEnded]}>
      <View style={styles.inspHeaderRow}>
        <Text style={styles.inspEyebrow}>
          {active ? '● КОНТРОЛЕР ПРАЦЮЄ НА РЕЙСІ' : '🏁 ПЕРЕВІРКУ ЗАВЕРШЕНО'}
        </Text>
        <Text style={styles.inspChevron}>›</Text>
      </View>
      <Text style={styles.inspTitle}>{inspection.inspectorName ?? 'Контролер на маршруті'}</Text>
      <Text style={styles.inspMeta}>
        {active ? `${mins} хв на рейсі` : 'Перевірку закрито'}
        {inspection.source === 'action_log' ? ' · за діями контролера' : ''}
        {active && autoCloseMins != null ? ` · автозавершення через ${autoCloseMins} хв` : ''}
      </Text>
      <View style={styles.inspStatsRow}>
        <InspStat value={inspection.checkedTotal} label="Квитків перевірено" styles={styles} />
        <InspStat value={inspection.validCount} label="Валідних" styles={styles} />
        <InspStat value={inspection.invalidCount} label="Невалідних" styles={styles} />
        <InspStat value={inspection.finesCount} label="Постанов видано" styles={styles} />
      </View>
      {/* Стан валідаторів — прямо тут: водій одним поглядом бачить, чи можуть
          пасажири платити, не переходячи в підменю «Контролер». */}
      <View style={[styles.inspReadersRow, readers.tone]}>
        <Text style={styles.inspReadersLabel}>Валідатори</Text>
        <Text style={[styles.inspReadersValue, readers.valueTone]}>{readers.label}</Text>
      </View>
    </View>
  );
}

/** Підпис стану зчитувачів для картки перевірки — ті самі слова, що й у банері. */
function readersSummary(
  readers: RouteInspection['readers'],
  styles: ReturnType<typeof makeStyles>,
): { label: string; tone: object; valueTone: object } {
  if (readers?.error) {
    return { label: 'помилка команди', tone: styles.inspReadersBad, valueTone: styles.inspReadersValueBad };
  }
  if (readers?.state === 'partial') {
    return {
      label: `заблоковано частково (${readers.blockedCount} з ${readers.total})`,
      tone: styles.inspReadersBad,
      valueTone: styles.inspReadersValueBad,
    };
  }
  if (readers?.blocked) {
    return { label: 'заблоковані', tone: styles.inspReadersBlocked, valueTone: styles.inspReadersValueBlocked };
  }
  if (!readers || readers.state === 'unknown') {
    return { label: 'стан невідомий', tone: styles.inspReadersUnknown, valueTone: styles.inspReadersValueUnknown };
  }
  return { label: 'працюють', tone: styles.inspReadersOk, valueTone: styles.inspReadersValueOk };
}

function InspStat({
  value,
  label,
  styles,
}: {
  value: number;
  label: string;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  return (
    <View style={styles.inspStat}>
      <Text style={styles.inspStatValue}>{value}</Text>
      <Text style={styles.inspStatLabel}>{label}</Text>
    </View>
  );
}

function ActivityCard({
  activity,
  interval,
  initiallyCollapsed,
  tripActive,
  styles,
}: {
  activity: {
    entries: RouteActivityEntry[];
    totalToday: number;
    paidToday: number;
    freeToday: number;
    totalSince: number;
  };
  interval: number;
  initiallyCollapsed: boolean;
  /** Є активний рейс — тоді стрічка і головна цифра рахуються з його старту. */
  tripActive: boolean;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);

  // Дві різні речі в одній картці раніше виглядали однаково: велика цифра —
  // це ВЕСЬ день по маршруту, а список нижче — тільки поточний рейс. Тепер
  // головна цифра йде за рейсом, а денний підсумок підписаний окремо.
  const scopeLabel = tripActive ? 'За рейс' : 'За останню годину';
  const primaryValue = tripActive ? activity.totalSince : activity.totalToday;

  return (
    <View style={styles.activityCard}>
      <Pressable style={styles.activityHeader} onPress={() => setCollapsed((v) => !v)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.activitySection}>Активність маршруту</Text>
          <Text style={styles.activityRefresh}>
            оновлення кожні {Math.round(interval / 1000)} с
          </Text>
        </View>
        <Text style={styles.activityChevron}>{collapsed ? '▼' : '▲'}</Text>
      </Pressable>

      <View style={styles.activityTilePrimary}>
        <Text style={styles.activityTileValue}>{primaryValue}</Text>
        <Text style={styles.activityTileLabel}>{scopeLabel}</Text>
      </View>
      <View style={styles.activityCounters}>
        <View style={styles.activityTile}>
          <Text style={styles.activityTileValueSmall}>{activity.totalToday}</Text>
          <Text style={styles.activityTileLabel}>Сьогодні всього</Text>
        </View>
        <View style={styles.activityTile}>
          <Text style={styles.activityTileValueSmall}>{activity.paidToday}</Text>
          <Text style={styles.activityTileLabel}>Сьогодні платні</Text>
        </View>
        <View style={styles.activityTile}>
          <Text style={styles.activityTileValueSmall}>{activity.freeToday}</Text>
          <Text style={styles.activityTileLabel}>Сьогодні пільга</Text>
        </View>
      </View>

      {!collapsed ? (
        activity.entries.length === 0 ? (
          <Text style={styles.activityEmpty}>
            {tripActive
              ? 'З початку рейсу валідацій ще не було.'
              : 'За останню годину валідацій не було.'}
          </Text>
        ) : (
          <>
            <Text style={styles.activityListLabel}>
              {tripActive ? 'Валідації з початку рейсу' : 'Валідації за останню годину'}
            </Text>
            {activity.entries
              .slice(0, 8)
              .map((e) => <ActivityRow key={e.id} entry={e} styles={styles} />)}
          </>
        )
      ) : (
        <Text style={styles.activityCollapsedHint}>
          {tripActive
            ? 'Тап — валідації з початку рейсу'
            : 'Тап — валідації за останню годину'}
        </Text>
      )}
    </View>
  );
}

function ActivityRow({
  entry,
  styles,
}: {
  entry: RouteActivityEntry;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  const isFree = entry.fare_type === TicketFareType.free;
  return (
    <View style={styles.activityRow}>
      <View style={[styles.fareBadge, isFree ? styles.fareBadgeFree : styles.fareBadgePaid]}>
        <Text style={styles.fareBadgeText}>{formatFareType(entry.fare_type)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.activityTime}>{formatTime(entry.validated_at)}</Text>
        <Text style={styles.activityMeta}>{formatRelative(entry.validated_at)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.activityPrice}>{formatTicketPrice(entry.price)}</Text>
        <Text style={styles.activityMeta}>
          {formatTransport(entry.transport)}
          {entry.validated_door_number != null ? ` · двері ${entry.validated_door_number}` : ''}
        </Text>
      </View>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: c.background },
    // flexGrow: 1 дозволяє блоку тапу пасажирів (flex: 1) розтягуватись до
    // низу видимого екрана, коли контенту менше за висоту viewport-а.
    // alignSelf + width дають maxWidth-смугу по центру: на планшеті в
    // альбомній орієнтації рядки не розтягуються на весь екран.
    scrollContent: {
      padding: 14,
      gap: 8,
      paddingBottom: 40,
      flexGrow: 1,
      width: '100%',
      alignSelf: 'center',
    },
    scrollContentWide: { paddingHorizontal: 20 },
    // flexGrow (а не flex) — рядок тягнеться до низу екрана, тож плита
    // лічильника з flex: 1 у правій колонці має куди рости.
    columnsRow: { flexDirection: 'row', gap: 12, flexGrow: 1 },
    column: { flex: 1, gap: 8 },

    // === Header «Контролер» menu button (top-right, native header) ===
    // Це вхід у підменю, не виклик: показує статус і шеврон, без іконки дії.
    headerMenuBtn: {
      marginRight: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.16)',
    },
    headerMenuLabel: { color: '#fff', fontSize: 12, fontWeight: '800' },
    headerMenuStatus: { color: 'rgba(255,255,255,0.86)', fontSize: 10, fontWeight: '600' },
    headerMenuChevron: { color: '#fff', fontSize: 18, fontWeight: '300', marginLeft: 2 },
    headerDot: { width: 9, height: 9, borderRadius: 999 },
    headerDotIdle: { backgroundColor: 'rgba(255,255,255,0.45)' },
    headerDotPending: { backgroundColor: '#f5c451' },
    headerDotAccepted: { backgroundColor: '#8fd3b0' },
    headerDotActive: { backgroundColor: '#5bd08c' },
    // === Картка "контролер працює на рейсі" ===
    inspCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
      gap: 6,
    },
    inspCardActive: { backgroundColor: c.successSoft, borderColor: c.success },
    inspCardEnded: { backgroundColor: c.surfaceMuted, borderColor: c.border },
    inspHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    inspChevron: { color: c.textMuted, fontSize: 20, fontWeight: '800' },
    inspEyebrow: { color: c.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

    callBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.primary,
      backgroundColor: c.primarySoft,
      padding: 14,
    },
    callBannerIcon: { fontSize: 20 },
    callBannerTitle: { color: c.text, fontSize: 14, fontWeight: '800' },
    callBannerHint: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    callBannerChevron: { color: c.primary, fontSize: 22, fontWeight: '800' },
    inspTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    inspMeta: { color: c.textMuted, fontSize: 12 },
    inspStatsRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
    inspStat: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 8,
      alignItems: 'center',
      gap: 2,
    },
    inspReadersRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 9,
      marginTop: 2,
    },
    inspReadersOk: { backgroundColor: c.surface, borderColor: c.border },
    inspReadersBlocked: { backgroundColor: c.warningSoft, borderColor: c.warning },
    inspReadersBad: { backgroundColor: c.dangerSoft, borderColor: c.danger },
    inspReadersUnknown: { backgroundColor: c.surfaceMuted, borderColor: c.border },
    inspReadersLabel: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
    inspReadersValue: { fontSize: 13, fontWeight: '800' },
    inspReadersValueOk: { color: c.success },
    inspReadersValueBlocked: { color: c.warning },
    inspReadersValueBad: { color: c.danger },
    inspReadersValueUnknown: { color: c.textMuted },

    inspStatValue: { color: c.text, fontSize: 20, fontWeight: '900' },
    inspStatLabel: { color: c.textMuted, fontSize: 10, fontWeight: '600', textAlign: 'center' },
    inspCloseBtn: {
      marginTop: 8,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.danger,
    },
    inspCloseBtnDisabled: { opacity: 0.5 },
    inspCloseLabel: { color: c.danger, fontWeight: '800', fontSize: 14 },

    routePickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      marginBottom: 8,
    },
    routePickerRowActive: { backgroundColor: c.primarySoft, borderColor: c.primary },
    routePickerCode: { minWidth: 44, fontSize: 18, fontWeight: '800', color: c.primary },
    routePickerName: { flex: 1, color: c.text, fontSize: 14, fontWeight: '500' },
    routePickerCheck: { color: c.primary, fontSize: 18, fontWeight: '900' },

    modalOverlay: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: c.background, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 20, paddingBottom: 36, maxHeight: '75%',
      width: '100%', alignSelf: 'center', maxWidth: CONTENT_MAX_WIDTH,
    },
    modalTitle: {
      fontSize: 18, fontWeight: '800', color: c.text,
      textAlign: 'center', marginBottom: 16,
    },
    modalCancel: {
      marginTop: 8, paddingVertical: 14, borderRadius: 14,
      alignItems: 'center', backgroundColor: c.surfaceMuted,
    },
    modalCancelLabel: { color: c.textMuted, fontWeight: '700', fontSize: 15 },
    modalBack: { paddingVertical: 10, alignItems: 'center' },
    modalBackLabel: { color: c.primary, fontWeight: '700', fontSize: 14 },
    modalEmptyHint: {
      color: c.textMuted, fontSize: 13, textAlign: 'center',
      paddingVertical: 20, fontStyle: 'italic',
    },

    header: { gap: 2, marginBottom: 0 },
    eyebrow: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    title: { fontSize: 19, fontWeight: '800', color: c.text },
    titleMuted: { fontSize: 16, fontWeight: '600', color: c.textMuted },
    vehicleLine: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginTop: 1 },
    vehicleLineMuted: { fontSize: 13, fontWeight: '600', color: c.textSoft, marginTop: 1, fontStyle: 'italic' },
    routeChangeHint: { color: c.primary, fontSize: 11, fontWeight: '600', marginTop: 1 },
    driverName: { color: c.textMuted, fontSize: 12, marginTop: 2 },

    tripCard: {
      padding: 12,
      borderRadius: 16,
      gap: 2,
    },
    tripCardStart: { backgroundColor: c.primary, borderWidth: 2, borderColor: c.primary },
    tripCardEnd: {
      backgroundColor: c.success,
      borderWidth: 2,
      borderColor: c.success,
    },
    tripCardDisabled: { opacity: 0.6 },
    tripCardEyebrow: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    tripCardTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 1 },
    tripCardHint: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },

    // === Passenger counter — плита з трьох зон: −  |  інфо  |  + ===
    // Свідомо тихіша за картку контролю оплати: світла поверхня, кольором
    // позначені лише зони дій. Головний акцент екрана — «Контроль оплати».
    counterWrap: { flex: 1, gap: 6, minHeight: 130 },
    counterTile: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    counterTileDisabled: { backgroundColor: c.surfaceMuted },

    counterZone: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      gap: 2,
    },
    counterZoneOut: {
      backgroundColor: c.dangerSoft,
      borderRightWidth: 1,
      borderRightColor: c.border,
    },
    counterZoneIn: {
      backgroundColor: c.successSoft,
      borderLeftWidth: 1,
      borderLeftColor: c.border,
    },
    counterZoneMuted: { backgroundColor: 'transparent' },
    counterSign: { fontSize: 46, fontWeight: '900', lineHeight: 50 },
    counterSignOut: { color: c.danger },
    counterSignIn: { color: c.success },
    counterZoneLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    counterZoneCount: { color: c.text, fontSize: 18, fontWeight: '800' },
    counterTextMuted: { color: c.textSoft },

    counterInfo: {
      flex: 1.1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
      gap: 2,
    },
    counterInfoEyebrow: {
      color: c.textSoft,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.7,
    },
    counterInfoValue: { color: c.text, fontSize: 44, fontWeight: '900', lineHeight: 48 },
    counterInfoMeta: { color: c.textSoft, fontSize: 11, textAlign: 'center' },

    // === Payment comparison card («Контроль оплати») — головний акцент екрана.
    // Рамка + підняття роблять її помітно важливішою за плиту лічильника. ===
    compareCard: {
      backgroundColor: c.surface,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: c.primary,
      padding: 18,
      gap: 10,
      shadowColor: c.shadow,
      shadowOpacity: 1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    compareEyebrow: {
      color: c.primary,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.8,
      textAlign: 'center',
    },
    compareRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    // Бічні числа («Увійшло», «Різниця») — контекст, не головне.
    comparePiece: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    comparePieceLead: {
      flex: 1.4,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: c.border,
    },
    comparePieceValue: {
      color: c.textSoft,
      fontSize: 26,
      fontWeight: '700',
      lineHeight: 30,
    },
    comparePieceValueLead: {
      fontSize: 68,
      lineHeight: 72,
      fontWeight: '900',
      color: c.primary,
    },
    comparePieceLabel: {
      color: c.textSoft,
      fontSize: 11,
      fontWeight: '600',
    },
    comparePieceLabelLead: {
      fontSize: 13,
      fontWeight: '900',
      color: c.text,
      letterSpacing: 0.3,
    },
    compareMessage: {
      fontSize: 15,
      fontWeight: '800',
      textAlign: 'center',
      color: c.text,
    },
    compareMessageWarn: { color: c.warning },
    compareMessageDanger: { color: c.danger },
    compareMessageOk: { color: c.success },

    counterUndo: {
      marginTop: 6,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 12,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    counterUndoDisabled: { opacity: 0.4 },
    counterUndoLabel: { color: c.textMuted, fontWeight: '700', fontSize: 12 },

    // === Activity card with collapsible body ===
    activityCard: {
      backgroundColor: c.surface,
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: c.border,
      gap: 12,
    },
    activityHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    activitySection: { color: c.text, fontSize: 16, fontWeight: '700' },
    activityRefresh: { color: c.textSoft, fontSize: 11 },
    activityChevron: { color: c.textMuted, fontSize: 18, paddingHorizontal: 8 },

    activityTilePrimary: {
      backgroundColor: c.surfaceMuted,
      borderRadius: 12,
      paddingVertical: 18,
      paddingHorizontal: 18,
      alignItems: 'center',
      gap: 4,
    },
    activityCounters: { flexDirection: 'row', gap: 8 },
    activityTile: {
      flex: 1,
      backgroundColor: c.surfaceMuted,
      borderRadius: 12,
      padding: 14,
      gap: 4,
      alignItems: 'flex-start',
    },
    activityTileValue: { fontSize: 72, fontWeight: '900', color: c.primary, lineHeight: 76 },
    // Три плитки в рядку замість двох — цифра трохи менша, підпис у два рядки.
    activityTileValueSmall: { fontSize: 30, fontWeight: '800', color: c.text, lineHeight: 34 },
    activityTileLabel: { fontSize: 12, color: c.textMuted, fontWeight: '600', textAlign: 'center' },

    activityRow: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    activityTime: { color: c.text, fontWeight: '700', fontSize: 14 },
    activityMeta: { color: c.textMuted, fontSize: 11 },
    activityPrice: { color: c.text, fontWeight: '700', fontSize: 14 },
    activityListLabel: {
      color: c.textSoft,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginTop: 6,
      marginBottom: 2,
    },
    activityEmpty: {
      color: c.textMuted,
      fontSize: 12,
      textAlign: 'center',
      paddingVertical: 14,
      fontStyle: 'italic',
    },
    activityCollapsedHint: {
      color: c.textSoft,
      fontSize: 12,
      textAlign: 'center',
      fontStyle: 'italic',
    },

    fareBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    fareBadgePaid: { backgroundColor: c.primarySoft },
    fareBadgeFree: { backgroundColor: c.accentSoft },
    fareBadgeText: { fontSize: 10, fontWeight: '700', color: c.text },

    activityStateCard: {
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 18,
      gap: 8,
    },
    activityStateTitle: { color: c.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
    activityStateHint: { color: c.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 17 },
    activityStateButton: {
      marginTop: 4,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: c.primarySoft,
    },
    activityStateButtonLabel: { color: c.primary, fontSize: 13, fontWeight: '800' },

    settingsLink: {
      paddingVertical: 14,
      alignItems: 'center',
    },
    settingsLinkLabel: { color: c.textMuted, fontWeight: '700', fontSize: 14 },
  });
}
