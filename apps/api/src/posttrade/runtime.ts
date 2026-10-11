import { PostTradeStore } from "./store.js";
export function createPostTradeStore(env: NodeJS.ProcessEnv = process.env) {
  if(env.POSTTRADE_DEMO_ENABLED!=="1") return undefined;
  if(env.VERCEL==="1" || env.IMPACKS_EMBEDDED_DEMO==="1") throw new Error("Post-trade needs a standalone API with persistent SQLite storage.");
  const path=env.POSTTRADE_DB_PATH?.trim();
  if(!path || path===":memory:") throw new Error("POSTTRADE_DB_PATH must identify a durable local SQLite file.");
  return new PostTradeStore(path);
}
