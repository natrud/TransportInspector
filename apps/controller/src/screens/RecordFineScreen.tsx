import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  type FineDocType,
  type FineReason,
  type UserByPhoneResult,
  FINE_MULTIPLIER,
  calculateFineKopecks,
  formatPrice,
  formatTicketPrice,
  formatTransport,
  lookupUserByPhone,
  ticketPriceToKopecks,
  useColors,
  useCreateFine,
  useCurrentInspection,
  useSession,
  useTransportFares,
} from '@transport/shared';
import type { RootStackParamList } from '../app/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'RecordFine'>;

type UiReason = 'no_ticket' | 'expired' | 'invalid_qr';
type UiDoc = 'passport' | 'student' | 'other';

const UI_REASONS: Array<{ id: UiReason; label: string }> = [
  { id: 'no_ticket', label: 'Без квитка' },
  { id: 'expired', label: 'Прострочений' },
  { id: 'invalid_qr', label: 'Підробка QR' },
];

const UI_DOCS: Array<{ id: UiDoc; label: string }> = [
  { id: 'passport', label: 'Паспорт' },
  { id: 'student', label: 'Студентський' },
  { id: 'other', label: 'Інше' },
];

function mapReasonToUi(r: FineReason | undefined): UiReason {
  if (!r) return 'no_ticket';
  switch (r) {
    case 'expired':
    case 'used':
      return 'expired';
    case 'invalid_qr':
      return 'invalid_qr';
    default:
      return 'no_ticket';
  }
}

function uiToBackendReason(ui: UiReason): FineReason { return ui; }
function uiToBackendDoc(ui: UiDoc): FineDocType { return ui; }

const PHONE_LOOKUP_DELAY_MS = 800;

