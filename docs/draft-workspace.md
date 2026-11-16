# Draft workspace

## Accounts and development

Supabase Authentication handles email magic-link sign-in. Only verified users with
an admin-assigned `app_metadata.member_name` of `Andrew` or `Sam` can access private
lists or change picks. These two accounts have their names assigned in Supabase Auth;
there is no public registration, and the app does not request passwords. Assign
future member names with the Supabase Admin API, not user-editable `user_metadata`.

Supabase's standard Magic Link email works without custom SMTP. It returns to the
Site URL with `#access_token=...`; `CompleteMagicLink` exchanges those tokens for
an HTTP-only server session and removes them from the address bar. Projects that
can edit email templates may instead use `docs/magic-link-email.html` and the
`/auth/confirm` callback. Add `http://localhost:3000/auth/confirm` and the deployed
site's `/auth/confirm` URL under Authentication → URL Configuration → Redirect URLs.
The built-in sender is for testing: Supabase currently limits it to two emails per
project per hour and delivers only to project team addresses. Configure custom SMTP
before relying on magic-link delivery for draft night.
For the current Vercel site, set Site URL to `https://frankiefidleristheman-6z1t.vercel.app`
and allow `https://frankiefidleristheman-6z1t.vercel.app/auth/confirm`. Keep the
localhost redirect for development; the app sends the callback for the domain
where sign-in was requested.
The optional template uses the validated redirect URL and token hash so the link can
be opened in another browser. The callback also accepts the PKCE code flow, which
requires opening the link in the browser where it was requested. Used or expired
links return to sign-in with a message. Requests never automatically create accounts.

Required environment variables:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<existing project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<existing publishable key>
SUPABASE_SERVICE_ROLE_KEY=<server-only service role key>
PRE_DRAFT_PRIVATE=false
```

The existing `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` is also supported.
Never expose the service role key in browser code.

Apply `db/draft-workspace.sql` once in Supabase SQL Editor (completed during setup).
The migration adds block metadata, shortlist storage, and atomic save functions.
New tables/functions deny direct anonymous and authenticated access; the server
uses its service role after checking the signed-in member and list ownership.

## Pre-draft privacy

Keep `PRE_DRAFT_PRIVATE=false` while building. To restrict the public website,
set it to `true` in the deployment's server environment and redeploy. Locally,
restart Next.js after changing it.

Visitors can then view `/draft/board`, its configuration and recorded-pick read
endpoints, and the sign-in screen. Other pages redirect to sign-in; private API
requests return 401. Public navigation and player research beneath the board are
hidden. All draft writes and shortlist reads/writes require membership even while
the site's research pages are open during development.

## Draft behavior

`lib/draftRules.mjs` is shared by the API, carousel, and board. Franchise awards
and scheduled turns are separate: a block completes the blocker, records
`initiated_by` and `blocked_team_code`, and leaves the original picker active.
The carousel labels the award “Blocked [original picker]”. Snake picks follow
the configured order. Duplicate players, ineligible positions, invalid blocks,
roster limits, and out-of-order entries are rejected on the server.

Previous ownership comes from the preceding season's `fantasy_rosters`, with the
user-confirmed `Draft.csv` snapshot as the fallback specifically for the 2026 draft.
An owner who has completed their franchise pick has no remaining blocking rights.

Edits replay subsequent picks through the rules before saving. An edit that would
invalidate later turns is rejected. Undo proceeds from the latest selection backward
so earlier changes cannot silently corrupt blocking rights or pick order.
Draft order cannot be edited once selections exist.

Supabase save functions compare the last-read state under a transaction lock.
Concurrent edits return a conflict instead of silently overwriting another save.
Draft views refresh every five seconds; both shortlists refresh every ten seconds.

## Player Focus

Andrew and Sam's lists are displayed together, separate from the public board.
Each user can add, remove, or move players up/down only in their own list.
Drafted players remain greyed out, occupy their spot, and count toward ten until
manually removed. Player search/filter changes do not clear either list.
The player table has a “Show 50 more” control instead of stopping at 30 players.

## Verification

```powershell
node --test tests/*.test.mjs
node tests/workspace-storage.cjs
npm run build
```

The storage integration check requires the existing Supabase environment. It uses
only temporary negative-season rows and removes them in `finally`; it never
changes the actual 2026 picks or personal lists. Run one instance at a time.

Implementation follows [Supabase SSR authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
and [Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy).
