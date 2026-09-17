import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  NativeModules,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  type CameraDevice,
  useCameraDevice,
  useCameraDevices,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import {
  type ColorPalette,
  parseQrPayload,
  useColors,
  useCurrentInspection,
  useLayout,
  useSession,
  useSettings,
  useTicketValidate,
} from '@transport/shared';
import type { RootStackParamList } from '../app/navigation';
import { useCameraPermissionState } from '../hooks/useCameraPermissionState';

type Props = NativeStackScreenProps<RootStackParamList, 'Scanner'>;

const REPEAT_DEBOUNCE_MS = 1500;
const TOAST_VISIBLE_MS = 1500;
// 5с виявилось замало на повільному холодному старті (перше відкриття після
// встановлення, коли CameraX/Play Services ще розкручуються): екран встигав
// показати «Камеру не знайдено» ще до того, як провайдер віддав список
// пристроїв, хоча камера була справна і за секунду-дві таки з'являлась.
const CAMERA_DISCOVERY_TIMEOUT_MS = 9000;

interface FlashToast {
  ticketId: string;
}

interface NativeCameraDevicesModule {
  getConstants?: () => { availableCameraDevices?: CameraDevice[] };
}

function selectCameraDevice(devices: CameraDevice[]): CameraDevice | undefined {
  return devices.find((item) => item.position === 'back') ?? devices[0];
}

