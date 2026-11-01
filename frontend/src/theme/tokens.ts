/**
 * Design tokens. Every text/background pair is contrast-checked in
 * `tests/contrast.test.ts` against WCAG 2.1 AA (>= 4.5:1 body text).
 *
 * House style, kept deliberately small:
 * - one accent (blue) for actions and selection, semantic colours only for
 *   status; status is also written out in words, never colour alone;
 * - neutral surfaces carry structure, borders are hairlines, no shadows;
 * - a six-step type scale, nothing in between.
 */
export const brand = {
  primary: '#2E86C1',
  primaryStrong: '#1B5F8F',
  secondary: '#F39C12',
  accent: '#27AE60',
  danger: '#C0392B',
  neutral: '#7F8C8D',
} as const;

export interface Theme {
  mode: 'light' | 'dark';
  colors: {
    background: string;
    /** Rows, sheets, inputs — a step away from the background. */
    surface: string;
    surfaceRaised: string;
    /** Selected/soft accent fill for chips and progress tracks. */
    tint: string;
    border: string;
    /** Body text on `background`/`surface`. */
    text: string;
    textMuted: string;
    /** Icons and decorative glyphs only, never body copy. */
    textFaint: string;
    primary: string;
    onPrimary: string;
    primaryText: string;
    secondary: string;
    onSecondary: string;
    accent: string;
    onAccent: string;
    danger: string;
    onDanger: string;
    focusRing: string;
  };
  spacing: (step: number) => number;
  radius: { sm: number; md: number; lg: number; pill: number };
  /** Minimum touch target (WCAG 2.5.5 / Material 48dp). */
  touchTarget: number;
  typography: {
    display: { fontSize: number; lineHeight: number; fontWeight: '700' };
    title: { fontSize: number; lineHeight: number; fontWeight: '700' };
    heading: { fontSize: number; lineHeight: number; fontWeight: '600' };
    body: { fontSize: number; lineHeight: number; fontWeight: '400' };
    label: { fontSize: number; lineHeight: number; fontWeight: '600' };
    caption: { fontSize: number; lineHeight: number; fontWeight: '400' };
  };
}

const spacingUnit = 4;
const spacing = (step: number) => step * spacingUnit;

const shared = {
  spacing,
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  touchTarget: 48,
  typography: {
    display: { fontSize: 30, lineHeight: 36, fontWeight: '700' as const },
    title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
    heading: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
    body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
    label: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const },
    caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
  },
};

export const lightTheme: Theme = {
  mode: 'light',
  colors: {
    background: '#FFFFFF',
    surface: '#F5F7F9',
    surfaceRaised: '#FFFFFF',
    tint: 'rgba(46, 134, 193, 0.12)',
    border: '#BFCAD5',
    text: '#141A21',
    textMuted: '#5A6672',
    textFaint: '#7C8894',
    primary: brand.primaryStrong,
    onPrimary: '#FFFFFF',
    // `brand.primary` on white is 3.97:1 — icons and large headings only.
    primaryText: brand.primaryStrong,
    secondary: brand.secondary,
    onSecondary: '#1B1F24',
    accent: brand.accent,
    onAccent: '#1B1F24',
    danger: brand.danger,
    onDanger: '#FFFFFF',
    focusRing: '#1B5F8F',
  },
  ...shared,
};

export const darkTheme: Theme = {
  mode: 'dark',
  colors: {
    background: '#0F1720',
    surface: '#17212B',
    surfaceRaised: '#1E2A36',
    tint: 'rgba(140, 194, 230, 0.16)',
    border: '#3A4753',
    text: '#F1F5F9',
    textMuted: '#A9B7C3',
    textFaint: '#8A97A3',
    primary: '#8CC2E6',
    onPrimary: '#0F1720',
    primaryText: '#8CC2E6',
    secondary: '#F5B041',
    onSecondary: '#0B1F2A',
    accent: '#2ECC71',
    onAccent: '#0B1F2A',
    danger: '#EC7063',
    onDanger: '#0B1F2A',
    focusRing: '#9CC7E4',
  },
  ...shared,
};

/**
 * Status colours required by the brief: green on time, yellow upcoming, red
 * overdue. Keyed by the status values used across the app.
 */
export function statusTone(theme: Theme, status: string | undefined) {
  const palette = {
    DONE: { background: theme.colors.accent, foreground: theme.colors.onAccent },
    UPCOMING: { background: theme.colors.secondary, foreground: theme.colors.onSecondary },
    OVERDUE: { background: theme.colors.danger, foreground: theme.colors.onDanger },
    INFO: { background: theme.colors.primary, foreground: theme.colors.onPrimary },
  };
  switch (status) {
    case 'COMPLETED':
    case 'COMPLETE':
    case 'SUBMITTED':
    case 'GRADED':
    case '#27AE60':
      return palette.DONE;
    case 'TODAY':
    case 'UPCOMING':
    case 'PENDING':
    case 'PARTIAL':
    case '#F39C12':
      return palette.UPCOMING;
    case 'OVERDUE':
    case 'LATE':
    case '#C0392B':
      return palette.OVERDUE;
    default:
      return palette.INFO;
  }
}

/** Screen-reader-friendly Indonesian words for every status used in the UI. */
export const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Selesai',
  SUBMITTED: 'Selesai',
  COMPLETE: 'Lengkap',
  TODAY: 'Hari ini',
  UPCOMING: 'Terjadwal',
  PENDING: 'Belum',
  PARTIAL: 'Sebagian',
  OVERDUE: 'Terlewat',
  LATE: 'Terlambat',
  HOLIDAY: 'Libur',
};
