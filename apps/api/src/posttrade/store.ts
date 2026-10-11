import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { listingSchema, resaleQuoteSchema, type Opening, Position, ResaleListing, ResaleQuote, ResaleTrade, ListingRequest, ResaleQuoteRequest, PostTradePortfolio } from "@impacks/contracts";
import { HttpError } from "../errors.js";

type Row = Record<string, any>;
const fail = (code: string, message: string, status = 409): never => { throw new HttpError(status, code, message); };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const iso = (ms: number) => new Date(ms).toISOString();
const validInt = (value: number, max: number) => Number.isSafeInteger(value) && value >= 0 && value <= max;

/** Paper-only ledger. No exchange orders, blockchain transfers or redeemable balances. */
export class PostTradeStore {
  readonly db: DatabaseSync;
  constructor(path: string, private clock = Date.now) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS pt_accounts (owner TEXT PRIMARY KEY, balance INTEGER NOT NULL CHECK(balance>=0));
      CREATE TABLE IF NOT EXISTS pt_sources (card_id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE, owner TEXT NOT NULL,
        opening_id TEXT NOT NULL, fingerprint TEXT NOT NULL, market_id TEXT NOT NULL, question TEXT NOT NULL, side TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity>0), closes_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS pt_positions (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES pt_accounts(owner),
        source_card_id TEXT NOT NULL REFERENCES pt_sources(card_id), quantity INTEGER NOT NULL CHECK(quantity>=0),
        reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=quantity), cost INTEGER NOT NULL CHECK(cost>=0));
      CREATE TABLE IF NOT EXISTS pt_listings (id TEXT PRIMARY KEY, seller TEXT NOT NULL, position_id TEXT NOT NULL REFERENCES pt_positions(id),
        quantity INTEGER NOT NULL CHECK(quantity>=0), price INTEGER NOT NULL CHECK(price BETWEEN 1 AND 99),
        status TEXT NOT NULL CHECK(status IN ('open','filled','cancelled','expired')), expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS pt_quotes (id TEXT PRIMARY KEY, buyer TEXT NOT NULL, listing_id TEXT NOT NULL REFERENCES pt_listings(id),
        quantity INTEGER NOT NULL, price INTEGER NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS pt_trades (id TEXT PRIMARY KEY, quote_id TEXT NOT NULL UNIQUE REFERENCES pt_quotes(id),
        listing_id TEXT NOT NULL, buyer TEXT NOT NULL, seller TEXT NOT NULL, buyer_position_id TEXT NOT NULL,
        quantity INTEGER NOT NULL, price INTEGER NOT NULL, total INTEGER NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS pt_operations (owner TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL,
        kind TEXT NOT NULL, result_id TEXT NOT NULL, PRIMARY KEY(owner,key));
      CREATE TABLE IF NOT EXISTS pt_cash_entries (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES pt_accounts(owner),
        reference TEXT NOT NULL, amount INTEGER NOT NULL, UNIQUE(owner,reference));
      CREATE INDEX IF NOT EXISTS pt_position_owner ON pt_positions(owner);
    `);
  }
  close() { this.db.close(); }
  private get(sql: string, ...args: SQLInputValue[]): Row | undefined { return this.db.prepare(sql).get(...args) as Row | undefined; }
  private all(sql: string, ...args: SQLInputValue[]): Row[] { return this.db.prepare(sql).all(...args) as Row[]; }
  private run(sql: string, ...args: SQLInputValue[]) { return this.db.prepare(sql).run(...args); }
  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = work(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private account(owner: string) {
    if (!owner || owner.length > 200) fail("INVALID_OWNER", "Invalid account.", 400);
    const added = this.run("INSERT INTO pt_accounts VALUES (?,10000) ON CONFLICT DO NOTHING", owner);
    if (added.changes) this.run("INSERT INTO pt_cash_entries VALUES (?,?,?,10000)", randomUUID(), owner, "paper-starter-credit");
  }
  private operation(owner: string, key: string, fingerprint: string, kind: string): string | undefined {
    if (!/^[a-zA-Z0-9_-]{8,128}$/.test(key)) fail("INVALID_KEY", "Supply an Idempotency-Key of 8–128 letters, digits, hyphens or underscores.", 400);
    const previous = this.get("SELECT * FROM pt_operations WHERE owner=? AND key=?", owner, key);
    if (previous && (previous.fingerprint !== fingerprint || previous.kind !== kind)) fail("KEY_REUSED", "Retry the original request with this key.");
    return previous?.result_id;
  }
  private record(owner: string, key: string, fingerprint: string, kind: string, result: string) {
    this.run("INSERT INTO pt_operations VALUES (?,?,?,?,?)", owner, key, fingerprint, kind, result);
  }
  private expire() {
    for (const row of this.all("SELECT * FROM pt_listings WHERE status='open' AND expires_at<=?", this.clock())) {
      this.run("UPDATE pt_positions SET reserved=reserved-? WHERE id=?", row.quantity, row.position_id);
      this.run("UPDATE pt_listings SET status='expired' WHERE id=?", row.id);
    }
  }
  /** Trusted server adapter only. Never expose this as a browser-supplied fill endpoint. */
  importOpening(owner: string, opening: Opening) {
    if (opening.mode !== "demo" || opening.payment.status !== "confirmed") return;
    this.transaction(() => {
      this.account(owner);
      for (const card of opening.cards) {
        if (card.order.status !== "filled" || !card.order.id?.startsWith("demo-order:") || card.position?.status === "closed") continue;
        if (!validInt(card.order.quantity,1000000) || card.order.quantity === 0 || !validInt(card.order.spentCents,100000000)) continue;
        const fingerprint = digest([owner, opening.id, card.id, card.marketId, card.side, card.order.id, card.order.quantity, card.order.spentCents]);
        const prior = this.get("SELECT * FROM pt_sources WHERE card_id=? OR order_id=?", card.id, card.order.id);
        if (prior) { if (prior.fingerprint !== fingerprint) fail("FILL_CONFLICT", "This fill was already allocated differently."); continue; }
        // Fixture markets have no real closing timestamp. Paper resale expires 24h after the original opening.
        const closesAt = Date.parse(opening.createdAt) + 86400000;
        if (!Number.isFinite(closesAt)) fail("INVALID_FILL", "Opening timestamp is invalid.");
        this.run("INSERT INTO pt_sources VALUES (?,?,?,?,?,?,?,?,?,?)", card.id, card.order.id, owner, opening.id, fingerprint, card.marketId, card.question, card.side, card.order.quantity, closesAt);
        this.run("INSERT INTO pt_positions VALUES (?,?,?,?,0,?)", randomUUID(), owner, card.id, card.order.quantity, card.order.spentCents);
      }
    });
  }
  controls(owner: string, cardId: string): boolean { return !!this.get("SELECT 1 FROM pt_sources WHERE owner=? AND card_id=?", owner, cardId); }
  project(owner: string, opening: Opening): Opening {
    return { ...opening, cards: opening.cards.map(card => {
      if (!this.controls(owner, card.id)) return card;
      const row = this.get("SELECT coalesce(sum(quantity),0) AS quantity, coalesce(sum(reserved),0) AS reserved, coalesce(sum(cost),0) AS cost FROM pt_positions WHERE owner=? AND source_card_id=?", owner, card.id)!;
      return { ...card, position: { ...card.position, status: row.quantity > 0 ? "open" as const : "closed" as const,
        remainingQuantity: row.quantity, listedQuantity: row.reserved, costBasisCents: row.cost } };
    }) };
  }
  private position(row: Row): Position {
    return { id: row.id, sourceCardId: row.source_card_id, marketId: row.market_id, question: row.question, side: row.side,
      remainingQuantity: row.quantity, listedQuantity: row.reserved, availableQuantity: row.quantity-row.reserved,
      costBasisCents: row.cost, marketClosesAt: iso(row.closes_at), mode: "paper" };
  }
  private listing(id: string, owner: string): ResaleListing {
    const row = this.get(`SELECT l.*, s.market_id, s.question, s.side FROM pt_listings l JOIN pt_positions p ON p.id=l.position_id
      JOIN pt_sources s ON s.card_id=p.source_card_id WHERE l.id=?`,id);
    if (!row) fail("LISTING_NOT_FOUND", "Listing not found.",404);
    return { id: row!.id, positionId: row!.position_id, marketId: row!.market_id, question: row!.question, side: row!.side,
      remainingQuantity: row!.quantity, priceCents: row!.price, status: row!.status, mine: row!.seller===owner, expiresAt: iso(row!.expires_at), mode:"paper" };
  }
  listings(owner: string): ResaleListing[] {
    return this.transaction(() => { this.expire(); return this.all("SELECT id FROM pt_listings WHERE status='open' ORDER BY rowid DESC LIMIT 200").map(row => this.listing(row.id,owner)); });
  }
  portfolio(owner: string): PostTradePortfolio {
    return this.transaction(() => {
      this.account(owner); this.expire();
      return { positions: this.all(`SELECT p.*,s.market_id,s.question,s.side,s.closes_at FROM pt_positions p JOIN pt_sources s ON s.card_id=p.source_card_id WHERE p.owner=? AND p.quantity>0 ORDER BY p.rowid DESC`,owner).map(row => this.position(row)),
        listings:this.all("SELECT id FROM pt_listings WHERE seller=? ORDER BY rowid DESC LIMIT 200",owner).map(row=>this.listing(row.id,owner)),
        trades:this.all("SELECT id FROM pt_trades WHERE buyer=? OR seller=? ORDER BY rowid DESC LIMIT 200",owner,owner).map(row=>this.trade(row.id,owner)),
        balanceCents:this.get("SELECT balance FROM pt_accounts WHERE owner=?",owner)!.balance, mode:"paper", currency:"SIMULATED_USD" };
    });
  }
  list(owner: string, input: ListingRequest, key: string): ResaleListing {
    input=listingSchema.parse(input);
    return this.transaction(() => {
      const fingerprint=digest(input), previous=this.operation(owner,key,fingerprint,"list");
      if(previous) return this.listing(previous,owner);
      this.expire();
      const row=this.get(`SELECT p.*,s.closes_at FROM pt_positions p JOIN pt_sources s ON s.card_id=p.source_card_id WHERE p.id=? AND p.owner=?`,input.positionId,owner);
      if(!row) fail("POSITION_NOT_FOUND","Position not found.",404);
      if(row!.closes_at<=this.clock()) fail("MARKET_CLOSED","This paper position's trading window has closed.");
      if(input.quantity>row!.quantity-row!.reserved) fail("QUANTITY_UNAVAILABLE","That quantity is already sold or listed.");
      const id=randomUUID();
      this.run("UPDATE pt_positions SET reserved=reserved+? WHERE id=?",input.quantity,input.positionId);
      this.run("INSERT INTO pt_listings VALUES (?,?,?,?,?,'open',?)",id,owner,input.positionId,input.quantity,input.priceCents,row!.closes_at);
      this.record(owner,key,fingerprint,"list",id); return this.listing(id,owner);
    });
  }
  cancel(owner:string,id:string):ResaleListing {
    return this.transaction(()=>{
      this.expire(); const row=this.get("SELECT * FROM pt_listings WHERE id=? AND seller=?",id,owner);
      if(!row) fail("LISTING_NOT_FOUND","Listing not found.",404);
      if(row!.status==="open") {
        this.run("UPDATE pt_positions SET reserved=reserved-? WHERE id=?",row!.quantity,row!.position_id);
        this.run("UPDATE pt_listings SET status='cancelled' WHERE id=?",id);
      }
      return this.listing(id,owner);
    });
  }
  quote(owner:string,input:ResaleQuoteRequest):ResaleQuote {
    input=resaleQuoteSchema.parse(input);
    return this.transaction(()=>{
      this.account(owner);this.expire();
      const row=this.get("SELECT * FROM pt_listings WHERE id=?",input.listingId);
      if(!row) fail("LISTING_NOT_FOUND","Listing not found.",404);
      if(row!.seller===owner) fail("SELF_TRADE","You cannot buy your own listing.");
      if(row!.status!=="open" || row!.quantity<input.quantity) fail("QUANTITY_UNAVAILABLE","This listing no longer has that quantity.");
      const expires=Math.min(this.clock()+30000,row!.expires_at),id=randomUUID();
      this.run("INSERT INTO pt_quotes VALUES (?,?,?,?,?,?)",id,owner,input.listingId,input.quantity,row!.price,expires);
      return { id,listingId:input.listingId,quantity:input.quantity,priceCents:row!.price,subtotalCents:row!.price*input.quantity,feeCents:0,
        totalCents:row!.price*input.quantity,expiresAt:iso(expires),mode:"paper",currency:"SIMULATED_USD" };
    });
  }
  trade(id:string,owner:string):ResaleTrade {
    const row=this.get("SELECT * FROM pt_trades WHERE id=? AND (buyer=? OR seller=?)",id,owner,owner);
    if(!row) fail("TRADE_NOT_FOUND","Trade not found.",404);
    return { id:row!.id,quoteId:row!.quote_id,listingId:row!.listing_id,quantity:row!.quantity,priceCents:row!.price,proceedsCents:row!.total,
      buyerPositionId:row!.buyer_position_id,role:row!.buyer===owner?"buyer":"seller",status:"completed",createdAt:iso(row!.created_at),mode:"paper",currency:"SIMULATED_USD",payout:"not_redeemable" };
  }
  buy(owner:string,quoteId:string,key:string):ResaleTrade {
    return this.transaction(()=>{
      const fingerprint=digest({quoteId}),previous=this.operation(owner,key,fingerprint,"buy");
      if(previous) return this.trade(previous,owner);
      this.expire();
      const q=this.get("SELECT * FROM pt_quotes WHERE id=? AND buyer=?",quoteId,owner);
      if(!q) fail("QUOTE_NOT_FOUND","Quote not found.",404);
      if(this.get("SELECT 1 FROM pt_trades WHERE quote_id=?",quoteId)) fail("QUOTE_USED","Retry with the original idempotency key.");
      if(q!.expires_at<=this.clock()) fail("QUOTE_EXPIRED","Request a fresh quote.");
      const l=this.get("SELECT * FROM pt_listings WHERE id=?",q!.listing_id)!;
      if(l.status!=="open" || l.expires_at<=this.clock() || l.quantity<q!.quantity || l.seller===owner || l.price!==q!.price) fail("QUANTITY_UNAVAILABLE","Listing changed or sold. Request a fresh quote.");
      const p=this.get("SELECT * FROM pt_positions WHERE id=?",l.position_id)!;
      const total=q!.quantity*q!.price, cash=this.get("SELECT balance FROM pt_accounts WHERE owner=?",owner)!;
      if(cash.balance<total) fail("INSUFFICIENT_BALANCE","Not enough simulated USD.");
      const id=randomUUID(),positionId=randomUUID(),disposedCost=q!.quantity===p.quantity?p.cost:Math.floor(p.cost*q!.quantity/p.quantity);
      this.run("UPDATE pt_positions SET quantity=quantity-?,reserved=reserved-?,cost=cost-? WHERE id=?",q!.quantity,q!.quantity,disposedCost,p.id);
      this.run("INSERT INTO pt_positions VALUES (?,?,?,?,0,?)",positionId,owner,p.source_card_id,q!.quantity,total);
      this.run("UPDATE pt_listings SET quantity=quantity-?,status=CASE WHEN quantity=? THEN 'filled' ELSE 'open' END WHERE id=?",q!.quantity,q!.quantity,l.id);
      this.run("UPDATE pt_accounts SET balance=balance-? WHERE owner=?",total,owner);
      this.run("UPDATE pt_accounts SET balance=balance+? WHERE owner=?",total,l.seller);
      this.run("INSERT INTO pt_cash_entries VALUES (?,?,?,?)",randomUUID(),owner,id,-total);
      this.run("INSERT INTO pt_cash_entries VALUES (?,?,?,?)",randomUUID(),l.seller,id,total);
      this.run("INSERT INTO pt_trades VALUES (?,?,?,?,?,?,?,?,?,?)",id,quoteId,l.id,owner,l.seller,positionId,q!.quantity,q!.price,total,this.clock());
      this.record(owner,key,fingerprint,"buy",id); return this.trade(id,owner);
    });
  }
}
