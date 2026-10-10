// Loaded first so every other module sees .env values (Node 21.7+).
try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the real environment (e.g. on the host).
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  isProd: process.env.NODE_ENV === "production",
  databaseUrl: process.env.DATABASE_URL ?? "file:data/fridge-tab.db",
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || undefined,
  geminiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-flash-latest",
};
