-- Run once in the Supabase SQL editor with an administrative role. It is safe
-- to run again. This creates no accounts, sessions, or sample workspace data.
-- The server uses service_role; browser clients have no access to these tables
-- or RPCs. Keep the service-role key exclusively in server environment settings.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ghost_users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT ghost_users_email_unique UNIQUE (email),
  CONSTRAINT ghost_users_email_normalized
    CHECK (email = lower(btrim(email)))
);

CREATE TABLE IF NOT EXISTS public.ghost_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT ghost_sessions_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.ghost_users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ghost_sessions_expiry
  ON public.ghost_sessions (expires_at);

CREATE TABLE IF NOT EXISTS public.ghost_workspaces (
  user_id text PRIMARY KEY,
  version bigint NOT NULL,
  state jsonb NOT NULL,
  CONSTRAINT ghost_workspaces_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.ghost_users (id) ON DELETE CASCADE,
  CONSTRAINT ghost_workspaces_version_safe
    CHECK (version BETWEEN 0 AND 9007199254740991),
  CONSTRAINT ghost_workspaces_state_version CHECK (
    (jsonb_typeof(state) = 'object'
      AND jsonb_typeof(state -> 'version') = 'number'
      AND state -> 'version' = to_jsonb(version)) IS TRUE
  )
);

CREATE TABLE IF NOT EXISTS public.ghost_commands (
  user_id text NOT NULL,
  request_id text NOT NULL,
  type text NOT NULL,
  payload_hash text,
  version bigint NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT ghost_commands_pkey PRIMARY KEY (user_id, request_id),
  CONSTRAINT ghost_commands_user_version_unique UNIQUE (user_id, version),
  CONSTRAINT ghost_commands_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.ghost_users (id) ON DELETE CASCADE,
  CONSTRAINT ghost_commands_request_id_length CHECK (length(request_id) BETWEEN 1 AND 200),
  CONSTRAINT ghost_commands_type_length CHECK (length(type) BETWEEN 1 AND 100),
  CONSTRAINT ghost_commands_payload_hash_length CHECK (payload_hash IS NULL OR length(payload_hash) <= 200),
  CONSTRAINT ghost_commands_version_safe CHECK (version BETWEEN 0 AND 9007199254740991),
  CONSTRAINT ghost_commands_snapshot_version CHECK (
    (jsonb_typeof(snapshot) = 'object'
      AND jsonb_typeof(snapshot -> 'version') = 'number'
      AND snapshot -> 'version' = to_jsonb(version)) IS TRUE
  )
);

ALTER TABLE public.ghost_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghost_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghost_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghost_commands ENABLE ROW LEVEL SECURITY;

-- No RLS policies are created: only the server's BYPASSRLS service role can use
-- this persistence layer. Explicit revokes also remove Supabase default grants.
REVOKE ALL ON TABLE public.ghost_users, public.ghost_sessions,
  public.ghost_workspaces, public.ghost_commands FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT ON TABLE public.ghost_users TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.ghost_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ghost_workspaces TO service_role;
GRANT SELECT, INSERT ON TABLE public.ghost_commands TO service_role;

