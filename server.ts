import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  let aiClient: any = null;
  let currentApiKey: string | undefined = undefined;
  const recipeCache = new Map<string, string>();
  const GEMINI_MODEL = "gemini-3-flash-preview";
  const FALLBACK_MODEL = "gemini-1.5-flash"; // Keep a stable fallback

  function getAI() {
    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
    if (!apiKey) {
      console.error("CRITICAL: GEMINI_API_KEY is missing from environment variables.");
      throw new Error("API Key Gemini tidak ditemukan. Harap buka menu 'Settings' -> 'Secrets' dan tambahkan 'GEMINI_API_KEY'.");
    }

    if (!aiClient || apiKey !== currentApiKey) {
      currentApiKey = apiKey;
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return aiClient;
  }

  // API Route for Recipe Generation
  app.post("/api/recipe", async (req, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) return res.status(400).json({ error: "Prompt is required" });

      const cacheKey = prompt.trim().toLowerCase();

      // Check Cache - Only if not a variation request
      const { isVariation } = req.body;
      if (!isVariation && recipeCache.has(cacheKey)) {
        console.log("Serving recipe from cache");
        return res.json({ text: recipeCache.get(cacheKey) });
      }

      const ai = getAI();
      let response;

      try {
        console.log(`Generating recipe using primary model: ${GEMINI_MODEL}`);
        response = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            responseMimeType: "application/json",
            temperature: 0.8
          }
        });
      } catch (primaryError: any) {
        // Fallback if primary model hits quota
        const isQuotaError = primaryError?.status === 429 || 
                             primaryError?.message?.includes("429") || 
                             primaryError?.message?.includes("RESOURCE_EXHAUSTED");
        
        if (isQuotaError) {
          console.warn(`Primary model ${GEMINI_MODEL} hit quota limit. Trying fallback...`);
          try {
            response = await ai.models.generateContent({
              model: FALLBACK_MODEL,
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              config: {
                responseMimeType: "application/json",
                temperature: 0.9 // Higher temperature for fallback variety
              }
            });
          } catch (fallbackError: any) {
            console.error("Fallback model also failed:", fallbackError);
            throw fallbackError; // Re-throw to be handled by outer catch
          }
        } else {
          throw primaryError;
        }
      }

      const recipeText = response.text || "{}";
      recipeCache.set(cacheKey, recipeText);
      res.json({ text: recipeText });
    } catch (error: any) {
      console.error("Recipe API Error:", error);
      
      const errorMsg = error?.message || String(error);
      const isQuotaError = error?.status === 429 || 
                           errorMsg.includes("429") || 
                           errorMsg.includes("QUOTA_EXCEEDED") ||
                           errorMsg.includes("RESOURCE_EXHAUSTED");
                           
      const isAuthError = (error?.status === 400 || error?.status === 401) || 
                          errorMsg.includes("API_KEY_INVALID") || 
                          errorMsg.includes("expired") || 
                          errorMsg.includes("INVALID_ARGUMENT") ||
                          errorMsg.includes("API key");

      if (isAuthError) {
        console.error("Critical Auth Error: API Key is invalid or expired.");
        return res.status(401).json({ 
          error: "API_KEY_EXPIRED",
          message: "API Key Gemini Anda sepertinya sudah kadaluarsa atau tidak valid. Silakan buat API Key baru di Google AI Studio dan perbarui di bagian 'Secrets' (ikon gerigi)."
        });
      }
      
      // If quota exceeded, return a simple mock recipe to keep the app working
      if (isQuotaError) {
        console.warn("Quota exceeded. Returning mock recipe fallback.");
        
        const fallbackNote = "Chef AI lagi istirahat bentar (limit tercapai), jadi ini resep darurat yang pasti enak!";

        // Try to extract some ingredients from the prompt for a slightly more dynamic fallback
        const promptText = String(prompt);
        const availableMatch = promptText.match(/Bahan Tersedia: (.*)/);
        const availableIngredients = availableMatch ? availableMatch[1].split(',').slice(0, 3).map(i => i.trim().split(' (')[0]) : ["Bahan Seadanya"];
        
        const mainIngredient = availableIngredients[0] || "Bahan Spesial";

        const mockRecipe = {
          analysis: {
            carbs: [{ name: "Nasi/Basi", amount: "Secukupnya" }],
            protein: [{ name: mainIngredient, amount: "Sesuai stok" }],
            spices: [{ name: "Bumbu Dapur", amount: "Secukupnya" }],
            notes: fallbackNote
          },
          menuName: `Menu Kreasi ${mainIngredient} ala Chef AI (Fallback)`,
          estimation: {
            time: "15 menit",
            calories: "420 kCal"
          },
          steps: [
            `Siapkan bahan-bahan dan bersihkan ${mainIngredient}.`,
            "Tumis bumbu seadanya yang kamu punya sampai harum.",
            `Masak ${mainIngredient} dengan bumbu tersebut sampai matang.`,
            "Sajikan hasil kreasimu selagi hangat!"
          ],
          storageTips: "Makan selagi hangat biar tetep mantap.",
          imageKeyword: "home cooked meal",
          substitutions: [
            { original: "Bahan utama", replacement: "Bahan apa aja yang ada di kulkas" }
          ]
        };
        return res.json({ text: JSON.stringify(mockRecipe) });
      }

      const errorMessage = error?.message || "Gagal membuat resep. Pastikan API Key valid.";
      res.status(error?.status || 500).json({ error: errorMessage });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
