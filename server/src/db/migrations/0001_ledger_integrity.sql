-- Ledger integrity layer.
--
-- The golden rule from the spec ("never mutate wallets.balance without a
-- matching ledger row") is enforced here rather than in application code, so it
-- holds for psql, future services, and anyone who forgets.
--
-- Composition: inserting a transactions row runs (b) then (c) at trigger depth
-- 1; (c)'s UPDATE fires (d) at depth 2. (d) allows depth >= 2 and rejects
-- everything else, which is exactly "only the ledger may move money".

-- (a) transactions is append-only.
CREATE FUNCTION transactions_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'transactions is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint

CREATE TRIGGER transactions_append_only
  BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION transactions_append_only();--> statement-breakpoint

-- (b) Stamp balance_after from the wallet. Whatever the application supplied is
-- discarded. FOR UPDATE serialises concurrent inserts against the same wallet.
CREATE FUNCTION transactions_stamp_balance_after() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  wallet_balance numeric(18,4);
BEGIN
  SELECT balance INTO wallet_balance
    FROM wallets
   WHERE user_id = NEW.user_id AND credit_type_id = NEW.credit_type_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no wallet for user % and credit_type %', NEW.user_id, NEW.credit_type_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.balance_after := wallet_balance + NEW.amount;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER transactions_stamp_balance_after
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION transactions_stamp_balance_after();--> statement-breakpoint

-- (c) Apply the ledger row to the cached wallet balance.
CREATE FUNCTION transactions_apply_to_wallet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE wallets
     SET balance = balance + NEW.amount,
         updated_at = now()
   WHERE user_id = NEW.user_id AND credit_type_id = NEW.credit_type_id;
  RETURN NULL;
END;
$$;--> statement-breakpoint

CREATE TRIGGER transactions_apply_to_wallet
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION transactions_apply_to_wallet();--> statement-breakpoint

-- (d) wallets.balance may only move from inside trigger (c), which runs nested
-- at depth 2. A direct UPDATE arrives at depth 1 and is rejected.
CREATE FUNCTION wallets_balance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.balance IS DISTINCT FROM OLD.balance AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'wallets.balance may only change via a transactions ledger insert'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER wallets_balance_guard
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION wallets_balance_guard();
