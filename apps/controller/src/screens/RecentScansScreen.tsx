import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  type ColorPalette,
  CONTENT_MAX_WIDTH,
  type Fine,
  type ValidationLogEntry,
  FINE_REASON_LABELS,
  formatPrice,
  formatTime,
  formatRelative,
  useColors,
  useFines,
  useRecentValidations,
} from '@transport/shared';
import type { RootStackParamList } from '../app/navigation';

type StackNav = NativeStackNavigationProp<RootStackParamList>;

type Filter = 'all' | 'scans' | 'fines';

interface MergedEntry {
  id: string;
  kind: 'scan' | 'fine';
  ts: number;
  scan?: ValidationLogEntry;
  fine?: Fine;
}

export function RecentScansScreen(): JSX.Element {
  const navigation = useNavigation<StackNav>();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { entries: scans, isLoading: scansLoading, refetch: refetchScans } = useRecentValidations(100);
  const { fines, isLoading: finesLoading, refetch: refetchFines } = useFines(50);

  const [filter, setFilter] = useState<Filter>('all');

  const merged: MergedEntry[] = useMemo(() => {
    const arr: MergedEntry[] = [];
    if (filter !== 'fines') {
      for (const s of scans) arr.push({ id: `s-${s.id}`, kind: 'scan', ts: s.scanned_at, scan: s });
    }
    if (filter !== 'scans') {
      for (const f of fines) arr.push({ id: `f-${f.id}`, kind: 'fine', ts: f.created_at, fine: f });
    }
    arr.sort((a, b) => b.ts - a.ts);
    return arr;
  }, [scans, fines, filter]);

  const onRefresh = (): void => {
    void refetchScans();
    void refetchFines();
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={scansLoading || finesLoading} onRefresh={onRefresh} />}
    >
      <View style={styles.filterBar}>
        <FilterButton label="Усі" active={filter === 'all'} onPress={() => setFilter('all')} styles={styles} />
        <FilterButton label="Скани" active={filter === 'scans'} onPress={() => setFilter('scans')} styles={styles} />
        <FilterButton label="Постанови" active={filter === 'fines'} onPress={() => setFilter('fines')} styles={styles} />
      </View>

      {merged.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Журнал порожній</Text>
          <Text style={styles.emptyText}>Тут зʼявлятимуться твої скани та видані постанови.</Text>
        </View>
      ) : (
        merged.map((entry) => (
          <Pressable
            key={entry.id}
            style={styles.row}
            onPress={() => {
              if (entry.kind === 'fine' && entry.fine) {
                navigation.navigate('FineReceipt', { fineId: entry.fine.id });
              }
            }}
          >
            {entry.kind === 'scan' ? <ScanRow entry={entry.scan!} styles={styles} /> : null}
            {entry.kind === 'fine' ? <FineRow fine={entry.fine!} styles={styles} /> : null}
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function FilterButton({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  return (
    <Pressable style={[styles.filterBtn, active && styles.filterBtnActive]} onPress={onPress}>
      <Text style={[styles.filterBtnLabel, active && styles.filterBtnLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function ScanRow({
  entry,
  styles,
}: {
  entry: ValidationLogEntry;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  const isValid = entry.result === 'valid';
  return (
    <View style={styles.rowContent}>
      <View style={[styles.iconCircle, isValid ? styles.iconValid : styles.iconInvalid]}>
        <Text style={styles.iconText}>{isValid ? '✓' : '✕'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{entry.ticket_id}</Text>
        <Text style={styles.rowMeta}>
          {isValid ? 'Валідний' : `Невалідний · ${entry.reason ?? ''}`}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.rowTime}>{formatTime(new Date(entry.scanned_at).toISOString())}</Text>
        <Text style={styles.rowMeta}>{formatRelative(new Date(entry.scanned_at).toISOString())}</Text>
      </View>
    </View>
  );
}

function FineRow({
  fine,
  styles,
}: {
  fine: Fine;
  styles: ReturnType<typeof makeStyles>;
}): JSX.Element {
  return (
    <View style={styles.rowContent}>
      <View style={[styles.iconCircle, styles.iconFine]}>
        <Text style={styles.iconText}>₴</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{fine.offender_name}</Text>
        <Text style={styles.rowMeta}>
          {FINE_REASON_LABELS[fine.reason]} · {fine.id}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.rowPrice}>{formatPrice(fine.fine_amount_kopecks)}</Text>
        <Text style={styles.rowMeta}>{formatRelative(new Date(fine.created_at).toISOString())}</Text>
      </View>
    </View>
  );
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    scroll: { flex: 1, backgroundColor: c.background },
    scrollContent: { padding: 16, paddingBottom: 32, gap: 10, width: '100%', alignSelf: 'center', maxWidth: CONTENT_MAX_WIDTH },
    filterBar: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 6,
    },
    filterBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
    },
    filterBtnActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    filterBtnLabel: { color: c.text, fontWeight: '700' },
    filterBtnLabelActive: { color: '#fff' },

    row: {
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    rowContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowTitle: { color: c.text, fontWeight: '700', fontSize: 14 },
    rowMeta: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    rowTime: { color: c.text, fontWeight: '600', fontSize: 13 },
    rowPrice: { color: c.danger, fontWeight: '800', fontSize: 15 },

    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconValid: { backgroundColor: c.successSoft },
    iconInvalid: { backgroundColor: c.dangerSoft },
    iconFine: { backgroundColor: c.warningSoft },
    iconText: { fontSize: 18, fontWeight: '900', color: c.text },

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
