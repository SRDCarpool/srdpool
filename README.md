# Saathi — Ride Together 🚗

A friendly, mobile-first carpooling app **only for IT professionals**, on one commuter corridor:
**Sangareddy / Isnapur → Financial District / HITEC City.**

| Ride Takers see | Ride Givers see |
|---|---|
| Fixed routes and fixed fares only: **Sangareddy ₹150**, **Isnapur ₹120** per seat. Destination is always Financial District / HITEC City | A simple form: starting point, destination, date, time, seats, then **pickup points** in order. Passengers see it as one line, e.g. `9:00 AM Malkapur Chintal › SRD X Road › ORR › ICICI › Wipro Circle` |
| Route choice from Sangareddy: **Via Isnapur & ORR** or the alternative **Via Shankarpally**. Isnapur riders always use the ORR route | The app detects the route (ORR or Shankarpally) and starting area (Sangareddy or Isnapur) from what they type; they can correct it with one tap |

There is no rating system. Trust comes from OTP-verified phones, member verification, Ride Giver vehicle/licence verification, ride counts, cancellations and a reliability score.

The top of **Home** has an *I am currently a [Ride Taker] [Ride Giver]* switch.

### Breakdown help (moving passengers to other rides)

If a car has a problem during a live ride (flat tyre, engine trouble, accident, out of fuel…), the Ride Giver taps **Car trouble? Ask nearby Ride Givers for help** on the live ride screen.

1. The car is marked as stopped and passengers are told a seat is being found for them.
2. Saathi alerts Ride Givers whose rides **pass the breakdown spot, haven't passed it yet, are live or leave within 75 minutes, and have empty seats**. They see a red 🆘 card on Home and an alert with the spot on a map.
3. A helper taps **Offer seats**. Passengers are moved to the helper's ride automatically: a 🆘 pickup stop is added at the broken-down car, and each passenger is dropped at the helper's stop closest to where they were going. They pay the helper the same fare, and any earlier payment is refunded.
4. Passengers get the new car's colour, model and number plate. The first Ride Giver sees who helped, and can end the ride, or tap **Problem fixed — continue ride** if the car is repaired.

In demo mode, demo Ride Givers offer help after about 40 seconds, so real Ride Givers get the first chance.

### Member verification

Before booking or posting a ride, every member submits: **name, company name, place of work, designation, Ride Giver / Ride Taker / both, and an ID card picture**. An admin reviews it in *Admin dashboard → Verify*. The ID card image is stored separately from the member's record, is visible only to admins, and is **deleted the moment it is approved or rejected** (the audit log records the deletion). Verified members show a 🏢 company badge. Members can book and post while their verification is under review.

- **Frontend:** React + Vite, Leaflet maps with OpenStreetMap tiles
- **Backend:** Node.js (Express + WebSockets), SQLite via Node's built-in `node:sqlite` (no native installs)
- **Maps:** the two corridors are real road routes from OSRM; live GPS tracking along them

## Run it

```bash
npm install
npm run dev
```

This starts the API on `:8787` and the app on http://localhost:5173 (Vite proxies `/api` and `/ws`).
Use a phone-width window (or DevTools device mode).

**Login:** any 10-digit Indian mobile number. Without an SMS provider configured, the 6-digit OTP is shown on screen and printed in the API console.
Switch between Ride Taker and Ride Giver in **Profile**: takers get the *Find Ride* tab, givers get *Post Ride*.

Requires Node.js 22.5+ (for `node:sqlite`; tested on Node 24).

## Routes and fares

Defined in [`server/corridors.js`](server/corridors.js):

| Route | Path | Serves | Fare |
|---|---|---|---|
| Via Isnapur & ORR | Sangareddy → Kandi → Rudraram → Isnapur → Patancheru ORR → Financial District → HITEC City | Sangareddy, Isnapur | ₹150 / ₹120 |
| Via Shankarpally (alternative) | Sangareddy → Shankarpally → Mokila → Financial District → HITEC City | Sangareddy | ₹150 |

