import { useMemo } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import {
  type ColorPalette,
  CONTENT_MAX_WIDTH,
  buildShiftReport,
  formatRole,
  listControllerCalls,
  listFines,
  listRecentValidations,
  useColors,
  useControllerCalls,
  useLogout,
  useSession,
  useSettings,
  useUpdateSettings,
} from '@transport/shared';
import { useCameraPermissionState } from '../hooks/useCameraPermissionState';

const SHIFT_WINDOW_MS = 12 * 60 * 60_000;

export function SettingsScreen(): JSX.Element {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { session } = useSession();
  const { settings } = useSettings();
  const { update } = useUpdateSettings();
  const { logout, isPending: loggingOut } = useLogout();
  // Лічильник у підписі кнопки звіту — щоб було видно, що незакрита робота
  // потрапить у звіт, ще до того, як його сформували.
  const { calls: pendingCalls } = useControllerCalls('pending');
  const { calls: workingCalls } = useControllerCalls('accepted');
  const activeCallsCount = pendingCalls.length + workingCalls.length;
  const camera = useCameraPermissionState();

  const onLogout = async (): Promise<void> => {
    await logout();
  };

  const onExportShift = async (): Promise<void> => {
    try {
      const now = Date.now();
      const startMs = now - SHIFT_WINDOW_MS;
      const controllerId = session?.user_id ?? null;
      // Виклики тягнемо з бекенда на момент формування звіту — polling-кеш
      // може бути на кілька секунд старішим, а звіт має бути точним.
      const [scans, fines, pending, working] = await Promise.all([
        listRecentValidations(controllerId, 500),
        listFines(controllerId, 200),
        listControllerCalls('pending'),
        listControllerCalls('accepted'),
      ]);
      const text = buildShiftReport({
        controllerSerial: session?.serial_number ?? 'UNKNOWN',
        controllerName: session?.display_name ?? null,
        windowStartMs: startMs,
        windowEndMs: now,
        scans: scans.filter((s) => s.scanned_at >= startMs),
        fines: fines.filter((f) => f.created_at >= startMs),
        activeCalls: [...pending, ...working],
      });
      await Share.share({ message: text, title: 'Звіт за зміну' });
    } catch (err) {
      Alert.alert('Не вдалось зібрати звіт', err instanceof Error ? err.message : 'unknown');
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Сесія</Text>
        <View style={styles.card}>
          <Row label="Користувач" value={session?.display_name ?? '—'} styles={styles} />
          <Row label="Роль" value={formatRole(session?.role)} styles={styles} />
          <Row label="GID" value={session?.serial_number ?? '—'} styles={styles} mono />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Камера</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Статус</Text>
            <View style={styles.cameraStatusRow}>
              <View
                style={[styles.cameraDot, camera.isGranted ? styles.cameraDotOk : styles.cameraDotBad]}
              />
              <Text
                style={[
                  styles.cameraStatusText,
                  camera.isGranted ? styles.cameraStatusTextOk : styles.cameraStatusTextBad,
                ]}
              >
                {camera.isGranted
                  ? 'Підключено'
                  : camera.isPermanentlyDenied
                    ? 'Дозвіл відхилено'
                    : 'Дозвіл не надано'}
              </Text>
            </View>
          </View>
          <Text style={styles.hint}>
            Потрібна для сканування QR-квитків. Якщо застосунок пише «Камеру не знайдено» —
            перевірте статус тут. Якщо він не «Підключено», відкрийте налаштування телефону і
            надайте доступ до камери вручну — після повернення статус оновиться сам.
          </Text>
          <Pressable style={styles.cameraSettingsButton} onPress={camera.openSettings}>
            <Text style={styles.cameraSettingsButtonLabel}>Відкрити налаштування телефону</Text>
          </Pressable>
          {!camera.isGranted ? (
            <Pressable style={styles.cameraRecheckButton} onPress={camera.refresh}>
              <Text style={styles.cameraRecheckLabel}>Перевірити ще раз</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Інтерфейс</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Експрес-режим скану</Text>
              <Text style={styles.hint}>
                Валідні квитки підтверджуються тостом без переходу на детальний екран — швидкий
                масовий контроль.
              </Text>
            </View>
            <Switch
              value={settings.rapidScanEnabled}
              onValueChange={(v) => void update({ rapidScanEnabled: v })}
            />
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Вібрація</Text>
              <Text style={styles.hint}>
                Коротко вібрувати при скані: одна вібрація — квиток валідний, подвійна —
                ні. Дозволяє не дивитись на екран у щільному салоні.
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
        <Text style={styles.sectionLabel}>Звіт</Text>
        <View style={styles.card}>
          <Text style={styles.hint}>
            Підсумок за останні 12 годин — сканування, постанови, сума штрафів і активні
            виклики водіїв. Поділитись через будь-який канал (SMS, email, месенджер).
          </Text>
          <Pressable style={styles.reportButton} onPress={() => void onExportShift()}>
            <Text style={styles.reportButtonLabel}>
              Звіт за зміну{activeCallsCount > 0 ? ` · активних викликів: ${activeCallsCount}` : ''}
            </Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={[styles.logoutButton, loggingOut && styles.logoutButtonDisabled]}
        disabled={loggingOut}
        onPress={() => void onLogout()}
      >
        <Text style={styles.logoutLabel}>Вийти з акаунту</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  styles,
  mono,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
  mono?: boolean;
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
      color: c.textMuted,
      fontSize: 12,
      textTransform: 'uppercase',
      fontWeight: '700',
      letterSpacing: 0.4,
      paddingHorizontal: 4,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      gap: 8,
    },

    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 8,
    },
    rowLabel: { color: c.text, fontSize: 14, fontWeight: '600' },
    rowValue: {
      color: c.textMuted,
      fontSize: 14,
      fontWeight: '600',
      maxWidth: '60%',
      textAlign: 'right',
    },
    rowValueMono: { fontFamily: 'Menlo', fontSize: 12 },
    hint: { color: c.textMuted, fontSize: 12, paddingHorizontal: 6 },

    cameraStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    cameraDot: { width: 9, height: 9, borderRadius: 999 },
    cameraDotOk: { backgroundColor: c.success },
    cameraDotBad: { backgroundColor: c.danger },
    cameraStatusText: { fontSize: 14, fontWeight: '700' },
    cameraStatusTextOk: { color: c.success },
    cameraStatusTextBad: { color: c.danger },
    cameraSettingsButton: {
      marginTop: 4,
      backgroundColor: c.primary,
      paddingVertical: 13,
      borderRadius: 14,
      alignItems: 'center',
    },
    cameraSettingsButtonLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },
    cameraRecheckButton: { paddingVertical: 10, alignItems: 'center' },
    cameraRecheckLabel: { color: c.textMuted, fontWeight: '700', fontSize: 13 },

    reportButton: {
      marginTop: 4,
      backgroundColor: c.primary,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
    },
    reportButtonLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },

    logoutButton: {
      marginTop: 12,
      paddingVertical: 16,
      borderRadius: 16,
      alignItems: 'center',
      backgroundColor: c.dangerSoft,
      borderWidth: 1,
      borderColor: c.danger,
    },
    logoutButtonDisabled: { opacity: 0.6 },
    logoutLabel: {
      color: c.danger,
      fontWeight: '700',
      fontSize: 15,
    },
  });
}
