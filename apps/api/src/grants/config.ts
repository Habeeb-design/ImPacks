import { isAddress } from "viem";

export interface GrantConfig {
  databaseUrl: string;
  appId: string;
  startsAt: Date;
  treasury: `0x${string}`;
  dailyLimit: number;
  rpcUrl: string;
}

export function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for welcome grants`);
  return value;
}

export function grantConfig(env: NodeJS.ProcessEnv = process.env): GrantConfig | null {
  if (env.WELCOME_GRANTS_ENABLED !== "1") return null;
  if (env.IMPACKS_EMBEDDED_DEMO === "1" || env.VERCEL === "1") {
    throw new Error("Welcome grants require the standalone API and worker, not the embedded Vercel demo");
  }
  const startsAt = new Date(required(env, "WELCOME_GRANTS_STARTS_AT"));
  if (!Number.isFinite(startsAt.getTime())) throw new Error("WELCOME_GRANTS_STARTS_AT must be an ISO date");
  const treasury = required(env, "WELCOME_GRANTS_TREASURY_ADDRESS");
  if (!isAddress(treasury) || /^0x0{40}$/i.test(treasury)) throw new Error("Invalid welcome-grant treasury address");
  const dailyLimit = Number(required(env, "WELCOME_GRANTS_DAILY_LIMIT"));
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 10000) throw new Error("Grant daily limit must be 1–10000 users");
  return {
    databaseUrl: required(env, "DATABASE_URL"), appId: required(env, "PRIVY_APP_ID"),
    startsAt, treasury: treasury.toLowerCase() as `0x${string}`, dailyLimit,
    rpcUrl: env.ETHEREUM_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  };
}
