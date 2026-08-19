# PQ Radar

A post-quantum TLS/SSH/FTPS readiness scanner. Checks whether your hostnames and
origin servers are actually negotiating a post-quantum hybrid key exchange, or
silently falling back to classical crypto — across five legs: client-to-edge,
direct-to-origin, SSH, FTPS implicit, and FTPS explicit.

Architecture: a Cloudflare Worker (TypeScript) as the API/UI layer, a D1
database (SQLite) for state, and a Python probe container (Cloudflare
Containers) that does the actual `openssl s_client` / SSH / FTPS handshakes.
See `docs/architecture.html` for the full picture.

This repo ships with no real account IDs, zones, subnets, or secrets — you
configure your own following the steps below.

## Screenshots

<img src="docs/screenshots/pq-summary.svg" width="700" alt="Example summary: 128 total endpoints, 84 PQ-ready, 66% ready">

*(Illustrative numbers — a fresh install starts at 0 until you scan.)*

**Proof, not just a badge** — the actual `openssl s_client` exchange behind every verdict, hostnames/IPs redacted (`?redact=1`). Here, the origin leg fell back to a classical group while the edge still negotiated PQ — exactly the gap this tool exists to catch.

<img src="docs/screenshots/detail-downgrade.png" width="700" alt="Row detail showing a PQ-vs-classical mismatch between edge and origin">

## Prerequisites

- Node.js and npm
- Docker running locally (the probe container is built and deployed as part
  of `wrangler deploy`)
- **Two different Cloudflare dependencies — don't conflate them:**
  - **The account to *host* this Worker in** — where `wrangler deploy`
    provisions the D1 database, the Durable Object, and pushes the container
    image. Can be a personal account; nothing here needs to be a
    "production" account.
  - **The account(s) to *scan* for readiness data** — whatever Cloudflare
    account(s) hold the zones/DNS records you actually want to check. Can be
    the same account as above, or a completely different one(s) you have no
    deploy access to at all — this app only ever reads zones/DNS from them.

### Two tokens, two jobs

