import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Print from 'expo-print';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  type ColorPalette,
  CONTENT_MAX_WIDTH,
  FINE_DOC_LABELS,
  FINE_MULTIPLIER,
  FINE_REASON_LABELS,
  formatPrice,
  useColors,
  useFine,
} from '@transport/shared';
import type { RootStackParamList } from '../app/navigation';
import { buildReceiptHtml, buildReceiptQrPayload, buildReceiptText } from '../lib/fine-receipt-format';

type Props = NativeStackScreenProps<RootStackParamList, 'FineReceipt'>;

// Ширина екранного превʼю — стилізована під 57 мм термопринтера.
const RECEIPT_WIDTH_PX = 240;

export function FineReceiptScreen({ navigation, route }: Props): JSX.Element {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { fine, isLoading } = useFine(route.params.fineId);
  const qrRef = useRef<QRCode | null>(null);
  const [qrSvgString, setQrSvgString] = useState<string | null>(null);

  // QR-код — після рендеру отримуємо raw SVG для HTML друку.
  useEffect(() => {
    if (!qrRef.current) return;
    // react-native-qrcode-svg API: ref.toDataURL(cb) → base64, але для inline SVG
    // у HTML нам потрібен сам SVG. Відкриваємо via toSvgString.
    // Бібліотека експортує getRef().toString(); fallback — base64 в <img>.
    const ref = qrRef.current as unknown as { toDataURL?: (cb: (b64: string) => void) => void };
    ref.toDataURL?.((b64) => setQrSvgString(`<img src="data:image/png;base64,${b64}" />`));
  }, [fine]);

  if (isLoading || !fine) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={c.primary} size="large" />
      </View>
    );
  }

  const receiptText = buildReceiptText(fine);
  const qrPayload = buildReceiptQrPayload(fine);

  const onShare = async (): Promise<void> => {
    try {
      await Share.share({
        message: receiptText,
        title: `Постанова ${fine.id}`,
      });
    } catch (err) {
      Alert.alert('Не вдалося поділитися', err instanceof Error ? err.message : 'unknown');
    }
  };

  const onPrint = async (): Promise<void> => {
    try {
      const html = buildReceiptHtml(fine, qrSvgString ?? '');
      await Print.printAsync({ html });
    } catch (err) {
      Alert.alert('Помилка друку', err instanceof Error ? err.message : 'unknown');
    }
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.receiptContainer}>
        <View style={styles.receipt}>
          <Text style={styles.receiptLine}>{'='.repeat(32)}</Text>
          <Text style={[styles.receiptLine, styles.bold, styles.center]}>ПОСТАНОВА ПРО ШТРАФ</Text>
          <Text style={[styles.receiptLine, styles.center]}>за ст. 135 КУпАП</Text>
          <Text style={styles.receiptLine}>{'='.repeat(32)}</Text>
          <Text style={styles.receiptLine}> </Text>

          <KeyVal label="Дата:" value={formatDateUa(fine.created_at)} styles={styles} />
          <KeyVal label="Контр.:" value={fine.controller_serial} styles={styles} />
          {fine.route_id ? <KeyVal label="Маршрут:" value={fine.route_id} styles={styles} /> : null}
          {fine.ticket_id ? <KeyVal label="Квиток:" value={fine.ticket_id} styles={styles} /> : null}

          <Text style={styles.receiptLine}>{'-'.repeat(32)}</Text>
          <Text style={styles.receiptLine}>Порушник:</Text>
          <Text style={[styles.receiptLine, styles.bold]}>{fine.offender_name}</Text>
          <Text style={styles.receiptLine}>
            {FINE_DOC_LABELS[fine.doc_type]} {fine.doc_number}
          </Text>
          <Text style={styles.receiptLine}> </Text>
          <Text style={styles.receiptLine}>Причина:</Text>
          <Text style={styles.receiptLine}>{FINE_REASON_LABELS[fine.reason]}</Text>
          {fine.location_note ? (
            <>
              <Text style={styles.receiptLine}> </Text>
              <Text style={styles.receiptLine}>Місце:</Text>
              <Text style={styles.receiptLine}>{fine.location_note}</Text>
            </>
          ) : null}

          <Text style={styles.receiptLine}>{'-'.repeat(32)}</Text>
          <KeyVal label="Ціна квитка:" value={formatPrice(fine.base_fare_kopecks)} styles={styles} />
          <KeyVal label="Множник:" value={`× ${FINE_MULTIPLIER}`} styles={styles} />
          <KeyVal label="СУМА:" value={formatPrice(fine.fine_amount_kopecks)} bold styles={styles} />
          <Text style={styles.receiptLine}>{'-'.repeat(32)}</Text>
          <KeyVal label="ID:" value={fine.id} styles={styles} />

          <View style={styles.qrBox}>
            <QRCode value={qrPayload} size={140} getRef={(ref) => (qrRef.current = ref)} />
          </View>
          <Text style={[styles.receiptLine, styles.center]}>Сплатити протягом 15 днів</Text>
          <Text style={styles.receiptLine}>{'='.repeat(32)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={() => void onPrint()}>
          <Text style={styles.primaryButtonLabel}>Друкувати на термопринтері</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void onShare()}>
          <Text style={styles.secondaryButtonLabel}>Поділитися текстом</Text>
        </Pressable>
        <Pressable style={styles.tertiaryButton} onPress={() => navigation.popToTop()}>
          <Text style={styles.tertiaryButtonLabel}>На головну</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function KeyVal({
  label,
  value,
  bold,
  styles,
}: {
  label: string;
  value: string;
  bold?: boolean;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  return (
    <View style={styles.kvRow}>
      <Text style={[styles.receiptLine, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.receiptLine, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

function formatDateUa(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: c.background },
    scrollContent: { padding: 16, alignItems: 'center', paddingBottom: 40, width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
    centerScreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.background,
    },

    receiptContainer: {
      backgroundColor: c.surfaceMuted,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    receipt: {
      width: RECEIPT_WIDTH_PX,
      backgroundColor: '#ffffff',
      paddingVertical: 14,
      paddingHorizontal: 8,
      borderRadius: 2,
    },
    receiptLine: {
      fontFamily: 'Menlo',
      fontSize: 11,
      lineHeight: 14,
      color: '#000',
    },
    bold: { fontWeight: '800' },
    center: { textAlign: 'center' },

    kvRow: { flexDirection: 'row', justifyContent: 'space-between' },

    qrBox: { alignItems: 'center', marginVertical: 10 },

    actions: {
      marginTop: 18,
      gap: 10,
      alignSelf: 'stretch',
    },
    primaryButton: {
      backgroundColor: c.primary,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: 'center',
    },
    primaryButtonLabel: { color: '#fff', fontWeight: '700', fontSize: 16 },
    secondaryButton: {
      backgroundColor: c.primarySoft,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
    },
    secondaryButtonLabel: { color: c.primaryStrong, fontWeight: '700' },
    tertiaryButton: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    tertiaryButtonLabel: { color: c.textMuted, fontWeight: '600' },
  });
}
