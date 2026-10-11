import type { Market, SandboxOrderIntent, Theme } from "@impacks/contracts";

export interface OrderObservation {
  clientOrderId: string; exchangeOrderId: string;
  state: "open" | "filled" | "cancelled";
  quantity: number; costCents: number; feeCents: number;
  costAtomic: string; feeAtomic: string; feesFinal: boolean; evidence: string;
}
export interface TradingGateway {
  readonly accountKey: string;
  readiness(): Promise<{ availableCents: number }>;
  markets(theme: Theme): Promise<Market[]>;
  validate(order: SandboxOrderIntent): Promise<void>;
  submit(order: SandboxOrderIntent): Promise<OrderObservation>;
  lookup(order: SandboxOrderIntent): Promise<OrderObservation | null>;
}
export interface RefundTransport {
  sign(input: { id: string; to: string; amountAtomic: string; nonce: number }): Promise<`0x${string}`>;
  pendingNonce(): Promise<number>;
  broadcast(signed: `0x${string}`): Promise<string>;
}
export interface PipelinePolicy {
  accountKey: string; capacityCents: number; feeReserveBps: number;
}
