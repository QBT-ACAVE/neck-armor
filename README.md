# Neck Armor

12-week neck strengthening PWA for football prep. Single-user, all data stored locally on device.

## Features

- 48 sessions across 3 phases (Foundation → Strength → Power)
- Per-set logging with weight, reps, RPE
- Rest timer with sound + haptic feedback (3 beeps + vibration pattern)
- YouTube exercise demo embeds (placeholder IDs — update in `lib/program.ts`)
- Auto weight progression based on RPE history
- Workout history + PR tracking
- Push notifications (iOS requires "Add to Home Screen" first)
- Full offline support via service worker
- iOS-style UI optimized for iPhone

## Stack

- Next.js 15 (App Router) + React 19 + TypeScript
- Tailwind CSS
- localStorage (no backend, no auth — single user)
- Service Worker for offline + push
- Lucide icons

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000 on your phone (same WiFi) to test on actual device. Or use ngrok/Tailscale.

## Deploy to Aaron's Vercel

```bash
npm i -g vercel
vercel login         # use your account
vercel               # first time: link to "Aaron's Projects" team
vercel --prod
```

Or via GitHub:
1. Push this repo to GitHub
2. Vercel dashboard → New Project → Import → select repo → choose "Aaron's Projects" as scope
3. Deploy (no env vars needed)

## Install on iPhone

1. Open the deployed URL in **Safari**
2. Tap Share → **Add to Home Screen**
3. Launch from home screen — runs full-screen, no Safari chrome
4. In-app: Settings → Enable notifications

## Customizing

**Exercise videos**: Edit `videoId` fields in `lib/program.ts` with real YouTube IDs.

**Adjust progression**: Tweak `PHASES.mult` arrays in `lib/program.ts` (currently 5% increments per week within phase, deload in week 12).

**Add exercises**: Add to phase templates (`dayA_P1`, `dayB_P1`, etc.).

## File map

```
app/
  page.tsx              -- routes to current incomplete session
  layout.tsx            -- PWA shell, bottom nav
  workout/page.tsx      -- main training screen
  calendar/page.tsx     -- 12-week grid
  history/page.tsx      -- PRs + stats
  settings/page.tsx     -- toggles, notifications, data export
  components/
    BottomNav.tsx
    RestTimer.tsx
    VideoModal.tsx
    SWRegister.tsx
lib/
  program.ts            -- all 48 sessions, exercises, progression logic
  storage.ts            -- localStorage + history + suggestions
public/
  manifest.json
  sw.js                 -- offline cache + push handler
  icon-192.png, icon-512.png
```

## Notes & gotchas

- **iOS push notifications** only work after "Add to Home Screen" (web push for installed PWAs landed in iOS 16.4+). The Settings page warns about this.
- **Real push delivery** requires a backend (Web Push protocol with VAPID keys). The service worker handles incoming pushes, but you'd need a small Vercel cron job to actually send them. Easiest add: Vercel Cron + a `/api/send-push` route.
- **Data is device-local**. If your son clears Safari data or switches phones, history is gone unless he exports first. Settings → Export creates a JSON backup.
- **Multi-device sync** would need Supabase. Easy upgrade later if you want it — your TagTrack stack would slot right in.

## Next steps to consider

- Wire real YouTube IDs for each exercise (search "Iron Neck rotations", "plate neck flexion tutorial", etc.)
- Add a `/api/send-push` route + Vercel Cron for actual scheduled reminders
- Migrate to Supabase if multi-device or you want to add other athletes
- Add measurement tracking (neck circumference every 4 weeks)
