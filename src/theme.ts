/**
 * Central theme — monochrome (black & white) camera-app aesthetic.
 * No accent color; contrast comes from value only.
 */
export const theme = {
  // Surfaces
  bg: '#000000',           // root background (pure black, like camera viewfinder)
  surface: '#0f0f0f',      // cards, panels
  surfaceAlt: '#1a1a1a',   // inputs, chips (inactive)
  overlay: 'rgba(0,0,0,0.55)',

  // Lines
  border: '#242424',
  borderStrong: '#3a3a3a',

  // Text
  text: '#ffffff',
  textMuted: '#9a9a9a',
  textDim: '#5a5a5a',
  placeholder: '#555555',

  // Interactive (monochrome)
  accent: '#ffffff',       // primary button bg
  accentText: '#000000',   // primary button text
  active: '#ffffff',       // tab/chip active
  inactive: '#666666',     // tab/chip inactive

  // Semantic (muted so they don't break the B/W palette)
  danger: '#e05555',
  encrypted: '#e0b355',    // warm amber for encrypted fields (subtle)
};

export const radius = {sm: 6, md: 10, lg: 14, xl: 22};
export const space = {xs: 4, sm: 8, md: 12, lg: 16, xl: 24};
