import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const nvidiaApiKey = Deno.env.get('NVIDIA_NIM_API_KEY')!;
const ummahApiKey = Deno.env.get('UMMAH_API_KEY')!;

const UMMAH_BASE = 'https://ummahapi.com';
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_TIMEOUT = 60_000;
const MAX_CONTEXT_CHARS = 6_000;
const SEMANTIC_MIN_SIMILARITY = 0.30;

// Comprehensive surah name map: all common names + alternate spellings → surah number
const SURAH_NAMES: Record<string, number> = {
  'fatiha': 1, 'fatihah': 1, 'al-fatiha': 1, 'al-fatihah': 1, 'al fatiha': 1, 'al fatihah': 1, 'fathia': 1, 'fatihat': 1,
  'baqarah': 2, 'baqara': 2, 'al-baqarah': 2, 'al-baqara': 2, 'al baqarah': 2, 'bakara': 2, 'baqarat': 2,
  'imran': 3, 'aal-e-imran': 3, 'aleimran': 3, 'al-imran': 3, 'al imran': 3, 'aale-imran': 3, 'ali-imran': 3, 'aaleimran': 3, 'aal e imran': 3,
  'nisa': 4, 'nisaa': 4, 'an-nisa': 4, 'an nisa': 4, 'al-nisa': 4, 'annisa': 4, 'nisah': 4, 'nisaa\'': 4,
  'maidah': 5, 'maida': 5, 'al-maidah': 5, 'al maidah': 5, 'almai\'dah': 5, 'mai\'dah': 5, 'almaidah': 5,
  'anam': 6, 'an\'am': 6, 'al-anam': 6, 'al an\'am': 6, 'alanam': 6, 'an\'aam': 6, 'al-an\'am': 6,
  'araf': 7, 'a\'raf': 7, 'al-a\'raf': 7, 'al a\'raf': 7, 'al-araf': 7,
  'anfal': 8, 'al-anfal': 8, 'al anfal': 8,
  'tawbah': 9, 'taubah': 9, 'at-tawbah': 9, 'at tawbah': 9, 'al-tawbah': 9, 'tawba': 9,
  'yunus': 10, 'younus': 10,
  'hud': 11,
  'yusuf': 12, 'yousef': 12, 'yousuf': 12, 'yusif': 12,
  'rad': 13, 'ra\'d': 13, 'ar-rad': 13, 'ar-ra\'d': 13, 'ar rad': 13, 'raad': 13, 'al-rad': 13,
  'ibrahim': 14, 'ibraheem': 14, 'abraheem': 14,
  'hijr': 15, 'al-hijr': 15, 'al hijr': 15,
  'nahl': 16, 'an-nahl': 16, 'an nahl': 16, 'al-nahl': 16, 'nahal': 16,
  'isra': 17, 'al-isra': 17, 'al isra': 17, 'israa': 17, 'bani israil': 17, 'bani israel': 17, 'al-israa': 17,
  'kahf': 18, 'al-kahf': 18, 'al kahf': 18, 'kahaf': 18, 'as-hab al-kahf': 18, 'cave': 18,
  'maryam': 19, 'mariam': 19, 'maryaam': 19, 'mariyam': 19,
  'taha': 20, 'ta-ha': 20, 'ta ha': 20,
  'anbiya': 21, 'al-anbiya': 21, 'al anbiya': 21, 'anbiyaa': 21,
  'hajj': 22, 'al-hajj': 22, 'al hajj': 22, 'haj': 22,
  'muminun': 23, 'al-muminun': 23, 'al muminun': 23, 'mu\'minun': 23, 'mumineen': 23, 'muminoon': 23,
  'nur': 24, 'noor': 24, 'an-nur': 24, 'an nur': 24, 'al-nur': 24,
  'furqan': 25, 'al-furqan': 25, 'al furqan': 25,
  'shuara': 26, 'ash-shu\'ara': 26, 'ash shuara': 26, 'shu\'ara': 26, 'shuaraa': 26,
  'naml': 27, 'an-naml': 27, 'an naml': 27, 'al-naml': 27,
  'qasas': 28, 'al-qasas': 28, 'al qasas': 28,
  'ankabut': 29, 'al-ankabut': 29, 'al ankabut': 29, 'ankaboot': 29,
  'rum': 30, 'ar-rum': 30, 'ar rum': 30, 'al-rum': 30,
  'luqman': 31, 'luqmaan': 31, 'lokman': 31, 'loqman': 31,
  'sajdah': 32, 'as-sajdah': 32, 'as sajdah': 32, 'al-sajdah': 32, 'sajda': 32,
  'ahzab': 33, 'al-ahzab': 33, 'al ahzab': 33,
  'saba': 34, 'sheba': 34, 'sabaa': 34,
  'fatir': 35, 'al-fatir': 35, 'al fatir': 35, 'fater': 35,
  'yasin': 36, 'yaseen': 36, 'ya-sin': 36, 'ya sin': 36, 'yaaseen': 36, 'yaseen': 36,
  'saffat': 37, 'as-saffat': 37, 'as saffat': 37, 'al-saffat': 37,
  'sad': 38, 'saad': 38, 'swad': 38,
  'zumar': 39, 'az-zumar': 39, 'az zumar': 39, 'al-zumar': 39,
  'ghafir': 40, 'al-ghafir': 40, 'al ghafir': 40, 'ghaafir': 40,
  'fussilat': 41, 'fusilat': 41, 'fussilat': 41, 'ha meem sajdah': 41,
  'shura': 42, 'ash-shura': 42, 'ash shura': 42, 'al-shura': 42,
  'zukhruf': 43, 'az-zukhruf': 43, 'az zukhruf': 43, 'al-zukhruf': 43,
  'dukhan': 44, 'ad-dukhan': 44, 'ad dukhan': 44, 'al-dukhan': 44,
  'jathiya': 45, 'al-jathiya': 45, 'al jathiya': 45, 'jathiah': 45,
  'ahqaf': 46, 'al-ahqaf': 46, 'al ahqaf': 46,
  'muhammad': 47, 'mohammad': 47, 'mohammed': 47,
  'fath': 48, 'al-fath': 48, 'al fath': 48,
  'hujurat': 49, 'al-hujurat': 49, 'al hujurat': 49, 'hujuraat': 49,
  'qaf': 50,
  'dhariyat': 51, 'adh-dhariyat': 51, 'adh dhariyat': 51, 'al-dhariyat': 51,
  'tur': 52, 'at-tur': 52, 'at tur': 52, 'al-tur': 52, 'toor': 52,
  'najm': 53, 'an-najm': 53, 'an najm': 53, 'al-najm': 53,
  'qamar': 54, 'al-qamar': 54, 'al qamar': 54,
  'rahman': 55, 'rehman': 55, 'rahmaan': 55, 'ar-rahman': 55, 'ar rahman': 55, 'al-rahman': 55, 'al rahman': 55,
  'waqiah': 56, 'waqi\'ah': 56, 'al-waqiah': 56, 'al waqiah': 56, 'waqia': 56, 'al-waqia': 56, 'waqi\'a': 56,
  'hadid': 57, 'al-hadid': 57, 'al hadid': 57, 'hadeed': 57,
  'mujadila': 58, 'al-mujadila': 58, 'al mujadila': 58, 'mujadalah': 58, 'mujadilah': 58,
  'hashr': 59, 'al-hashr': 59, 'al hashr': 59, 'hasyr': 59,
  'mumtahanah': 60, 'al-mumtahanah': 60, 'al mumtahanah': 60, 'mumtahina': 60, 'mumtahan': 60,
  'saff': 61, 'as-saff': 61, 'as saff': 61, 'al-saff': 61,
  'jumuah': 62, 'jumu\'ah': 62, 'al-jumuah': 62, 'al jumuah': 62, 'jumu\'a': 62, 'jumua': 62, 'juma': 62, 'jummah': 62,
  'munafiqun': 63, 'al-munafiqun': 63, 'al munafiqun': 63, 'munafiqoon': 63, 'munafiqin': 63,
  'taghabun': 64, 'at-taghabun': 64, 'at taghabun': 64, 'al-taghabun': 64,
  'talaq': 65, 'at-talaq': 65, 'at talaq': 65, 'al-talaq': 65, 'talaaq': 65,
  'tahrim': 66, 'at-tahrim': 66, 'at tahrim': 66, 'al-tahrim': 66, 'tahreem': 66,
  'mulk': 67, 'al-mulk': 67, 'al mulk': 67, 'tabarak': 67, 'tabarak allah': 67,
  'qalam': 68, 'al-qalam': 68, 'al qalam': 68, 'nun': 68,
  'haqqah': 69, 'al-haqqah': 69, 'al haqqah': 69, 'haqqa': 69,
  'maarij': 70, 'al-maarij': 70, 'al maarij': 70, 'ma\'arij': 70,
  'nuh': 71, 'nooh': 71, 'noah': 71,
  'jinn': 72, 'al-jinn': 72, 'al jinn': 72,
  'muzzammil': 73, 'al-muzzammil': 73, 'al muzzammil': 73,
  'muddaththir': 74, 'al-muddaththir': 74, 'al muddaththir': 74, 'mudassir': 74,
  'qiyamah': 75, 'al-qiyamah': 75, 'al qiyamah': 75, 'qiyama': 75,
  'insan': 76, 'al-insan': 76, 'al insan': 76, 'ad-dahr': 76, 'dahr': 76, 'addahr': 76,
  'mursalat': 77, 'al-mursalat': 77, 'al mursalat': 77, 'mursalaat': 77,
  'naba': 78, 'an-naba': 78, 'an naba': 78, 'al-naba': 78, 'nabah': 78, 'annaba': 78,
  'naziat': 79, 'an-naziat': 79, 'an naziat': 79, 'al-naziat': 79, 'nazi\'at': 79,
  'abasa': 80, '\'abasa': 80, 'abasa': 80,
  'takwir': 81, 'at-takwir': 81, 'at takwir': 81, 'al-takwir': 81,
  'infitar': 82, 'al-infitar': 82, 'al infitar': 82,
  'mutaffifin': 83, 'al-mutaffifin': 83, 'al mutaffifin': 83, 'mutafeefeen': 83,
  'inshiqaq': 84, 'al-inshiqaq': 84, 'al inshiqaq': 84,
  'buruj': 85, 'al-buruj': 85, 'al buruj': 85, 'burooj': 85,
  'tariq': 86, 'at-tariq': 86, 'at tariq': 86, 'al-tariq': 86, 'tareq': 86,
  'ala': 87, 'a\'la': 87, 'al-a\'la': 87, 'al a\'la': 87, 'al-ala': 87,
  'ghashiyah': 88, 'al-ghashiyah': 88, 'al ghashiyah': 88, 'ghaashiyah': 88,
  'fajr': 89, 'al-fajr': 89, 'al fajr': 89,
  'balad': 90, 'al-balad': 90, 'al balad': 90,
  'shams': 91, 'ash-shams': 91, 'ash shams': 91,
  'layl': 92, 'al-layl': 92, 'al layl': 92, 'lail': 92, 'laylah': 92,
  'duha': 93, 'ad-duha': 93, 'ad duha': 93, 'al-duha': 93, 'dhuha': 93,
  'sharh': 94, 'ash-sharh': 94, 'ash sharh': 94, 'inshirah': 94, 'alam nashrah': 94, 'inshira': 94,
  'tin': 95, 'at-tin': 95, 'at tin': 95, 'al-tin': 95,
  'alaq': 96, 'al-alaq': 96, 'al alaq': 96, 'iqra': 96, 'iqraa': 96, 'igra': 96, 'al-alaq': 96,
  'qadr': 97, 'al-qadr': 97, 'al qadr': 97,
  'bayyinah': 98, 'al-bayyinah': 98, 'al bayyinah': 98, 'bayinna': 98,
  'zalzalah': 99, 'az-zalzalah': 99, 'az zalzalah': 99, 'al-zalzalah': 99,
  'adiyat': 100, 'al-adiyat': 100, 'al adiyat': 100,
  'qariah': 101, 'al-qariah': 101, 'al qariah': 101, 'qaari\'ah': 101, 'qari\'ah': 101,
  'takathur': 102, 'at-takathur': 102, 'at takathur': 102, 'al-takathur': 102, 'takaathur': 102,
  'asr': 103, 'al-asr': 103, 'al asr': 103, 'al-\'asr': 103,
  'humazah': 104, 'al-humazah': 104, 'al humazah': 104, 'humaza': 104, 'humazah': 104,
  'fil': 105, 'al-fil': 105, 'al fil': 105, 'feel': 105,
  'quraysh': 106, 'quraish': 106, 'qurash': 106,
  'maun': 107, 'al-ma\'un': 107, 'al maun': 107, 'ma\'un': 107, 'maoon': 107, 'al-maun': 107,
  'kawthar': 108, 'al-kawthar': 108, 'al kawthar': 108, 'kauthar': 108, 'kausar': 108, 'kawsar': 108, 'kousar': 108,
  'kafirun': 109, 'al-kafirun': 109, 'al kafirun': 109, 'kafiroon': 109, 'al-kafiroon': 109,
  'nasr': 110, 'an-nasr': 110, 'an nasr': 110, 'al-nasr': 110,
  'masad': 111, 'al-masad': 111, 'al masad': 111, 'lahab': 111, 'al-lahab': 111, 'al lahab': 111, 'abu lahab': 111,
  'ikhlas': 112, 'ikhlaas': 112, 'al-ikhlas': 112, 'al ikhlas': 112, 'ikhlass': 112, 'ekhlas': 112, 'tawhid': 112, 'tawheed': 112, 'al-ikhlaas': 112,
  'falaq': 113, 'al-falaq': 113, 'al falaq': 113,
  'nas': 114, 'an-nas': 114, 'an nas': 114, 'al-nas': 114, 'annaas': 114,
};

