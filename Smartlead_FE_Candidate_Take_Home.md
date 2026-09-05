# The Send Console
## Senior Frontend Engineer — Take-Home Challenge

**Company:** Smartlead.ai
**Timebox:** ~4–5 hours
**Scope:** Frontend only
**Stack:** Your choice

---

## 1. The Brief

Smartlead sends cold-outreach email at scale. An operator may be looking at thousands of scheduled emails and dozens of sending mailboxes while the underlying system changes continuously.

Your task is to build a small operations console that helps a human:

- understand what is happening,
- find the right mailbox, campaign, or recipient,
- investigate why something is not progressing,
- take corrective action safely,
- and continue working when the system is slow, stale, or partially failing.

This is not a Figma reproduction exercise. We intentionally leave parts of the product behaviour open so you can make the decisions you think are right.

---

## 2. What You're Building

Create a new frontend repository from scratch, using whatever stack, framework, and tooling you're most comfortable with. There is no starter code and no design file — you own the architecture, the information hierarchy, and the interaction choices end to end.

Your application will talk to a backend API we expose (details below) that simulates a live sending system: mailboxes, campaigns, scheduled emails, and a stream of events.

### Representative Data

The default dataset contains roughly:

- 50 mailboxes,
- 10 campaigns,
- 50,000 scheduled emails.

Assume the dataset can grow significantly beyond this.

### Domain Model

#### Email

```text
id
campaign_id
mailbox_id
recipient
subject
scheduled_at
status
attempts
next_retry_at
last_error
```

Possible statuses include:

```text
pending
sending
retrying
sent
failed
dead
```

#### Mailbox

```text
id
email_address
hourly_limit
sent_last_hour
pending_count
paused
throttled_until
```

#### Campaign

```text
id
name
pending
sending
retrying
sent
dead
```

#### Event

```text
timestamp
entity_id
type
payload
```

---

## 3. API Surface

The backend exposes an API similar to:

```text
GET   /stats

GET   /mailboxes
GET   /mailboxes/:id
PATCH /mailboxes/:id

GET   /emails
GET   /emails/:id
POST  /emails/:id/retry

GET   /campaigns

GET   /events
```

The email and mailbox list endpoints support typical query parameters such as:

```text
page
limit
search
status
mailbox_id
campaign_id
sort
```

Build whatever client-side data layer you think best fits the problem. Do not turn this into a backend exercise — treat the API as given.

---

## 4. Reality of the System

Treat the following as normal conditions:

- data changes while the operator is viewing it,
- requests can be slow or fail,
- a corrective action may take time to confirm,
- the dataset is too large to load entirely into the browser.

Your interface should remain understandable and trustworthy under these conditions. Pick one or two of these to handle with real rigor rather than spreading thin effort across all of them.

---

## 5. The Product Problem

Build two connected screens:

1. **Mailboxes screen** — a browsable list of mailboxes with search, filtering, and sorting, plus a way to see one mailbox's detail (why it's paused/throttled, what's queued on it).
2. **Emails screen** — a browsable list of scheduled emails with search, filtering, and sorting across tens of thousands of rows, plus a way to see one email's detail (its status history, why it's stuck, what happens next).

From either screen, an operator should be able to take at least one corrective action (e.g. retrying an email, pausing/unpausing a mailbox) and clearly see whether it worked.

Beyond that, we're deliberately not specifying layout, exact filters, status hierarchy, or error presentation — make the decisions you believe produce the best operator experience.

---

## 6. The Bar

Build the console you'd actually want to operate if you were the one on the hook for a stalled campaign at 2am, working within the constraints described above (scale, latency, live state, partial failure).

Judge your own solution honestly: would it hold up under a large dataset, a flaky network, and a system that keeps changing underneath the person using it? If not, that's where your remaining time should go — not toward extra screens.

---

## 7. What Not to Spend Time On

Please do not spend significant time on:

- authentication,
- permissions,
- account setup,
- OAuth,
- campaign creation,
- email copy editing,
- a custom design system,
- backend worker logic,
- large analytics dashboards,
- decorative visualizations,
- pixel-perfect reproduction of Smartlead.

---

## 8. Deliverables

Submit a Git repository or zip containing:

### Source Code

Everything required to install dependencies and run the application locally, pointed at the API we provide.

### README

Document your project the way you'd document it for a team picking it up cold — setup, how to run it, and anything else you think a reader needs. How you structure it is up to you.

### Video Walkthrough

Record a video (unlisted YouTube, Loom, or similar link) walking through the running application and your reasoning behind it. Use it to cover things like:

- a demo of the core flows,
- the product and technical assumptions you made where the brief was open-ended,
- how you approached state management and the trickier async/race-condition cases,
- what you'd cut, change, or do differently with more time.

There's no fixed length — take the time you need to explain your thinking clearly.

---

— The Smartlead Engineering Team
