# My AI Reminder

A small personal reminder PWA with recurring reminders and web push notifications.

## What it does

- Add a reminder in plain text.
- Choose a time.
- Choose which days it repeats.
- Receive a push notification even when the app is not open (once deployed with the server running).
- Install it as an app on supported devices.

## Run locally

1. Install Node.js 20+.
2. Run `npm install`.
3. Generate VAPID keys:
   `npx web-push generate-vapid-keys`
4. Set environment variables:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` (for example `mailto:you@example.com`)
5. Run `npm start`.
6. Open `http://localhost:3000`.

For real phone notifications, deploy the server over HTTPS. Web Push requires a secure origin, and the server must remain available to send scheduled pushes.

## Important

The reminder scheduler checks every 30 seconds. Deploy this on a service that keeps the Node process running. If the host sleeps, notifications will be delayed until it wakes.

Web Push uses the browser Push API, Notifications API, and a service worker.