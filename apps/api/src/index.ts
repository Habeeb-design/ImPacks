import { buildApp } from "./app.js";
const mode = process.env.APP_MODE ?? "demo";
let providers;
if (mode === "sandbox") {
  const { geminiProviders } = await import("./providers/gemini.js");
  providers = await geminiProviders();
}
const app = buildApp({ mode, providers });
const address = await app.listen({ port: Number(process.env.PORT ?? 3001), host: process.env.HOST ?? "127.0.0.1" });
console.log(`ImPacks API: ${address} (${mode.toUpperCase()}: ${mode === "sandbox" ? "Gemini sandbox" : "simulated providers"})`);
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
