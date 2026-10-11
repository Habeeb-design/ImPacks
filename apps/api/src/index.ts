import { buildApp } from "./app.js";
const app = buildApp({ mode: process.env.APP_MODE ?? "demo" });
const address = await app.listen({ port: Number(process.env.PORT ?? 3001), host: process.env.HOST ?? "127.0.0.1" });
console.log(`ImPacks API: ${address} (DEMO: simulated providers)`);
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => { void app.close().then(() => process.exit(0)); });
