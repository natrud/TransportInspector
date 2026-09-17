import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  type ColorPalette,
  ReadersBlockCard,
  formatRelative,
  minutesUntil,
  useColors,
  useCurrentInspection,
  useLayout,
  useRecentValidations,
  useSession,
  useShiftSummary,
} from '@transport/shared';
import type { RootStackParamList } from '../app/navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen(): JSX.Element {
  const navigation = useNavigation<Nav>();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { session } = useSession();
  const layout = useLayout();
  const { inspection, isFetching: isInspectionRefreshing } = useCurrentInspection();
  const { summary } = useShiftSummary();
  const { entries: recent } = useRecentValidations(3);

  const total = summary?.totalScans ?? 0;
  // Перевірка завершується сама (строк задає адмін) — контролер має бачити,
  // скільки лишилось, бо разом з нею відкриються зчитувачі в салоні.
  const autoCloseMinutes = inspection ? minutesUntil(inspection.auto_close_at) : null;

  // Екран цілком на флексах, тож переживає будь-який розмір вікна. У альбомній
  // орієнтації міняється головне: дії стають поруч, а не одна під одною —
  // інакше велика картка скану з'їдає всю (невелику) висоту.
  const landscape = layout.isLandscape;

  return (
    // ScrollView — навмисно поверх флекс-розкладки «на весь екран». На
    // звичайному телефоні контенту рівно на висоту екрана, і flexGrow: 1
    // розтягує його без жодного скролу — виглядає так само, як і раніше.
    // Але на короткому екрані (телефон в альбомній орієнтації, чи просто
    // малий телефон з великим шрифтом) сума мінімальних висот карток більша
    // за екран: раніше це означало, що плитки без свого minHeight (halfCard)
    // стискались Yoga до нуля і зникали. Тепер вони мають підлогу (minHeight
    // нижче), а все, що не влізло понад неї, — прокручується.
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, { maxWidth: layout.contentMaxWidth }]}
    >
      <View style={styles.greetingRow}>
        <Text style={styles.greetingSerial}>{session?.serial_number ?? '—'}</Text>
        <Text style={styles.greetingDot}> · </Text>
        <Text style={styles.greetingName}>{session?.display_name ?? '—'}</Text>
      </View>

      <View style={styles.summaryStrip}>
        <Text style={styles.summaryLabel}>За зміну перевірено</Text>
        <Text style={styles.summaryValue}>{total}</Text>
      </View>

      <Pressable
        style={[styles.inspectionCard, inspection ? styles.inspectionCardActive : null]}
        onPress={() => navigation.navigate('InspectorQr')}
      >
        <View style={styles.inspectionCopy}>
          <Text style={styles.inspectionEyebrow}>
            {inspection ? '● ПЕРЕВІРКА ТРИВАЄ' : 'ОСОБИСТИЙ QR КОНТРОЛЕРА'}
          </Text>
          <Text style={styles.inspectionTitle}>
            {inspection
              ? `Маршрут ${inspection.route_number} · ТЗ ${inspection.vehicle_number}`
              : 'Розпочати перевірку в транспорті'}
          </Text>
          <Text style={styles.inspectionMeta}>
            {inspection
              ? `${Math.max(0, Math.floor(inspection.duration_seconds / 60))} хв · перевірено ${inspection.checked_total}` +
                (autoCloseMinutes != null ? ` · автозавершення через ${autoCloseMinutes} хв` : '')
              : 'Відкрити QR і прикласти його до валідатора'}
          </Text>
        </View>
        <Text style={styles.inspectionArrow}>{isInspectionRefreshing ? '↻' : '›'}</Text>
      </Pressable>

      {/* Той самий стан, що бачить водій — щоб контролер не гадав, чи справді
          валідація для пасажирів закрита. Деталі та повтор — на екрані QR. */}
      <ReadersBlockCard
        readers={inspection?.readers ?? null}
        audience="controller"
        compact
        onPress={() => navigation.navigate('InspectorQr')}
      />

      <View style={[styles.actions, landscape && styles.actionsLandscape]}>
        <Pressable
          style={[styles.primaryCard, landscape && styles.primaryCardLandscape]}
          onPress={() => navigation.navigate('Scanner')}
        >
          <Text style={[styles.primaryCardLabel, layout.isShort && styles.primaryCardLabelShort]}>
            Сканувати QR{'\n'}квитка
          </Text>
          <Text style={styles.primaryCardHint}>Перевірка валідності у режимі реального часу</Text>
        </Pressable>

        <View style={[styles.row2, landscape && styles.row2Landscape]}>
          <Pressable style={styles.halfCard} onPress={() => navigation.navigate('ManualEntry')}>
            <Text style={[styles.halfCardLabel, layout.isShort && styles.halfCardLabelShort]}>
              Ввід{'\n'}вручну
            </Text>
            <Text style={styles.halfCardHint}>Якщо QR не сканується</Text>
          </Pressable>
          <Pressable
            style={[styles.halfCard, styles.halfCardDanger]}
            onPress={() => navigation.navigate('RecordFine')}
          >
            <Text
              style={[
                styles.halfCardLabel,
                layout.isShort && styles.halfCardLabelShort,
                { color: c.danger },
              ]}
            >
              Видати{'\n'}постанову
            </Text>
            <Text style={styles.halfCardHint}>Ст. 135 КУпАП</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.previewCard}>
        <Text style={styles.previewLabel}>Останні скани</Text>
        {recent.length === 0 ? (
          <View style={styles.previewEmpty}>
            <Text style={styles.previewEmptyText}>
              Ще немає сканів цієї зміни.{'\n'}Натисни «Сканувати QR» вище.
            </Text>
          </View>
        ) : (
          recent.map((scan) => (
            <View key={scan.id} style={styles.previewRow}>
              <Text
                style={[
                  styles.previewIcon,
                  { color: scan.result === 'valid' ? c.success : c.danger },
                ]}
              >
                {scan.result === 'valid' ? '✓' : '✕'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewTicket}>{scan.ticket_id}</Text>
                <Text style={styles.previewMeta}>
                  {scan.result === 'valid' ? 'Валідний' : `Невалідний · ${scan.reason ?? ''}`}
                </Text>
              </View>
              <Text style={styles.previewTime}>
                {formatRelative(new Date(scan.scanned_at).toISOString())}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: c.background },
    scrollContent: {
      // flexGrow: 1 — контент розтягується на весь екран, коли влазить
      // (як і раніше), і дозволяє скролитись, коли ні.
      flexGrow: 1,
      // Смуга контенту по центру: на планшеті в альбомній орієнтації картки
      // не розтягуються на весь екран.
      width: '100%',
      alignSelf: 'center',
      padding: 16,
      gap: 12,
    },

    // Блок дій: у портреті велика картка скану над двома половинками,
    // у альбомній — поруч, щоб жодна не лишилась без висоти.
    actions: { flex: 5, gap: 12 },
    actionsLandscape: { flexDirection: 'row' },

    greetingRow: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 4 },
    greetingSerial: { color: c.text, fontWeight: '800', fontSize: 16 },
    greetingDot: { color: c.textSoft, fontSize: 14 },
    greetingName: { color: c.textMuted, fontSize: 14 },

    summaryStrip: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 16,
      paddingHorizontal: 18,
    },
    summaryLabel: { color: c.textMuted, fontSize: 14, fontWeight: '600' },
    summaryValue: { color: c.text, fontSize: 36, fontWeight: '900' },

    inspectionCard: {
      minHeight: 82,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.primarySoft,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.primary,
      paddingVertical: 13,
      paddingHorizontal: 16,
    },
    inspectionCardActive: { backgroundColor: c.successSoft, borderColor: c.success },
    inspectionCopy: { flex: 1, gap: 3 },
    inspectionEyebrow: { color: c.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
    inspectionTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    inspectionMeta: { color: c.textMuted, fontSize: 12 },
    inspectionArrow: { color: c.primary, fontSize: 34, fontWeight: '300', marginLeft: 12 },

    // === Велика primary card — займає найбільше місця ===
    primaryCard: {
      flex: 3,
      minHeight: 120,
      backgroundColor: c.primary,
      borderRadius: 24,
      padding: 24,
      justifyContent: 'center',
      gap: 8,
    },
    primaryCardLandscape: { flex: 1.2 },
    primaryCardLabel: { color: '#fff', fontSize: 38, fontWeight: '900', lineHeight: 42 },
    // Низьке вікно (альбомний телефон) — герой-напис не має виштовхувати підказку.
    primaryCardLabelShort: { fontSize: 28, lineHeight: 32 },
    primaryCardHint: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },

    // === Два другорядні екшени — теж великі ===
    row2: { flex: 2, flexDirection: 'row', gap: 12 },
    // У альбомній половинки стають стовпчиком збоку від картки скану.
    row2Landscape: { flex: 1, flexDirection: 'column' },
    halfCard: {
      flex: 1,
      // Без цього Yoga стискала кнопку до 0, коли сумарна мінімальна висота
      // екрана не влазила (саме це «з'їдало» кнопки на деяких телефонах) —
      // тепер вона має підлогу і текст завжди видно.
      minHeight: 92,
      backgroundColor: c.surface,
      padding: 18,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: 'center',
      gap: 8,
    },
    halfCardDanger: { borderColor: c.danger, backgroundColor: c.dangerSoft, borderWidth: 2 },
    halfCardLabel: { color: c.text, fontSize: 22, fontWeight: '800', lineHeight: 26 },
    halfCardLabelShort: { fontSize: 17, lineHeight: 21 },
    halfCardHint: { color: c.textMuted, fontSize: 12 },

    // === Preview скан-журналу ===
    previewCard: {
      flex: 2,
      minHeight: 120,
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    previewLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 8,
    },
    previewEmpty: { flex: 1, justifyContent: 'center', paddingHorizontal: 4 },
    previewEmptyText: {
      color: c.textSoft,
      fontSize: 13,
      lineHeight: 20,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    previewIcon: { fontSize: 22, fontWeight: '900', width: 24, textAlign: 'center' },
    previewTicket: { color: c.text, fontWeight: '700', fontSize: 14, fontFamily: 'Menlo' },
    previewMeta: { color: c.textMuted, fontSize: 11, marginTop: 2 },
    previewTime: { color: c.textMuted, fontSize: 11 },
  });
}
