export interface RecipeResult {
  analysis: {
    carbs: { name: string; amount: string }[];
    protein: { name: string; amount: string }[];
    spices: { name: string; amount: string }[];
    notes: string;
  };
  menuName: string;
  estimation: {
    time: string;
    calories: string;
  };
  steps: string[];
  storageTips: string;
  imageKeyword?: string;
  substitutions: { original: string; replacement: string }[];
  originalIngredients?: { name: string; amount?: string; type: 'normal' | 'favorite' | 'forbidden' }[];
  aiImageUrl?: string;
}

export async function generateRecipe(
  ingredients: { name: string; amount?: string; type: 'normal' | 'favorite' | 'forbidden' }[],
  isVariation: boolean = false
): Promise<RecipeResult> {
  const normal = ingredients.filter(i => i.type === 'normal').map(i => `${i.name} (${i.amount || 'secukupnya'})`).join(', ');
  const favorites = ingredients.filter(i => i.type === 'favorite').map(i => `${i.name} (${i.amount || 'secukupnya'})`).join(', ');
  const forbidden = ingredients.filter(i => i.type === 'forbidden').map(i => i.name).join(', ');

  const prompt = `
    Anda adalah "Chef AI". 
    Tugas kamu adalah ngeracik resep yang lezat berdasarkan bahan yang ada. Gunakan gaya bahasa yang santai, modern, dan nggak kaku (ala startup kuliner modern).

    ${isVariation ? "PENTING: User sudah melihat resep sebelumnya. Berikan ide menu yang BARU dan SERU, tetap pake bahan yang ada ya!" : ""}

    INFO BAHAN:
    - Bahan Tersedia: ${normal}
    - Bahan Favorit (Prioritasin): ${favorites}
    - PANTANGAN/ALERGI (JANGAN DIPAKE): ${forbidden}

    Aturan Main (WAJIB format JSON):
    1. Akurasi: Semua bahan di deskripsi langkah (instructions) HARUS ada di daftar "Analisis Bahan". Jangan sampe ketinggalan bumbu dasar kayak garam/minyak di list bahan kalau dipake di langkah masak.
    2. No "Secukupnya": Berikan estimasi takaran yang jelas buat 1-2 orang. Pake gram, sdm, sdt, atau siung.
    3. Struktur JSON: Karbo (carbs), Protein (protein), Bumbu (spices).
    4. Nama Menu: Harus unik, asik, dan bikin laper!
    5. Langkah Masak (steps): Singkat, padat, dan jelas. Pake gaya bahasa kayak lagi ngobrol sama temen (pake "kamu" kalau perlu).
    6. Tips Biar Awet: Kasih 1 tips cerdas biar makanan/bahan sisa nggak mubazir dan tetep awet.
    7. Saran Pengganti: Kalau ada bahan yang kurang tapi penting, kasih tau ganti pake apa yang kira-kira ada di dapur.
    8. Image Keyword: Pilih 2-3 kata kunci bahasa Inggris yang menggambarkan visual makanan ini untuk pencarian gambar (contoh: "creamy chicken pasta").

    Format JSON:
    {
      "analysis": {
        "carbs": [{ "name": "Beras", "amount": "200 gram" }],
        "protein": [{ "name": "Ayam Fillet", "amount": "250 gram" }],
        "spices": [{ "name": "Bawang Putih", "amount": "3 siung" }],
        "notes": "Catatan santai buat user."
      },
      "menuName": "Nama Menu Seru",
      "estimation": {
        "time": "XX menit",
        "calories": "XXX kCal"
      },
      "steps": ["Langkah 1...", "Langkah 2..."],
      "storageTips": "Tips biar awet...",
      "imageKeyword": "gourmet dish name",
      "substitutions": [
        { "original": "Saus Tiram", "replacement": "Kecap Manis + Garam" }
      ]
    }
  `;

  try {
    const response = await fetch("/api/recipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      if (response.status === 429) throw new Error("QUOTA_EXCEEDED");
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || "Gagal terhubung ke Chef AI");
    }

    const data = await response.json();
    const text = data.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const result = JSON.parse(jsonStr) as RecipeResult;
    
    // Return result without generating image
    return { ...result, originalIngredients: ingredients };
  } catch (error: any) {
    console.error("Recipe Service Error:", error);
    if (error?.message === "QUOTA_EXCEEDED") throw error;
    throw new Error("Waduh, dapur AI lumayan sibuk nih. Coba bentar lagi ya!");
  }
}

