import { postTradeRoutes, type ListingRequest, type PostTradePortfolio, type ResaleListing, type ResaleQuote, type ResaleTrade } from "@impacks/contracts";
import { ApiError } from "./api";
async function call<T>(path:string,token:string,body?:unknown,key?:string):Promise<T> {
  const response=await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ""}${path}`,{method:body===undefined?"GET":"POST",
    headers:{Authorization:`Bearer ${token}`,...(body!==undefined?{"Content-Type":"application/json"}:{}),...(key?{"Idempotency-Key":key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok) throw new ApiError(response.status,result?.error?.code??"REQUEST_FAILED",result?.error?.message??"Marketplace request failed.");
  return result;
}
export const postTradeApi={
  portfolio:(token:string)=>call<PostTradePortfolio>(postTradeRoutes.portfolio,token),
  listings:(token:string)=>call<{listings:ResaleListing[]}>(postTradeRoutes.listings,token),
  list:(token:string,body:ListingRequest,key:string)=>call<ResaleListing>(postTradeRoutes.listings,token,body,key),
  cancel:(token:string,id:string)=>call<ResaleListing>(`${postTradeRoutes.listings}/${encodeURIComponent(id)}/cancel`,token,{confirmSimulation:true}),
  quote:(token:string,listingId:string,quantity:number)=>call<ResaleQuote>(postTradeRoutes.quotes,token,{listingId,quantity}),
  buy:(token:string,quoteId:string,key:string)=>call<ResaleTrade>(postTradeRoutes.trades,token,{quoteId,confirmSimulation:true},key),
};
export type PendingResale = {owner:string;key:string} & ({kind:"list";body:ListingRequest}|{kind:"buy";quote:ResaleQuote});
export const resaleStorageKey=(owner:string)=>`impacks.posttrade.v1:${encodeURIComponent(owner)}`;
export function readResaleAttempt(value:string|null,owner:string):PendingResale|null {
  if(!value) return null;
  try { const parsed=JSON.parse(value) as PendingResale;
    if(parsed.owner!==owner || typeof parsed.key!=="string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(parsed.key)) return null;
    if(parsed.kind==="list" && parsed.body?.positionId && Number.isInteger(parsed.body.quantity) && Number.isInteger(parsed.body.priceCents) && parsed.body.confirmSimulation===true) return parsed;
    if(parsed.kind==="buy" && typeof parsed.quote?.id==="string" && Number.isInteger(parsed.quote.quantity) && Number.isInteger(parsed.quote.totalCents)) return parsed;
  } catch {} return null;
}