// Suurah name detection: returns surah number if user asks about a named surah
function detectSurahQuery(question: string): number | null {
  const lower = question.toLowerCase().replace(/[^a-z0-9\s-]/g, '');
  // Pattern 1: "surah <name>" or "sura <name>"
  const surahPattern = /(?:^|\s)(surah|sura)\s+([a-z-]+)/;
  const match = lower.match(surahPattern);
  if (match) {
    const name = match[2];
    if (SURAH_NAMES[name]) return SURAH_NAMES[name];
  }
  // Pattern 2: "surah <number>" or "surah number <number>"
  const numberPattern = /(?:^|\s)(surah|sura)\s+(?:number\s+)?(\d{1,3})\b/;
  const numberMatch = lower.match(numberPattern);
  if (numberMatch) {
    const num = parseInt(numberMatch[2], 10);
    if (num >= 1 && num <= 114) return num;
  }
  // Pattern 3: standalone surah name (> 4 chars to avoid false positives with common words)
  const words = lower.split(/\s+/);
  for (const word of words) {
    if (word.length > 4 && SURAH_NAMES[word]) return SURAH_NAMES[word];
  }
  return null;
}

// === KNOWN FIGURES CURATED DATA ===
type FigureInfo = {
  name: string;
  description: string;
  knownFor: string;
  quranMention?: string;
  hadithRef?: string;
};