- **The setup/deploy identity** — what `wrangler deploy` itself acts as. Used
  a handful of times to provision infrastructure; a scoped token is safer
  than full account admin and easier to get approved on a company account.
  Needs, on the hosting account:

  | Permission | Scope | Why |
  |---|---|---|
  | Workers Scripts — Edit | Account | Deploy the Worker itself |
  | D1 — Edit | Account | Create the database, apply the schema |
  | Workers Cloudflare Containers — Edit | Account | Build/push the probe container image |
  | Account Settings — Read | Account | Lets Wrangler identify the account non-interactively |
  | Workers Routes — Edit | Zone | Only if you attach a [custom domain](#custom-domain-optional) |

- **The scanning token(s)** — `CF_API_TOKEN` etc. below. Read-only, long-lived,
  minimal blast radius: if one leaks, the worst case is someone learns your
  DNS records, not that they can edit your estate. One per account you scan:

  | Permission | Scope | Why |
  |---|---|---|
  | Zone — Read | All zones on the account | Enumerate which zones exist |
  | DNS — Read | All zones on the account | Read the records that build the domain → origin mapping |

  Account-wide scope (not per-zone) is deliberate — with dozens of zones and
  one app per zone, per-zone tokens would need editing every time a site is
  added, for no security benefit since it's read-only either way.

  Validate a scanning token before provisioning anything else:
  ```
  curl -H "Authorization: Bearer $SCAN_TOKEN" \
    "https://api.cloudflare.com/client/v4/zones?per_page=50"
  ```
  Should return `"success": true` and your zone list. An auth error means
  the token lacks Zone Read or is scoped to the wrong account.

## Setup

1. **Install dependencies**
   ```
   npm install
   ```

2. **Authenticate Wrangler to the hosting account**

   Either `wrangler login` (opens a browser for OAuth):
   ```
   npx wrangler login
   ```
   or, preferred on a company account — export the setup token from
   [Two tokens, two jobs](#two-tokens-two-jobs) as an environment variable.
   No OAuth popup, and it sidesteps company policies that block third-party
   OAuth for CLIs:
   ```
   $env:CLOUDFLARE_API_TOKEN = "your-setup-token-here"
   $env:CLOUDFLARE_ACCOUNT_ID = "the-hosting-account-id"
   npx wrangler whoami   # confirm it sees the right account and token scopes
   ```

3. **Create a D1 database**
   ```
   npx wrangler d1 create pq-radar
   ```
   Copy the `database_id` from the output into `wrangler.jsonc`'s
   `d1_databases[0].database_id` (replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`).

4. **Bootstrap the schema** — one command. `schema.sql` is a consolidated
   file representing the app's full current table structure (verified to
   produce byte-identical tables/indexes to running every file in
   `migrations/` in order), and it also seeds Wrangler's own migration-
   tracking table so a future `wrangler d1 migrations apply` correctly sees
   every existing migration as already applied instead of trying to replay
   them.
   ```
   npx wrangler d1 execute pq-radar --remote --file=schema.sql
   ```
   `migrations/` is still there and still matters — it's the upgrade path if
   you already have a running deployment from before this file was
   consolidated: run `npx wrangler d1 migrations apply pq-radar --remote`
   against your existing database instead of re-running `schema.sql` (which
   is for a brand-new, empty database only — every statement in it will fail
   loudly against a database that already has these tables, rather than
   touching your existing data).

5. **Set `TRIGGER_SECRET`** — a secret you make up, gates every API endpoint
   and the web UI's login screen (Bearer token / paste-once-per-session).
   Never goes in `wrangler.jsonc`; secrets are encrypted, not committed
   anywhere.
   ```
   npx wrangler secret put TRIGGER_SECRET
   ```

6. **Configure the account(s) to scan.** Two ways — pick one:

   **One account, or exactly two ("dev"/"qa")** — the original, simplest
   path. Set the account ID(s) in `wrangler.jsonc`'s `vars`
   (`CF_ACCOUNT_ID` / `CF_ACCOUNT_ID_QA`, found on the right sidebar of any
   zone's Overview page for that account), then set the matching token(s):
   ```
   npx wrangler secret put CF_API_TOKEN
   npx wrangler secret put CF_API_TOKEN_QA
   ```
   For a single account, `CF_ACCOUNT_ID`/`CF_API_TOKEN` alone is enough —
   leave the `_QA` pair unset, no "QA missing" warning, no second slot
   expected.

   **Any number of accounts** — set `CF_ACCOUNTS` in `wrangler.jsonc`'s
   `vars` to a JSON array of `{label, accountId}` pairs, then one secret per
   label, named `CF_API_TOKEN_<LABEL>` (label uppercased, non-alphanumeric
   characters replaced with `_`):
   ```jsonc
   "vars": {
     "CF_ACCOUNTS": "[{\"label\":\"prod\",\"accountId\":\"...\"},{\"label\":\"corp-dev\",\"accountId\":\"...\"}]"
   }
   ```
   ```
   npx wrangler secret put CF_API_TOKEN_PROD
   npx wrangler secret put CF_API_TOKEN_CORP_DEV
   ```
   `CF_ACCOUNTS`, when set, takes over from `CF_ACCOUNT_ID`/`CF_API_TOKEN`
   (+ `_QA`) entirely — those two remain supported as the fallback for
   existing deployments that haven't set `CF_ACCOUNTS`, so upgrading is
   optional, not required.

7. **Deploy**
   ```
   npx wrangler deploy
   ```

8. **(Optional) Configure subnets to scan directly by CIDR**, beyond whatever
   DNS records get pulled in step 9. Origins outside every configured subnet
   still get scanned automatically as "extra" targets, so this step is only
   needed if you want exhaustive address-by-address CIDR sweeps of your own
   network ranges.
   ```
   npx wrangler d1 execute pq-radar --remote --command \
     "INSERT INTO subnets (cidr, label, enabled) VALUES ('YOUR.CIDR.HERE/24', 'label', 1)"
   ```

9. **First run**: visit `/readiness` on your deployed Worker, unlock with the
   `TRIGGER_SECRET` you set in step 5, click **"Pull zones from Cloudflare"**
   to sync your DNS records, then **"Run full scan"**.

## Custom domain (optional)

`wrangler deploy` only ever gives you a `*.workers.dev` URL by default —
and on a company account, `workers.dev` may be blocked by policy outright.
To reach something like `pqradar.yourcompany.com` instead:

- Add the domain in the dashboard under the Worker's **Settings → Domains &
  Routes**, or as a `routes` entry in `wrangler.jsonc`.
- Needs **Workers Routes — Edit** on the setup token (the conditional
  permission from [Two tokens, two jobs](#two-tokens-two-jobs)).
- The zone has to live on the same Cloudflare account you deployed the
  Worker into.

Attaching a domain adds a DNS record to that zone — on a shared/production
zone, that's often the one step here that needs someone else's sign-off, so
plan for it rather than being surprised by it.

## Authentication for shared/company deployments

`TRIGGER_SECRET` is one shared string pasted into a login screen — fine
solo, but thin for a shared deployment: no per-user identity, no audit
trail, and this app's data is a map of every origin IP behind your CDN,
which is genuinely sensitive reconnaissance information.

**Recommended for a shared deployment: Cloudflare Access, restricted to
named individuals**, in front of the Worker's web UI — zero auth code on
your side.

- No identity-provider integration required: use a **one-time PIN** policy.
  A visitor enters their work email, Cloudflare emails a six-digit code,
  they're in.
- Restrict to **specific email addresses**, not the whole domain — in the
  policy, use the **Emails** selector (not "Emails ending in") and list
  people by address. Anyone else is refused, even a valid company address.
  An **Access Group** (a named, reusable list) makes onboarding/offboarding
  a single edit instead of hunting through every policy.
- Free tier covers up to 50 users. If you later add a real IDP, swap the
  policy from one-time PIN to it without touching any code here.
- Leave `TRIGGER_SECRET` in place on the API endpoints the cron and any
  scripts call — Access sits only in front of the human-facing UI, and the
  two coexist cleanly.

Skip building a username/password login of your own — that means storing
and hashing credentials and managing sessions, which is more work than the
shared secret it would replace, and still no real per-user identity. One
honest limit of PIN-only worth knowing: it proves mailbox control, not
active employment, so someone who's left the company but still has mailbox
access could still get in — an acceptable tradeoff for an internal
dashboard, but worth knowing rather than assuming.

## Local testing without a full deploy

`container/test-*.json` are standalone request bodies for exercising the
probe container directly (not wired into any script — nothing in the app
references them by name). They use public test targets
(`cloudflare.com`, `badssl.com`, the reserved `192.0.2.1` documentation
range) so they're safe to run as-is.

## Standalone CLI (no Cloudflare account needed)

Prefer not to deploy the Worker at all? `container/scan.py` runs the exact
same TLS handshake classifier as the hosted tool, in a small Docker image,
against your own domains or CIDR ranges — no account, no cloud dependency,
just OpenSSL 3.5 in a container. Pull the published image directly:

```
docker run --rm ashishmgupta/pqradar example.com
docker run --rm ashishmgupta/pqradar example.com api.example.com 10.0.0.0/24
docker run --rm -v "$(pwd):/data" ashishmgupta/pqradar --file /data/targets.txt --out /data/report.json
```

Or build it yourself from source instead of pulling:
```
docker build -f container/Dockerfile.cli -t pqradar container/
docker run --rm pqradar example.com
```

Targets are positional and auto-classified — a hostname or a CIDR/IP, mixed
freely in one run. `--file` reads one target per line (`#` comments and
blank lines ignored). Every result is labeled by leg: a hostname target
resolves through DNS like a browser would, so a CDN-fronted host is scanned
at its **edge**, not its origin; a bare IP or CIDR entry connects directly,
so that leg is the **origin** itself.

`--out` writes a report instead of printing JSON to stdout — `.html` for a
dark-mode report (compliance %, PQ/not-PQ breakdown, and the OpenSSL
command + raw response per target), anything else for JSON:
```
docker run --rm -v "$(pwd):/data" ashishmgupta/pqradar example.com --out /data/report.html
```

v1 is TLS/HTTPS on port 443 only — SSH and FTPS aren't wired into the CLI
yet (the hosted Worker path covers those).

See [docs/docker-guide.html](docs/docker-guide.html) for the step-by-step
walkthrough, including publishing your own build to Docker Hub.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
