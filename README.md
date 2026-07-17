# CrowdGuardian AI 🛡️ — Real-Time Crowd Safety Command Center

An AI-powered public safety and crowd-density monitoring platform that detects dangerous crowd surges in real time, visualizes them on standard/satellite maps and schematic vector blueprints, and automates emergency dispatches via Twilio SMS and Voice Calls.

---

## 🚀 Key Features

1. **Working Call + SMS Alert Pipeline**: Directly integrated with Twilio REST API (with dynamic, high-fidelity mock fallback if keys are omitted). Sends SMS with safe evacuation exits and places outbound voice calls using TwiML `<Say>` instructions.
2. **Dual Visualizer Maps**:
   - **Interactive Map View**: Scrollable OpenStreetMap/Esri Satellite tiles with location geocoding searches (via Nominatim) and an organic canvas-rendered dynamic density heatmap.
   - **Stadium Blueprint View**: SVG schematic of the stadium showing exit routes and pulsing radar distress rings on critical zones.
3. **AI Predictive Projections**: Integrates Gemini AI (`gemini-3.5-flash`) to generate 10-minute density trends, select alternative evacuation bypass pathways, and issue command-center police directives.
4. **Interactive YOLO CV Stream simulator**: Lets operators trigger frame-by-frame YOLO person counting models inside each zone to simulate real-time computer vision camera audits.
5. **Timeline Playback**: Step through a realistic, synthetic 30-minute crowd buildup, midpoint surge, response execution, and south gate dispersal timeline.

---

## 🛠️ Tech Stack & Architecture

- **Frontend**: React 19 + TypeScript + Tailwind CSS (v4) + Recharts + Leaflet
- **Backend**: Express + Vite full-stack server integration on Node.js
- **Model Engine**: `@google/genai` TypeScript SDK (utilizing `gemini-3.5-flash`)
- **Emergency Gateway**: Twilio REST SMS and Call APIs

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory (based on `.env.example`):

```env
# Google Gemini API key (Required for predictive AI analysis)
GEMINI_API_KEY="your-gemini-api-key"

# Twilio Credentials (Optional. If omitted, the platform falls back to simulated SMS and voice call logs)
TWILIO_ACCOUNT_SID="your-twilio-account-sid"
TWILIO_AUTH_TOKEN="your-twilio-auth-token"
TWILIO_FROM_NUMBER="your-twilio-phone-number"

# Recipient Phone Number for SMS and calls
# NOTE: Twilio trial accounts can ONLY send SMS or calls to verified phone numbers registered in your Twilio Console.
ALERT_RECIPIENT_NUMBER="+your-phone-number"
```

---

## 🏃 Setup & Launch Instructions

### 1. Install Dependencies
All necessary libraries are already pre-installed in your environment. If you want to force-reinstall dependencies:
```bash
npm install
```

### 2. Run the Command Center (Development Mode)
Launch the unified full-stack Express + Vite server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Run Production Build
To build and compile the application for deployment:
```bash
npm run build
npm run start
```

---

## 📡 Live Interactive Demo Walkthrough

1. **Live Timeline Playback**: Click the **PLAY** button in the header HUD. Watch the elapsed time tick forward. The crowd builds up. Around minute 15:00, the Main Stage Front zone spikes into a critical density limit (97%+).
2. **Automated Alert Triggering**: The moment the density crosses 85%, the backend automatically fires an SMS alert and places a voice call to the `ALERT_RECIPIENT_NUMBER`, logging the Twilio SIDs to the live log stream on the right.
3. **Simulate Surge Instant Override**: If you do not want to wait, click **SIMULATE SURGE** in the header. This immediately spikes the Main Stage Front area to 96% and triggers the alert pipeline instantly.
4. **AI Projections**: Shift between monitoring zones in the left panel. The center column **A.I. Predictive Intelligence Desk** will call Gemini AI to produce predictive risk indicators, outline detailed bypass routes, and generate operations briefs.
5. **Real-time Map Search**: Click the **SATELLITE & MAP** tab in the center column. Toggle between satellite imagery or street maps, and use the search bar to search for cities or places around the globe.
6. **YOLO Stream Auditing**: For each zone card on the left column, you can input custom person counts and click **YOLO Feed** to emulate real-time computer vision detection frame inputs.