const KNOWN_FIGURES: Record<string, FigureInfo> = {
  'muhammad': {
    name: 'Muhammad (ﷺ)',
    description: 'The final prophet and messenger of Allah, sent to all of humanity as a mercy to the worlds.',
    knownFor: 'Final messenger of Allah, Quran revealed to him, completed the religion of Islam',
    quranMention: 'Mentioned by name 4 times in the Quran; also referred to as "the Messenger", "the Prophet", "Ahmad"',
    hadithRef: 'Sahih al-Bukhari and Sahih Muslim are the most authentic collections of his sayings and actions',
  },
  'adam': {
    name: 'Adam (عليه السلام)',
    description: 'The first human being and first prophet of Allah, created from clay and given knowledge of all things.',
    knownFor: 'First human, first prophet, father of humanity',
    quranMention: 'Surah Al-Baqarah (2:30-38), Surah Al-A\'raf (7:11-25), Surah Ta-Ha (20:115-123)',
    hadithRef: 'Sahih al-Bukhari 3409 - Prophet ﷺ said: "Allah created Adam in His image"',
  },
  'ibrahim': {
    name: 'Ibrahim (عليه السلام)',
    description: 'Prophet Ibrahim (Abraham) — the patriarch of monotheism, known as Khalilullah (Friend of Allah). He built the Kaaba with his son Ismail.',
    knownFor: 'Father of monotheism, built the Kaaba, offered his son in obedience to Allah',
    quranMention: 'Mentioned in 25+ surahs; Surah Ibrahim (14), Surah Al-Baqarah 2:124-141',
    hadithRef: 'Sahih al-Bukhari 3364 - Prophet ﷺ said: "Ibrahim was the most truthful person"',
  },
  'musa': {
    name: 'Musa (عليه السلام)',
    description: 'Prophet Musa (Moses) — the most mentioned prophet in the Quran, given the Torah and sent to Pharaoh and Bani Israel.',
    knownFor: 'Received the Torah, split the sea, spoke directly to Allah',
    quranMention: 'Mentioned in 30+ surahs; Surah Al-Qasas (28), Surah Ta-Ha (20), Surah Al-A\'raf (7:103-162)',
  },
  'isa': {
    name: 'Isa (عليه السلام)',
    description: 'Prophet Isa (Jesus) — a mighty messenger of Allah, born miraculously to Maryam (Mary), given the Injeel (Gospel), and will return before the Day of Judgment.',
    knownFor: 'Born without a father, spoke in the cradle, raised the dead by Allah\'s permission, will return as a just ruler',
    quranMention: 'Mentioned in 10+ surahs; Surah Maryam (19:16-36), Surah Aal-e-Imran (3:45-59), Surah An-Nisa (4:157-159)',
    hadithRef: 'Sahih al-Bukhari 3448 - Prophet ﷺ said: "Isa will descend among you as a just ruler"',
  },
  'yusuf': {
    name: 'Yusuf (عليه السلام)',
    description: 'Prophet Yusuf (Joseph) — known for his beauty, patience, and forgiveness. A full surah (Surah Yusuf, 12) is named after his story.',
    knownFor: 'Interpretation of dreams, resisted temptation, forgave his brothers',
    quranMention: 'Surah Yusuf (12) — the longest continuous story in the Quran',
  },
  'nuh': {
    name: 'Nuh (عليه السلام)',
    description: 'Prophet Nuh (Noah) — called his people for 950 years, built the ark by Allah\'s command, and was saved with the believers from the great flood.',
    knownFor: 'Built the ark, called his people for 950 years, survived the great flood',
    quranMention: 'Surah Nuh (71), Surah Hud (11:25-49), Surah Al-Ankabut (29:14-15)',
  },
  'yunus': {
    name: 'Yunus (عليه السلام)',
    description: 'Prophet Yunus (Jonah) — swallowed by a great fish when he left his people in anger, then glorified Allah from the darkness.',
    knownFor: 'Swallowed by a whale, his prayer from the darkness, his people accepted after he left',
    quranMention: 'Surah Yunus (10), Surah Al-Anbiya (21:87-88), Surah As-Saffat (37:139-148)',
  },
  'maryam': {
    name: 'Maryam (Mary, عليها السلام)',
    description: 'Maryam bint Imran — the mother of Prophet Isa (Jesus), the most virtuous woman in Paradise. A full surah (Surah Maryam, 19) is named after her.',
    knownFor: 'Mother of Prophet Isa, chaste and devout, received provision from Allah in the mihrab',
    quranMention: 'Surah Maryam (19), Surah Aal-e-Imran (3:35-47) — a full surah named after her',
    hadithRef: 'Sahih al-Bukhari 3432 - "The best of women among the people of Paradise are Maryam bint Imran"',
  },
  'fatima': {
    name: 'Fatimah (رضي الله عنها)',
    description: 'Fatimah bint Muhammad — the youngest daughter of the Prophet ﷺ and Khadijah (RA), wife of Ali (RA), mother of Hasan and Husayn (RA). She is the leader of the women of Paradise.',
    knownFor: 'Daughter of Prophet ﷺ, wife of Ali, mother of Hasan and Husayn, leader of women of Paradise',
    quranMention: 'Interpretive reference: Quran 33:33 is understood by many scholars to include the Ahl al-Bayt (the Prophet\'s household)',
  },
  'khadijah': {
    name: 'Khadijah (رضي الله عنها)',
    description: 'Khadijah bint Khuwaylid — the first wife of Prophet ﷺ, the first person to accept Islam, and his greatest supporter. She was a wealthy businesswoman and a woman of noble character.',
    knownFor: 'First wife of Prophet ﷺ, first Muslim, mother of Fatimah (RA), supported the Prophet during the early revelation',
    quranMention: 'Interpretive reference: Quran 93 is understood by some scholars to refer to the consolation the Prophet received after her passing',
  },
  'aisha': {
    name: 'Aisha (رضي عنها)',
    description: 'Aisha bint Abu Bakr — the wife of Prophet ﷺ, known as Umm al-Mu\'mineen (Mother of the Believers). She was a scholar, narrator of thousands of hadith, and a leader in Islamic jurisprudence.',
    knownFor: 'Wife of Prophet ﷺ, narrated over 2,200 hadith, expert in fiqh and tafsir',
    quranMention: 'Interpretive reference: Quran 24:11-20 is understood by many scholars to refer to the incident of slander against her',
  },
  'abu_bakr': {
    name: 'Abu Bakr (رضي الله عنه)',
    description: 'Abu Bakr as-Siddiq — the first adult male to accept Islam, closest companion of Prophet ﷺ, first caliph of Islam. Known for his unwavering faith and generosity.',
    knownFor: 'First caliph, companion of the cave, father of Aisha (RA), freed Bilal (RA)',
    quranMention: 'Interpretive reference: Quran 9:40 is understood by scholars to refer to Abu Bakr as "the second of the two when they were in the cave"',
    hadithRef: 'Sahih al-Bukhari 3660 - "If I were to take a close friend, I would take Abu Bakr"',
  },
  'umar': {
    name: 'Umar ibn al-Khattab (رضي الله عنه)',
    description: 'Umar al-Farooq — the second caliph of Islam, known for his strength, justice, and wisdom. His acceptance of Islam strengthened the Muslim community immensely.',
    knownFor: 'Second caliph, known as al-Farooq (the distinguisher), expanded the Islamic state, established the Hijri calendar',
    quranMention: 'Interpretive reference: Quran 8:30 is understood by some scholars to reference his role',
  },
  'uthman': {
    name: 'Uthman ibn Affan (رضي الله عنه)',
    description: 'Uthman Dhun-Nurayn — the third caliph, known for his modesty, generosity, and compiling the standard Quranic text.',
    knownFor: 'Third caliph, compiled the Quran into one book, married to two daughters of Prophet ﷺ',
    quranMention: 'Interpretive reference: general verses about charity are understood by some scholars to reference his generosity',
    hadithRef: 'Sahih al-Bukhari 3695 - "Every prophet has a companion in Paradise, and my companion there will be Uthman"',
  },
  'ali': {
    name: 'Ali ibn Abi Talib (رضي الله عنه)',
    description: 'Ali — the cousin and son-in-law of Prophet ﷺ, fourth caliph, known for his bravery, knowledge, and eloquence. He grew up in the Prophet\'s household and was among the first to accept Islam.',
    knownFor: 'Fourth caliph, husband of Fatimah (RA), father of Hasan and Husayn, famously brave warrior',
    quranMention: 'Interpretive reference: Quran 5:55 and 66:4 are understood by many scholars to reference events involving him',
  },
  'hasan': {
    name: 'Hasan ibn Ali (رضي الله عنه)',
    description: 'Hasan — the grandson of Prophet ﷺ, son of Ali and Fatimah (RA). He was a caliph for a short period and abdicated to preserve Muslim unity.',
    knownFor: 'Grandson of Prophet ﷺ, abdicated caliphate to preserve unity, leader of the youth of Paradise',
    quranMention: 'Interpretive reference: Quran 33:33 is understood by many scholars to include the Ahl al-Bayt',
  },
  'husayn': {
    name: 'Husayn ibn Ali (رضي الله عنه)',
    description: 'Husayn — the grandson of Prophet ﷺ, son of Ali and Fatimah (RA). He was martyred at Karbala and is deeply revered by Muslims.',
    knownFor: 'Grandson of Prophet ﷺ, martyred at Karbala, known for his stand against injustice',
    quranMention: 'Interpretive reference: Quran 33:33 is understood by many scholars to include the Ahl al-Bayt',
  },
  'bilal': {
    name: 'Bilal ibn Rabah (رضي الله عنه)',
    description: 'Bilal — an Ethiopian companion, the first muezzin (caller to prayer) in Islam. He was a slave freed by Abu Bakr (RA) and was known for his beautiful voice.',
    knownFor: 'First muezzin of Islam, freed by Abu Bakr (RA), steadfast under persecution in Mecca',
    quranMention: 'Interpretive reference: Quran 49:13 is understood by many scholars to reference the principle of righteousness over lineage',
  },
};

