import { ausdReadiness } from "./readiness.js";
try {
  const report = await ausdReadiness();
  console.log(JSON.stringify(report, null, 2));
  if (report.blockers.length) process.exitCode = 1;
} catch { console.error("Readiness check unavailable; sensitive details withheld."); process.exitCode = 1; }
