import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  type ColorPalette,
  CONTENT_MAX_WIDTH,
  formatRole,
  useColors,
  useLogout,
  useRoutes,
  useSelectRoute,
  useSelectVehicle,
  useSession,
  useSettings,
  useUpdateSettings,
  useVehicles,
} from '@transport/shared';
import type { RootStackParamList } from '../app/navigation';

const POLL_OPTIONS = [
  { label: '1 с', value: 1_000 },
  { label: '3 с', value: 3_000 },
  { label: '5 с', value: 5_000 },
  { label: '10 с', value: 10_000 },
  { label: '15 с', value: 15_000 },
  { label: '30 с', value: 30_000 },
  { label: '60 с', value: 60_000 },
  { label: '2 хв', value: 120_000 },
];

/** Нижче цього значення пояснюємо, що саме пришвидшується. */
const FREQUENT_POLL_MS = 5_000;

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props): JSX.Element {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { session } = useSession();
  const { settings } = useSettings();
  const { update } = useUpdateSettings();
  const { logout, isPending: loggingOut } = useLogout();
  const { routes, refetch: refetchRoutes } = useRoutes({ withValidator: true });
  const { selectRoute } = useSelectRoute();
  const { selectVehicle } = useSelectVehicle();
  const routeId = session?.assigned_route_id ?? null;
  const vehicleNumber = session?.assigned_vehicle_number ?? null;
  const assignedRoute = useMemo(
    () => routes.find((r) => r.id === routeId) ?? null,
    [routes, routeId],
  );

  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const [pickerStep, setPickerStep] = useState<'route' | 'vehicle'>('route');
  const [pendingRouteId, setPendingRouteId] = useState<string | null>(null);
  const { vehicles, refetch: refetchVehicles } = useVehicles(pendingRouteId ?? routeId);

  const openRoutePicker = (): void => {
    setPendingRouteId(null);
    setPickerStep('route');
    setRoutePickerOpen(true);
    // Список маршрутів кешується на 30 хв — форсуємо свіжий запит при
    // відкритті picker'а, щоб зміни адміна з'являлись без перезапуску застосунку.
    void refetchRoutes();
  };

  const openVehiclePicker = (): void => {
    setPendingRouteId(routeId);
    setPickerStep('vehicle');
    setRoutePickerOpen(true);
    void refetchVehicles();
  };

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

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Сесія</Text>
          <View style={styles.card}>
            <Row label="Користувач" value={session?.display_name ?? '—'} styles={styles} />
            <Row label="Роль" value={formatRole(session?.role)} styles={styles} />
            <Row label="GID" value={session?.serial_number ?? '—'} styles={styles} mono />

            {/* Маршрут — тапабельний для зміни */}
            <Pressable style={styles.row} onPress={openRoutePicker}>
              <Text style={styles.rowLabel}>Маршрут</Text>
              <View style={styles.routeValue}>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {assignedRoute
                    ? `${assignedRoute.code} · ${assignedRoute.name}`
                    : '— (оберіть)'}
                </Text>
                <Text style={styles.routeChangeHint}>змінити ›</Text>
              </View>
            </Pressable>

            {/* Транспортний номер — уточнюючий вибір у межах маршруту */}
            <Pressable style={styles.row} onPress={openVehiclePicker} disabled={!routeId}>
              <Text style={styles.rowLabel}>Транспортний номер</Text>
              <View style={styles.routeValue}>
                <Text style={styles.rowValue} numberOfLines={1}>
                  {vehicleNumber ?? '— (оберіть)'}
                </Text>
                <Text style={styles.routeChangeHint}>змінити ›</Text>
              </View>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Polling активності маршруту</Text>
          <View style={styles.card}>
            <Text style={styles.hint}>
              Частота оновлення стрічки валідацій
            </Text>
            <View style={styles.chipsRow}>
              {POLL_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.chip, settings.pollIntervalMs === opt.value && styles.chipActive]}
                  onPress={() => void update({ pollIntervalMs: opt.value })}
                >
                  <Text style={[styles.chipLabel, settings.pollIntervalMs === opt.value && styles.chipLabelActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {settings.pollIntervalMs <= FREQUENT_POLL_MS ? (
              <Text style={styles.warnHint}>
                Діє тільки для Контроль Оплати та Активність маршруту
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Інтерфейс</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Лічильник пасажирів</Text>
                <Text style={styles.hint}>
                  Показувати на головному екрані плиту «вийшов / у салоні / увійшов».
                  Вимкнення ховає її — уже враховані пасажири не втрачаються.
                </Text>
              </View>
              <Switch
                value={settings.passengerCounterEnabled}
                onValueChange={(v) => void update({ passengerCounterEnabled: v })}
              />
            </View>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>Вібрація</Text>
                <Text style={styles.hint}>
                  Коротко вібрувати при тапі лічильника і коли на маршруті зʼявляється нова
                  валідація — щоб не дивитись на екран під час руху.
                </Text>
              </View>
              <Switch
                value={settings.hapticsEnabled}
                onValueChange={(v) => void update({ hapticsEnabled: v })}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Контролер</Text>
          <View style={styles.card}>
            <Pressable style={styles.row} onPress={() => navigation.navigate('Controller')}>
              <Text style={styles.rowLabel}>Виклик і робота контролера</Text>
              <Text style={styles.routeChangeHint}>відкрити ›</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={[styles.logoutButton, loggingOut && styles.logoutButtonDisabled]}
          disabled={loggingOut}
          onPress={() => void logout()}
        >
          <Text style={styles.logoutLabel}>Вийти з акаунту</Text>
        </Pressable>
      </ScrollView>

      {/* Модальний picker маршруту */}
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
                        style={[
                          styles.modalRouteRow,
                          routeId === r.id && styles.modalRouteRowActive,
                        ]}
                        onPress={() => void onPickRoute(r.id)}
                      >
                        <Text style={[
                          styles.modalRouteCode,
                          routeId === r.id && styles.modalRouteCodeActive,
                        ]}>
                          {r.code}
                        </Text>
                        <Text style={[
                          styles.modalRouteName,
                          routeId === r.id && styles.modalRouteNameActive,
                        ]}>
                          {r.name}
                        </Text>
                        {routeId === r.id ? (
                          <Text style={styles.modalRouteCheck}>✓</Text>
                        ) : null}
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
                        style={[
                          styles.modalRouteRow,
                          vehicleNumber === v && styles.modalRouteRowActive,
                        ]}
                        onPress={() => void onPickVehicle(v)}
                      >
                        <Text style={[
                          styles.modalRouteCode,
                          vehicleNumber === v && styles.modalRouteCodeActive,
                        ]}>
                          {v}
                        </Text>
                        {vehicleNumber === v ? (
                          <Text style={styles.modalRouteCheck}>✓</Text>
                        ) : null}
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
    </>
  );
}

function Row({
  label, value, styles, mono,
}: {
  label: string; value: string;
  styles: ReturnType<typeof makeStyles>; mono?: boolean;
}): JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.rowValueMono]}>{value}</Text>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: c.background },
    scrollContent: { padding: 16, gap: 14, paddingBottom: 32, width: '100%', alignSelf: 'center', maxWidth: CONTENT_MAX_WIDTH },

    section: { gap: 8 },
    sectionLabel: {
      color: c.textMuted, fontSize: 12, textTransform: 'uppercase',
      fontWeight: '700', letterSpacing: 0.4, paddingHorizontal: 4,
    },
    card: {
      backgroundColor: c.surface, borderRadius: 18, borderWidth: 1,
      borderColor: c.border, padding: 12, gap: 8,
    },
    row: {
      flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'center', paddingHorizontal: 6, paddingVertical: 8,
    },
    rowLabel: { color: c.text, fontSize: 14, fontWeight: '600' },
    rowValue: { color: c.textMuted, fontSize: 14, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
    rowValueMono: { fontFamily: 'Menlo', fontSize: 12 },

    routeValue: { alignItems: 'flex-end', gap: 2, maxWidth: '55%' },
    routeChangeHint: { color: c.primary, fontSize: 11, fontWeight: '600' },

    hint: { color: c.textMuted, fontSize: 12, paddingHorizontal: 6, lineHeight: 17 },
    warnHint: {
      color: c.warning,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      paddingHorizontal: 6,
    },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 4 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
      backgroundColor: c.surfaceMuted, borderWidth: 1, borderColor: c.border,
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipLabel: { color: c.text, fontWeight: '700' },
    chipLabelActive: { color: '#fff' },

    logoutButton: {
      marginTop: 12, paddingVertical: 16, borderRadius: 16, alignItems: 'center',
      backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.danger,
    },
    logoutButtonDisabled: { opacity: 0.6 },
    logoutLabel: { color: c.danger, fontWeight: '700', fontSize: 15 },

    // Modal
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
    modalRouteRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      padding: 14, borderRadius: 14, marginBottom: 8,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    },
    modalRouteRowActive: { backgroundColor: c.primarySoft, borderColor: c.primary },
    modalRouteCode: { minWidth: 44, fontSize: 18, fontWeight: '800', color: c.text },
    modalRouteCodeActive: { color: c.primary },
    modalRouteName: { flex: 1, color: c.text, fontSize: 14 },
    modalRouteNameActive: { color: c.primaryStrong, fontWeight: '600' },
    modalRouteCheck: { color: c.primary, fontSize: 18, fontWeight: '900' },
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
  });
}
