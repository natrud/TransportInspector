import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type ReadersState, formatReadersSource } from '../data/readers-api';
import type { ColorPalette } from '../theme/colors';
import { useColors } from '../theme/useColors';

/**
 * Єдина картка стану зчитувачів — навмисно спільна для обох застосунків:
 * водій і контролер мусять бачити ОДИН І ТОЙ САМИЙ факт однаково, без
 * розбіжностей у формулюваннях («у мене написано заблоковано, а в тебе ні»).
 *
 * Відрізняється лише пояснення під заголовком: водію важливо, що пасажири не
 * можуть оплатити, контролеру — що валідація для пасажирів закрита.
 */

export type ReadersAudience = 'driver' | 'controller';

interface Props {
  readers: ReadersState | null;
  audience: ReadersAudience;
  /** Показувати картку і в нормальному стані (екран керування зчитувачами). */
  showWhenNormal?: boolean;
  /** Компактний рядок без пояснень — для щільних екранів (напр. Home контролера). */
  compact?: boolean;
  /** Кнопки/дії під текстом. */
  children?: ReactNode;
  onPress?: () => void;
}

function minutes(seconds: number): number {
  return Math.max(0, Math.floor(seconds / 60));
}

export function ReadersBlockCard({
  readers,
  audience,
  showWhenNormal = false,
  compact = false,
  children,
  onPress,
}: Props): JSX.Element | null {
  const c = useColors();
  const styles = makeStyles(c);

  const hasError = !!readers?.error;
  const isBlocked = !!readers?.blocked;
  const isPartial = readers?.state === 'partial';
  // Стан ще не приїхав (нема маршруту/ТЗ) — на екрані керування картку все одно
  // показуємо, щоб резервні кнопки не зникали разом з нею.
  const isUnknown = !readers || readers.state === 'unknown';

  if (!isBlocked && !hasError && !showWhenNormal) return null;

  const tone = hasError || isPartial ? 'danger' : isBlocked ? 'warning' : 'ok';
  const toneStyle =
    tone === 'danger' ? styles.cardDanger : tone === 'warning' ? styles.cardWarning : styles.cardOk;

  const eyebrow = hasError
    ? '⚠ КОМАНДА НЕ ПРОЙШЛА'
    : isPartial
      ? `⚠ ЗАБЛОКОВАНО ЧАСТКОВО · ${readers?.blockedCount ?? 0} З ${readers?.total ?? 0}`
      : isBlocked
        ? '🔒 ЗЧИТУВАЧІ ЗАБЛОКОВАНО'
        : isUnknown
          ? 'СТАН ЗЧИТУВАЧІВ НЕВІДОМИЙ'
          : '✓ ЗЧИТУВАЧІ ПРАЦЮЮТЬ';

  const title = [
    readers?.routeNumber ? `Маршрут ${readers.routeNumber}` : null,
    readers?.vehicleNumber ? `ТЗ ${readers.vehicleNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const explain = hasError
    ? 'Валідатор не підтвердив команду. Стан зчитувачів міг не змінитися — повторіть спробу.'
    : isBlocked
      ? audience === 'driver'
        ? 'Пасажири зараз не можуть оплатити проїзд — це нормально на час перевірки.'
        : 'Валідація для пасажирів закрита. Оплатити «під контролера» вже не вийде.'
      : isUnknown
        ? 'Для цього маршруту та ТЗ у системі немає валідаторів. Перевірте, що обрано свій маршрут і транспортний засіб.'
        : 'Пасажири оплачують проїзд у звичайному режимі.';

  const metaParts: string[] = [];
  if (isBlocked && readers) {
    metaParts.push(`${minutes(readers.blockedSeconds)} хв`);
    const source = formatReadersSource(readers.source);
    if (source) metaParts.push(source);
    // Для блокування, привʼязаного до перевірки, відлік показує картка
    // перевірки («автозавершення через N хв») — двох різних таймерів на екрані
    // бути не повинно. Тут лишається відлік лише для ручного блокування.
    if (readers.source !== 'inspection' && readers.autoUnblockSeconds != null) {
      metaParts.push(`авторозблокування через ${minutes(readers.autoUnblockSeconds)} хв`);
    }
  } else if (readers && readers.total > 0) {
    metaParts.push(`${readers.total} ${readers.total === 1 ? 'зчитувач' : 'зчитувачі'} на ТЗ`);
  }

  const body = (
    <View style={[styles.card, toneStyle]}>
      <View style={styles.headerRow}>
        <Text style={[styles.eyebrow, tone === 'ok' && !isUnknown ? styles.eyebrowOk : null]}>
          {eyebrow}
        </Text>
        {onPress ? <Text style={styles.chevron}>›</Text> : null}
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {compact ? null : <Text style={styles.explain}>{explain}</Text>}
      {metaParts.length > 0 ? <Text style={styles.meta}>{metaParts.join(' · ')}</Text> : null}
      {hasError ? <Text style={styles.error} numberOfLines={3}>{readers?.error}</Text> : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );

  if (!onPress) return body;
  return <Pressable onPress={onPress}>{body}</Pressable>;
}

function makeStyles(c: ColorPalette) {
  return StyleSheet.create({
    card: {
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 12,
      gap: 4,
    },
    cardWarning: {
      backgroundColor: c.warningSoft,
      borderColor: c.warning,
    },
    cardDanger: {
      backgroundColor: c.dangerSoft,
      borderColor: c.danger,
    },
    cardOk: {
      backgroundColor: c.surface,
      borderColor: c.border,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    eyebrow: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.4,
      color: c.text,
    },
    eyebrowOk: {
      color: c.success,
    },
    chevron: {
      fontSize: 20,
      color: c.textMuted,
      lineHeight: 20,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: c.text,
    },
    explain: {
      fontSize: 13,
      lineHeight: 18,
      color: c.text,
    },
    meta: {
      fontSize: 12,
      color: c.textMuted,
    },
    error: {
      fontSize: 12,
      color: c.danger,
      marginTop: 2,
    },
    actions: {
      marginTop: 10,
      gap: 8,
    },
  });
}
