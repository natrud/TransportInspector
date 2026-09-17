import { useMemo, useState } from 'react';
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
  formatRelative,
  formatTime,
  useAcceptControllerCall,
  useColors,
  useCompleteControllerCall,
  useControllerCalls,
  useCurrentInspection,
} from '@transport/shared';

type ViewMode = 'new' | 'working' | 'archive';

export function CallsScreen(): JSX.Element {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [view, setView] = useState<ViewMode>('new');

  const pending = useControllerCalls('pending');
  const working = useControllerCalls('accepted');
  // Архів потрібен лише на своїй вкладці — інакше це третій фоновий polling.
  const all = useControllerCalls('all', { enabled: view === 'archive' });
  const { accept, isPending: accepting } = useAcceptControllerCall();
  const { complete, isPending: completing } = useCompleteControllerCall();
  const { inspection, close: closeInspection, isClosing } = useCurrentInspection();
  const [busyId, setBusyId] = useState<string | null>(null);

  const archiveCalls = useMemo(
    () => all.calls.filter((x) => x.status === 'completed' || x.status === 'cancelled'),
    [all.calls],
  );

  const onAccept = async (call: ControllerCall): Promise<void> => {
    setBusyId(call.id);
    try {
      await accept(call.id);
      setView('working');
    } catch (err) {
      Alert.alert('Не вдалось прийняти виклик', err instanceof Error ? err.message : 'unknown');
    } finally {
      setBusyId(null);
    }
  };

  const onComplete = (call: ControllerCall): void => {
    Alert.alert('Завершити виклик?', 'Робота з цим водієм завершена. Виклик піде в архів.', [
      { text: 'Ні', style: 'cancel' },
      {
        text: 'Завершити',
        onPress: async () => {
          setBusyId(call.id);
          try {
            await complete(call.id);
          } catch (err) {
            Alert.alert('Помилка', err instanceof Error ? err.message : 'unknown');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const onCloseInspection = (): void => {
    Alert.alert('Завершити перевірку?', 'Це завершить перевірку і закриє повʼязані виклики водіїв.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Завершити',
        style: 'destructive',
        onPress: () => void closeInspection().catch(() => Alert.alert('Помилка', 'Не вдалося завершити.')),
      },
    ]);
  };

  const current =
    view === 'new' ? pending : view === 'working' ? working : { calls: archiveCalls, isFetching: all.isFetching, refetch: all.refetch };
  const onRefresh = (): void => void current.refetch();

  // call.routeId — це route_number валідатора (той самий рядок, що бачить
  // водій), а не UUID з довідника TransportRoute: показуємо його як є.
  const routeLabel = (call: ControllerCall): string =>
    call.routeId ? `Маршрут ${call.routeId}` : 'Маршрут не вказано';

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={current.isFetching} onRefresh={onRefresh} />}
    >
      <View style={styles.tabsRow}>
        <Tab label="Нові" count={pending.calls.length} active={view === 'new'} onPress={() => setView('new')} styles={styles} />
        <Tab label="В роботі" count={working.calls.length} active={view === 'working'} onPress={() => setView('working')} styles={styles} />
        <Tab label="Архів" active={view === 'archive'} onPress={() => setView('archive')} styles={styles} />
      </View>

      {view === 'working' && inspection ? (
        <View style={styles.inspBanner}>
          <Text style={styles.inspBannerEyebrow}>● ВИ НА ПЕРЕВІРЦІ</Text>
          <Text style={styles.inspBannerTitle}>
            Маршрут {inspection.route_number} · ТЗ {inspection.vehicle_number}
          </Text>
          <Text style={styles.inspBannerMeta}>
            перевірено {inspection.checked_total} · постанов {inspection.fines_count}
          </Text>
          <Pressable
            style={[styles.inspBannerBtn, isClosing && styles.disabled]}
            onPress={onCloseInspection}
            disabled={isClosing}
          >
            <Text style={styles.inspBannerBtnLabel}>
              {isClosing ? 'Завершення…' : 'Завершити перевірку'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {current.calls.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            {view === 'new' ? 'Немає нових викликів' : view === 'working' ? 'Немає викликів у роботі' : 'Архів порожній'}
          </Text>
          <Text style={styles.emptyText}>
            {view === 'new'
              ? "Тут з'являться виклики від водіїв."
              : view === 'working'
                ? 'Прийняті виклики зʼявляться тут, поки перевірку не завершено.'
                : 'Тут завершені та скасовані виклики.'}
          </Text>
        </View>
      ) : (
        current.calls.map((call) => (
          <View key={call.id} style={[styles.card, view === 'archive' && styles.cardArchived]}>
            <View style={styles.cardHeader}>
              <Text style={styles.route}>{routeLabel(call)}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.time}>{formatTime(call.createdAt)}</Text>
                <Text style={styles.meta}>{formatRelative(call.createdAt)}</Text>
              </View>
            </View>
            <Text style={styles.driver}>
              {call.driverDisplayName ?? "Ім'я не вказано"} · {call.driverSerial}
            </Text>
            <Pressable
              onPress={() => call.driverPhone && void Linking.openURL(`tel:${call.driverPhone}`)}
              disabled={!call.driverPhone}
            >
              <Text style={styles.driverPhone}>{call.driverPhone ?? 'Номер телефону не задано'}</Text>
            </Pressable>

            {view === 'new' ? (
              <Pressable
                style={[styles.primaryBtn, accepting && busyId === call.id && styles.disabled]}
                disabled={accepting && busyId === call.id}
                onPress={() => void onAccept(call)}
              >
                {accepting && busyId === call.id ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnLabel}>Прийняти</Text>
                )}
              </Pressable>
            ) : null}

            {view === 'working' ? (
              <>
                <Text style={styles.acceptedLine}>
                  ✓ Прийнято{call.acceptedAt ? ` о ${formatTime(call.acceptedAt)}` : ''}
                </Text>
                <Text style={styles.workingHint}>
                  {inspection
                    ? 'Виклик закриється автоматично, коли завершите перевірку.'
                    : 'Прикладіть особистий QR до валідатора, щоб почати перевірку. Або завершіть виклик вручну.'}
                </Text>
                <Pressable
                  style={[styles.ghostBtn, completing && busyId === call.id && styles.disabled]}
                  disabled={completing && busyId === call.id}
                  onPress={() => onComplete(call)}
                >
                  <Text style={styles.ghostBtnLabel}>Завершити виклик вручну</Text>
                </Pressable>
              </>
            ) : null}

            {view === 'archive' ? (
              <View
                style={[
                  styles.statusBadge,
                  call.status === 'completed' ? styles.statusDone : styles.statusCancelled,
                ]}
              >
                <Text style={styles.statusBadgeLabel}>
                  {call.status === 'completed'
                    ? `Завершено${call.acceptedAt ? ` · прийняв о ${formatTime(call.acceptedAt)}` : ''}`
                    : 'Скасовано водієм'}
                </Text>
              </View>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function Tab({
  label,
  count,
  active,
  onPress,
  styles,
}: {
  label: string;
  count?: number;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  return (
    <Pressable style={[styles.tabBtn, active && styles.tabBtnActive]} onPress={onPress}>
      <Text style={[styles.tabBtnLabel, active && styles.tabBtnLabelActive]}>
        {label}
        {count ? ` (${count})` : ''}
      </Text>
    </Pressable>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: c.background },
    scrollContent: { padding: 16, paddingBottom: 32, gap: 10, width: '100%', alignSelf: 'center', maxWidth: CONTENT_MAX_WIDTH },

    tabsRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
    tabBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
    },
    tabBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    tabBtnLabel: { color: c.text, fontWeight: '700', fontSize: 12 },
    tabBtnLabelActive: { color: '#fff' },

    inspBanner: {
      backgroundColor: c.successSoft,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.success,
      padding: 14,
      gap: 4,
    },
    inspBannerEyebrow: { color: c.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
    inspBannerTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
    inspBannerMeta: { color: c.textMuted, fontSize: 12 },
    inspBannerBtn: {
      marginTop: 8,
      paddingVertical: 11,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.danger,
    },
    inspBannerBtnLabel: { color: c.danger, fontWeight: '800', fontSize: 14 },

    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.warning,
      padding: 14,
      gap: 6,
    },
    cardArchived: { borderColor: c.border },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    route: { color: c.text, fontWeight: '800', fontSize: 16 },
    driver: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
    driverPhone: { color: c.primary, fontSize: 13, fontWeight: '700' },
    time: { color: c.text, fontWeight: '700', fontSize: 13 },
    meta: { color: c.textMuted, fontSize: 11 },
    acceptedLine: { color: c.success, fontWeight: '800', fontSize: 13, marginTop: 2 },
    workingHint: { color: c.textMuted, fontSize: 12, lineHeight: 17 },

    primaryBtn: {
      marginTop: 6,
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryBtnLabel: { color: '#fff', fontWeight: '800', fontSize: 14 },
    ghostBtn: {
      marginTop: 4,
      borderRadius: 12,
      paddingVertical: 11,
      alignItems: 'center',
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    ghostBtnLabel: { color: c.textMuted, fontWeight: '700', fontSize: 13 },
    disabled: { opacity: 0.6 },

    statusBadge: { marginTop: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    statusDone: { backgroundColor: c.successSoft },
    statusCancelled: { backgroundColor: c.surfaceMuted },
    statusBadgeLabel: { color: c.text, fontWeight: '700', fontSize: 12 },

    emptyCard: {
      marginTop: 20,
      padding: 24,
      borderRadius: 18,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      gap: 6,
    },
    emptyTitle: { color: c.text, fontWeight: '700', fontSize: 16 },
    emptyText: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
  });
}
