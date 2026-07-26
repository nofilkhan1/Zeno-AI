import { Text, type StyleProp, type TextStyle } from 'react-native';

type QuranAyahTextProps = {
  arabic: string;
  ayah?: number | null;
  style?: StyleProp<TextStyle>;
};

const AYAH_END_MARKER = '\u06DD';
const EXISTING_AYAH_END_PATTERN = /[\u06DD\uFD3E\uFD3F]/u;
const TRAILING_ARABIC_NUMBER_PATTERN = /[\u0660-\u0669\u06F0-\u06F9]+\s*$/u;
const rtlAyahText: TextStyle = { writingDirection: 'rtl', textAlign: 'right' };

export function toArabicIndicDigits(value: number): string {
  return String(value).replace(/\d/g, (digit) => String.fromCharCode(0x0660 + Number(digit)));
}

export function getAyahNumberFromVerseKey(verseKey?: string): number | null {
  const match = verseKey?.match(/^\d+:(\d+)$/);
  const ayah = match ? Number(match[1]) : NaN;
  return Number.isInteger(ayah) && ayah > 0 ? ayah : null;
}

export function getAyahEndMarker(arabic: string, ayah?: number | null): string {
  if (!Number.isInteger(ayah) || !ayah || ayah < 1) return '';
  if (EXISTING_AYAH_END_PATTERN.test(arabic) || TRAILING_ARABIC_NUMBER_PATTERN.test(arabic)) return '';
  return `\u00A0${AYAH_END_MARKER}${toArabicIndicDigits(ayah)}`;
}

export function formatQuranTranslation(translation: string): string {
  return translation.replace(/([,.;:!?])(\d+)/g, '$1 $2');
}

export default function QuranAyahText({ arabic, ayah, style }: QuranAyahTextProps) {
  return <Text style={[rtlAyahText, style]}>{arabic}{getAyahEndMarker(arabic, ayah)}</Text>;
}