const FIGURE_ALIASES: Record<string, string> = {
  'mohammad': 'muhammad', 'mohammed': 'muhammad', 'ahmad': 'muhammad',
  'mustafa': 'muhammad', 'rasulullah': 'muhammad', 'rasoolallah': 'muhammad',
  'abraham': 'ibrahim',
  'moses': 'musa', 'moosa': 'musa',
  'jesus': 'isa', 'christ': 'isa',
  'joseph': 'yusuf',
  'noah': 'nuh',
  'jonah': 'yunus', 'jonas': 'yunus',
  'mary': 'maryam',
  'fatimah': 'fatima',
  'khadija': 'khadijah',
  'ayesha': 'aisha', 'aishah': 'aisha', 'aaisyah': 'aisha',
  'abubakr': 'abu_bakr', 'abu bakr': 'abu_bakr', 'abu baker': 'abu_bakr', 'siddiq': 'abu_bakr',
  'usman': 'uthman', 'uthman ibn affan': 'uthman',
  'ali ibn abi talib': 'ali',
  'hassan': 'hasan', 'hasan ibn ali': 'hasan',
  'hussain': 'husayn', 'husayn ibn ali': 'husayn',
  'bilal ibn rabah': 'bilal', 'bilal habashi': 'bilal',
};

const HONORIFICS = /^(hazrat|imam|saint|prophet|sayyidina|syedina|syed|moulana|maulana|sheikh|shaykh|hadhrat|janab|sahabi|radiAllahu)\s+/i;

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Detect if the question asks about a KNOWN_FIGURES entry
function detectFigure(question: string): FigureInfo | null {
  const lower = question.toLowerCase().trim();
  if (!lower || lower.length < 3) return null;

  // 1. Exact "who is/was X" pattern
  const whoMatch = lower.match(/^(who)\s+(is|was)\s+(.+)$/i);
  if (whoMatch) {
    const name = normalizeName(whoMatch[3]).replace(HONORIFICS, '');
    const candidates = [name, ...name.split(/\s+/)];
    for (const c of candidates) {
      if (KNOWN_FIGURES[c]) return KNOWN_FIGURES[c];
      if (FIGURE_ALIASES[c]) {
        const canon = FIGURE_ALIASES[c];
        if (KNOWN_FIGURES[canon]) return KNOWN_FIGURES[canon];
      }
    }
  }

  // 2. Broader pattern: "tell me about X", "X in islam", "X in the quran"
  const tellMatch = lower.match(/^(?:tell me about|tell about|about)\s+(.+)$/i);
  if (tellMatch) {
    const name = normalizeName(tellMatch[1]).replace(HONORIFICS, '');
    const candidates = [name, ...name.split(/\s+/)];
    for (const c of candidates) {
      if (KNOWN_FIGURES[c]) return KNOWN_FIGURES[c];
      if (FIGURE_ALIASES[c]) {
        const canon = FIGURE_ALIASES[c];
        if (KNOWN_FIGURES[canon]) return KNOWN_FIGURES[canon];
      }
    }
  }

  // 3. Check if any figure name/alias appears as a standalone content word
  // Used for queries like "fatima in islam", "who was aisha"
  const words = lower.replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 1);
  const stopwords = new Set(['the', 'is', 'was', 'a', 'an', 'in', 'of', 'to', 'and', 'or', 'for', 'on', 'at', 'by', 'with', 'from', 'as', 'are', 'do', 'does', 'did', 'has', 'have', 'had', 'can', 'could', 'will', 'would', 'should', 'may', 'might', 'it', 'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your', 'he', 'she', 'him', 'her', 'his', 'who', 'tell', 'about', 'what', 'that', 'this', 'these', 'those']);
  const contentWords = words.filter(w => !stopwords.has(w));
  if (contentWords.length === 0) return null;

  // Check multi-word keys (e.g. "abu_bakr")
  for (const [key, figure] of Object.entries(KNOWN_FIGURES)) {
    if (key.includes('_')) {
      const spacedKey = key.replace(/_/g, ' ');
      // Only match if the spaced key is a significant part of the query
      if (lower.includes(spacedKey)) return figure;
    }
  }

  // Check single-word keys and aliases
  for (let i = 0; i < contentWords.length; i++) {
    const w = contentWords[i];
    if (KNOWN_FIGURES[w]) {
      // Heuristic: figure name should be early (first 4) OR late (last 4)
      // OR the query is very short (<=4 content words)
      if (contentWords.length <= 4 || i <= 3 || i >= contentWords.length - 4) {
        return KNOWN_FIGURES[w];
      }
    }
    if (FIGURE_ALIASES[w]) {
      const canon = FIGURE_ALIASES[w];
      const figure = KNOWN_FIGURES[canon];
      if (figure) {
        if (contentWords.length <= 4 || i <= 3 || i >= contentWords.length - 4) {
          return figure;
        }
      }
    }
  }

  // Check multi-word aliases (e.g. "abu bakr")
  for (const [alias, canonKey] of Object.entries(FIGURE_ALIASES)) {
    if (alias.includes(' ') && lower.includes(alias)) {
      const figure = KNOWN_FIGURES[canonKey];
      if (figure) return figure;
    }
  }

  return null;
}

