# Send Console

An operations console for Smartlead's sending system: browse mailboxes and scheduled emails at scale, see why something is stuck, and take corrective action (retry an email, pause/unpause a mailbox) with clear confirmation of whether it worked.

Built for the Senior Frontend Engineer take-home. This README covers setup, the decisions made where the brief was open-ended, and what's still missing.

## Running it

```bash
npm install
npm run dev       # http://localhost:5173
```

Requires the real backend — see "Pointing it at the real API" below.

Other scripts:

```bash
npm run build      # typecheck + production build
npm run test        # unit tests (vitest)
npm run lint        # eslint
```

### Pointing it at the real API

This console pairs with a real backend: [`SmartLead.ai BE`](../SmartLead.ai%20BE.ai) (the Send Worker take-home, with a lightweight operator API layered on top — see that repo's README, "Lightweight Operator API").

**Live demo:** `http://184.193.207.246:4000` (temporary EC2 box — see that repo's `deploy/DEPLOYMENT.md` for what's provisioned and how to tear it down). To point this FE at it:

```bash
cp .env.example .env
# edit .env:
VITE_API_BASE_URL=http://184.193.207.246:4000
```

To run the BE yourself instead:

```bash
npm run migrate
npm run seed -- --reset --emails=50000 --campaigns=10 --mailboxes=50
npm run api      # :4000 — what the FE talks to
npm run worker   # advances state; without it, everything stays "pending" forever
```

The BE's domain model doesn't map one-to-one onto this FE's — its lightweight API derives or additively backs everything, so from this FE's side it's the same `/mailboxes`, `/emails`, `/campaigns`, `/events` surface either way.

## What's here

Two connected screens, per the brief:

- **Mailboxes** (`/mailboxes`) — searchable/filterable/sortable list with live stats (sent-vs-limit, queued count, throttle countdown), and a detail view (`/mailboxes/:id`) with a plain-language "why is it in this state" explanation, what's queued on it, and a pause/unpause action.
- **Emails** (`/emails`) — a virtualized list across all 50,000+ rows with server-side search/filter/sort, and a detail view (`/emails/:id`) with attempts, last error, a "what happens next" explanation, a status-history timeline, and a retry action.

Both screens cross-link (a mailbox chip on an email jumps to that mailbox; a mailbox's queue links into the filtered Emails view).

## Architecture

```
src/
  api/         Single fetch client (index.ts): timeout, GET retry/backoff, and
               zod response validation. The only thing every query hook imports.
  types/       zod schemas + inferred TS types (domain.ts) and request/list-param
               shapes (api.ts) — single source of truth for the domain model.
  queries/     React Query hooks. Polling intervals, optimistic updates,
               rollback-on-error, and the SSE subscription live here —
               components never touch the API client directly.
  routes/      The four screens (Mailboxes/Mailbox detail/Emails/Email detail).
  components/  Reusable UI: DataTable, StatusBadge, Timeline, Toast,
               ConfirmDialog, FreshnessIndicator.
  common/      constants/index.ts — poll intervals, page sizes, and other
               tunables read from one place instead of duplicated per file.
  utils/       Small hooks and helpers: debounce, relative-time formatting,
               visibility tracking, a tiny external store.
```

**Stack:** React + TypeScript + Vite, React Router, TanStack Query (server state, polling, optimistic mutations), TanStack Table + TanStack Virtual (the 50k-row table), Tailwind + Radix primitives, zod (response validation), Vitest.

`EmailsPage`'s filters/sort/page are synced to the URL (`useSearchParams`), so links built elsewhere — e.g. the mailbox detail page's per-campaign rows — actually filter, and refreshing preserves the view. `MailboxesPage` keeps this state component-local; see "What I'd cut" below.

**Why this shape:** the goal was to make the data layer (correctness under scale/latency/partial failure) load-bearing and well-tested, and keep the UI thin on top of it. `queries/emails.ts` and `queries/mailboxes.ts` do the actual work the brief cares about — route components mostly just render what those hooks hand them.

## Design decisions

The brief asks to pick one or two of the "reality" conditions (scale, latency/failure, live state, partial failure) and go deep on those rather than spreading thin. I chose:

**Scale.** With "50,000 rows, assume it grows significantly," the constraint is: never hold the full dataset in the browser, never sort/filter it client-side.
- Every list request is server-side paginated/filtered/sorted — the client only ever holds one page.
- The emails table is windowed (`@tanstack/react-virtual`) — DOM node count stays constant regardless of dataset size.
- Search is debounced (300ms) before it becomes a request.
- The mailbox queue breakdown (by campaign/recipient) is a true server-side aggregate (`GET /mailboxes/:id/queue-summary`), not a client-side reduce over a couple of paginated fetches — see "Bugs found & fixed" for why that distinction mattered in practice.

**Live state & trustworthy actions.** Mutations (`retry`, `pause`/`unpause`) use React Query's optimistic-update pattern: the UI reflects the *intended* state immediately, but that's explicitly not the same as claiming success — the mutation's own response and the next poll/push both have to agree before anything is presented as done. A failed mutation rolls back and shows an error toast, not a false positive.
- List/detail views poll (visibility-aware) with a persistent "Updated Ns ago" indicator, so staleness is always visible rather than masquerading as live truth.
- Against the real backend, an app-wide SSE subscription (`useEventStream`) is the primary update mechanism — ~875ms end-to-end for a change made outside the tab, versus 8–45s for poll-only — with polling widened afterward as a fallback (e.g. the emails list: 8s → 45s), not the thing doing the work. Push also scales with concurrent viewers better than polling: one DB listener fans out to any number of open tabs, instead of each tab running its own poll loop against the same endpoint.
- I deliberately didn't build deep resilience for raw request failure beyond the essentials: timeout, one bounded retry-with-backoff on GETs, no auto-retry on mutations, and typed error states with a manual retry affordance. Conscious tradeoff — see "What I'd cut."

**State management: React Query over Redux/Zustand.** The hard problems here — cache invalidation, polling, retry/backoff, optimistic updates with rollback, request de-duplication — are exactly what it's built for.

**The race I cared about:** optimistic update vs. the next poll landing before the mutation resolves. Every mutation cancels in-flight queries for the affected keys before writing the optimistic value, so a slow background poll can't overwrite it with stale data, and reconciles with the mutation's own response in `onSuccess` rather than trusting the optimistic value indefinitely.

**What I didn't solve:** true multi-operator conflict (two people acting on the same mailbox at once) converges eventually via poll/push reconciliation, but there's no explicit "someone else changed this" signal — out of scope for a single-operator-workflow brief; see "What I'd cut."

## Assumptions

Written originally against no real API — the brief describes the surface as "similar to" a spec, not a literal contract. Every response shape, sort convention, and mutation-ack behavior was a documented guess, isolated behind `src/api/index.ts` and `src/types/domain.ts` so the rest of the app wouldn't need to change once a real backend existed. Running against the real one confirmed every guess correct without changing either file:

- `/mailboxes` and `/emails` return `{ items, page, limit, total }`; `/campaigns` and `/events` return plain arrays.
- `/events?entity_id=&limit=` scopes a timeline to one entity.
- `POST /emails/:id/retry` acks into `retrying`, not an immediate final outcome.
- `PATCH /mailboxes/:id` accepts `{ paused: boolean }`.
- Sort params use a `-field` / `field` (desc/asc) convention.

## Testing & verification

`npm run test` — focused, not exhaustive:
- `src/utils/format.test.ts` — relative-time formatting and mailbox health-state priority (paused > throttled > active).

Beyond `tsc -b`, `vitest run`, and `npm run build`, I drove the running app end-to-end in headless Chromium against the real backend (search/filter/sort, pause/unpause, retry, both detail pages) to visually confirm each state, not just that the build succeeds. That pass is what surfaced the bugs below.

## Bugs found & fixed

**Queued list mixed in wrong statuses.** "Queued" means pending-or-retrying, but the API filters on one status at a time. The original client-side merge of two paginated fetches let `sent`/`dead` emails leak into the "queued" view. Fixed by querying both statuses and merging — later replaced entirely by a server-side aggregate (below).

**SSE invalidation storm.** The first `useEventStream` implementation invalidated on every pushed message, one-to-one — fine for a sparse operator action, not for a worker resuming a mailbox with a real backlog: measured **98 `/stats` requests in 4 seconds** from a single click. Fixed with a 1-second batching window — messages update a small set of "what needs refreshing" flags, and one timer flushes them at most once per second. Re-measured against the same burst (996 queued emails): 2 requests total.

**Silent mutation failure — pause did nothing.** Found only against the real backend: pausing a mailbox from its own detail page did nothing — no request, no error, no toast.

```ts
queryClient.setQueriesData({ queryKey: ['mailboxes'] }, (old) => {
  if (!old) return old
  return { ...old, items: old.items.map(...) }   // crashes if `old` has no `.items`
})
```

`['mailboxes']` matches by prefix — it hits every cached list page *and* the single-mailbox detail query, which has no `.items`. Whenever that mailbox's own detail page was open (exactly when you'd click its pause button), `.items.map` threw inside `onMutate`, which fails silently before any request is sent. My earlier test passes never caught it because they always paused from the list page first. Fixed two ways: an `Array.isArray(old.items)` guard as an immediate patch, then restructuring `queryKeys` so list and detail keys are disjoint prefixes (`['mailboxes','list',...]` vs `['mailboxes','detail',id]`) — removing the hazard structurally instead of trusting every call site to remember the guard.

**Queue breakdown wrong at scale, not just imprecise.** The mailbox queue breakdown was computed client-side from a 100-row cap (50 pending + 50 retrying). The "sample of X of Y" disclosure was honest about the *count*, but on a real, busy mailbox (432 queued) the campaign *ranking* built from a 59-row sample put the wrong campaign in first place — the true top campaign (66 emails) wasn't even the sample's top pick (48, third place). A partial sample can't be patched into a correct ranking. Fixed by adding a true server-side aggregate (`GET /mailboxes/:id/queue-summary`, `GROUP BY campaign_id` over every queued row) and pointing the UI at it.

## What I'd cut, change, or do next

- **URL-sync filters on `MailboxesPage`** — `EmailsPage` has this now; `MailboxesPage` doesn't, since nothing currently deep-links into it. The same failure mode would appear the moment something does.
- **Multi-operator awareness** — a lightweight "changed by someone else since you loaded it" signal, using `/events` as a changefeed.
- **Bulk actions** (retry-all-failed-in-campaign, pause-all-throttled) — out of scope for "at least one corrective action," but the natural next ask.
- **Column virtualization / server-driven column config** if the email schema grows.
- **A broader audit for the query-key-prefix bug class** — now that `setQueriesData` on a shared prefix is a known footgun, worth grepping for every other place it could recur.

## Video walkthrough

[link here]