export function ScannerScreen({ navigation, route }: Props): JSX.Element {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { hasPermission, requestPermission } = useCameraPermission();
  // Детальний стан — щоб відрізнити «ще не питали» (кнопка нижче реально
  // відкриє системний діалог) від «відхилено назавжди» (Android більше не
  // покаже діалог, requestPermission() нічого не зробить — лишається тільки
  // відкрити налаштування телефону вручну).
  const cameraPermission = useCameraPermissionState();
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);
  // Vision Camera vimога: камера має бути активна ЛИШЕ коли екран у фокусі і
  // застосунок на передньому плані. Інакше CameraX не звільняє пристрій при
  // переході між екранами / згортанні → «device/camera-already-in-use» і
  // чорний екран при наступному відкритті сканера.
  const cameraActive = isFocused && appActive;
  const backDevice = useCameraDevice('back');
  const devices = useCameraDevices();
  const [nativeDevices, setNativeDevices] = useState<CameraDevice[]>([]);
  // Some Android devices/emulators expose only a front camera. Scanning is
  // still possible there, so use it rather than waiting forever for `back`.
  const device = backDevice ?? selectCameraDevice(devices) ?? selectCameraDevice(nativeDevices);
  const { session } = useSession();
  const layout = useLayout();
  // Рамка прив'язана до КОРОТШОЇ сторони вікна: у альбомній орієнтації
  // фіксовані 260dp не влізли б у висоту разом з підказкою.
  const frameSize = Math.min(260, Math.round(Math.min(layout.width, layout.height) * 0.62));
  const { inspection } = useCurrentInspection();
  const { settings } = useSettings();
  const { validate, isPending } = useTicketValidate();

  const routeId =
    route.params?.routeId ?? inspection?.route_number ?? session?.assigned_route_id ?? null;

  const [lastScannedAt, setLastScannedAt] = useState(0);
  const [lastValue, setLastValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<FlashToast | null>(null);
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [cameraMountKey, setCameraMountKey] = useState(0);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const isHandlingRef = useRef(false);
  const autoRetriesRef = useRef(0);

  useEffect(() => {
    if (!hasPermission) {
      void requestPermission().catch(() => {
        setCameraProblem('Не вдалося запросити доступ до камери. Спробуйте ще раз.');
      });
    }
  }, [hasPermission, requestPermission]);

  // Повернулись на екран (фокус/передній план) — даємо камері чистий старт:
  // скидаємо транзієнтні помилки і перемонтовуємо <Camera>.
  const prevActiveRef = useRef(cameraActive);
  useEffect(() => {
    if (cameraActive && !prevActiveRef.current) {
      setCameraProblem(null);
      setCameraUnavailable(false);
      setCameraMountKey((v) => v + 1);
    }
    prevActiveRef.current = cameraActive;
  }, [cameraActive]);

  useEffect(() => {
    if (!hasPermission || device) return;

    // Vision Camera 4 can expose an empty device list when getConstants() is
    // called before CameraX finishes starting. Its Android module does not
    // emit a second event in that case. Polling its native constants briefly
    // closes that startup race and works in release APKs as well.
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const readNativeDevices = (): void => {
      if (cancelled) return;
      const module = NativeModules.CameraDevices as NativeCameraDevicesModule | undefined;
      const next = module?.getConstants?.().availableCameraDevices;
      if (Array.isArray(next) && next.length > 0) {
        setNativeDevices(next);
        return;
      }
      attempts += 1;
      // Стільки ж спроб, скільки триває вікно до «Камеру не знайдено»
      // (CAMERA_DISCOVERY_TIMEOUT_MS) — раніше цей робочий цикл здавався
      // за 3 с, а екран помилки чекав довше, тож де-факто нічого не робив
      // в останні секунди очікування.
      if (attempts < CAMERA_DISCOVERY_TIMEOUT_MS / 250) timer = setTimeout(readNativeDevices, 250);
    };
    readNativeDevices();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [hasPermission, device, cameraMountKey]);

  useEffect(() => {
    if (!hasPermission || device || cameraProblem) {
      setCameraUnavailable(false);
      return;
    }
    const timer = setTimeout(() => setCameraUnavailable(true), CAMERA_DISCOVERY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hasPermission, device, cameraProblem, cameraMountKey]);

  useEffect(() => {
    if (!toast) return;
    Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
        () => setToast(null),
      );
    }, TOAST_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [toast, toastOpacity]);

  const handleScan = async (value: string): Promise<void> => {
    if (isHandlingRef.current) return;
    const now = Date.now();
    if (value === lastValue && now - lastScannedAt < REPEAT_DEBOUNCE_MS) return;
    setLastValue(value);
    setLastScannedAt(now);

    const qr = parseQrPayload(value);
    if (!qr) {
      navigation.replace('TicketResult', {
        result: {
          kind: 'invalid',
          reason: 'malformed-qr',
          ticket: null,
          message: 'QR-код не схожий на квиток системи',
        },
        rawQr: value,
      });
      return;
    }

    isHandlingRef.current = true;
    setError(null);
    try {
      const res = await validate({
        qr,
        serialNumber: session?.serial_number ?? 'UNKNOWN',
        routeId,
        doorNumber: 0,
        rawQr: value,
        inspectionSessionId: inspection?.id ?? null,
      });

      if (settings.rapidScanEnabled && res.kind === 'valid') {
        setToast({ ticketId: res.ticket.id });
        return;
      }

      navigation.replace('TicketResult', { result: res, rawQr: value });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка валідації');
    } finally {
      isHandlingRef.current = false;
    }
  };

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      const first = codes[0]?.value;
      if (first) void handleScan(first);
    },
  });

  const retryCamera = (): void => {
    setCameraProblem(null);
    setCameraUnavailable(false);
    setNativeDevices([]);
    setCameraMountKey((value) => value + 1);
    void requestPermission().catch(() => {
      setCameraProblem('Не вдалося оновити доступ до камери.');
    });
  };

  if (hasPermission === false) {
    // Android більше не показує системний діалог після повторної відмови —
    // тоді «Запросити дозвіл» тихо нічого не робить, і людина бачить той
    // самий екран знову й знову. Розрізняємо це явно й даємо реальний вихід.
    const permanentlyDenied = cameraPermission.isPermanentlyDenied;
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.centerTitle}>Немає доступу до камери</Text>
        <Text style={styles.centerText}>
          {permanentlyDenied
            ? 'Дозвіл на камеру відхилено, і Android більше не покаже діалог. Надайте доступ у налаштуваннях телефону — після повернення сюди все запрацює само.'
            : 'Сканування QR потребує дозволу на камеру. Натисніть нижче, щоб надати доступ.'}
        </Text>
        {permanentlyDenied ? (
          <TouchableOpacity style={styles.primaryButton} onPress={cameraPermission.openSettings}>
            <Text style={styles.primaryButtonLabel}>Відкрити налаштування телефону</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.primaryButton} onPress={() => void requestPermission()}>
            <Text style={styles.primaryButtonLabel}>Запитати дозвіл</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryButtonLabel}>Назад</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    if (cameraUnavailable) {
      return (
        <View style={styles.centerScreen}>
          <Text style={styles.centerTitle}>Камеру не знайдено</Text>
          <Text style={styles.centerText}>
            Перевірте дозвіл у налаштуваннях Android, закрийте інші застосунки, які можуть
            використовувати камеру. На емуляторі потрібна налаштована камера або реальний телефон.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={retryCamera}>
            <Text style={styles.primaryButtonLabel}>Спробувати ще раз</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={cameraPermission.openSettings}>
            <Text style={styles.secondaryButtonLabel}>Налаштування телефону</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('ManualEntry')}>
            <Text style={styles.secondaryButtonLabel}>Ввести код вручну</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={styles.centerText}>Підготовка камери…</Text>
      </View>
    );
  }

  if (cameraProblem) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.centerTitle}>Камера недоступна</Text>
        <Text style={styles.centerText}>{cameraProblem}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={retryCamera}>
          <Text style={styles.primaryButtonLabel}>Спробувати ще раз</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('ManualEntry')}>
          <Text style={styles.secondaryButtonLabel}>Ввести код вручну</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        key={cameraMountKey}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={cameraActive}
        codeScanner={codeScanner}
        onInitialized={() => {
          setCameraProblem(null);
          autoRetriesRef.current = 0;
        }}
        onError={(cameraError) => {
          const code = cameraError.code;
          // Транзієнтні збої (пристрій ще не звільнився після попереднього
          // екрана / згортання) — тихо перемонтовуємо камеру, до 2 разів,
          // перш ніж показувати екран помилки.
          const transient =
            code === 'device/camera-already-in-use' ||
            code === 'device/no-device' ||
            String(code).startsWith('session/');
          if (transient && autoRetriesRef.current < 2) {
            autoRetriesRef.current += 1;
            setTimeout(() => setCameraMountKey((v) => v + 1), 700);
            return;
          }
          if (code === 'device/camera-already-in-use') {
            setCameraProblem('Камеру зараз використовує інший застосунок. Закрийте його та повторіть.');
          } else if (code === 'permission/camera-permission-denied') {
            setCameraProblem('Доступ до камери заборонено в налаштуваннях Android.');
          } else {
            setCameraProblem(`Не вдалося запустити камеру (${code}).`);
          }
        }}
      />
      <View pointerEvents="none" style={styles.overlay}>
        <View style={[styles.frame, { width: frameSize, height: frameSize }]} />
        <Text style={styles.overlayHint}>
          {settings.rapidScanEnabled
            ? 'Експрес-режим: валідні підтверджуються миттєво'
            : 'Наведи рамку на QR квитка'}
        </Text>
      </View>

      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.toast, { opacity: toastOpacity }]}
        >
          <Text style={styles.toastIcon}>✓</Text>
          <View>
            <Text style={styles.toastTitle}>Валідний</Text>
            <Text style={styles.toastTicket}>{toast.ticketId}</Text>
          </View>
        </Animated.View>
      ) : null}

      <View style={styles.bottomBar}>
        {isPending ? (
          <View style={styles.statusPill}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.statusText}>Перевіряємо…</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelButtonLabel}>Скасувати</Text>
        </Pressable>
      </View>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    frame: {
      borderRadius: 28,
      borderWidth: 4,
      borderColor: '#ffffff',
      backgroundColor: 'transparent',
    },
    overlayHint: {
      marginTop: 22,
      paddingHorizontal: 18,
      paddingVertical: 12,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.55)',
      color: '#fff',
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
      maxWidth: '85%',
    },

    toast: {
      position: 'absolute',
      top: 100,
      alignSelf: 'center',
      paddingVertical: 14,
      paddingHorizontal: 22,
      borderRadius: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minWidth: 240,
      backgroundColor: c.success,
    },
    toastIcon: { color: '#fff', fontSize: 32, fontWeight: '900', lineHeight: 36 },
    toastTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
    toastTicket: { color: 'rgba(255,255,255,0.92)', fontFamily: 'Menlo', fontSize: 13 },

    bottomBar: {
      position: 'absolute',
      bottom: 36,
      left: 16,
      right: 16,
      alignItems: 'center',
      gap: 14,
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    statusText: { color: '#fff', fontWeight: '600' },
    errorText: {
      color: '#ffd0cc',
      fontWeight: '600',
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
    },
    cancelButton: {
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.92)',
    },
    cancelButtonLabel: { color: c.primaryStrong, fontWeight: '700', fontSize: 16 },

    centerScreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingHorizontal: 28,
      backgroundColor: c.background,
    },
    centerTitle: { fontSize: 22, fontWeight: '700', color: c.text, textAlign: 'center' },
    centerText: { color: c.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    primaryButton: {
      backgroundColor: c.primary,
      paddingHorizontal: 22,
      paddingVertical: 14,
      borderRadius: 14,
    },
    primaryButtonLabel: { color: '#fff', fontWeight: '700' },
    secondaryButton: { paddingHorizontal: 22, paddingVertical: 12 },
    secondaryButtonLabel: { color: c.primary, fontWeight: '600' },
  });
}
