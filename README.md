# The Daily Roll — Local MVP

A browser-based prototype for testing the customer acquisition, $500 program purchase, attendance-back, rewards, parent/kid views, and peer-voted MVP workflow.

## Run locally

Requires Node.js 20.19+ or newer.

Option A — simplest:

```bash
npx vite --host localhost
```

Then open http://localhost:5173

Option B — Python only:

```bash
python -m http.server 5173
```

Then open http://localhost:5173

## Included

- Public program selection with day/time availability
- $500 program purchase simulation
- $100 attendance-back model
- $50 child reward allocation model
- Parent dashboard
- Kid dashboard
- Player photo upload stored locally in browser
- Peer MVP voting (one vote per child in demo)
- Manager MVP tally and override
- Session/attendance simulation
- LocalStorage persistence
- No real payment processing
- No video integration
- No production privacy/legal controls

## Next phase

Connect the data model to a real backend, authentication, payment provider, email/SMS, receipt OCR, and eventually AI video processing.
