import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  let aiClient: any = null;
  const recipeCache = new Map<string, string>();
  const GEMINI_MODEL = "gemini-2.0-flash";
  const FALLBACK_MODEL = "gemini-1.5-flash";

  function getAI() {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.error("CRITICAL: GEMINI_API_KEY is missing from environment variables.");
        throw new Error("API Key Gemini tidak ditemukan. Harap buka menu 'Settings' -> 'Secrets' dan tambahkan 'GEMINI_API_KEY'.");
      }
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

      // Check Cache
      if (recipeCache.has(cacheKey)) {
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
            responseMimeType: "application/json"
          }
        });
      } catch (primaryError: any) {
        // Fallback if primary model hits quota
        const isQuotaError = primaryError?.status === 429 || 
                             primaryError?.message?.includes("429") || 
                             primaryError?.message?.includes("RESOURCE_EXHAUSTED");
        
        if (isQuotaError) {
          console.warn(`Primary model ${GEMINI_MODEL} hit quota limit. Trying fallback ${FALLBACK_MODEL}...`);
          try {
            response = await ai.models.generateContent({
              model: FALLBACK_MODEL,
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              config: {
                responseMimeType: "application/json"
              }
            });
          } catch (fallbackError: any) {
            console.error("Fallback model also failed:", fallbackError);
            throw fallbackError;
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
      
      if (isQuotaError || isAuthError) {
        console.warn(isAuthError ? "API Key expired/invalid. Returning mock recipe fallback." : "Quota exceeded. Returning mock recipe fallback.");
        
        const fallbackNote = isAuthError 
          ? "Ups, API Key Chef AI sepertinya sudah kadaluarsa. Tapi jangan khawatir, ini ada resep spesial buat kamu!"
          : "Chef AI lagi istirahat bentar (limit tercapai), jadi ini resep darurat yang pasti enak!";

        const mockRecipe = {
          analysis: {
            carbs: [{ name: "Nasi Putih", amount: "1 porsi" }],
            protein: [{ name: "Telur Dadar", amount: "2 butir" }],
            spices: [{ name: "Bawang Merah", amount: "2 siung" }],
            notes: fallbackNote
          },
          menuName: "Nasi Telur Spesial Chef AI (Fallback)",
          estimation: {
            time: "10 menit",
            calories: "450 kCal"
          },
          steps: [
            "Siapkan nasi putih hangat di piring.",
            "Kocok telur dengan sedikit garam dan irisan bawang.",
            "Goreng telur sampai kecokelatan di wajan panas.",
            "Sajikan telur di atas nasi. Simpel tapi juara!"
          ],
          storageTips: "Makan selagi hangat biar tetep mantap.",
          imageKeyword: "egg rice dish",
          substitutions: [
            { original: "Nasi", replacement: "Mie Instan" }
          ]
        };
        return res.json({ text: JSON.stringify(mockRecipe) });
      }

      const errorMessage = error?.message || "Gagal membuat resep. Pastikan API Key valid.";
      res.status(error?.status || 500).json({ error: errorMessage });
    }
  });


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
    console.log(`Server running on port ${PORT}`);
  });
} 

startServer();