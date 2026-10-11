// Run through the explicit grants:migrate command before enabling the API/worker.
export const grantSchema = `
CREATE TABLE IF NOT EXISTS welcome_grant_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  app_id text NOT NULL,
  chain_id integer NOT NULL,
  treasury text NOT NULL,
  starts_at timestamptz NOT NULL
);
-- Legacy Base Sepolia databases receive a NULL binding and fail closed at startup.
-- Never relabel their signed transactions as Ethereum Sepolia transactions.
ALTER TABLE welcome_grant_settings ADD COLUMN IF NOT EXISTS chain_id integer;
CREATE TABLE IF NOT EXISTS welcome_grants (
  user_id text PRIMARY KEY,
  recipient text UNIQUE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','prepared','confirmed','ineligible','failed','needs_review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  prepared_at timestamptz,
  confirmed_at timestamptz,
  tx_hash text UNIQUE,
  raw_transaction text,
  nonce bigint UNIQUE,
  last_error text,
  CHECK ((raw_transaction IS NULL AND tx_hash IS NULL AND nonce IS NULL AND prepared_at IS NULL)
    OR (raw_transaction IS NOT NULL AND tx_hash IS NOT NULL AND nonce IS NOT NULL AND prepared_at IS NOT NULL)),
  CHECK (status NOT IN ('prepared','confirmed','needs_review') OR raw_transaction IS NOT NULL),
  CHECK (raw_transaction IS NULL OR recipient IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS welcome_grants_queue ON welcome_grants (status, next_attempt_at, created_at);
`;
