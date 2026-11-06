-- LOCAL TEST PROTOTYPE. Not a migration, not a production security boundary.
CREATE SCHEMA dispatch_lab;
CREATE TABLE dispatch_lab.operation (
  operation_key text PRIMARY KEY,
  admission_id text NOT NULL,
  admission_open boolean NOT NULL,
  current_attempt bigint NOT NULL,
  fence bigint NOT NULL,
  lease_until timestamptz NOT NULL
);
CREATE TABLE dispatch_lab.intent (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_key text NOT NULL REFERENCES dispatch_lab.operation,
  admission_id text NOT NULL,
  attempt_id bigint NOT NULL,
  fence bigint NOT NULL,
  request_digest text NOT NULL,
  provider_key text NOT NULL,
  state text NOT NULL CHECK (state IN ('prepared','sending','unknown','response_held','cleared')),
  result_digest text
);
CREATE UNIQUE INDEX one_unresolved ON dispatch_lab.intent(operation_key) WHERE state <> 'cleared';
-- This trusted proof ledger is a synthetic test input, not provider proof.
CREATE TABLE dispatch_lab.proof (
  intent_id bigint PRIMARY KEY REFERENCES dispatch_lab.intent,
  proof_kind text NOT NULL CHECK (proof_kind IN ('nonexecution','cancelled_no_late_effect')),
  evidence text NOT NULL CHECK (length(evidence)>0)
);
CREATE FUNCTION dispatch_lab.prepare(p_key text,p_admission text,p_attempt bigint,p_fence bigint,p_digest text,p_provider_key text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE op dispatch_lab.operation%ROWTYPE;
BEGIN
 SELECT * INTO op FROM dispatch_lab.operation WHERE operation_key=p_key FOR UPDATE;
 IF NOT FOUND THEN RETURN 'hold_missing'; END IF;
 IF p_admission IS NULL OR p_attempt IS NULL OR p_fence IS NULL OR op.admission_id <> p_admission OR NOT op.admission_open OR op.current_attempt <> p_attempt OR op.fence <> p_fence OR op.lease_until <= clock_timestamp() OR coalesce(p_digest,'')='' OR coalesce(p_provider_key,'')='' THEN RETURN 'hold_scope'; END IF;
 IF EXISTS (SELECT 1 FROM dispatch_lab.intent WHERE operation_key=p_key AND state <> 'cleared') THEN RETURN 'hold_unresolved'; END IF;
 INSERT INTO dispatch_lab.intent(operation_key,admission_id,attempt_id,fence,request_digest,provider_key,state) VALUES(p_key,p_admission,p_attempt,p_fence,p_digest,p_provider_key,'prepared');
 RETURN 'prepared';
END $$;
CREATE FUNCTION dispatch_lab.start(p_key text,p_attempt bigint,p_fence bigint,p_intent bigint,p_digest text,p_provider_key text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE op dispatch_lab.operation%ROWTYPE; i dispatch_lab.intent%ROWTYPE;
BEGIN
 SELECT * INTO op FROM dispatch_lab.operation WHERE operation_key=p_key FOR UPDATE;
 IF NOT FOUND THEN RETURN 'hold_missing'; END IF;
 SELECT * INTO i FROM dispatch_lab.intent WHERE operation_key=p_key AND state <> 'cleared' FOR UPDATE;
 IF NOT FOUND THEN RETURN 'hold_missing'; END IF;
 IF p_attempt IS NULL OR p_fence IS NULL OR p_intent IS NULL OR p_digest IS NULL OR p_provider_key IS NULL OR i.id <> p_intent OR i.request_digest <> p_digest OR i.provider_key <> p_provider_key OR NOT op.admission_open OR op.admission_id <> i.admission_id OR op.current_attempt <> p_attempt OR op.fence <> p_fence OR i.attempt_id <> p_attempt OR i.fence <> p_fence OR op.lease_until <= clock_timestamp() OR i.state <> 'prepared' THEN RETURN 'hold_scope'; END IF;
 UPDATE dispatch_lab.intent SET state='sending' WHERE id=i.id;
 RETURN 'send_once';
END $$;
CREATE FUNCTION dispatch_lab.unknown(p_id bigint) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
 UPDATE dispatch_lab.intent SET state='unknown' WHERE id=p_id AND state IN ('prepared','sending');
 RETURN CASE WHEN FOUND THEN 'unknown_hold' ELSE 'hold_state' END;
END $$;
CREATE FUNCTION dispatch_lab.late_result(p_id bigint,p_digest text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
 -- No receipt mechanism exists in this prototype. A result never clears the intent.
 UPDATE dispatch_lab.intent SET state='response_held',result_digest=p_digest WHERE id=p_id AND state IN ('prepared','sending','unknown') AND coalesce(p_digest,'')<>'';
 RETURN CASE WHEN FOUND THEN 'result_held_no_receipt' ELSE 'hold_state' END;
END $$;
CREATE FUNCTION dispatch_lab.clear_with_test_proof(p_id bigint) RETURNS text LANGUAGE plpgsql AS $$
DECLARE op_key text;
BEGIN
 -- Serialize proof-based clearing and send authorization on the operation row.
 -- Sending and unknown outcomes need a verified drain protocol, not modeled here.
 SELECT operation_key INTO op_key FROM dispatch_lab.intent WHERE id=p_id;
 IF NOT FOUND THEN RETURN 'hold_no_proof'; END IF;
 PERFORM 1 FROM dispatch_lab.operation WHERE operation_key=op_key FOR UPDATE;
 UPDATE dispatch_lab.intent SET state='cleared' WHERE id=p_id AND state='prepared' AND EXISTS (SELECT 1 FROM dispatch_lab.proof WHERE intent_id=p_id AND proof_kind IN ('nonexecution','cancelled_no_late_effect') AND length(evidence)>0);
 RETURN CASE WHEN FOUND THEN 'cleared' ELSE 'hold_no_proof' END;
END $$;
-- No grants to PUBLIC. The disposable database owner is the test harness.
REVOKE ALL ON SCHEMA dispatch_lab FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA dispatch_lab FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA dispatch_lab FROM PUBLIC;
