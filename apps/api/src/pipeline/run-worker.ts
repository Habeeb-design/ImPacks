import { createPurchaseWorker } from "./runtime.js";
import { createRefundTransport } from "./refund-transport.js";
const { store, ledger, worker } = createPurchaseWorker(createRefundTransport());
let stopping = false;
let nextReadiness = 0;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stopping = true; });
console.log("Purchase worker started: Ethereum Sepolia / Gemini sandbox only.");
try {
  while (!stopping) {
    try {
      const refreshReadiness = Date.now() >= nextReadiness;
      if (refreshReadiness) nextReadiness = Date.now() + 15_000;
      await worker.tick({ refreshReadiness });
    } catch { ledger.heartbeat(false, "Worker cycle failed; purchases remain durable"); }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, 1000));
  }
} finally { ledger.heartbeat(false, "Worker stopped"); store.close(); }