// Detect if a question is asking about a person (for confidence capping)
function isPersonQuestion(question: string): boolean {
  const lower = question.toLowerCase().trim();
  const whoMatch = lower.match(/^(who)\s+(is|was)\s+(.+)$/i);
  if (whoMatch) {
    const name = normalizeName(whoMatch[3]).replace(HONORIFICS, '');
    const nonPersonIndicators = new Set(['this', 'that', 'he', 'she', 'they', 'the best', 'your', 'the quran', 'the meaning', 'the purpose', 'the difference', 'the most', 'the greatest', 'the strongest']);
    if (name && name.length > 1 && !nonPersonIndicators.has(name)) {
      return true;
    }
  }
  return false;
}

// Build response for a matched figure (NO LLM, NO retrieval)
function buildFigureResponse(figure: FigureInfo): object {
  const parts: string[] = [];
  parts.push(figure.name);
  parts.push('');
  parts.push(figure.description);
  parts.push('');
  parts.push(`Known for: ${figure.knownFor}`);

  if (figure.quranMention) {
    parts.push('');
    parts.push(`Quran mention: ${figure.quranMention}`);
  }

  if (figure.hadithRef) {
    parts.push('');
    parts.push(`Hadith reference: ${figure.hadithRef}`);
  }

  const confidence = figure.hadithRef ? 'green' : 'yellow';

  return {
    answer: parts.join('\n'),
    error: null,
    noResults: false,
    isFigureResponse: true,
    figure: {
      name: figure.name,
      description: figure.description,
      knownFor: figure.knownFor,
      quranMention: figure.quranMention || null,
      hadithRef: figure.hadithRef || null,
    },
    quranVerses: [],
    hadiths: [],
    tafsir: null,
    confidence,
  };
}
// === END KNOWN FIGURES ===

// Fetch a complete surah from UmmahAPI
async function fetchSurahDirect(
  surahNumber: number,
  translation: string,
  headers: Record<string, string>,
): Promise<{ verseKey: string; surahNumber: number; surahName: string; ayah: number; arabic: string; translation: string; translationSource: string }[]> {
  try {
    const res = await fetch(`${UMMAH_BASE}/api/quran/surah/${surahNumber}?translation=${translation}`, { headers });
    const data = await res.json();
    if (!data.success) return [];
    const surahMeta = data.data?.surah;
    const surahName = surahMeta?.name_english || `Surah ${surahNumber}`;
    const verses = data.data?.verses || [];
    return verses.map((v: Record<string, unknown>) => ({
      verseKey: v.verse_key as string,
      surahNumber: surahNumber,
      surahName,
      ayah: v.ayah as number,
      arabic: v.arabic as string,
      translation: v.translation as string,
      translationSource: translation,
    }));
  } catch (err) {
    console.log(`[Quran-Answer] fetchSurahDirect error for surah ${surahNumber}:`, String(err));
    return [];
  }
}

// Map common English Islamic terms to Arabic/transliterated variants
// UmmahAPI indexes Arabic text + English translation — some topics
// are better found via their Arabic term.
const ARABIC_FALLBACKS: Record<string, string[]> = {
  fasting: ['sawm', 'siyam'],
  prayer: ['salat', 'salah'],
  charity: ['zakat', 'sadaqah'],
  pilgrimage: ['hajj', 'umrah'],
  god: ['allah'],
  lord: ['rabb'],
  mercy: ['rahmah'],
  prophet: ['nabi', 'rasul'],
  angels: ['malaikah'],
  heaven: ['jannah', 'paradise'],
  hell: ['jahannam', 'hellfire'],
  repentance: ['tawbah'],
  patience: ['sabr'],
  gratitude: ['shukr'],
  knowledge: ['ilm'],
  justice: ['adl'],
  truth: ['haqq'],
  faith: ['iman'],
  worship: ['ibadah'],
  marriage: ['nikah'],
  divorce: ['talaq'],
  oath: ['yamin'],
  witnesses: ['shahada'],
  inheritance: ['mirath'],
  usury: ['riba'],
  gambling: ['maysir'],
  intoxicants: ['khamr'],
  pork: ['khinzir'],
  fasting: ['sawm', 'siyam'],
  friday: ['jumuah'],
  mosque: ['masjid'],
  hypocrite: ['munafiq'],
  disbeliever: ['kafir'],
  believer: ['mumin', 'muminun'],
  Satan: ['shaytan', 'iblis'],
};

async function callNvidia(messages: unknown[]): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), NVIDIA_TIMEOUT);
  try {
    const res = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${nvidiaApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'meta/llama-3.1-8b-instruct', messages, stream: false }),
      signal: abort.signal,
    });
    if (!res.ok) {
      const errText = await res.text();
      console.log(`[NVIDIA] error: status=${res.status}, body=${errText.slice(0, 500)}`);
      return { ok: false, error: `NVIDIA returned ${res.status}: ${errText.slice(0, 200)}` };
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.log(`[NVIDIA] empty response:`, JSON.stringify(data).slice(0, 300));
      return { ok: false, error: 'NVIDIA returned empty response' };
    }
    return { ok: true, content };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      console.log(`[NVIDIA] timeout after ${NVIDIA_TIMEOUT}ms`);
      return { ok: false, error: `NVIDIA model timed out after ${NVIDIA_TIMEOUT / 1000}s` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[NVIDIA] fetch error: ${msg}`);
    return { ok: false, error: `Failed to call NVIDIA: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

function extractKeywords(question: string): string[] {
  const stopwords = new Set([
    'what', 'is', 'the', 'does', 'say', 'about', 'in', 'and', 'of', 'to',
    'a', 'an', 'are', 'how', 'why', 'when', 'where', 'who', 'which', 'do',
    'does', 'did', 'has', 'have', 'had', 'can', 'could', 'will', 'would',
    'should', 'may', 'might', 'shall', 'that', 'this', 'these', 'those',
    'it', 'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your',
    'he', 'she', 'him', 'her', 'his', 'me', 'my', 'i', 'not', 'no',
    'or', 'but', 'if', 'then', 'than', 'so', 'as', 'with', 'without',
    'all', 'any', 'some', 'each', 'every', 'both', 'neither', 'either',
    'by', 'for', 'on', 'at', 'from', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under',
    'again', 'further', 'once', 'here', 'there', 'tell', 'me', 'explain',
    'ruling', 'rulings', 'concept', 'meaning', 'definition',
    'quran', 'koran', 'islam', 'muslim',
  ]);
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));
}

type DuaResult = {
  id: number;
  category: string;
  title: string;
  arabic: string;
  transliteration: string;
  translation: string;
  source: string;
  repeat: number | null;
};

// A dua request must never fall through to the general LLM pipeline. The
// wording users may recite is returned only from UmmahAPI's verified records.
function isDuaQuestion(question: string): boolean {
  return /\bdu[’']?a(?:s)?\b|\bsupplication(?:s)?\b/i.test(question);
}

function extractDuaSearchTerms(question: string): string[] {
  const lower = question.toLowerCase();
  const terms = new Set<string>();

  // UmmahAPI's literal "sad" search is empty, so route common user language to
  // its real distress/grief records rather than asking an LLM to fill the gap.
  if (/\bsad(?:ness)?\b|\bgrie[fv]\b|\bloss\b/.test(lower)) {
    terms.add('grief');
    terms.add('anxiety');
  }
  if (/\banxious|\banxiety|\bworried|\bworry|\bdistress\b/.test(lower)) {
    terms.add('grief');
    terms.add('anxiety');
    terms.add('distress');
  }
  if (/\beat(?:ing)?\b|\bfood\b|\bdrink(?:ing)?\b/.test(lower)) {
    terms.add('eating');
  }
  if (/\bforgiv(?:e|eness)|\bistighfar|\brepent(?:ance)?\b/.test(lower)) {
    terms.add('forgiveness');
  }

  for (const keyword of extractKeywords(question)) {
    if (!['dua', 'duas', 'supplication', 'supplications'].includes(keyword)) {
      terms.add(keyword);
    }
  }
  return [...terms].slice(0, 5);
}

async function searchDuas(
  question: string,
  headers: Record<string, string>,
): Promise<DuaResult[]> {
  const terms = extractDuaSearchTerms(question);
  if (terms.length === 0) return [];

  try {
    const batches = await Promise.all(terms.map(async (term) => {
      const params = new URLSearchParams({ q: term });
      const res = await fetch(`${UMMAH_BASE}/api/duas/search?${params}`, { headers });
      if (!res.ok) return [];
      const data = await res.json();
      if (!data.success || !Array.isArray(data.data?.results)) return [];
      return data.data.results as Record<string, unknown>[];
    }));

    const seen = new Set<number>();
    const duas: DuaResult[] = [];
    for (const dua of batches.flat()) {
      const id = Number(dua.id);
      if (!Number.isInteger(id) || seen.has(id)) continue;
      // Do not expose a partially populated record as a recitable dua.
      if (typeof dua.arabic !== 'string' || typeof dua.translation !== 'string' || typeof dua.source !== 'string') continue;
      seen.add(id);
      duas.push({
        id,
        category: typeof dua.category === 'string' ? dua.category : '',
        title: typeof dua.title === 'string' ? dua.title : 'Verified Dua',
        arabic: dua.arabic,
        transliteration: typeof dua.transliteration === 'string' ? dua.transliteration : '',
        translation: dua.translation,
        source: dua.source,
        repeat: typeof dua.repeat === 'number' ? dua.repeat : null,
      });
    }
    const lowerQuestion = question.toLowerCase();
    const isEatingBefore = /\bbefore\s+(?:eat|eating|food)/.test(lowerQuestion);
    const isSadness = /\bsad(?:ness)?\b|\bgrie[fv]\b/.test(lowerQuestion);
    const isAnxiety = /\banxious|\banxiety|\bworried|\bworry/.test(lowerQuestion);
    const isLossSpecific = /\bdeath|\bdeceased|\bgraveside|\bloss\b|\bcalamity\b/.test(lowerQuestion);

    // Avoid presenting a valid but contextually unsuitable recitation (such as
    // a dua for the deceased) for a broad sadness request.
    let relevant = duas;
    if (isEatingBefore) {
      relevant = relevant.filter((dua) => /before eating/i.test(dua.title));
    }
    if (isSadness && !isLossSpecific) {
      relevant = relevant.filter((dua) => !/deceased|graveside/i.test(dua.title));
    }

    const relevanceScore = (dua: DuaResult): number => {
      const title = dua.title.toLowerCase();
      let score = 0;
      if (isEatingBefore && /before eating/.test(title)) score += 100;
      if (isAnxiety && /anxious|worried/.test(title)) score += 100;
      if ((isAnxiety || isSadness) && /distress/.test(title)) score += 70;
      if (isSadness && /calamity|patience/.test(title)) score += 50;
      return score;
    };
    return relevant.sort((a, b) => relevanceScore(b) - relevanceScore(a)).slice(0, 3);
  } catch (err) {
    console.log(`[Quran-Answer] dua search error: ${String(err)}`);
    return [];
  }
}

function buildDuaResponse(question: string, duas: DuaResult[]): object {
  if (duas.length === 0) {
    return {
      answer: 'No verified dua was found in the available source for this topic. To avoid presenting unverified wording, no dua text is shown. Please consult a qualified scholar or a reliable dua collection.',
      error: null,
      noResults: false,
      isDuaResponse: true,
      duas: [],
      quranVerses: [],
      hadiths: [],
      tafsir: null,
      confidence: 'red',
    };
  }

  return {
    answer: `Verified dua${duas.length > 1 ? 's' : ''} for “${question}”. The Arabic, transliteration, translation, and source below are retrieved directly from UmmahAPI; no dua wording was generated by an LLM.`,
    error: null,
    noResults: false,
    isDuaResponse: true,
    duas,
    quranVerses: [],
    hadiths: [],
    tafsir: null,
    confidence: 'green',
  };
}

// Fetch Quran search results for a single query term, return normalized objects
async function searchQuran(
  term: string,
  translation: string,
  headers: Record<string, string>,
): Promise<{ verseKey: string; surahNumber: number; surahName: string; ayah: number; arabic: string; translation: string; translationSource: string }[]> {
  try {
    const params = new URLSearchParams({ q: term, translation, limit: '5' });
    const res = await fetch(`${UMMAH_BASE}/api/quran/search?${params}`, { headers });
    const data = await res.json();
    if (!data.success) return [];
    return (data.data?.results || []).map((r: Record<string, unknown>) => ({
      verseKey: r.verse_key as string,
      surahNumber: r.surah_number as number,
      surahName: r.surah_name as string,
      ayah: r.ayah as number,
      arabic: r.arabic as string,
      translation: r.translation as string,
      translationSource: r.translation_source as string,
    }));
  } catch (err) {
    console.log(`[Quran-Answer] searchQuran error for term="${term}":`, String(err));
    return [];
  }
}

// Fetch Hadith search results for a single query term
async function searchHadith(
  term: string,
  headers: Record<string, string>,
): Promise<{ id: string; collection: string; collectionName: string; hadithNumber: number; arabic?: string; english: string; grade: string }[]> {
  try {
    const params = new URLSearchParams({ q: term, limit: '3' });
    const res = await fetch(`${UMMAH_BASE}/api/hadith/search?${params}`, { headers });
    const data = await res.json();
    if (!data.success) return [];
    return (data.data?.hadiths || []).map((h: Record<string, unknown>) => ({
      id: h.id as string,
      collection: h.collection as string,
      collectionName: h.collection_name as string,
      hadithNumber: h.hadithnumber as number,
      arabic: h.arabic as string | undefined,
      english: h.english as string,
      grade: h.grade as string,
    }));
  } catch (err) {
    console.log(`[Quran-Answer] searchHadith error for term="${term}":`, String(err));
    return [];
  }
}

// Semantic search fallback — calls the quran-semantic-search edge function
async function semanticSearch(
  question: string,
  matchCount: number,
  authToken: string,
): Promise<{ surah: number; ayah: number; translation_text: string; similarity: number }[]> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/quran-semantic-search`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: question, match_count: matchCount }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.log(`[Quran-Answer] semantic search HTTP ${res.status}: ${err.slice(0, 200)}`);
      return [];
    }
    const data = await res.json();
    return data.verses || [];
  } catch (err) {
    console.log(`[Quran-Answer] semantic search error:`, String(err));
    return [];
  }
}

async function fetchTafsir(
  surah: number,
  ayah: number,
): Promise<{ key: string; name: string; author: string; text: string } | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ummahApiKey) headers['x-api-key'] = ummahApiKey;
    const res = await fetch(`${UMMAH_BASE}/api/tafsir/ibn_kathir/surah/${surah}/ayah/${ayah}`, { headers });
    const data = await res.json();
    if (!data.success || !data.data?.tafsir?.text) {
      console.log(`[Quran-Answer] tafsir not available for ${surah}:${ayah}`);
      return null;
    }
    return data.data.tafsir;
  } catch (err) {
    console.log(`[Quran-Answer] tafsir fetch error:`, String(err));
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const { question, translation } = await req.json();
    if (!question) {
      return new Response(JSON.stringify({ error: 'Missing question' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    console.log(`[Quran-Answer] question="${question}" user=${user.id}`);

    // === FIGURE DETECTION (short-circuits before any retrieval/LLM) ===
    const matchedFigure = detectFigure(question);
    if (matchedFigure) {
      console.log(`[Quran-Answer] matched known figure: ${matchedFigure.name}`);
      return new Response(JSON.stringify(buildFigureResponse(matchedFigure)), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const isUncuratedPersonQuery = isPersonQuestion(question);
    if (isUncuratedPersonQuery) {
      console.log(`[Quran-Answer] uncurated person query — confidence will be capped at yellow`);
    }

    const keywords = extractKeywords(question);
    console.log(`[Quran-Answer] extracted keywords="${keywords.join(', ')}"`);

    // Check if user is asking about a specific surah by name
    const surahNumber = detectSurahQuery(question);
    if (surahNumber) {
      console.log(`[Quran-Answer] detected named surah: ${surahNumber} — routing to direct surah lookup`);
    }

    const apiHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (ummahApiKey) apiHeaders['x-api-key'] = ummahApiKey;

    const tr = translation || 'sahih_international';

    // === DUA DETECTION (short-circuits before generic retrieval/LLM) ===
    // Recitable religious wording must only ever come from a real source.
    if (isDuaQuestion(question)) {
      const duaTerms = extractDuaSearchTerms(question);
      console.log(`[Quran-Answer] dua query detected; retrieving UmmahAPI duas for="${duaTerms.join(', ')}"`);
      const duas = await searchDuas(question, apiHeaders);
      console.log(`[Quran-Answer] verified dua results: ${duas.length}; NVIDIA not called`);
      return new Response(JSON.stringify(buildDuaResponse(question, duas)), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Start semantic search in parallel (but we'll filter by similarity threshold)
    const semanticPromise = semanticSearch(question, 8, token);

    // If we need keyword search, build search terms
    let searchTerms = new Set<string>();
    if (keywords.length > 0) {
      searchTerms = new Set([...keywords]);
      for (const kw of keywords) {
        const fallbacks = ARABIC_FALLBACKS[kw];
        if (fallbacks) {
          for (const fb of fallbacks) searchTerms.add(fb);
        }
      }
    }

    // Fire all searches in parallel
    const promises: Promise<unknown>[] = [];

    // Direct surah fetch
    const surahPromise = surahNumber ? fetchSurahDirect(surahNumber, tr, apiHeaders) : Promise.resolve([] as Awaited<ReturnType<typeof fetchSurahDirect>>);

    // Keyword searches
    const termArray = [...searchTerms];
    const quranPromises = termArray.map((t) => searchQuran(t, tr, apiHeaders));
    const hadithPromises = termArray.map((t) => searchHadith(t, apiHeaders));

    const [quranResults, hadithResults, directSurahVerses, semanticVerses] = await Promise.all([
      Promise.all(quranPromises),
      Promise.all(hadithPromises),
      surahPromise,
      semanticPromise,
    ]);

    // Process direct surah verses (highest priority)
    const directSurahSet = new Set<string>();
    const quranVerses: Array<typeof quranResults[0][0]> = [];
    for (const dv of directSurahVerses) {
      if (!directSurahSet.has(dv.verseKey)) {
        directSurahSet.add(dv.verseKey);
        quranVerses.push({ ...dv, translationSource: `${tr} (direct surah)`, _isDirectSurah: true });
      }
    }

    // Merge keyword results (skip verse keys already added by direct surah)
    const seenQuran = new Set<string>([...directSurahSet]);
    for (const batch of quranResults) {
      for (const v of batch) {
        if (!seenQuran.has(v.verseKey)) {
          seenQuran.add(v.verseKey);
          quranVerses.push(v);
        }
      }
    }

    // Merge deduped Hadith results (keep up to 5)
    const seenHadith = new Set<string>();
    const hadiths = hadithResults.flat().filter((h) => {
      const key = `${h.collection}-${h.hadithNumber}`;
      if (seenHadith.has(key)) return false;
      seenHadith.add(key);
      return true;
    }).slice(0, 5);

    console.log(`[Quran-Answer] direct surah: ${directSurahVerses.length} verses, keyword: ${quranResults.flat().length - directSurahVerses.length} verses (${directSurahVerses.length} deduped), hadiths: ${hadiths.length}`);

    // Merge semantic search results — BUT filter by minimum similarity threshold
    let semanticAdded = 0;
    if (semanticVerses.length > 0) {
      const aboveThreshold = semanticVerses.filter(sv => sv.similarity >= SEMANTIC_MIN_SIMILARITY);
      console.log(`[Quran-Answer] semantic search returned ${semanticVerses.length} verses, ${aboveThreshold.length} above similarity threshold ${SEMANTIC_MIN_SIMILARITY}`);
      if (aboveThreshold.length > 0) {
        for (const sv of aboveThreshold) {
          const key = `${sv.surah}:${sv.ayah}`;
          if (!seenQuran.has(key)) {
            seenQuran.add(key);
            quranVerses.push({
              verseKey: key,
              surahNumber: sv.surah,
              surahName: `Surah ${sv.surah}`,
              ayah: sv.ayah,
              arabic: '',
              translation: sv.translation_text,
              translationSource: `${tr} (semantic, sim=${sv.similarity.toFixed(3)})`,
              _isSemantic: true,
            });
            semanticAdded++;
          }
        }
      }
    } else {
      console.log(`[Quran-Answer] semantic search returned no results`);
    }

    // Sort: direct surah first, then semantic, then keyword matches
    quranVerses.sort((a, b) => {
      const aDirect = (a as Record<string, unknown>)._isDirectSurah ? 0 : 1;
      const bDirect = (b as Record<string, unknown>)._isDirectSurah ? 0 : 1;
      if (aDirect !== bDirect) return aDirect - bDirect;
      const aSem = (a as Record<string, unknown>)._isSemantic ? -1 : 1;
      const bSem = (b as Record<string, unknown>)._isSemantic ? -1 : 1;
      return aSem - bSem;
    });
    console.log(`[Quran-Answer] pre-sort quranVerses count: ${quranVerses.length}, semanticAdded: ${semanticAdded}, keywords total: ${quranResults.flat().length}`);

    const quranVersesFinal = quranVerses.slice(0, 8);

    // Log retrieved context for audit
    console.log(`[Quran-Answer] === RETRIEVED CONTEXT (${quranVersesFinal.length} verses, ${hadiths.length} hadiths) ===`);
    for (const v of quranVersesFinal) {
      console.log(`[Quran-Answer] [VERSE] ${v.verseKey} ${v.surahName} [${v.translationSource}]: ${v.translation.slice(0, 120)}`);
    }

    // Debug: log full quranVerses order for diagnosis
    for (let i = 0; i < quranVerses.length; i++) {
      console.log(`[Quran-Answer] [SORTED ${i}] ${quranVerses[i].verseKey} [${quranVerses[i].translationSource}]`);
    }
    for (const h of hadiths) {
      console.log(`[Quran-Answer] [HADITH] ${h.collectionName} #${h.hadithNumber} (${h.grade}): ${h.english.slice(0, 120)}`);
    }

    // Fetch tafsir for the most relevant verse (first in sorted list)
    let tafsir: { key: string; name: string; author: string; text: string } | null = null;
    if (quranVersesFinal.length > 0) {
      const [surahNum, ayahNum] = quranVersesFinal[0].verseKey.split(':').map(Number);
      if (surahNum && ayahNum) {
        tafsir = await fetchTafsir(surahNum, ayahNum);
        console.log(`[Quran-Answer] tafsir ${tafsir ? 'found' : 'not found'} for ${quranVersesFinal[0].verseKey}`);
      }
    }

    // No-fabrication safeguard
    if (quranVersesFinal.length === 0 && hadiths.length === 0 && !surahNumber) {
      console.log(`[Quran-Answer] no results found across any search term, skipping LLM`);
      return new Response(JSON.stringify({
        answer: null,
        error: null,
        noResults: true,
        quranVerses: [],
        hadiths: [],
        tafsir: null,
        confidence: 'red',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Even if only direct surah verses exist, we still proceed to LLM
    if (quranVersesFinal.length === 0 && hadiths.length === 0 && surahNumber) {
      console.log(`[Quran-Answer] only direct surah data available, but proceeding with surah info`);
    }

    // Build context for LLM — truncate if too long to avoid context window issues
    let contextParts: string[] = [];
    let totalChars = 0;

    if (quranVersesFinal.length > 0) {
      contextParts.push('=== QURAN VERSES (RETRIEVED) ===');
      totalChars += 40;
      for (let i = 0; i < quranVersesFinal.length; i++) {
        const v = quranVersesFinal[i];
        const entry = `[Q${i + 1}] ${v.verseKey} (${v.surahName})\nTranslation: ${v.translation}`;
        if (totalChars + entry.length > MAX_CONTEXT_CHARS) break;
        contextParts.push(entry);
        totalChars += entry.length;
      }
    }

    // Add tafsir to context if available
    if (tafsir) {
      const tafsirEntry = `\n=== SCHOLARLY EXPLANATION ===\nSource: ${tafsir.name} by ${tafsir.author}\n${tafsir.text.slice(0, 1500)}`;
      if (totalChars + tafsirEntry.length <= MAX_CONTEXT_CHARS) {
        contextParts.push(tafsirEntry);
        totalChars += tafsirEntry.length;
      } else {
        contextParts.push(`\n=== SCHOLARLY EXPLANATION ===\nSource: ${tafsir.name} by ${tafsir.author}\n[tafsir excerpt too long, omitted]`);
      }
    }

    if (hadiths.length > 0) {
      contextParts.push('');
      contextParts.push('=== AUTHENTIC HADITHS (RETRIEVED) ===');
      totalChars += 45;
      for (let i = 0; i < hadiths.length; i++) {
        const h = hadiths[i];
        const entry = `[H${i + 1}] ${h.collectionName} #${h.hadithNumber} (Grade: ${h.grade})\nText: ${h.english}`;
        if (totalChars + entry.length > MAX_CONTEXT_CHARS) break;
        contextParts.push(entry);
        totalChars += entry.length;
      }
    }

    const contextStr = contextParts.join('\n');
    console.log(`[Quran-Answer] context length: ${contextStr.length} chars`);

    const systemPrompt = `You are a knowledgeable Islamic studies assistant. Your role is to answer questions about Islam using the retrieved Quran verses and authentic hadiths provided below as context.

CRITICAL RULES:
1. Answer using the retrieved verses and hadiths provided in the context. You may summarize what they say collectively. Never fabricate a verse, hadith, or citation that is not in the context.
2. Every claim about what the Quran says MUST cite the specific Surah:Ayah reference (e.g., "Quran 2:183").
3. Every claim about what a hadith says MUST cite the collection and number (e.g., "Sahih al-Bukhari #8").
4. If multiple retrieved verses address the topic, synthesize them into a coherent answer rather than fixating on a single verse.
5. If a SCHOLARLY EXPLANATION section is provided, you may reference it with attribution (e.g., "Ibn Kathir explains..."). Never present tafsir as your own explanation.
6. If the retrieved context clearly contains relevant verses and hadiths, use them to answer the question. Do NOT claim "no direct verse exists" when the context provides relevant verses.
7. For topics where scholars differ (e.g., fiqh rulings), present it as "Scholars differ" rather than a definitive ruling. Do not issue a fatwa.
8. Be honest: do not fabricate any verse, hadith, or scholarly quote.

At the end of your response, on its own line, add one of these confidence indicators:
[CONFIDENCE: green] — direct Quran verse or authentic hadith clearly addresses the question
[CONFIDENCE: yellow] — general scholarly understanding inferred from multiple sources, no single direct verse/hadith
[CONFIDENCE: orange] — weaker evidence or minority opinion only
[CONFIDENCE: red] — no clear textual evidence found`;

    const userMsg = `Question: ${question}\n\nRetrieved context:\n${contextStr}\n\nAnswer my question using the context above. Synthesize all relevant verses and hadiths into a complete answer. If the context lacks enough to answer, say so honestly.`;

    console.log(`[Quran-Answer] calling NVIDIA (messages length: ${systemPrompt.length + userMsg.length} chars)...`);
    const result = await callNvidia([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ]);

    if (!result.ok) {
      console.log(`[Quran-Answer] NVIDIA call failed: ${result.error}`);
      // Still return retrieved context even if LLM fails
      return new Response(JSON.stringify({
        answer: null,
        error: result.error,
        noResults: false,
        quranVerses: quranVersesFinal,
        hadiths,
        tafsir: tafsir ? { source: tafsir.name, author: tafsir.author, text: tafsir.text.slice(0, 2000) } : null,
        confidence: 'red',
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    console.log(`[Quran-Answer] answer length=${result.content.length}`);

    // Parse confidence from answer
    let confidence = 'green';
    const confidenceMatch = result.content.match(/\[CONFIDENCE:\s*(green|yellow|orange|red)\]/i);
    if (confidenceMatch) {
      confidence = confidenceMatch[1].toLowerCase();
    }
    // Cap confidence for uncurated person queries (never green for unverified figures)
    if (isUncuratedPersonQuery && confidence === 'green') {
      confidence = 'yellow';
    }
    const cleanAnswer = result.content.replace(/\[CONFIDENCE:\s*(green|yellow|orange|red)\]/gi, '').trim();

    const semanticForDebug = semanticVerses.map((sv: Record<string, unknown>) => ({
      key: `${sv.surah}:${sv.ayah}`,
      sim: sv.similarity,
      text: (sv.translation_text as string || '').slice(0, 60),
    }));
    return new Response(JSON.stringify({
      answer: cleanAnswer,
      error: null,
      noResults: false,
      quranVerses: quranVersesFinal,
      hadiths,
      tafsir: tafsir ? { source: tafsir.name, author: tafsir.author, text: tafsir.text.slice(0, 2000) } : null,
      confidence,
      _debug: { semanticCount: semanticVerses.length, keywordTotal: quranResults.flat().length },
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error(`[Quran-Answer] error:`, err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
