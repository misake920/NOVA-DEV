# Supabase persistence

The server stores the workspace, account identity, session records and command receipts in Supabase PostgreSQL through the Data API. The browser never receives a Supabase server key. The app does not need Supabase Auth or email/password forms for its single-owner workflow.

1. Create a Supabase project and open its **SQL Editor**.
2. Run the complete contents of [`schema.sql`](schema.sql). This creates the tables and transaction functions; it does not insert customers, sales or other example records. Rerunning the script is safe for this schema.
3. Set these variables in the server deployment's environment settings, then redeploy:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | Project URL, such as `https://<project-ref>.supabase.co` |
   | `SUPABASE_SECRET_KEY` | Server secret key from the project's API key settings |
   | `SUPABASE_SERVICE_ROLE_KEY` | Alternative to `SUPABASE_SECRET_KEY` for a legacy service-role key |

Use one server key. `SUPABASE_SECRET_KEY` takes precedence if both key variables are present. Do not use an anon or publishable key. Do not prefix these variables with `VITE_`, put them in frontend configuration, or commit key values. A direct PostgreSQL connection string is unnecessary for this adapter. Local Supabase development can use its HTTP loopback project URL; deployed projects require HTTPS.

The Supabase **Data API** must be enabled and expose the `public` schema. `ghost_health()` checks the required schema version during initialization. Missing variables return `DATABASE_NOT_CONFIGURED`; missing tables/functions return `DATABASE_SCHEMA_MISSING`. No failed connection falls back to temporary memory storage.

Every table enables Row Level Security and grants access only to the server's `service_role`. The RPC functions also revoke execution from `PUBLIC`, `anon` and `authenticated`. These privileges intentionally prevent browser-side database access. Keep the server key private, since it bypasses RLS. The application server chooses the account ID and scopes every workspace and command query to that account; callers must never select account IDs from untrusted request bodies.

Account creation inserts the identity and initial workspace in one transaction. Command commits lock that account's workspace row and atomically save both the updated snapshot and its request receipt. Retries of the same request replay the recorded snapshot; changing its command type or payload returns `IDEMPOTENCY_CONFLICT`. An explicit stale version returns `VERSION_CONFLICT`. Commands without an explicit version retry a bounded number of compare-and-swap conflicts. Transform callbacks must be synchronous and may be called again after a concurrency conflict, so they should compute workspace changes without external side effects.

The schema creates storage only. The server provisions an empty owner workspace on first use, using its configured owner identity. Existing workspaces remain in Supabase across deployments, browser reloads and server restarts. For backup retention and recovery, configure the project's backups or Point-in-Time Recovery according to your Supabase plan.

After adding the environment variables, deploy the app and open its workspace. Creating a real record and reloading should preserve it. That operational check requires your project and credentials; the schema and adapter alone do not establish a live database connection.
