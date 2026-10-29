/**
 * Hallmark "Garden" theme, carried over from the web app (VoltLot `src/tokens.css` and `src/index.css` @ 94fda61).
 * The web defines these in oklch; React Native needs sRGB, so each value here is the converted hex. Change a colour
 * in both apps, or the two will drift.
 */

export const colors = {
  // Garden base (tokens.css)
  paper: '#F7F1DF',
  paper2: '#EEE6D1',
  paper3: '#E3DAC2',
  ink: '#072311',
  ink2: '#223C28',
  muted: '#4D5D4C',
  rule: '#C7C9B8',
  rule2: '#8C9F86',
  accent: '#1F6A19',
  accent2: '#C3DBA6',
  accentInk: '#F8F5EA',
  error: '#BE2323',
  success: '#21763C',

  // Project names (index.css), resolved onto Garden
  brand: '#1F6A19',
  brandDark: '#0E5108',
  brandTint: '#D7E6C6',
  brandWash: '#E8EDD3',
  body: '#223C28',
  line: '#C7C9B8',
  lineStrong: '#8C9F86',
  surface: '#EEE6D1',
  chip: '#E3DAC2',
  disabled: '#8D9686',
  greenInk: '#175012',
  greenDeep: '#0B3E12',
  greenBg: '#D8E8C5',
  amberInk: '#853900',
  amberDeep: '#6F2A00',
  amberBg: '#F8E2CA',
  onInk: '#F8F5EA',
  onInkMuted: '#C5C6B0',
} as const;

/** Loaded in the root layout with expo-font. Vollkorn 600 for headings, Hanken Grotesk for everything else. */
export const fonts = {
  display: 'Vollkorn_600SemiBold',
  body: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_500Medium',
  bodySemibold: 'HankenGrotesk_600SemiBold',
  bodyBold: 'HankenGrotesk_700Bold',
} as const;

/** The web's type scale (tokens.css), in points. Fluid display sizes use their phone-width value. */
export const text = {
  xs: 13,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 25,
  xxl: 31,
  display: 44,
  section: 32,
  title: 20,
  lead: 18,
} as const;

export const space = { xxxs: 2, xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 40, xxl: 64 } as const;

export const radius = { card: 4, pill: 999 } as const;

/** Headings use slightly tight tracking on the web (-0.012em). */
export const displayTracking = (size: number) => size * -0.012;
