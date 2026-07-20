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
  accent: string;
  danger: string;
  sidebarBg: string;
  surface: string;
  surfaceBorder: string;
  dialogBg: string;
  dialogOverlay: string;
};

const lightPalette: ThemeColors = {
  bg: '#F5F4EF',
  composerBg: '#FFFFFF',
  composerBorder: '#E8E6E1',
  userBubble: '#E8E6E1',
  textPrimary: '#1F1E1D',
  textMuted: '#6B6862',
  accent: '#D97757',
  danger: '#EF4444',
  sidebarBg: '#EEEDE8',
  surface: '#FFFFFF',
  surfaceBorder: '#E8E6E1',
  dialogBg: '#FFFFFF',
  dialogOverlay: 'rgba(0,0,0,0.3)',
};

const darkPalette: ThemeColors = {
  bg: '#2D2B28',
  composerBg: '#1f1e1b',
  composerBorder: '#3d3a35',
  userBubble: '#393937',
  textPrimary: '#eee',
  textMuted: '#a3a098',
  accent: '#D97757',
  danger: '#EF4444',
  sidebarBg: '#22211E',
  surface: '#1f1e1b',
  surfaceBorder: '#3d3a35',
  dialogBg: '#2D2B28',
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

export const radii = { sm: 10, md: 16, lg: 20 };

export const fontHeading = 'Inter_700Bold';
export const fontHeadingMedium = 'Inter_500Medium';
export const fontBody = 'Inter_400Regular';
export const fontBodyMedium = 'Inter_500Medium';

export function typography(colors: ThemeColors) {
  return {
    title: { fontFamily: fontHeading, fontSize: 22, color: colors.textPrimary } as TextStyle,
    heading: { fontFamily: fontHeading, fontSize: 18, color: colors.textPrimary } as TextStyle,
    body: { fontFamily: fontBody, fontSize: 16, lineHeight: 26, letterSpacing: 0.2, color: colors.textPrimary } as TextStyle,
    bodyMedium: { fontFamily: fontBodyMedium, fontSize: 16, letterSpacing: 0.2, color: colors.textPrimary } as TextStyle,
    caption: { fontFamily: fontBody, fontSize: 13, color: colors.textMuted } as TextStyle,
    captionMedium: { fontFamily: fontBodyMedium, fontSize: 13, color: colors.textMuted } as TextStyle,
  };
}

export function softShadow(): ViewStyle {
  return Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
    default: { elevation: 2 },
  }) as ViewStyle;
}

export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };
