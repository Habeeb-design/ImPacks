import type { PipelineStatus } from "@impacks/contracts";

/** Only show opening motion while the worker is actually preparing/executing. */
export function purchaseProgress(
  pipeline: Pick<PipelineStatus, "state" | "fundingMode"> | null | undefined,
  hasOpening: boolean,
  busy: boolean,
): { label: string; spinning: boolean } | null {
  if (pipeline?.state === "reconciliation-required") {
    return { label: "Checking order status. Your pack will appear after its trades are verified. Do not start another purchase.", spinning: false };
  }
  if (hasOpening) return null;
  if (pipeline?.state === "preparing" || pipeline?.state === "executing") {
    return { label: "Opening your pack…", spinning: true };
  }
  if (busy) return { label: "Connecting checkout. Check your wallet for a confirmation request…", spinning: true };
  return null;
}
