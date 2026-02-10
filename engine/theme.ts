/**
 * Omnis Theme Configuration
 * AMOLED black theme with accent colors
 */

export const Colors = {
  // Base colors
  background: "#000000",
  surface: "#121212",
  surfaceVariant: "#1E1E1E",
  transparent: "#00000000",

  // Accent colors
  accent: "#96ACB7",
  accentDark: "#303030",

  // Text colors
  textPrimary: "#FFFFFF",
  textSecondary: "#B3B3B3",
  textMuted: "#666666",

  // UI colors
  border: "#303030",
  error: "#CF6679",
  success: "#4CAF50",
  warning: "#FFB74D",

  // Message colors
  messageSent: "#181818",
  messageReceived: "#252525",
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
};

export const Theme = {
  colors: Colors,
  spacing: Spacing,
  borderRadius: BorderRadius,
  fontSize: FontSize,
};

export default Theme;