Fares are per seat, set by where the passenger boards, and charged by the server (Ride Givers don't set prices).
Ride Givers' typed pickup points are placed along the route using known landmarks (SRD X Road, Kandi, Isnapur, Patancheru, ORR, Kollur, Shankarpally, Mokila, ICICI, Wipro Circle, Financial District, Gachibowli, HITEC City…); unknown names are spaced evenly between them. To add landmarks or change fares, edit `LANDMARKS` / `FARES` in that file.

## How it works

| Area | Implementation |
|---|---|
| Auth | Mobile OTP (hashed, 5-min expiry, 5 attempts, 30 s resend limit, per-IP rate limits) → 90-day session token |
| Search | Passenger picks Sangareddy or Isnapur (+ route, date, optional time). Server returns rides on routes serving that origin, with the suggested boarding point and fixed fare |
| Booking | Passenger chooses where to board and get down from the Ride Giver's pickup points; total = fare × seats |
| Live tracking | The Ride Giver's phone streams GPS over WebSocket → snapped to the route → pushed only to confirmed passengers. Approaching/arrived/dropped notifications are server-side |
| Realtime | WebSocket per user: `sync` (refetch), `notification` (toast), `live` (car position) |
| Privacy | Number plates are masked until a booking is confirmed; live location only for confirmed riders; phone numbers never leave the server |
| Jobs | 1 s tick (simulated drives), 15 s housekeeping (expiry, reminders 30 min before departure) |
| Admin | Verification queue, reports, suspensions, listing removal, duplicate detection, audit log |

## Try these flows

| Flow | How |
|---|---|
| Ride Taker | Find Ride → *Isnapur ₹120* → open a ride (boarding defaults to the Isnapur stop) → *Request to book* (demo Ride Giver accepts in ~3 s) → *Demo: Ride Giver starts the ride* → live map → *I've boarded* → drop-off → pay |
| Alternative route | Find Ride → *Sangareddy* → *Via Shankarpally* |
| Ride Giver | Profile → switch to Ride Giver → add vehicle → Post Ride → type start, destination, time, seats and pickup points → *Post Ride* → a demo passenger requests in ~5 s → Accept → *Slide to start* → *Picked up* → *Slide to end* |
| Real GPS | Turn off *Simulate the drive* before starting; open the app on a phone and drive — the passenger sees your position move. Browsers allow GPS only on `localhost` or HTTPS, so use a tunnel (e.g. `cloudflared`) for phone testing |
| Ride alert | Find Ride with no results → *Notify me* → a demo Ride Giver posts a matching ride in ~12 s |
| Spam control | Post two rides within 90 min → blocked; same start and destination → flagged as a duplicate |

Demo members (Ravi, Priya, Arjun…) are bots that keep fresh rides on both routes, accept requests and reply in chat. Turn them off with `DEMO_BOTS=0`.

## Configuration

Copy `.env.example` to `.env` and run with `node --env-file=.env server/index.js`. Key settings:

- `TWILIO_*`: real SMS for OTP and SOS alerts (MSG91 etc. can replace `server/sms.js`)
- `ADMIN_PHONES` + `NODE_ENV=production`: lock the admin panel to listed numbers and hide dev OTPs
- `OSRM_URL`, `TILE_URL`: the free public OpenStreetMap services are for **development only** (usage limits apply). For launch, self-host OSRM or use a provider (MapTiler, Stadia, Mapbox, Google)

## Production build

```bash
npm run build
NODE_ENV=production PORT=8080 node server/index.js
```

The API serves the built app from `dist/`. Put it behind HTTPS (required for GPS and installable PWA).

## Still to connect before launch

- **Payments:** UPI is recorded in test mode. Plug Razorpay/Cashfree into `pay()` in `server/engine.js` and add webhooks for refunds
- **Push notifications:** currently in-app (WebSocket). Add FCM/APNs for background alerts
- **Masked calling:** UI is ready; connect Exotel/Twilio Proxy in `CallSheet`
- **Document uploads:** licence/RC photos are only acknowledged; store them in encrypted object storage for reviewers
- **Database:** SQLite is fine for a pilot; move to PostgreSQL for scale
- **Native apps:** wrap with Capacitor or port screens to React Native for background GPS while driving

## Project structure

```
server/
  index.js      HTTP API, auth, admin, static hosting
  engine.js     rides, bookings, live trips, notifications, jobs
  corridors.js  the fixed routes, fares and landmark placement
  geo.js        OSRM routing and route geometry
  state.js      per-user snapshot (what the app renders)
  realtime.js   WebSocket channels
  seed.js       demo members & rides
  sms.js        OTP/SOS SMS (Twilio or console)
  db.js         SQLite tables
src/
  api.js        fetch + WebSocket client
  store.jsx     app state & actions (talks to the API)
  ui.jsx        components: Leaflet map, place search, slider, sheets, cards
  screens/      auth, home, find, post, rides, track (live/chat/ride done), profile, notifications, admin
```
