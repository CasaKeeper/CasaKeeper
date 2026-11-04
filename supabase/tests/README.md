# CasaKeeper household security tests

`household-security.test.ts` is an opt-in integration suite. It creates disposable users and household records only when explicitly enabled; it never runs as part of the normal application test command. It writes a local manifest before remote setup and updates it immediately after every generated user or household is created.

Required local-only environment variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://jhkwxqlvxwzxgmhtzpix.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CASEKEEPER_SECURITY_TEST_PASSWORD=...
CASEKEEPER_RUN_REMOTE_SECURITY_TESTS=1
```

Run only after explicit approval for remote test writes:

```bash
npm run test:security
```

Run the read-only cleanup verifier manually from a network-enabled PowerShell terminal:

```bash
npm run test:security:verify-cleanup
```

It loads `.env.local`, verifies the CasaKeeper URL and service-role JWT reference, paginates REST and Auth Admin reads, and exits incomplete if any request fails. It never inserts, updates, or deletes remote records.

The service-role key and password must remain in ignored local environment configuration and are never printed by the suite.

The suite verifies the exact project URL and the service-role JWT `ref` claim before creating any remote record. It uses the service-role client only for disposable-user setup, exact-ID cleanup, and controlled fixture changes needed to test expiration. Ordinary assertions use separate publishable-key clients and authenticated sessions.

Cleanup runs in `finally`, retries three times, and deletes only the UUIDs in the current run manifest. If a process is interrupted or cleanup fails, the manifest remains under `supabase/tests/.runs/`. After reviewing the manifest, recover with:

```bash
set CASEKEEPER_RUN_REMOTE_SECURITY_CLEANUP=1
npm run test:security:cleanup -- supabase/tests/.runs/<run-id>.json
```

The cleanup command also requires the same ignored local Supabase URL and service-role key, and verifies the project identity before deleting.

Coverage includes profiles, memberships, invitations, tasks, routines, routine completions, wishlist items, resources, attachments, anonymous access, shared household-member access, cross-household reads/writes/deletes, parent validation, and attachment cleanup. It does not test Storage object cleanup because uploads are not part of this migration.
