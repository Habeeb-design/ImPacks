"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { ListingRequest, PostTradePortfolio, ResaleListing, ResaleQuote } from "@impacks/contracts";
import { usePackSession } from "../lib/session";
import { useAccountWallet } from "./WalletProvider";
import { SiteHeader } from "./SiteHeader";
import { ApiError } from "../lib/api";
import { postTradeApi, readResaleAttempt, resaleStorageKey, type PendingResale } from "../lib/posttrade-api";
import styles from "./Marketplace.module.css";
const money=(cents:number)=>`$${(cents/100).toFixed(2)}`;
type Draft={kind:"list";body:ListingRequest}|{kind:"buy";quote:ResaleQuote};

export function Marketplace(){
  const wallet=useAccountWallet();
  const {session,connecting,sessionError,retrySession,showError}=usePackSession();
  const [portfolio,setPortfolio]=useState<PostTradePortfolio|null>(null),[listings,setListings]=useState<ResaleListing[]>([]);
  const [draft,setDraft]=useState<Draft|null>(null),[pending,setPending]=useState<PendingResale|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const identity=useRef(wallet.userId),request=useRef(0),working=useRef(false);identity.current=wallet.authenticated?wallet.userId:null;
  const reload=useCallback(async()=>{
    if(!session || session.user.id!==identity.current)return;
    const owner=session.user.id,number=++request.current;
    const [next,market]=await Promise.all([postTradeApi.portfolio(session.token),postTradeApi.listings(session.token)]);
    if(identity.current===owner && request.current===number){setPortfolio(next);setListings(market.listings);}
  },[session]);
  useEffect(()=>{
    request.current++;setPortfolio(null);setListings([]);setDraft(null);setPending(null);setError("");setNotice("");
    if(wallet.userId){try{setPending(readResaleAttempt(sessionStorage.getItem(resaleStorageKey(wallet.userId)),wallet.userId));}catch{setError("Session storage is unavailable; retry protection cannot be saved.");}}
  },[wallet.userId,wallet.authenticated]);
  useEffect(()=>{
    let active=true;
    const check=()=>void reload().catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Marketplace unavailable.");});
    check();const timer=setInterval(check,10000);return()=>{active=false;request.current++;clearInterval(timer);};
  },[reload]);
  async function submit(attempt:PendingResale){
    if(!session || session.user.id!==attempt.owner || identity.current!==attempt.owner || working.current)return;
    const owner=attempt.owner;working.current=true;setBusy(true);setError("");setNotice("");
    try{
      // Persist the exact command before the server can act. Never regenerate on a network error.
      sessionStorage.setItem(resaleStorageKey(owner),JSON.stringify(attempt));setPending(attempt);setDraft(null);
      if(attempt.kind==="list")await postTradeApi.list(session.token,attempt.body,attempt.key);
      else await postTradeApi.buy(session.token,attempt.quote.id,attempt.key);
      sessionStorage.removeItem(resaleStorageKey(owner));
      if(identity.current!==owner)return;
      setPending(null);setNotice(attempt.kind==="list"?"Listing created. Quantity is reserved until purchased, cancelled or expired.":"Purchase completed. The position and its paper payout rights are now yours. No AUSD moved.");
      await reload();
    }catch(cause){
      if(identity.current!==owner)return;
      const definite=cause instanceof ApiError && [400,403,404,409].includes(cause.status);
      if(definite){sessionStorage.removeItem(resaleStorageKey(owner));setPending(null);}
      setError(cause instanceof Error?cause.message:"Result unconfirmed. Retry the saved request.");
      if(cause instanceof ApiError && cause.status===401)showError(cause);
    }finally{working.current=false;setBusy(false);}
  }
  function reviewListing(event:FormEvent<HTMLFormElement>,positionId:string){event.preventDefault();if(pending||working.current)return;
    const data=new FormData(event.currentTarget);setDraft({kind:"list",body:{positionId,quantity:Number(data.get("quantity")),priceCents:Number(data.get("price")),confirmSimulation:true}});setError("");}
  async function reviewBuy(event:FormEvent<HTMLFormElement>,id:string){event.preventDefault();if(!session||pending||working.current)return;
    const owner=session.user.id,quantity=Number(new FormData(event.currentTarget).get("quantity"));working.current=true;setBusy(true);setError("");
    try{const quote=await postTradeApi.quote(session.token,id,quantity);if(identity.current===owner)setDraft({kind:"buy",quote});}
    catch(cause){if(identity.current===owner)setError(cause instanceof Error?cause.message:"Quote unavailable.");}
    finally{working.current=false;setBusy(false);}}
  async function cancel(id:string){if(!session||working.current||pending)return;const owner=session.user.id;working.current=true;setBusy(true);
    try{await postTradeApi.cancel(session.token,id);if(identity.current===owner){setNotice("Unsold quantity released. Completed purchases remain final.");await reload();}}
    catch(cause){if(identity.current===owner)setError(cause instanceof Error?cause.message:"Cancellation unconfirmed; retry cancellation.");}
    finally{working.current=false;setBusy(false);}}
  const locked=busy||!!pending;
  return <div className={styles.shell}><SiteHeader/><main className={styles.page}>
    <header className={styles.hero}><span className={styles.badge}>PAPER MARKETPLACE</span><h1>Pass the position.</h1><p>Buy another collector’s position, or list part of yours. Ownership and future paper payout rights move together.</p><p className={styles.disclosure}>Simulated USD only. No Gemini order, AUSD transfer or cash redemption. Each account starts with $100 in paper funds. Fixture positions have a 24-hour trading window after opening.</p></header>
    {connecting?<p role="status">Connecting your account…</p>:!session?<section className={styles.panel}><h2>Sign in to trade.</h2>{sessionError&&<p role="alert">{sessionError}</p>}{wallet.authenticated?<button onClick={retrySession}>Reconnect account</button>:<Link href="/login?next=%2Fmarketplace">Sign in with email →</Link>}</section>:<>
      <div className={styles.balance}><span>Simulated USD available</span><strong>{portfolio?money(portfolio.balanceCents):"—"}</strong><button disabled={busy} onClick={()=>void reload().catch(cause=>setError(cause.message))}>Refresh</button></div>
      {error&&<p className={styles.message} role="alert">{error}</p>}{notice&&<p className={styles.message} role="status">{notice}</p>}
      {pending&&<section className={styles.panel}><h2>Saved request needs confirmation.</h2><p>The previous result may already be recorded. Retry the same request to retrieve it without buying or listing twice.</p><button disabled={busy} onClick={()=>void submit(pending)}>{busy?"Checking…":"Retry saved request"}</button></section>}
      {draft&&!pending&&<section className={styles.panel} aria-label="Review trade"><h2>{draft.kind==="list"?"Review your listing":"Review your purchase"}</h2>
        {draft.kind==="list"?<p>List {draft.body.quantity} contracts at {money(draft.body.priceCents)} each. Potential proceeds: {money(draft.body.quantity*draft.body.priceCents)} simulated USD, fees $0.00. You receive proceeds only when another user buys.</p>:<p>Buy {draft.quote.quantity} contracts at {money(draft.quote.priceCents)} each. Total {money(draft.quote.totalCents)} simulated USD, fees $0.00. Quote expires at {new Date(draft.quote.expiresAt).toLocaleTimeString()}. Availability is rechecked on confirmation.</p>}
        <p>These are seller-set listing prices, not live Gemini bids. Prices can move. Not investment advice. Buying transfers the existing position’s rights; it does not create an option contract.</p>
        <button disabled={busy} onClick={()=>void submit({...draft,owner:session.user.id,key:crypto.randomUUID()})}>Confirm paper {draft.kind==="list"?"listing":"purchase"}</button><button className={styles.secondary} disabled={busy} onClick={()=>setDraft(null)}>Back</button>
      </section>}
      <section><div className={styles.sectionHeading}><h2>Your holdings</h2><Link href="/dashboard">Pack history →</Link></div><p>Remaining quantity is current ownership. Listed quantity is locked against a second sale.</p>
        <div className={styles.grid}>{portfolio?.positions.map(position=><article className={styles.card} key={position.id}><span className={styles.side}>{position.side}</span><h3>{position.question}</h3><p>{position.remainingQuantity} owned · {position.listedQuantity} listed · {position.availableQuantity} available</p><p>Remaining cost basis: {money(position.costBasisCents)} simulated USD</p><p>Trading ends {new Date(position.marketClosesAt).toLocaleString()}</p>
          <form onSubmit={event=>reviewListing(event,position.id)}><label>Quantity<input aria-label={`Quantity to list for ${position.question}`} name="quantity" type="number" min="1" max={position.availableQuantity} step="1" defaultValue="1" required disabled={locked}/></label><label>Price per contract (¢)<input name="price" type="number" min="1" max="99" step="1" defaultValue="50" required disabled={locked}/></label><button disabled={locked||position.availableQuantity<1||Date.parse(position.marketClosesAt)<=Date.now()}>Review listing</button></form></article>)}</div>
        {portfolio&&!portfolio.positions.length&&<p className={styles.empty}>No positions yet. <Link href="/packs">Open a pack</Link> or buy a listing below.</p>}
      </section>
      <section><h2>From other collectors</h2><div className={styles.grid}>{listings.filter(listing=>!listing.mine).map(listing=><article className={styles.card} key={listing.id}><span className={styles.side}>{listing.side}</span><h3>{listing.question}</h3><strong>{money(listing.priceCents)} per contract</strong><p>{listing.remainingQuantity} available · simulated USD</p><form onSubmit={event=>void reviewBuy(event,listing.id)}><label>Quantity<input name="quantity" type="number" min="1" max={listing.remainingQuantity} step="1" defaultValue="1" required disabled={locked}/></label><button disabled={locked}>Get purchase quote</button></form></article>)}</div>{!listings.some(listing=>!listing.mine)&&<p className={styles.empty}>No listings from other collectors yet. A second signed-in account can buy yours.</p>}</section>
      <section><h2>Your listings</h2>{portfolio?.listings.map(listing=><div className={styles.row} key={listing.id}><span>{listing.side} · {listing.question}<small>{listing.remainingQuantity} remaining · {money(listing.priceCents)} each · {listing.status}</small></span>{listing.status==="open"&&<button className={styles.secondary} disabled={locked} onClick={()=>void cancel(listing.id)}>Cancel unsold quantity</button>}</div>)}</section>
      <section><h2>Trade history</h2>{portfolio?.trades.map(trade=><div className={styles.row} key={trade.id}><span>{trade.role==="buyer"?"Bought":"Sold"} {trade.quantity} contracts<small>{new Date(trade.createdAt).toLocaleString()} · completed paper transfer</small></span><strong>{money(trade.proceedsCents)} simulated USD</strong></div>)}</section>
    </>}
  </main></div>;
}
