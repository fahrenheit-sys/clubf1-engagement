// Light / Apple-style design tokens. Brand accent colors (lib/constants BRAND)
// are kept for data viz and highlights; these tokens cover surfaces and text.
export const UI = {
  bg:          '#F5F5F7', // app background (Apple light gray)
  surface:     '#FFFFFF', // cards
  surfaceAlt:  '#FBFBFD', // subtle alt surface (table header, hover)
  text:        '#1D1D1F', // primary text
  textMuted:   '#6E6E73', // secondary text
  textFaint:   '#86868B', // tertiary / axis ticks
  border:      '#E8E8ED', // hairline borders
  borderStrong:'#D2D2D7',
  shadow:      '0 1px 2px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.05)',
  shadowSm:    '0 1px 2px rgba(0,0,0,0.06)',
  radius:      16,
  radiusSm:    10,
} as const
