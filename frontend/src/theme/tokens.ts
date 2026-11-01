/**
 * Design tokens. Brand colours are fixed by the brief; every text/background
 * pair is contrast-checked in `tests/contrast.test.ts` against WCAG 2.1 AA
 * (>= 4.5:1 for body text, >= 3:1 for large text and UI borders).
 *
 * `brand.primary` (#2E86C1) only reaches 3.97:1 on white, so it is used for
 * large headings, icons and decoration. Filled buttons with white labels use
 * `primaryStrong` (6.82:1) instead of failing AA.
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
    surface: string;
    surfaceRaised: string;
    border: string;
    /** Body text on `background`/`surface`. */
    text: string;
    textMuted: string;
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
  radius: { sm: number; md: number; lg: number };
  /** Minimum touch target (WCAG 2.5.5 / Material 48dp). */
  touchTarget: number;
  typography: {
    title: { fontSize: number; fontWeight: '700' };
    heading: { fontSize: number; fontWeight: '600' };
    body: { fontSize: number; fontWeight: '400' };
    caption: { fontSize: number; fontWeight: '400' };
  };
}

const spacingUnit = 4;
const spacing = (step: number) => step * spacingUnit;

const shared = {
  spacing,
  radius: { sm: 8, md: 12, lg: 20 },
  touchTarget: 48,
  typography: {
    title: { fontSize: 28, fontWeight: '700' as const },
    heading: { fontSize: 18, fontWeight: '600' as const },
    body: { fontSize: 16, fontWeight: '400' as const },
    caption: { fontSize: 13, fontWeight: '400' as const },
  },
};

export const lightTheme: Theme = {
  mode: 'light',
  colors: {
    background: '#FFFFFF',
    surface: '#F4F7FA',
    surfaceRaised: '#FFFFFF',
    border: '#AEC3D4',
    text: '#1B1F24',
    textMuted: '#5B6670',
    primary: brand.primaryStrong,
    onPrimary: '#FFFFFF',
    // `brand.primary` on white is 3.97:1, enough for icons and large headings
    // only; interactive text uses the darker shade.
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
    surface: '#16212B',
    surfaceRaised: '#1D2A36',
    border: '#3A4B5A',
    text: '#F1F5F9',
    textMuted: '#A8B6C2',
    primary: '#7FB8DE',
    onPrimary: '#0F1720',
    primaryText: '#7FB8DE',
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
 * Colour-coding required by the brief: green on time, yellow upcoming, red
 * overdue. Keyed by the server's `accentColor`/status values so API and UI
 * cannot drift.
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
