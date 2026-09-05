# Send Console

An operations console for Smartlead's sending system: browse mailboxes and scheduled emails at scale, see why something is stuck, and take corrective action (retry an email, pause/unpause a mailbox) with clear confirmation of whether it worked.

Built for the Senior Frontend Engineer take-home. This document explains how to run it, the decisions made where the brief was intentionally open, and what's still missing.

## Running it

```bash
npm install
npm run dev       # http://localhost:5173
```

That's it — **no backend setup required**. By default the app runs entirely against a schema-accurate, in-browser mock backend (via [MSW](https://mswjs.io)), seeded with 50 mailboxes, 10 campaigns, and 50,000 scheduled emails, with a background simulator that continuously advances state (sends complete, retries resolve, mailboxes throttle) so the "live system" behavior is real, not just described.

### Pointing it at the real API

This console is paired with a real backend: [`SmartLead.ai BE`](../SmartLead.ai%20BE.ai), the Send Worker take-home, with a lightweight operator API layered on top of it (see that repo's README, "Lightweight Operator API" section, for the full story of what was added and why).

**Live demo deployment:** the BE is currently running on EC2 at `http://184.193.207.246:4000` (see that repo's `deploy/DEPLOYMENT.md` for what's provisioned and how to tear it down — it's a temporary demo box, not meant to stay up indefinitely). To point this FE at it:

```bash
cp .env.example .env
# edit .env:
VITE_API_BASE_URL=http://184.193.207.246:4000
VITE_USE_MOCK=false
```

To run the BE yourself instead (locally, or your own deployment):

```bash
# in the BE repo: start Postgres, migrate, seed, then run both processes
npm run migrate
npm run seed -- --reset --emails=50000 --campaigns=10 --mailboxes=50
npm run api      # :4000 — what the FE talks to
npm run worker   # actually advances state; without this everything stays "pending" forever

# in this repo, point .env at wherever that's running (localhost:4000 if local)
```

Restart `npm run dev`. Setting `VITE_API_BASE_URL` automatically disables the mock — the mock module (and its `faker`/`msw` dependencies) is dynamically imported only when needed, so it isn't even in the bundle when pointed at a real backend (confirm with `npm run build`: you'll see it split into its own chunk).

The BE's domain model doesn't map one-to-one onto this FE's (no `retrying` status, no campaign names, no mailbox pause/throttle fields, no event log) — the BE's lightweight API derives or additively backs all of it; see its README for exactly how. From this FE's side, none of that is visible — it's the same `/mailboxes`, `/emails`, `/campaigns`, `/events` surface either way.

Other scripts:

```bash
npm run build      # typecheck + production build
npm run test        # unit tests (vitest)
npm run lint        # eslint
```

## What's here

Two connected screens, per the brief:

- **Mailboxes** (`/mailboxes`) — searchable/filterable/sortable list with live-ish stats (sent-vs-limit, queued count, throttle countdown), and a detail view (`/mailboxes/:id`) with a plain-language "why is it in this state" explanation, what's queued on it, and a pause/unpause action.
- **Emails** (`/emails`) — a virtualized list across all 50,000+ rows with server-side search/filter/sort, and a detail view (`/emails/:id`) with attempts, last error, a "what happens next" explanation, a status-history timeline, and a retry action.

Both screens cross-link (a mailbox chip on an email jumps to that mailbox; a mailbox's queue links into the filtered Emails view), and a top-bar **Network** control lets you dial the mock's latency/failure rate (`clean` / `normal` / `degraded`) to see the resilience behavior on demand instead of hoping for a flaky request during a demo.

## Where I chose to go deep vs. shallow

The brief explicitly asks to pick one or two of the "reality" conditions (scale, latency/failure, live state, partial failure) and handle them with real rigor rather than spreading thin. I chose:

**1. Scale.** With "50,000 rows, assume it grows significantly," the non-negotiable constraint is: never hold the full dataset in the browser, and never sort/filter it client-side.
- Every list request is server-side paginated/filtered/sorted (`page`, `limit`, `search`, `status`, `mailbox_id`, `campaign_id`, `sort`) — the client only ever holds one page.
- The emails table is windowed with `@tanstack/react-virtual`: the DOM node count is constant whether there are 50 rows or 50,000, so the render cost doesn't scale with dataset size.
- Search is debounced (300ms) before it becomes a request, so typing doesn't fan out a request per keystroke against a large table.
- The mailbox detail page's "queued" breakdown (by campaign / by recipient) is a true server-side aggregate too (`GET /mailboxes/:id/queue-summary`, a real `GROUP BY` in Postgres), not a `reduce` over a couple of paginated fetches. See "A third bug" under Verification for why that distinction turned out to matter in practice, not just in principle.

**2. Live state & trustworthy corrective actions.** An operator paused a mailbox — did it actually happen, or did the click just... happen? The brief specifically flags that confirmation "may take time."
- Mutations (`retry`, `pause`/`unpause`) use React Query's optimistic-update pattern: the UI reflects the *intended* state immediately (e.g., a row flips to "Retrying…"), but that's explicitly not the same as claiming success — the mutation result and the next poll both have to agree before anything is presented as done. A failed mutation rolls back the optimistic change and shows an error toast, not a false positive.
- List and detail views poll (visibility-aware — polling pauses when the tab isn't focused) with a persistent "Updated Ns ago" / "Refreshing…" indicator, so the operator always has a trust signal for how current the view is, rather than a static snapshot masquerading as live truth.
- The mock backend models retry as async-with-delay (acks into `retrying`, resolves to `sent`/`failed`/`dead` a few seconds later via its own background tick) specifically so this eventual-consistency path is real and demoable, not simulated by a `setTimeout` in the UI layer.
- Against the real backend, polling is a *fallback*, not the primary mechanism: `src/queries/useEventStream.ts` holds one app-wide `EventSource` subscription to the API's `GET /events/stream` (Server-Sent Events), fed by a Postgres `LISTEN`/`NOTIFY` trigger on the `events` table (see the BE repo's `migrations/009_events_notify.sql` and `src/api/eventStream.js`) that fires on every insert from *either* the worker process or the API process. On a pushed event, the relevant React Query keys are invalidated shortly after — measured at ~875ms end-to-end for a change made completely outside the browser tab, versus the 8-45s a poll-only approach would've taken to notice. Poll intervals were deliberately widened afterward (e.g. the emails list: 8s → 45s) since they're now just the bounded-staleness safety net if the push connection drops, not the thing doing the work. This was a deliberate choice over the more common "just poll faster" fix: polling doesn't scale with *concurrent viewers* (50 open tabs means 50 independent 8s loops hitting the same endpoint, most returning "nothing changed"), where push fans out from one DB listener regardless of how many browsers are watching.
  - **The bug this shipped with, briefly:** the first version invalidated on *every* pushed message, one-to-one. That's fine for a sparse operator action, but the worker isn't sparse — resuming a mailbox with a real backlog lets it claim/send/fail many emails per second, each one its own `events` row, each one its own push. Measured against a live resume click: **98 `/stats` requests in 4 seconds** from a single click. The fix is a 1-second batching window in `useEventStream` — every message updates a small set of "what needs refreshing" flags, and a single timer flushes them at most once/second regardless of how many messages arrived in between. Re-measured against the identical burst (a mailbox with 996 queued emails): 2 requests total, flat thereafter. This is the same lesson as the scale work above, just discovered on the push side instead of the poll side: naive real-time updates don't survive contact with a bursty backend any better than naive polling does.

I deliberately did **not** build deep resilience for raw request failure beyond the essentials (timeout, one bounded retry-with-backoff on GETs, no auto-retry on mutations, typed error states with a manual retry affordance, and the "Network: degraded" control to make it demonstrable). That's a conscious tradeoff, not an oversight — see "What I'd do next."

## Architecture

```
src/
  api/         Thin fetch client (http.ts) + typed endpoint functions (endpoints.ts).
               All responses are parsed through zod — the API is treated as
               untrusted at the boundary, not cast with `as`.
  types/       zod schemas + inferred TS types — single source of truth for the
               domain model (Email, Mailbox, Campaign, Event).
  queries/     React Query hooks. This is where polling intervals, optimistic
               updates, and rollback-on-error live — components never touch
               the API client directly.
  routes/      The four screens (Mailboxes/Mailbox detail/Emails/Email detail).
  components/  Reusable UI: VirtualTable, StatusBadge, Timeline, Toast,
               ConfirmDialog, FreshnessIndicator.
  mocks/       The in-browser mock backend (MSW): seed data generation,
               a live-state simulator (tickSimulation), chaos controls, and
               the request handlers. Only loaded when VITE_USE_MOCK is active.
  utils/       Small framework-agnostic helpers: debounce, relative-time
               formatting, a tiny external store for the chaos toggle.
```

**Stack:** React + TypeScript + Vite, React Router (screen-to-screen navigation), TanStack Query (server state, polling, optimistic mutations), TanStack Table + TanStack Virtual (the 50k-row table), Tailwind + Radix primitives (dialog/dropdown/toast — accessible behavior without hand-building a design system), zod (response validation), Vitest (unit tests).

Filter/sort/page state in `EmailsPage` is synced with the URL (`useSearchParams`), so a link built elsewhere with query params — e.g. the mailbox detail page's per-campaign rows — actually filters, and a refresh or shared link preserves the view. `MailboxesPage` still keeps this state component-local — see "What I'd cut, change, or do next".

**Why this shape:** the goal was to make the "hard part" (data layer correctness under scale/latency/partial failure) load-bearing and well-tested, and keep the UI layer thin on top of it. Concretely: `queries/emails.ts` and `queries/mailboxes.ts` are the two files doing the actual work the brief cares about; the route components mostly just render what those hooks hand them.

## Assumptions

This was originally written against no real API — the brief describes the surface as "similar to" a list of endpoints, not a literal contract, and no base URL was available while building. Every response shape, sort convention, and mutation-acknowledgment behavior below was a documented guess, isolated behind `src/api/endpoints.ts` and `src/types/domain.ts` specifically so the rest of the app wouldn't need to change once a real backend existed.

It now runs against a real one (see "Pointing it at the real API" above), which confirmed every guess correct without changing either file:

- `/mailboxes` and `/emails` return `{ items, page, limit, total }`; `/campaigns` and `/events` return plain arrays.
- `/events?entity_id=&limit=` scopes a timeline to one email/mailbox — confirmed against a real, persisted event log (the BE added one specifically for this).
- `POST /emails/:id/retry` acks with the email in a `retrying` state, not an immediate final outcome — confirmed against real async resolution (the BE's worker picks the row back up on its own claim cycle).
- `PATCH /mailboxes/:id` accepts `{ paused: boolean }`.
- Sort params use a `-field` / `field` (desc/asc) convention.

The one thing that *did* need a real backend to surface — not a wrong assumption, but a real bug — is below.

## State management & the trickier cases

- **Why React Query over Redux/Zustand for server state:** the hard problems here (cache invalidation, polling, retry/backoff, optimistic updates with rollback, request de-duplication, stale-while-revalidate) are exactly what it's built for, and hand-rolling them is where subtle bugs live.
- **Filters used to live in component state only, not the URL — this turned out to be a real, concrete bug, not just a hypothetical gap.** The bar I designed for: an operator debugging a stalled campaign at 2am wants to paste a link ("emails, mailbox X, status failed") into a Slack thread, and wants back/forward to behave like navigation instead of losing their filters. What originally shipped only cleared the lower bar — filters/sort/page worked fine while you stayed on the page, but a link built *elsewhere* (the mailbox detail page's per-campaign row links, "View all in Emails →") silently did nothing: `EmailsPage` never read its own URL's query string, so `/emails?mailbox_id=mb_8&campaign_id=cp_7` rendered the identical unfiltered 50k-row list as `/emails` with no params at all — a dead-end link, not a cosmetic gap. Caught by clicking through those exact links against the real backend and noticing two different campaigns produced the same result set. Fixed by seeding filter/sort/page state from `useSearchParams` on load and syncing it back on every change (`replace: true`, so filtering doesn't spam browser history). `MailboxesPage` has the identical component-local pattern and hasn't hit this yet only because nothing currently deep-links into it with query params — it would need the same fix the moment that changes.
- **The race I actually cared about:** optimistic update vs. the next poll landing before the mutation resolves. Handled by having every mutation cancel in-flight queries for the affected keys before writing the optimistic value (`queryClient.cancelQueries`), so a slow background poll can't overwrite the optimistic state with stale data, and by reconciling with the mutation's own response in `onSuccess` rather than trusting the optimistic value indefinitely.
- **What I didn't fully solve:** true multi-operator conflict (two people acting on the same mailbox at once) — the optimistic-update + poll-reconciliation pattern will eventually converge and show the real state, but there's no explicit "someone else changed this" toast. Given the two-screen, single-operator-workflow scope of the brief, I judged this out of scope for the time budget; see below.

## Testing

`npm run test` — focused rather than exhaustive, given the timebox:
- `src/utils/format.test.ts` — relative-time formatting and mailbox health-state derivation (paused takes priority over throttled, etc.) — small pure functions, but exactly the kind of off-by-one/priority bug that's easy to get subtly wrong and hard to notice visually.
- `src/mocks/store.test.ts` — the mock backend's state machine: retry is rejected for `sent`/`sending`, and — this is the one that actually caught a real bug during development — a mailbox's queued-count doesn't get double-counted or under-counted when an email moves between `dead`/`failed`/`retrying`/`sent`. This class of bug (a counter drifting slowly out of sync with reality) is the kind that wouldn't show up in a quick manual click-through but would erode trust in the console over a long session.

## Verification

Beyond `tsc -b`, `vitest run`, and `npm run build`, I drove the running app end-to-end in headless Chromium (search/filter/sort on both screens, pause/unpause with the confirm dialog, retry with its optimistic state, both detail pages, and the Network preset switcher) to check for console errors and visually confirm each state — not just that the build succeeds. Against the mock, that pass caught and fixed one real bug: a mailbox's "queued" list was showing `sent`/`dead` emails alongside `pending`/`retrying` ones because the single-status filter couldn't express "pending OR retrying" — fixed by querying both and merging client-side.

### A second, more interesting bug — found only against the real backend

Re-running the same click-through against the real API (not the mock) surfaced a silent failure the mock never could have: **pausing a mailbox from its own detail page did nothing** — no request, no error, no toast, just a dialog that closed. Root cause, in `useToggleMailboxPause` (and identically in `useRetryEmail`):

```ts
queryClient.setQueriesData({ queryKey: ['mailboxes'] }, (old) => {
  if (!old) return old
  return { ...old, items: old.items.map(...) }   // crashes if `old` has no `.items`
})
```

`{ queryKey: ['mailboxes'] }` matches by *prefix* — it hits every cached list page (shape `{ items: [...] }`) **and** the single-mailbox detail query (`['mailboxes', id]`, shape: a plain `Mailbox` object, no `.items`). Whenever a mailbox's own detail page was open — which is exactly when you'd click *its* pause button — that detail query was in cache, `.items.map` threw inside `onMutate`, and because `onMutate` throwing happens *before* the mutation function ever runs, the whole thing failed before a network request was ever made. No console error surfaced because React Query treats it as a normal (if silent) mutation failure path.

Why the mock never caught this: my own test script's first pass always paused from the *list* page, in a fresh browser with no detail query cached yet — the buggy branch was never exercised. It only reproduced once I drove the app in the shape a real operator actually would (open a mailbox, pause it from there). Fixed by guarding the updater with `Array.isArray(old.items)` in both hooks, so a non-list-shaped cache entry is left untouched instead of crashing. This is the argument, made concrete, for why "run it against something real" earns its place over more mock-driven testing: the bug wasn't in the mock's fidelity, it was in a query-key prefix match I'd reasoned about only in the abstract.

### A third bug — an aggregate that silently stopped being one at scale

The mailbox detail page's "queued" breakdown (by campaign / by recipient) was computed client-side: fetch page 1 of `status=pending` and page 1 of `status=retrying` (50 rows each), merge, then `reduce`/`slice` in the browser. That's exactly the client-side aggregation the "Scale" section above says never to do — it just didn't get caught earlier because every test mailbox during development had a queue small enough to fit inside that 100-row cap, so the sampling was invisible.

It surfaced against the real backend on a genuinely busy mailbox: `mailbox8@smartlead.test`, throttled, 432 emails queued. The UI honestly labeled itself "sample of 59 of 432" — the *count* disclosure was working exactly as designed — but the campaign ranking built from that same 59-row sample was wrong, not merely imprecise: it showed Campaign 2 as the largest (10 of the sample). The true per-campaign counts, computed server-side over all 432 rows, put **Campaign 7** on top (66) — Campaign 2 wasn't even close (48, third place). A "sample of X of Y" label is an honest disclosure about the *total*; it says nothing about whether a *ranking* built from that same sample is trustworthy, and here it wasn't.

Fixed by adding a real aggregate to the BE — `GET /mailboxes/:id/queue-summary`, a `GROUP BY campaign_id` query over every queued row for that mailbox, plus a `LIMIT`-based top-N for "next up" recipients — and pointing the mailbox detail page at it instead of the two paginated fetches. The recipient list is still intentionally a top-10 preview, but now honestly labeled as one ("432 queued · next 10 by schedule time") rather than implying it's a sample of everything; the campaign breakdown and total are now both exact.

## What I'd cut, change, or do next

- **URL-sync filters/sort/page on `MailboxesPage`.** `EmailsPage` now does this (see "State management" above) after the bug it caused; `MailboxesPage` still keeps filters in local-only state. Nothing links into `/mailboxes` with query params today, so it's lower priority than `EmailsPage` was, but the same dead-link failure mode exists the moment something does.
- **The real backend has no configurable chaos.** The mock's "Network: degraded" control has nothing to toggle against the real API — the worker's provider-failure rates are set at process start via env vars, not runtime-adjustable. I'd want a way to dial that live for a demo/test the same way the mock allows.
- **Multi-operator awareness** — a lightweight "this was changed by someone else since you loaded it" signal, using the `/events` stream as a changefeed rather than just a per-entity timeline.
- **Bulk actions** (retry-all-failed-in-campaign, pause-all-throttled) — explicitly out of scope for the brief's "at least one corrective action" bar, but the natural next ask from a real operator.
- **Column virtualization / server-driven column config** if the email schema grows — right now columns are fixed, which is fine at the current field count.
- **A broader audit for the same query-key-prefix bug class** — now that I know `setQueriesData` on a shared prefix is a footgun when different-shaped queries share it, I'd grep for every other place this pattern could recur before calling the data layer done, rather than trusting that I caught the only two instances.

## Video walkthrough

[link here]
