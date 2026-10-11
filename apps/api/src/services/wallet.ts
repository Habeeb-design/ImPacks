import { AUSD_BASE_SEPOLIA, type WalletBalance } from "@impacks/contracts";
import { HttpError } from "../errors.js";
export async function readAusdBalance(address: string, request: typeof fetch = fetch): Promise<WalletBalance> {
 if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new HttpError(400,"INVALID_ADDRESS","Enter a valid Ethereum wallet address.");
 try {
  const response = await request(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org", {method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(8000),body:JSON.stringify([
    {jsonrpc:"2.0",id:1,method:"eth_chainId",params:[]},
    {jsonrpc:"2.0",id:2,method:"eth_call",params:[{to:AUSD_BASE_SEPOLIA.tokenAddress,data:"0x313ce567"},"latest"]},
    {jsonrpc:"2.0",id:3,method:"eth_call",params:[{to:AUSD_BASE_SEPOLIA.tokenAddress,data:`0x70a08231${address.slice(2).padStart(64,"0")}`},"latest"]},
  ])});
  if (!response.ok) throw new Error("RPC unavailable");
  const values = await response.json() as {id:number;result?:string;error?:unknown}[];
  if (!Array.isArray(values)) throw new Error("Invalid response");
  function hex(id:number) { const value=values.find(v=>v.id===id); if(value?.error || !value?.result || !/^0x[0-9a-fA-F]+$/.test(value.result)) throw new Error("Invalid RPC value");return BigInt(value.result); }
  if (hex(1)!==BigInt(AUSD_BASE_SEPOLIA.chainId) || hex(2)!==6n) throw new Error("Incorrect chain or token");
  const balance=hex(3);const fraction=(balance%1000000n).toString().padStart(6,"0").replace(/0+$/,"");
  return {address,chainId:84532,asset:"AUSD",tokenAddress:AUSD_BASE_SEPOLIA.tokenAddress,balanceAtomic:balance.toString(),formatted:`${balance/1000000n}${fraction ? `.${fraction}` : ""}`,network:"Base Sepolia"};
 } catch { throw new HttpError(503,"BALANCE_UNAVAILABLE","The AUSD balance is unavailable. Please try again."); }
}
