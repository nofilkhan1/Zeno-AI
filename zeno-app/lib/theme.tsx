import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { TextStyle, ViewStyle, Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'zeno-theme-preference';

export type ThemeMode = 'system' | 'light' | 'dark';

export type ThemeColors = {
  bg: string;
  composerBg: string;
  composerBorder: string;
  userBubble: string;
  textPrimary: string;
  textMuted: string;
  textDisabled: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  error: string;
  info: string;
  border: string;
  borderStrong: string;
  disabledBg: string;
  disabledText: string;
  sidebarBg: string;
  surface: string;
  surfaceBorder: string;
  dialogBg: string;
  overlay: string;
  overlaySubtle: string;
  dialogOverlay: string;
};

const lightPalette: ThemeColors = {
  bg: '#F5F4EF',
  composerBg: '#FFFFFF',
  composerBorder: '#E8E6E1',
  userBubble: '#E8E6E1',
  textPrimary: '#1F1E1D',
  textMuted: '#6B6862',
  textDisabled: '#A6A39D',
  accent: '#D97757',
  success: '#16A34A',
  warning: '#CA8A04',
  danger: '#EF4444',
  error: '#EF4444',
  info: '#3B82F6',
  border: '#E8E6E1',
  borderStrong: '#D7D3CC',
  disabledBg: '#E8E6E1',
  disabledText: '#A6A39D',
  sidebarBg: '#EEEDE8',
  surface: '#FFFFFF',
  surfaceBorder: '#E8E6E1',
  dialogBg: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.4)',
  overlaySubtle: 'rgba(0,0,0,0.04)',
  dialogOverlay: 'rgba(0,0,0,0.3)',
};

const darkPalette: ThemeColors = {
  bg: '#2D2B28',
  composerBg: '#1f1e1b',
  composerBorder: '#3d3a35',
  userBubble: '#393937',
  textPrimary: '#eee',
  textMuted: '#a3a098',
  textDisabled: '#66625C',
  accent: '#D97757',
  success: '#4ADE80',
  warning: '#FACC15',
  danger: '#EF4444',
  error: '#EF4444',
  info: '#60A5FA',
  border: '#3D3A35',
  borderStrong: '#514C45',
  disabledBg: '#393937',
  disabledText: '#66625C',
  sidebarBg: '#22211E',
  surface: '#1f1e1b',
  surfaceBorder: '#3d3a35',
  dialogBg: '#2D2B28',
  overlay: 'rgba(0,0,0,0.5)',
  overlaySubtle: 'rgba(255,255,255,0.06)',
  dialogOverlay: 'rgba(0,0,0,0.6)',
};

export const palettes = { light: lightPalette, dark: darkPalette };

type ThemeCtx = {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  colors: ThemeColors;
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeCtx>(null!);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setModeState(v);
    });
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m);
  }, []);

  const resolved: 'light' | 'dark' = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const colors = resolved === 'dark' ? darkPalette : lightPalette;

  return <ThemeContext.Provider value={{ mode, resolved, colors, setMode }}>{children}</ThemeContext.Provider>;
}

export function useThemeMode() {
  return useContext(ThemeContext);
}

export function useColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radii = { sm: 10, md: 16, lg: 20, pill: 999 } as const;

export const fontHeading = 'Inter_700Bold';
export const fontHeadingMedium = 'Inter_500Medium';
export const fontBody = 'Inter_400Regular';
export const fontBodyMedium = 'Inter_500Medium';

export const typographyRoles = {
  display: { fontFamily: fontHeading, fontSize: 32, lineHeight: 40 },
  title: { fontFamily: fontHeading, fontSize: 22 },
  heading: { fontFamily: fontHeading, fontSize: 18 },
  body: { fontFamily: fontBody, fontSize: 16, lineHeight: 26, letterSpacing: 0.2 },
  bodyMedium: { fontFamily: fontBodyMedium, fontSize: 16, letterSpacing: 0.2 },
  caption: { fontFamily: fontBody, fontSize: 13 },
  captionMedium: { fontFamily: fontBodyMedium, fontSize: 13 },
  label: { fontFamily: fontBodyMedium, fontSize: 14, lineHeight: 20 },
  overline: { fontFamily: fontBodyMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.8 },
} as const;

export function typography(colors: ThemeColors) {
  return {
    title: { ...typographyRoles.title, color: colors.textPrimary } as TextStyle,
    heading: { ...typographyRoles.heading, color: colors.textPrimary } as TextStyle,
    body: { ...typographyRoles.body, color: colors.textPrimary } as TextStyle,
    bodyMedium: { ...typographyRoles.bodyMedium, color: colors.textPrimary } as TextStyle,
    caption: { ...typographyRoles.caption, color: colors.textMuted } as TextStyle,
    captionMedium: { ...typographyRoles.captionMedium, color: colors.textMuted } as TextStyle,
  };
}

function createElevation(elevation: number, shadowOpacity: number, shadowRadius: number): ViewStyle {
  return Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity, shadowRadius },
    default: { elevation },
  }) as ViewStyle;
}

export const elevations = {
  none: {} as ViewStyle,
  sm: createElevation(2, 0.08, 8),
  md: createElevation(4, 0.12, 14),
  lg: createElevation(8, 0.16, 24),
} as const;

export function softShadow(): ViewStyle {
  return elevations.sm;
}

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };
