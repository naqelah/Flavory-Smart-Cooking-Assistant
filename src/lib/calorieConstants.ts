export const COMMON_INGREDIENTS_CALORIES: Record<string, number> = {
  // Karbohidrat
  "nasi": 130, // per 100g
  "kentang": 77,
  "roti": 265,
  "mie": 138,
  "pasta": 131,
  "ubi": 86,
  "jagung": 86,
  "singkong": 160,

  // Protein Hewani
  "telur": 155,
  "ayam": 239,
  "daging sapi": 250,
  "ikan": 205,
  "udang": 99,
  "cumi": 92,
  "susu": 42,
  "keju": 402,

  // Protein Nabati
  "tempe": 193,
  "tahu": 76,
  "kacang tanah": 567,
  "kacang hijau": 347,

  // Sayuran
  "bayam": 23,
  "sawi": 13,
  "kangkung": 19,
  "wortel": 41,
  "brokoli": 34,
  "tomat": 18,
  "timun": 15,
  "kol": 25,
  "buncis": 31,
  "terong": 25,

  // Buah
  "pisang": 89,
  "apel": 52,
  "jeruk": 47,
  "mangga": 60,
  "alpukat": 160,

  // Bumbu
  "bawang merah": 40,
  "bawang putih": 149,
  "cabai": 40,
  "jahe": 80,
  "kunyit": 354,
  "kecap": 53,
  "saus sambal": 95,
  "minyak": 884,
  "mentega": 717,
  "gula": 387,
  "garam": 0
};

export function estimateCalories(name: string): number | null {
  const normalized = name.toLowerCase().trim();
  
  // Direct match
  if (COMMON_INGREDIENTS_CALORIES[normalized] !== undefined) {
    return COMMON_INGREDIENTS_CALORIES[normalized];
  }

  // Partial match
  for (const [key, value] of Object.entries(COMMON_INGREDIENTS_CALORIES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  // Default if not found (minimal)
  return 0; // Or return null to hide it
}
