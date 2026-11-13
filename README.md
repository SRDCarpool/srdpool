# SRDPool — Ride Together 🚗

A friendly, mobile-first carpooling app **only for IT professionals**, on one commuter corridor, both ways:
**Sangareddy / Isnapur ⇄ Financial District / HITEC City.**

| Ride Takers see | Ride Givers see |
|---|---|
**To office** or **Going home**, then fixed fares by home area: **Sangareddy ₹150**, **Isnapur ₹120** per seat, in either direction. The office end is always Financial District / HITEC City | A simple form: starting point, destination, date, time, seats, then **pickup points** in order. Passengers see it as one line, e.g. `9:00 AM Malkapur Chintal › SRD X Road › ORR › ICICI › Wipro Circle` |
| Route choice for Sangareddy: **via Isnapur & ORR** or the alternative **via Shankarpally**. Isnapur riders always use the ORR route | The app detects the direction (to office / going home), route (ORR or Shankarpally) and home area (Sangareddy or Isnapur) from what they type; they can correct each with one tap |

There is no rating system. Trust comes from OTP-verified phones, member verification (company, designation and ID card), ride counts, cancellations and a reliability score.

The top of **Home** has an *I am currently a [Ride Taker] [Ride Giver]* switch.

### Breakdown help (moving passengers to other rides)

If a car has a problem during a live ride (flat tyre, engine trouble, accident, out of fuel…), the Ride Giver taps **Car trouble? Ask nearby Ride Givers for help** on the live ride screen. Nothing is sent unless they tap it.

1. The car is marked as stopped and passengers are told a seat is being found for them.
2. SRDPool alerts only Ride Givers who are **live right now, travelling the same direction, behind the breakdown spot (haven't passed it), and have empty seats**. They see a red 🆘 card on Home and an alert with the spot on a map. Once a helper drives past the spot, the card disappears for them, and requests close automatically when the broken-down ride ends.
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

**Login:** any email address. Without an email service configured (development), the 6-digit code is shown on screen and printed in the API console. Setup then asks for a mobile number.
Switch between Ride Taker and Ride Giver in **Profile**: takers get the *Find Ride* tab, givers get *Post Ride*.

Requires Node.js 22.5+ (for `node:sqlite`; tested on Node 24).

## Routes, boarding points and fares

Defined in [`server/corridors.js`](server/corridors.js).

Ride Takers can only board and get down at these fixed points:

| Direction | Board at | Get down at |
|---|---|---|
| To office | Sangareddy, SRD X Road, Kandi, Isnapur | GAR, Cyient Signal, Capgemini, ICICI, Wipro Circle, Gachibowli, HITEC City |
| Going home | HITEC City, Gachibowli, Wipro Circle, ICICI, Capgemini, Cyient Signal, GAR | Isnapur, Kandi, SRD X Road, Sangareddy |

**Fares** are per seat and follow the home-side point: **Isnapur ₹120**; Sangareddy, SRD X Road and Kandi **₹150**. The server works out the fare from the chosen point, so the app can't change it, and Ride Givers don't set prices.

| Route | Path | Home points it passes |
|---|---|---|
| To office · via Isnapur & ORR | Sangareddy → SRD X Road → Kandi → Isnapur → Patancheru ORR → GAR → … → HITEC City | all four |
| To office · via Shankarpally | Sangareddy → SRD X Road → (Kandi) → Shankarpally → Mokila → GAR → … → HITEC City | Sangareddy, SRD X Road, Kandi |
| Going home · via ORR & Isnapur | HITEC City → … → GAR → Patancheru ORR → Isnapur → Kandi → SRD X Road → Sangareddy | all four |
| Going home · via Shankarpally | HITEC City → … → GAR → Mokila → Shankarpally → Kandi → SRD X Road → Sangareddy | Kandi, SRD X Road, Sangareddy |

Every posted ride automatically includes the fixed points its route passes between the Ride Giver's start and destination, even if they didn't type them. Typed names that match a fixed point (e.g. "Sangareddy New Bus Stand", "ICICI Towers") count as that point. The route line passengers see shows the Ride Giver's own points, plus the rider's chosen board / get-down points. Rides created before this change are upgraded automatically when the server starts.

The office-side coordinates (GAR, Cyient Signal, Capgemini, ICICI…) are approximate. If one sits in the wrong place, adjust `OFFICE_POINTS` in `server/corridors.js`. Other typed pickup points are placed using known landmarks (Patancheru, ORR, Kollur, Shankarpally, Mokila…), and unknown names are spaced evenly between them.

## How it works

| Area | Implementation |
|---|---|
| Auth | Email OTP (hashed, 10-min expiry, 5 attempts, 30 s resend limit, per-IP rate limits) → 90-day session token; mobile number collected at setup for calls |
| Search | Passenger picks Sangareddy or Isnapur (+ route, date, optional time). Server returns rides on routes serving that origin, with the suggested boarding point and fixed fare |
| Booking | Passenger chooses where to board and get down from the Ride Giver's pickup points; total = fare × seats |
| Live tracking | The Ride Giver's phone streams GPS over WebSocket → snapped to the route → pushed only to confirmed passengers. Approaching/arrived/dropped notifications are server-side |
| Realtime | WebSocket per user: `sync` (refetch), `notification` (toast), `live` (car position) |
| Privacy | Number plates are masked until a booking is confirmed; live location only for confirmed riders; a phone number is released only to a co-rider on the same confirmed ride when they tap Call (members can turn calls off) |
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

Copy `.env.example` to `.env` (or set the same values in your host's dashboard). Key settings:

- `SMTP_*`, `MAIL_FROM`: **required in production** — sign-in codes are emailed. Any SMTP provider works (Google Workspace / Gmail app password, Zoho, Brevo, Amazon SES). Without them, development prints codes on screen and in the console; production refuses to sign anyone in.
- `ADMIN_EMAILS`: comma-separated emails that get the admin dashboard.
- `TWILIO_*`: optional, for SOS text messages to trusted contacts.
- `DATA_DIR`: where the SQLite database lives — must be a persistent disk.
- `OSRM_URL`, `TILE_URL`: the free public OpenStreetMap services are for light use only. For real traffic, self-host OSRM or use a provider (MapTiler, Stadia, Mapbox, Google).

## Sign-in and calling

- **Sign up / sign in:** members enter their email and get a 6-digit code (10-minute expiry, 5 attempts, 30-second resend limit, per-IP rate limits) → 90-day session. During setup they add their **mobile number for communication**.
- **Call button:** opens the phone's dialer (`tel:`) with the other member's number. The number is released only between the Ride Giver and a Ride Taker with a **confirmed seat on the same upcoming or live ride**. Members can switch calls off in *Profile → Privacy & location* (chat only). Demo members can't be called.

## Publishing

The app is one Node server (API + WebSockets + the built web app) with a SQLite database file, so any host that runs a Docker container **with a persistent disk** works — e.g. Render, Railway, Fly.io, DigitalOcean App Platform or a small VPS.

```bash
docker build -t srdpool .
docker run -p 8080:8080 -v srdpool-data:/data --env-file .env srdpool
```

Checklist:
1. Fill in `.env` (at least `SMTP_*`, `MAIL_FROM`, `ADMIN_EMAILS`); keep `NODE_ENV=production` and `DEMO_BOTS=0`.
2. Mount a persistent volume at `/data` (the database lives there; back it up).
3. Serve over **HTTPS** with your domain — browsers only allow GPS (live tracking) on HTTPS. Most hosts provide this automatically.
4. Health check: `GET /healthz`.
5. Sign in with an `ADMIN_EMAILS` address to review member verifications in the admin dashboard.

Without Docker: `npm ci && npm run build && NODE_ENV=production PORT=8080 node --env-file=.env server/index.js`.

## Still to connect

- **Payments:** UPI is recorded in test mode. Plug Razorpay/Cashfree into `pay()` in `server/engine.js` and add webhooks for refunds
- **Push notifications:** currently in-app (WebSocket). Add FCM/APNs for alerts when the app is closed
- **Database:** SQLite is fine for a pilot; move to PostgreSQL for scale
- **Native apps:** wrap with Capacitor or port screens to React Native for background GPS while driving
- **Legal:** add Terms, a Privacy Policy (you store emails, phone numbers and — briefly — ID photos) and a support contact before inviting members

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
  mail.js       sign-in code emails (SMTP or console)
  sms.js        SOS text messages (Twilio or console)
  db.js         SQLite tables
src/
  api.js        fetch + WebSocket client
  store.jsx     app state & actions (talks to the API)
  ui.jsx        components: Leaflet map, place search, slider, sheets, cards
  screens/      auth, home, find, post, rides, track (live/chat/ride done), profile, notifications, admin
```