export function RecordFineScreen({ navigation, route }: Props): JSX.Element {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { session } = useSession();
  const { inspection } = useCurrentInspection();
  // Коли квитка немає взагалі (постанова «з нуля»), прив'язати штраф до
  // конкретного квитка неможливо — контролер обирає ВИД ТРАНСПОРТУ, а ціну
  // за нього бере з адмінки (не хардкод): скільки видів транспорту і які в
  // них ціни — вирішує /admin/app-setting/list, тут лише відображаємо.
  const { fares, isLoading: faresLoading, error: faresError } = useTransportFares();
  const { create, isPending, error } = useCreateFine();

  const autoFilled = !!(route.params?.ticketId || route.params?.reason);
  const initialReason: UiReason = mapReasonToUi(route.params?.reason);

  const [offenderName, setOffenderName] = useState('');
  const [offenderPhone, setOffenderPhone] = useState('');
  const [docType, setDocType] = useState<UiDoc>('passport');
  const [docNumber, setDocNumber] = useState('');
  const [reason, setReason] = useState<UiReason>(initialReason);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Пошук юзера за телефоном
  const [foundUser, setFoundUser] = useState<UserByPhoneResult | null>(null);
  const [phoneSearching, setPhoneSearching] = useState(false);
  const phoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setFoundUser(null);
    if (phoneTimerRef.current) clearTimeout(phoneTimerRef.current);

    const digits = offenderPhone.replace(/\D/g, '');
    if (digits.length < 10) return;

    phoneTimerRef.current = setTimeout(async () => {
      setPhoneSearching(true);
      try {
        const result = await lookupUserByPhone(offenderPhone);
        setFoundUser(result);
        if (result && !offenderName.trim()) {
          setOffenderName(result.display_name);
        }
      } finally {
        setPhoneSearching(false);
      }
    }, PHONE_LOOKUP_DELAY_MS);

    return () => {
      if (phoneTimerRef.current) clearTimeout(phoneTimerRef.current);
    };
  }, [offenderPhone]);

  // Штраф ЗАВЖДИ 20× вартості квитка (ст. 135 КУпАП). Якщо постанова
  // виписується за перевіреним квитком — ціну беремо з нього, а не з
  // тарифів транспорту: різні тарифи дають різний штраф, і саме це має бути
  // в квитанції. Без квитка контролер обирає вид транспорту вручну.
  const ticketPrice = route.params?.ticketPrice ?? null;
  // Пільговий (0 грн) квиток не може бути базою — 20 × 0 = 0. У такому разі
  // контролер обирає тариф транспорту, як і за повної відсутності квитка.
  const ticketFareRaw = ticketPrice != null ? ticketPriceToKopecks(ticketPrice) : 0;
  const ticketFareKopecks = ticketFareRaw > 0 ? ticketFareRaw : null;

  // Вид транспорту для розрахунку штрафу, коли квиток не пред'явлено.
  //
  // 1. ОСНОВНИЙ шлях — з активної перевірки. Контролер уже приклав свій QR до
  //    валідатора конкретного ТЗ, і система знає, у чому він їде
  //    (inspection.transport_type приходить з картки валідатора). Питати про
  //    це людину вдруге — зайве.
  // 2. ФОЛБЕК — ручний вибір зі списку тарифів. Потрібен, якщо перевірку не
  //    відкрито (постанова «з нуля»), або у валідаторі не вказано тип
  //    транспорту. Кнопки лишаються видимими завжди, тож автовибір за потреби
  //    можна перекрити вручну.
  const inspectionTransport = inspection?.transport_type ?? null;
  const autoFare = inspectionTransport
    ? (fares.find((f) => f.transport === inspectionTransport) ?? null)
    : null;

  const [manualTransport, setManualTransport] = useState<string | null>(null);
  // Щойно контролер обрав транспорт сам — автовизначення більше не перебиває
  // його вибір (напр. перевірка в тролейбусі, а порушник їхав автобусом).
  const [transportTouched, setTransportTouched] = useState(false);

  useEffect(() => {
    if (transportTouched) return;
    const next = autoFare?.transport ?? fares[0]?.transport ?? null;
    if (next != null && next !== manualTransport) setManualTransport(next);
  }, [autoFare, fares, manualTransport, transportTouched]);

  const manualFare = fares.find((f) => f.transport === manualTransport) ?? fares[0] ?? null;
  const manualFareKopecks = manualFare ? ticketPriceToKopecks(manualFare.price) : 0;
  const baseFareKopecks = ticketFareKopecks ?? manualFareKopecks;
  const fineAmount = calculateFineKopecks(baseFareKopecks);

  // Транспорт підтягнувся сам і контролер його не міняв.
  const transportFromInspection =
    !transportTouched && autoFare != null && manualTransport === autoFare.transport;

  // Нульовий штраф виписувати не можна: це або незавантажені тарифи, або
  // порожня адмінка. Краще заблокувати кнопку і сказати чому, ніж видати
  // постанову на 0 грн.
  const fareUnavailable = ticketFareKopecks == null && manualFareKopecks <= 0;

  const onSubmit = async (): Promise<void> => {
    // Нульова база = постанова на 0 грн. Це не «дешевий штраф», це зіпсований
    // документ: у квитанції лишиться 0, і стягнути за ним нічого не можна.
    if (baseFareKopecks <= 0) {
      setValidationError(
        'Не визначено вартість квитка — сума штрафу вийде нульовою. Оберіть вид транспорту вище.',
      );
      return;
    }
    if (!offenderName.trim()) {
      setValidationError('Заповніть ПІБ порушника');
      return;
    }
    if (!docNumber.trim()) {
      setValidationError('Заповніть номер документа');
      return;
    }
    setValidationError(null);

    const fine = await create({
      controller_serial: session?.serial_number ?? 'UNKNOWN',
      route_id:
        route.params?.routeId ?? inspection?.route_number ?? session?.assigned_route_id ?? null,
      ticket_id: route.params?.ticketId ?? null,
      offender_name: offenderName.trim(),
      offender_phone: offenderPhone.trim() || null,
      offender_user_id: foundUser?.user_id ?? null,
      doc_type: uiToBackendDoc(docType),
      doc_number: docNumber.trim(),
      reason: uiToBackendReason(reason),
      base_fare_kopecks: baseFareKopecks,
      location_note: null,
      inspection_session_id: inspection?.id ?? null,
    });

    navigation.replace('FineReceipt', { fineId: fine.id });
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
        <Text style={styles.amountRule}>
          Сума штрафу — {FINE_MULTIPLIER}-кратний розмір вартості квитка (ст. 135 КУпАП)
        </Text>
        <View style={styles.amountCard}>
          <Text style={styles.amountLabel}>Сума штрафу</Text>
          <Text style={styles.amountValue}>{formatPrice(fineAmount)}</Text>
          <Text style={styles.amountFormula}>
            {FINE_MULTIPLIER} × {formatPrice(baseFareKopecks)}
            {ticketFareKopecks != null
              ? ` · ціна квитка ${formatTicketPrice(ticketPrice as number)}`
              : manualFare
                ? ` · ${formatTransport(manualFare.transport)}${
                    transportFromInspection ? ', з поточної перевірки' : ', обрано вручну'
                  }`
                : ''}
          </Text>
        </View>

        {ticketFareKopecks == null ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Вартість квитка (база штрафу)</Text>

            {transportFromInspection && inspection ? (
              <View style={styles.autoFilledBanner}>
                <Text style={styles.autoFilledIcon}>✓</Text>
                <Text style={styles.autoFilledText}>
                  Транспорт визначено з поточної перевірки:{' '}
                  {formatTransport(inspectionTransport as string)} · ТЗ {inspection.vehicle_number}.
                  Якщо порушник їхав іншим — оберіть нижче.
                </Text>
              </View>
            ) : inspectionTransport != null && autoFare == null && fares.length > 0 ? (
              // Перевірка йде, транспорт відомий, але ціни для нього в адмінці
              // немає (напр. маршрутка прихована в SETTINGS_SPEC). Мовчки
              // підставити чужий тариф не можна — кажемо прямо.
              <Text style={[styles.fareHint, styles.fareHintError]}>
                У поточній перевірці транспорт «{formatTransport(inspectionTransport)}», але ціну
                квитка для нього в адмінці не налаштовано. Оберіть тариф вручну.
              </Text>
            ) : (
              <Text style={styles.fareHint}>
                {ticketPrice != null
                  ? `У квитка нульова вартість (пільга), тож ${FINE_MULTIPLIER}× від нього дало б нуль. Оберіть вид транспорту — його ціна з адмінки піде у квитанцію.`
                  : "Квиток не перевірявся, тож прив'язати штраф до нього неможливо. Оберіть вид транспорту — його ціна з адмінки піде у квитанцію."}
              </Text>
            )}

            {fares.length > 0 ? (
              <View style={styles.chipsRow}>
                {fares.map((fare) => (
                  <Chip
                    key={fare.transport}
                    label={`${formatTransport(fare.transport)} · ${formatPrice(ticketPriceToKopecks(fare.price))}`}
                    active={fare.transport === manualTransport}
                    onPress={() => {
                      setTransportTouched(true);
                      setManualTransport(fare.transport);
                    }}
                    styles={styles}
                  />
                ))}
              </View>
            ) : (
              // Порожній список і помилка запиту — різні речі, і плутати їх
              // не можна: у другому випадку тарифи в адмінці є, просто
              // застосунок їх не дістав.
              <Text style={[styles.fareHint, !faresLoading && styles.fareHintError]}>
                {faresLoading
                  ? 'Завантажуємо тарифи…'
                  : faresError
                    ? 'Не вдалося завантажити тарифи з сервера. Перевірте звʼязок — без них суму штрафу порахувати неможливо.'
                    : 'В адмінці не налаштовано жодного тарифу транспорту.'}
              </Text>
            )}
          </View>
        ) : null}

        {autoFilled ? (
          <View style={styles.autoFilledBanner}>
            <Text style={styles.autoFilledIcon}>✓</Text>
            <Text style={styles.autoFilledText}>
              Дані квитка автозаповнено{route.params?.ticketId ? `: ${route.params.ticketId}` : ''}
            {ticketPrice != null ? ` · ${formatTicketPrice(ticketPrice)}` : ''}
            </Text>
          </View>
        ) : null}

        {/* Телефон + пошук юзера */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Телефон порушника</Text>
          <View style={styles.phoneRow}>
            <TextInput
              style={[styles.input, styles.phoneInput]}
              value={offenderPhone}
              onChangeText={setOffenderPhone}
              placeholder="+380XXXXXXXXX"
              placeholderTextColor={c.textSoft}
              keyboardType="phone-pad"
              autoCorrect={false}
            />
            {phoneSearching ? (
              <ActivityIndicator size="small" color={c.primary} style={styles.phoneSpinner} />
            ) : null}
          </View>
          {foundUser ? (
            <View style={styles.userFoundCard}>
              <Text style={styles.userFoundIcon}>✓</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.userFoundName}>{foundUser.display_name}</Text>
                {foundUser.email ? (
                  <Text style={styles.userFoundEmail}>{foundUser.email}</Text>
                ) : null}
              </View>
            </View>
          ) : offenderPhone.replace(/\D/g, '').length >= 10 && !phoneSearching ? (
            <Text style={styles.userNotFound}>Користувача не знайдено в системі</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ПІБ порушника</Text>
          <TextInput
            style={styles.input}
            value={offenderName}
            onChangeText={setOffenderName}
            placeholder="Прізвище Імʼя По батькові"
            placeholderTextColor={c.textSoft}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Документ</Text>
          <View style={styles.chipsRow}>
            {UI_DOCS.map((d) => (
              <Chip
                key={d.id}
                label={d.label}
                active={d.id === docType}
                onPress={() => setDocType(d.id)}
                styles={styles}
              />
            ))}
          </View>
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            value={docNumber}
            onChangeText={setDocNumber}
            placeholder="Номер документа"
            placeholderTextColor={c.textSoft}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Причина</Text>
          <View style={styles.chipsRow}>
            {UI_REASONS.map((r) => (
              <Chip
                key={r.id}
                label={r.label}
                active={r.id === reason}
                onPress={() => setReason(r.id)}
                styles={styles}
              />
            ))}
          </View>
        </View>

        {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
        {error ? <Text style={styles.error}>{error.message}</Text> : null}
      </ScrollView>

      <View style={styles.bottomBar}>
        <Pressable
          style={[
            styles.submitButton,
            (isPending || fareUnavailable) && styles.submitButtonDisabled,
          ]}
          onPress={() => void onSubmit()}
          // Поки не відома вартість квитка, видати постанову не можна: сума
          // вийшла б нульовою.
          disabled={isPending || fareUnavailable}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitLabel}>Видати постанову · {formatPrice(fineAmount)}</Text>
          )}
        </Pressable>
        <Pressable style={styles.cancelButton} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelLabel}>Скасувати</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Chip({
  label, active, onPress, styles,
}: {
  label: string; active: boolean; onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.background },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, gap: 14, width: '100%', alignSelf: 'center', maxWidth: CONTENT_MAX_WIDTH },

    amountCard: {
      backgroundColor: c.dangerSoft, borderRadius: 16, borderWidth: 2,
      borderColor: c.danger, padding: 18, alignItems: 'center', gap: 4,
    },
    amountLabel: { color: c.danger, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
    amountValue: { color: c.danger, fontWeight: '900', fontSize: 48, letterSpacing: 0.5 },
    amountFormula: { color: c.textMuted, fontSize: 12, textAlign: 'center' },
    // Дрібний рядок над сумою — правило, за яким вона порахована.
    amountRule: {
      color: c.textMuted,
      fontSize: 11,
      lineHeight: 15,
      textAlign: 'center',
      paddingHorizontal: 8,
      marginBottom: -6,
    },
    fareHint: { color: c.textMuted, fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
    fareHintError: { color: c.danger, fontWeight: '600' },

    autoFilledBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12,
      backgroundColor: c.successSoft, borderWidth: 1, borderColor: c.success,
    },
    autoFilledIcon: { color: c.success, fontSize: 18, fontWeight: '900' },
    autoFilledText: { color: c.success, fontSize: 13, fontWeight: '600', flex: 1 },

    section: { gap: 8 },
    sectionLabel: {
      color: c.textMuted, fontWeight: '700', fontSize: 12,
      textTransform: 'uppercase', letterSpacing: 0.4, paddingHorizontal: 4,
    },
    input: {
      backgroundColor: c.surface, borderRadius: 14, borderWidth: 1,
      borderColor: c.border, paddingHorizontal: 16, paddingVertical: 16,
      color: c.text, fontSize: 17,
    },

    phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    phoneInput: { flex: 1 },
    phoneSpinner: { marginRight: 4 },

    userFoundCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.successSoft, borderRadius: 12, borderWidth: 1,
      borderColor: c.success, paddingHorizontal: 14, paddingVertical: 10,
    },
    userFoundIcon: { color: c.success, fontSize: 20, fontWeight: '900' },
    userFoundName: { color: c.success, fontWeight: '700', fontSize: 14 },
    userFoundEmail: { color: c.textMuted, fontSize: 12 },
    userNotFound: { color: c.textMuted, fontSize: 12, paddingHorizontal: 4, fontStyle: 'italic' },

    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999,
      backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipLabel: { color: c.text, fontWeight: '700', fontSize: 14 },
    chipLabelActive: { color: '#fff' },

    error: { color: c.danger, fontWeight: '600', fontSize: 13, paddingHorizontal: 4 },

    bottomBar: {
      backgroundColor: c.background, borderTopWidth: 1, borderTopColor: c.border,
      paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 8,
      width: '100%', alignSelf: 'center', maxWidth: CONTENT_MAX_WIDTH,
    },
    submitButton: { backgroundColor: c.danger, paddingVertical: 18, borderRadius: 16, alignItems: 'center' },
    submitButtonDisabled: { opacity: 0.6 },
    submitLabel: { color: '#fff', fontWeight: '800', fontSize: 16 },
    cancelButton: { paddingVertical: 8, alignItems: 'center' },
    cancelLabel: { color: c.textMuted, fontWeight: '700' },
  });
}
