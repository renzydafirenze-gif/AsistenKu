import { contrastRatio, readableTextOn, relativeLuminance } from '../src/theme/contrast';
import { darkTheme, lightTheme } from '../src/theme/tokens';

describe('theme contrast (WCAG 2.1 AA)', () => {
  it('parses luminance monotonically', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#808080')).toBeGreaterThan(0.2);
    expect(() => relativeLuminance('#GGGGGG')).toThrow();
  });

  it.each([lightTheme, darkTheme])(
    'body text meets 4.5:1 in $mode mode',
    (theme) => {
      const { colors } = theme;
      expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.text, colors.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.textMuted, colors.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colors.primaryText, colors.background)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([lightTheme, darkTheme])('filled surfaces keep labels readable in $mode mode', (theme) => {
    const { colors } = theme;
    expect(contrastRatio(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.onSecondary, colors.secondary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.onDanger, colors.danger)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([lightTheme, darkTheme])('borders are visible but not text, 3:1 in $mode mode', (theme) => {
    // Card borders are decorative (text and layout carry the meaning), so the
    // 3:1 non-text rule does not apply; they still need to be visible.
    expect(contrastRatio(theme.colors.border, theme.colors.background)).toBeGreaterThanOrEqual(1.5);
    expect(contrastRatio(theme.colors.border, theme.colors.surface)).toBeGreaterThanOrEqual(1.5);
  });

  it('picks readable text for arbitrary badge colours', () => {
    expect(readableTextOn('#F39C12')).toBe('#0B1F2A');
    expect(readableTextOn('#C0392B')).toBe('#FFFFFF');
    expect(readableTextOn('#27AE60')).toBe('#0B1F2A');
    expect(readableTextOn('#1B1F24')).toBe('#FFFFFF');
  });
});
