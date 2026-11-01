/**
 * WCAG 2.1 relative luminance / contrast ratio. Pure so the palette can be
 * verified in a unit test instead of by eyeballing screenshots.
 */
export function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`invalid hex colour: ${hex}`);
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Picks whichever candidate text colour reads better on `background`, so a
 * server-supplied badge colour can never produce unreadable labels.
 */
export function readableTextOn(background: string, light = '#FFFFFF', dark = '#0B1F2A'): string {
  return contrastRatio(background, light) >= contrastRatio(background, dark) ? light : dark;
}
