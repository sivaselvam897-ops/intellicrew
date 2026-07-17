# Drop-in Feature Files — Integration Guide

These 3 files add **Live Weather Risk** and **Alert History + Export** to
CrowdGuardian AI with **zero new npm dependencies** — nothing to install,
nothing that can fail to build.

## Files

```
src/components/WeatherRiskPanel.tsx   -> new panel, fetches live weather (no API key needed)
src/components/AlertHistoryPanel.tsx  -> new panel, table + CSV/summary export
src/utils/exportReport.ts             -> shared export helper (required by AlertHistoryPanel)
```

Copy them into the matching paths in your repo (create `src/components`
and `src/utils` if they don't already exist).

## Wiring into your app (2 minutes)

In whatever file renders your dashboard columns (likely `App.tsx` or a
`Dashboard.tsx`), add:

```tsx
import WeatherRiskPanel from "./components/WeatherRiskPanel";
import AlertHistoryPanel from "./components/AlertHistoryPanel";
import { AlertLogEntry } from "./utils/exportReport";
import { useState } from "react";

// inside your component:
const [alertLog, setAlertLog] = useState<AlertLogEntry[]>([]);

// wherever you already trigger an SMS/Call (your Twilio integration),
// also push an entry:
setAlertLog(prev => [
  {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    zoneName: zone.name,
    densityPercent: zone.density,
    channel: "SMS",
    recipient: alertRecipientNumber,
    status: "sent", // or "simulated" / "failed"
  },
  ...prev,
]);
```

Then render the two panels anywhere in your JSX, e.g. in the right-hand
log column next to your existing live log stream:

```tsx
<WeatherRiskPanel lat={13.0827} lon={80.2707} venueName="Main Stadium" />
<AlertHistoryPanel entries={alertLog} venueName="Main Stadium" />
```

Swap `lat`/`lon` for your actual venue coordinates (or wire it to
whatever "selected location" state your map search already produces).

## Why these are low-risk to add right before judging

- No `npm install` required — pure React + Tailwind + built-in browser APIs.
- Each file is self-contained; if one doesn't compile, it can't break the others.
- `WeatherRiskPanel` degrades gracefully (shows "Weather unavailable")
  if the network call fails — it will never crash your app.
- Both panels work fine with empty/default props, so you can render them
  immediately and wire up real data afterward if time runs out.

## If you want it to actually influence your existing risk score

`WeatherRiskPanel` exports a standalone helper:

```ts
import { computeEnvironmentalRisk } from "./components/WeatherRiskPanel";
```

You can call this with a weather snapshot and add its `.score` (0-100)
into your existing density/danger calculation as a weighted term, e.g.:

```ts
const combinedRisk = densityScore * 0.8 + environmentalRisk.score * 0.2;
```
