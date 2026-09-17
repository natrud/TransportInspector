import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  type ColorPalette,
  CONTENT_MAX_WIDTH,
  type FineReason,
  type Ticket,
  type ValidationFailureReason,
  formatDateTime,
  formatFareType,
  formatReason,
  formatTicketPrice,
  formatTime,
  formatTransport,
  useColors,
} from '@transport/shared';
import type { RootStackParamList } from '../app/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'TicketResult'>;

function mapReasonToFineReason(reason: ValidationFailureReason): FineReason {
  switch (reason) {
    case 'used':
      return 'used';
    case 'expired':
      return 'expired';
    case 'hash-mismatch':
    case 'route-mismatch':
    case 'not-active':
      return 'invalid_qr';
    case 'not-found':
    case 'malformed-qr':
    case 'offline':
    case 'unknown':
      return 'no_ticket';
  }
}

export function TicketResultScreen({ navigation, route }: Props): JSX.Element {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { result, rawQr } = route.params;
  const isValid = result.kind === 'valid';
  const ticket = result.kind === 'valid' ? result.ticket : result.ticket;
  const fineReason = result.kind === 'invalid' ? mapReasonToFineReason(result.reason) : null;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={[styles.banner, isValid ? styles.bannerValid : styles.bannerInvalid]}>
        <Text style={styles.bannerIcon}>{isValid ? '✓' : '✕'}</Text>
        <Text style={styles.bannerTitle}>
          {isValid ? 'Квиток валідний' : 'Квиток невалідний'}
        </Text>
        {result.kind === 'invalid' ? (
          <>
            <Text style={styles.bannerSubtitle}>{formatReason(result.reason)}</Text>
            <Text style={styles.bannerMessage}>{result.message}</Text>
          </>
        ) : (
          <Text style={styles.bannerSubtitle}>
            Активний до {formatTime(result.ticket.active_until)}
          </Text>
        )}
      </View>

      {ticket ? <TicketDetails ticket={ticket} styles={styles} /> : null}

      {rawQr && result.kind === 'invalid' && result.reason === 'malformed-qr' ? (
        <View style={styles.rawCard}>
          <Text style={styles.detailsLabel}>Зчитаний вміст QR</Text>
          <Text style={styles.rawText}>{rawQr}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {fineReason ? (
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={() =>
              navigation.replace('RecordFine', {
                ticketId: ticket?.id,
                reason: fineReason,
                // Сума штрафу — 20× ціни САМЕ цього квитка, тож несемо її далі.
                ticketPrice: ticket?.price,
              })
            }
          >
            <Text style={styles.dangerButtonLabel}>Видати постанову (ст. 135 КУпАП)</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.replace('Scanner', { routeId: undefined })}
        >
          <Text style={styles.primaryButtonLabel}>Сканувати наступний</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.popToTop()}
        >
          <Text style={styles.secondaryButtonLabel}>На головну</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function TicketDetails({
  ticket,
  styles,
}: {
  ticket: Ticket;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  return (
    <View style={styles.detailsCard}>
      <DetailsRow styles={styles} label="ID" value={ticket.id} mono />
      <DetailsRow styles={styles} label="Транспорт" value={formatTransport(ticket.transport)} />
      <DetailsRow styles={styles} label="Тариф" value={formatFareType(ticket.fare_type)} />
      <DetailsRow styles={styles} label="Ціна" value={formatTicketPrice(ticket.price)} />
      <DetailsRow styles={styles} label="Статус" value={ticket.status} />
      <DetailsRow
        styles={styles}
        label="Куплено"
        value={formatDateTime(ticket.created_at)}
      />
      <DetailsRow
        styles={styles}
        label="Валідовано"
        value={formatDateTime(ticket.validated_at)}
      />
      <DetailsRow
        styles={styles}
        label="Активний до"
        value={formatDateTime(ticket.active_until)}
      />
      {ticket.validated_serial_number ? (
        <DetailsRow
          styles={styles}
          label="Контролер"
          value={ticket.validated_serial_number}
        />
      ) : null}
      {ticket.validated_door_number != null ? (
        <DetailsRow
          styles={styles}
          label="Двері"
          value={`№${ticket.validated_door_number}`}
        />
      ) : null}
      {ticket.validation_method ? (
        <DetailsRow
          styles={styles}
          label="Метод"
          value={ticket.validation_method.toUpperCase()}
        />
      ) : null}
    </View>
  );
}

function DetailsRow({
  label,
  value,
  mono,
  styles,
}: {
  label: string;
  value: string;
  mono?: boolean;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  return (
    <View style={styles.detailsRow}>
      <Text style={styles.detailsLabel}>{label}</Text>
      <Text style={[styles.detailsValue, mono && styles.detailsValueMono]}>{value}</Text>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: c.background },
    scrollContent: { padding: 16, paddingBottom: 32, width: '100%', alignSelf: 'center', maxWidth: CONTENT_MAX_WIDTH },

    banner: {
      borderRadius: 24,
      padding: 24,
      alignItems: 'center',
      gap: 8,
    },
    bannerValid: {
      backgroundColor: c.successSoft,
      borderWidth: 2,
      borderColor: c.success,
    },
    bannerInvalid: {
      backgroundColor: c.dangerSoft,
      borderWidth: 2,
      borderColor: c.danger,
    },
    bannerIcon: {
      fontSize: 64,
      fontWeight: '900',
      color: c.text,
    },
    bannerTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: c.text,
      textAlign: 'center',
    },
    bannerSubtitle: {
      fontSize: 16,
      fontWeight: '600',
      color: c.textMuted,
      textAlign: 'center',
    },
    bannerMessage: {
      marginTop: 8,
      fontSize: 14,
      color: c.text,
      textAlign: 'center',
    },

    detailsCard: {
      marginTop: 16,
      borderRadius: 18,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 8,
    },
    detailsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    detailsLabel: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    detailsValue: {
      color: c.text,
      fontSize: 15,
      fontWeight: '600',
      maxWidth: '60%',
      textAlign: 'right',
    },
    detailsValueMono: {
      fontFamily: 'Menlo',
      fontSize: 13,
    },

    rawCard: {
      marginTop: 16,
      padding: 14,
      borderRadius: 14,
      backgroundColor: c.surfaceMuted,
      borderWidth: 1,
      borderColor: c.border,
    },
    rawText: {
      marginTop: 6,
      fontFamily: 'Menlo',
      fontSize: 12,
      color: c.text,
    },

    actions: {
      marginTop: 20,
      gap: 12,
    },
    primaryButton: {
      backgroundColor: c.primary,
      paddingVertical: 30,
      borderRadius: 18,
      alignItems: 'center',
    },
    primaryButtonLabel: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 18,
    },
    secondaryButton: {
      paddingVertical: 24,
      borderRadius: 18,
      alignItems: 'center',
      backgroundColor: c.primarySoft,
    },
    secondaryButtonLabel: {
      color: c.primaryStrong,
      fontWeight: '700',
      fontSize: 17,
    },
    dangerButton: {
      backgroundColor: c.danger,
      paddingVertical: 30,
      borderRadius: 18,
      alignItems: 'center',
    },
    dangerButtonLabel: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 18,
    },
  });
}