CREATE OR REPLACE FUNCTION public.ghost_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  -- Verify the required tables and column types without creating test records.
  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('ghost_users'), ('ghost_sessions'), ('ghost_workspaces'), ('ghost_commands')
    ) AS expected(table_name)
    LEFT JOIN pg_catalog.pg_class AS c ON c.oid = to_regclass('public.' || expected.table_name)
    WHERE c.oid IS NULL OR c.relkind <> 'r'
  ) OR EXISTS (
    SELECT 1 FROM (VALUES
      ('ghost_users', 'id', 'pg_catalog.text', true),
      ('ghost_users', 'name', 'pg_catalog.text', true),
      ('ghost_users', 'email', 'pg_catalog.text', true),
      ('ghost_users', 'password_hash', 'pg_catalog.text', true),
      ('ghost_users', 'created_at', 'pg_catalog.timestamptz', true),
      ('ghost_sessions', 'token_hash', 'pg_catalog.text', true),
      ('ghost_sessions', 'user_id', 'pg_catalog.text', true),
      ('ghost_sessions', 'expires_at', 'pg_catalog.timestamptz', true),
      ('ghost_workspaces', 'user_id', 'pg_catalog.text', true),
      ('ghost_workspaces', 'version', 'pg_catalog.int8', true),
      ('ghost_workspaces', 'state', 'pg_catalog.jsonb', true),
      ('ghost_commands', 'user_id', 'pg_catalog.text', true),
      ('ghost_commands', 'request_id', 'pg_catalog.text', true),
      ('ghost_commands', 'type', 'pg_catalog.text', true),
      ('ghost_commands', 'payload_hash', 'pg_catalog.text', false),
      ('ghost_commands', 'version', 'pg_catalog.int8', true),
      ('ghost_commands', 'snapshot', 'pg_catalog.jsonb', true),
      ('ghost_commands', 'created_at', 'pg_catalog.timestamptz', true)
    ) AS expected(table_name, column_name, type_name, not_null)
    LEFT JOIN pg_catalog.pg_attribute AS a
      ON a.attrelid = to_regclass('public.' || expected.table_name)
      AND a.attname = expected.column_name AND a.attnum > 0 AND NOT a.attisdropped
    WHERE a.attnum IS NULL OR a.atttypid <> to_regtype(expected.type_name)
      OR a.attnotnull <> expected.not_null
  ) OR to_regprocedure('public.ghost_create_user(text,text,text,text,jsonb,timestamptz)') IS NULL
    OR to_regprocedure('public.ghost_commit_command(text,text,text,text,bigint,bigint,jsonb,timestamptz)') IS NULL THEN
    RETURN jsonb_build_object('error', 'SCHEMA_NOT_READY');
  END IF;
  RETURN jsonb_build_object('schemaVersion', 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ghost_create_user(
  p_id text,
  p_name text,
  p_email text,
  p_password_hash text,
  p_workspace jsonb,
  p_created_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_email text := lower(btrim(p_email));
  v_version numeric;
BEGIN
  IF p_id IS NULL OR length(p_id) = 0
    OR p_name IS NULL OR length(btrim(p_name)) = 0
    OR v_email IS NULL
    OR p_password_hash IS NULL
    OR p_created_at IS NULL OR NOT isfinite(p_created_at) THEN
    RETURN jsonb_build_object('error', 'INVALID_INPUT');
  END IF;

  IF jsonb_typeof(p_workspace) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_workspace -> 'version') IS DISTINCT FROM 'number' THEN
    RETURN jsonb_build_object('error', 'INVALID_WORKSPACE');
  END IF;
  v_version := (p_workspace ->> 'version')::numeric;
  IF v_version < 0 OR v_version > 9007199254740991 OR v_version <> trunc(v_version) THEN
    RETURN jsonb_build_object('error', 'INVALID_WORKSPACE');
  END IF;

  -- This exception block is a subtransaction: a duplicate on either insert
  -- rolls back both records before returning the public duplicate-email code.
  BEGIN
    INSERT INTO public.ghost_users (id, name, email, password_hash, created_at)
      VALUES (p_id, p_name, v_email, p_password_hash, p_created_at);
    INSERT INTO public.ghost_workspaces (user_id, version, state)
      VALUES (p_id, v_version::bigint, p_workspace);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('error', 'EMAIL_EXISTS');
  END;

  RETURN jsonb_build_object('user', jsonb_build_object(
    'id', p_id, 'name', p_name, 'email', v_email, 'password_hash', p_password_hash
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.ghost_commit_command(
  p_user_id text,
  p_request_id text,
  p_type text,
  p_payload_hash text,
  p_base_version bigint,
  p_expected_version bigint,
  p_snapshot jsonb,
  p_created_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_current_version bigint;
  v_next_version bigint;
  v_previous public.ghost_commands%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR length(p_user_id) = 0
    OR p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 1 AND 200
    OR p_type IS NULL OR length(p_type) NOT BETWEEN 1 AND 100
    OR (p_payload_hash IS NOT NULL AND length(p_payload_hash) > 200) THEN
    RETURN jsonb_build_object('error', 'INVALID_COMMAND');
  END IF;

  SELECT version INTO v_current_version
    FROM public.ghost_workspaces WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'WORKSPACE_NOT_FOUND');
  END IF;

  SELECT * INTO v_previous FROM public.ghost_commands
    WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_previous.type IS DISTINCT FROM p_type
      OR v_previous.payload_hash IS DISTINCT FROM p_payload_hash THEN
      RETURN jsonb_build_object('error', 'IDEMPOTENCY_CONFLICT');
    END IF;
    -- Replays do not depend on versions or snapshots supplied by a retry.
    RETURN jsonb_build_object(
      'snapshot', v_previous.snapshot, 'version', v_previous.version, 'replayed', true
    );
  END IF;

  IF p_base_version IS NULL OR p_base_version NOT BETWEEN 0 AND 9007199254740991
    OR (p_expected_version IS NOT NULL AND p_expected_version NOT BETWEEN 0 AND 9007199254740991) THEN
    RETURN jsonb_build_object('error', 'INVALID_COMMAND');
  END IF;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current_version THEN
    RETURN jsonb_build_object('error', 'VERSION_CONFLICT', 'currentVersion', v_current_version);
  END IF;
  IF p_base_version <> v_current_version THEN
    RETURN jsonb_build_object('error', 'CAS_CONFLICT', 'currentVersion', v_current_version);
  END IF;

  IF v_current_version >= 9007199254740991 THEN
    RETURN jsonb_build_object('error', 'INVALID_WORKSPACE');
  END IF;
  v_next_version := v_current_version + 1;
  IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_snapshot -> 'version') IS DISTINCT FROM 'number'
    OR p_snapshot -> 'version' IS DISTINCT FROM to_jsonb(v_next_version)
    OR p_created_at IS NULL OR NOT isfinite(p_created_at) THEN
    RETURN jsonb_build_object('error', 'INVALID_WORKSPACE');
  END IF;

  -- The synchronous JavaScript transform ran against p_base_version. The lock
  -- and comparison above make its workspace update and receipt one transaction.
  UPDATE public.ghost_workspaces SET version = v_next_version, state = p_snapshot
    WHERE user_id = p_user_id;
  INSERT INTO public.ghost_commands
    (user_id, request_id, type, payload_hash, version, snapshot, created_at)
    VALUES (p_user_id, p_request_id, p_type, p_payload_hash, v_next_version, p_snapshot, p_created_at);

  RETURN jsonb_build_object('snapshot', p_snapshot, 'version', v_next_version, 'replayed', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.ghost_health() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ghost_create_user(text, text, text, text, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ghost_commit_command(text, text, text, text, bigint, bigint, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ghost_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.ghost_create_user(text, text, text, text, jsonb, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ghost_commit_command(text, text, text, text, bigint, bigint, jsonb, timestamptz)
  TO service_role;

-- Make the public-schema RPC signatures available to PostgREST after commit.
NOTIFY pgrst, 'reload schema';
COMMIT;
