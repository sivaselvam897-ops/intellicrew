import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize express app
const app = express();
const PORT = 3000;

app.use(express.json());

// In-Memory Database State
let dbZones = [
  {
    id: "z1",
    name: "North Plaza Entrance",
    capacity: 3000,
    currentCount: 450,
    density: 15,
    status: "safe",
    sparkline: [10, 12, 14, 15, 15],
    coordinates: { lat: 37.7845, lng: -122.4012 },
    svgPos: { x: 50, y: 15 },
    nearestExit: "Exit A (North Plaza Gates)"
  },
  {
    id: "z2",
    name: "Main Stage Front",
    capacity: 2500,
    currentCount: 250,
    density: 10,
    status: "safe",
    sparkline: [5, 8, 9, 10, 10],
    coordinates: { lat: 37.7830, lng: -122.4025 },
    svgPos: { x: 50, y: 50 },
    nearestExit: "Exit B (West Gate Fast-Track)"
  },
  {
    id: "z3",
    name: "West Concourse",
    capacity: 1500,
    currentCount: 75,
    density: 5,
    status: "safe",
    sparkline: [4, 4, 5, 5, 5],
    coordinates: { lat: 37.7820, lng: -122.4040 },
    svgPos: { x: 20, y: 50 },
    nearestExit: "Exit C (West Gate Bypass)"
  },
  {
    id: "z4",
    name: "East Food Court",
    capacity: 1200,
    currentCount: 96,
    density: 8,
    status: "safe",
    sparkline: [6, 7, 7, 8, 8],
    coordinates: { lat: 37.7835, lng: -122.3995 },
    svgPos: { x: 80, y: 50 },
    nearestExit: "Exit D (East Arched Tunnel)"
  },
  {
    id: "z5",
    name: "South Gate Exit",
    capacity: 4000,
    currentCount: 80,
    density: 2,
    status: "safe",
    sparkline: [1, 1, 2, 2, 2],
    coordinates: { lat: 37.7810, lng: -122.4005 },
    svgPos: { x: 50, y: 85 },
    nearestExit: "Exit E (South Expressway Terminal)"
  }
];

let dbDispatchLogs: any[] = [
  {
    id: "log_init",
    timestamp: new Date().toISOString(),
    zoneId: "system",
    zoneName: "All Zones",
    type: "alert",
    recipient: "Command Center Operators",
    message: "CrowdGuardian AI monitoring node initialized successfully. GPS base station online.",
    status: "completed",
    sid: "MOCK_SYS_INIT_001"
  }
];

// Load simulation checkpoints
let simulationData: any = null;
try {
  const fileContent = fs.readFileSync(path.join(process.cwd(), "data/crowd_simulation.json"), "utf8");
  simulationData = JSON.parse(fileContent);
  console.log("Successfully loaded crowd_simulation.json dataset with", simulationData?.timeline?.length, "checkpoints.");
} catch (err) {
  console.error("Warning: Could not read /data/crowd_simulation.json, using fallback curves.", err);
}

// Simulation Control
let simTimeSeconds = 0; // Runs from 0 to 1800 (30 mins)
let isSimulationRunning = false;
let autoAlertLockouts: { [zoneId: string]: number } = {}; // prevent spamming automated SMS

// Interpolator function
function getSimulationDensityAtTime(zoneId: string, timeSeconds: number): number {
  if (!simulationData || !simulationData.timeline) {
    // Basic fallback curve
    if (zoneId === "z2") {
      // Stage Front surge peak in the middle
      const center = 900;
      const sigma = 300;
      const density = 10 + 85 * Math.exp(-Math.pow(timeSeconds - center, 2) / (2 * Math.pow(sigma, 2)));
      return Math.round(density);
    }
    return Math.round(15 + 20 * Math.sin(timeSeconds / 300));
  }

  const timeline = simulationData.timeline;
  
  // Find surrounding checkpoints
  let before = timeline[0];
  let after = timeline[timeline.length - 1];

  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].timeOffsetSeconds <= timeSeconds) {
      before = timeline[i];
    }
  }
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].timeOffsetSeconds > timeSeconds) {
      after = timeline[i];
      break;
    }
  }

  if (before.timeOffsetSeconds === after.timeOffsetSeconds) {
    return before.densities[zoneId] || 0;
  }

  // Linear Interpolation
  const tDiff = after.timeOffsetSeconds - before.timeOffsetSeconds;
  const fraction = (timeSeconds - before.timeOffsetSeconds) / tDiff;
  
  const bVal = before.densities[zoneId] || 0;
  const aVal = after.densities[zoneId] || 0;
  
  const val = bVal + (aVal - bVal) * fraction;
  return Math.round(val);
}

// Tick updater function
function advanceSimulation() {
  if (!isSimulationRunning) return;

  simTimeSeconds += 5;
  if (simTimeSeconds > 1800) {
    simTimeSeconds = 0; // loop simulation
  }

  updateZonesFromTime(simTimeSeconds);
}

function updateZonesFromTime(timeSeconds: number) {
  dbZones = dbZones.map((zone) => {
    const density = getSimulationDensityAtTime(zone.id, timeSeconds);
    const count = Math.round((density / 100) * zone.capacity);
    
    // Status color ranges
    let status: "safe" | "warning" | "critical" = "safe";
    if (density >= 85) status = "critical";
    else if (density >= 60) status = "warning";

    // Update sparkline
    const spark = [...zone.sparkline];
    spark.push(density);
    if (spark.length > 15) {
      spark.shift();
    }

    // Auto Dispatch pipeline trigger
    if (status === "critical") {
      const lastTrigger = autoAlertLockouts[zone.id] || 0;
      const now = Date.now();
      if (now - lastTrigger > 60000) { // 1 minute lockout
        autoAlertLockouts[zone.id] = now;
        triggerAutomaticAlert(zone, density);
      }
    }

    return {
      ...zone,
      currentCount: count,
      density: density,
      status: status,
      sparkline: spark
    };
  });
}

// Background simulation loop
setInterval(advanceSimulation, 5000);

// Twilio Helper (Direct fetch REST client implementation)
async function sendTwilioAlert(to: string, message: string, isVoice: boolean): Promise<{ success: boolean; sid: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[MOCK TWILIO DISPATCH] ${isVoice ? "VOICE CALL" : "SMS TEXT"} to ${to}: "${message}"`);
    return {
      success: true,
      sid: `MOCK_TW_SID_${Math.random().toString(36).substring(2, 11).toUpperCase()}`
    };
  }

  try {
    const twilioUrl = isVoice
      ? `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`
      : `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const params = new URLSearchParams();
    
    params.append("To", to);
    params.append("From", fromNumber);
    
    if (isVoice) {
      // Direct raw TwiML is supported on outbound calls using Twiml parameter!
      params.append(
        "Twiml",
        `<Response>
          <Say voice="alice" language="en-US">Attention emergency responder. CrowdGuardian A.I. alert broadcast: ${message}</Say>
          <Pause length="1"/>
          <Say voice="alice">Standard evacuating and dispersal directives have been logged to the security terminal.</Say>
         </Response>`
      );
    } else {
      params.append("Body", message);
    }

    const response = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    });

    const data: any = await response.json();
    if (response.ok) {
      return { success: true, sid: data.sid };
    } else {
      console.error("Twilio API Error Response:", data);
      return { success: false, sid: "", error: data.message || "Unknown Twilio API Error" };
    }
  } catch (err: any) {
    console.error("Failed executing direct Twilio REST request:", err);
    return { success: false, sid: "", error: err.message || "Network request failed" };
  }
}

// Automatic alert pipeline trigger
async function triggerAutomaticAlert(zone: any, density: number) {
  const recipient = process.env.ALERT_RECIPIENT_NUMBER || "+15550199";
  const alertMsg = `CRITICAL ALERT: Zone "${zone.name}" density spike of ${density}% is exceeding safety bounds. Nearest emergency exit is: ${zone.nearestExit}. Please deploy officers immediately!`;

  // Log SMS
  const smsRes = await sendTwilioAlert(recipient, alertMsg, false);
  const smsLog = {
    id: `log_auto_sms_${Date.now()}`,
    timestamp: new Date().toISOString(),
    zoneId: zone.id,
    zoneName: zone.name,
    type: "sms",
    recipient: recipient,
    message: `[AUTOMATED SMS SENT] SID: ${smsRes.sid || "FAILED"}. Msg: ${alertMsg}`,
    status: smsRes.success ? "sent" : "failed",
    sid: smsRes.sid || "ERROR"
  };
  dbDispatchLogs.unshift(smsLog);

  // Log Voice call
  const voiceMsg = `Warning, warning. Zone "${zone.name}" has crossed the safety threshold at ${density} percent. Deploy crowd safety responders to ${zone.nearestExit} now.`;
  const voiceRes = await sendTwilioAlert(recipient, voiceMsg, true);
  const voiceLog = {
    id: `log_auto_voice_${Date.now()}`,
    timestamp: new Date().toISOString(),
    zoneId: zone.id,
    zoneName: zone.name,
    type: "voice",
    recipient: recipient,
    message: `[AUTOMATED CALL PLACED] SID: ${voiceRes.sid || "FAILED"}. Msg: ${voiceMsg}`,
    status: voiceRes.success ? "completed" : "failed",
    sid: voiceRes.sid || "ERROR"
  };
  dbDispatchLogs.unshift(voiceLog);
}

// Initialize Gemini Client
let geminiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
    console.log("Gemini API client initialized successfully.");
  } catch (err) {
    console.error("Error initializing Gemini API Client:", err);
  }
}

// API Endpoints
app.get("/api/state", (req, res) => {
  res.json({
    zones: dbZones,
    dispatchLogs: dbDispatchLogs,
    simulation: {
      timeSeconds: simTimeSeconds,
      formattedTime: `${Math.floor(simTimeSeconds / 60)}m ${simTimeSeconds % 60}s`,
      running: isSimulationRunning,
      phase: simulationData?.timeline?.find((t: any) => t.timeOffsetSeconds <= simTimeSeconds)?.phase || "Active"
    }
  });
});

app.post("/api/simulation/toggle", (req, res) => {
  isSimulationRunning = !isSimulationRunning;
  res.json({ running: isSimulationRunning });
});

app.post("/api/simulation/reset", (req, res) => {
  simTimeSeconds = 0;
  updateZonesFromTime(0);
  res.json({ success: true, timeSeconds: 0 });
});

app.post("/api/simulate-surge", (req, res) => {
  // Find Zone 2 (Main Stage) and push to 96% density immediately
  dbZones = dbZones.map((zone) => {
    if (zone.id === "z2") {
      const spark = [...zone.sparkline];
      spark.push(96);
      if (spark.length > 15) spark.shift();
      
      const updatedZone = {
        ...zone,
        currentCount: Math.round(zone.capacity * 0.96),
        density: 96,
        status: "critical" as const,
        sparkline: spark
      };

      // Manually trigger alert pipeline for this spike immediately
      triggerAutomaticAlert(updatedZone, 96);
      return updatedZone;
    }
    return zone;
  });

  res.json({ success: true, zones: dbZones });
});

app.post("/api/alert", async (req, res) => {
  const { zoneId, density, status, recipientNumber, customMessage, isVictim } = req.body;
  const recipient = recipientNumber || process.env.ALERT_RECIPIENT_NUMBER || "+15550199";
  const zone = dbZones.find((z) => z.id === zoneId) || { name: "Manual Override Zone", nearestExit: "Exit A Gates" };

  const finalMsg = customMessage || `EMERGENCY DIRECTIVE: ${isVictim ? "ATTENTION VISITOR:" : "ATTENTION SECURITY:"} Zone "${zone.name}" crossed threshold with ${density}% density. Safe dispersal exit is: ${zone.nearestExit}. Please move calmly.`;

  // Send real/mock SMS
  const smsRes = await sendTwilioAlert(recipient, finalMsg, false);
  const logSms = {
    id: `log_manual_sms_${Date.now()}`,
    timestamp: new Date().toISOString(),
    zoneId: zoneId || "custom",
    zoneName: zone.name,
    type: isVictim ? "sms" : "sms",
    recipient: recipient,
    message: `[${isVictim ? "VICTIM ALERT SENT" : "RESPONDER SMS SENT"}] SID: ${smsRes.sid || "FAILED"}. Msg: ${finalMsg}`,
    status: smsRes.success ? "sent" : "failed",
    sid: smsRes.sid || "ERROR"
  };
  dbDispatchLogs.unshift(logSms);

  // Send real/mock Call if selected
  let callSid = "N/A";
  let callStatus = "completed";
  if (!isVictim) {
    const voiceMsg = `Security briefing. Zone ${zone.name} is reporting heavy congestion at ${density} percent. Initiate tactical crowd diversion toward ${zone.nearestExit}.`;
    const callRes = await sendTwilioAlert(recipient, voiceMsg, true);
    callSid = callRes.sid || "ERROR";
    callStatus = callRes.success ? "completed" : "failed";

    const logVoice = {
      id: `log_manual_call_${Date.now()}`,
      timestamp: new Date().toISOString(),
      zoneId: zoneId || "custom",
      zoneName: zone.name,
      type: "voice",
      recipient: recipient,
      message: `[COMMAND DISPATCH CALL] SID: ${callSid}. Msg: ${voiceMsg}`,
      status: callStatus,
      sid: callSid
    };
    dbDispatchLogs.unshift(logVoice);
  }

  res.json({
    success: smsRes.success,
    smsSid: smsRes.sid,
    callSid: callSid,
    error: smsRes.error
  });
});

app.post("/api/police-command", (req, res) => {
  const { command, units } = req.body;
  const timestamp = new Date().toISOString();
  
  const log = {
    id: `log_police_${Date.now()}`,
    timestamp,
    zoneId: "dispatch",
    zoneName: "All Sectors",
    type: "police_dispatch",
    recipient: units || "All Tact Unit Leaders",
    message: `[POLICE DIRECTIVE] Broadcast to units [${units}]: "${command}"`,
    status: "completed",
    sid: `CMD_${Math.random().toString(36).substring(2, 7).toUpperCase()}`
  };

  dbDispatchLogs.unshift(log);
  res.json({ success: true, log });
});

// YOLO Image Frame count emulation
app.post("/api/yolo-process", (req, res) => {
  const { zoneId, count } = req.body;
  
  dbZones = dbZones.map((zone) => {
    if (zone.id === zoneId) {
      const density = Math.min(100, Math.round((count / zone.capacity) * 100));
      let status: "safe" | "warning" | "critical" = "safe";
      if (density >= 85) status = "critical";
      else if (density >= 60) status = "warning";

      const spark = [...zone.sparkline];
      spark.push(density);
      if (spark.length > 15) spark.shift();

      const updated = {
        ...zone,
        currentCount: count,
        density,
        status,
        sparkline: spark
      };

      if (status === "critical") {
        triggerAutomaticAlert(updated, density);
      }

      return updated;
    }
    return zone;
  });

  // Log YOLO trigger
  dbDispatchLogs.unshift({
    id: `log_yolo_${Date.now()}`,
    timestamp: new Date().toISOString(),
    zoneId,
    zoneName: dbZones.find(z => z.id === zoneId)?.name || "Unknown Zone",
    type: "alert",
    recipient: "CV Video Stream Node",
    message: `[YOLO Person Counter] Realtime frame parsed. Detected: ${count} people in zone.`,
    status: "completed",
    sid: `YOLO_DET_${Math.random().toString(36).substring(2, 7).toUpperCase()}`
  });

  res.json({ success: true, zones: dbZones });
});

// Drone Aerial Scanning emulation
app.post("/api/drone-process", (req, res) => {
  const { zoneId, count, droneId, altitude, battery } = req.body;
  
  const dId = droneId || "DRN-Guardian-09";
  const alt = altitude || 150;
  const batt = battery || 88;

  dbZones = dbZones.map((zone) => {
    if (zone.id === zoneId) {
      const density = Math.min(100, Math.round((count / zone.capacity) * 100));
      let status: "safe" | "warning" | "critical" = "safe";
      if (density >= 85) status = "critical";
      else if (density >= 60) status = "warning";

      const spark = [...zone.sparkline];
      spark.push(density);
      if (spark.length > 15) spark.shift();

      const updated = {
        ...zone,
        currentCount: count,
        density,
        status,
        sparkline: spark
      };

      if (status === "critical") {
        triggerAutomaticAlert(updated, density);
      }

      return updated;
    }
    return zone;
  });

  const zoneName = dbZones.find(z => z.id === zoneId)?.name || "Unknown Zone";
  const updatedZone = dbZones.find(z => z.id === zoneId);
  const density = updatedZone ? updatedZone.density : 0;

  // Log Drone Aerial Scan
  dbDispatchLogs.unshift({
    id: `log_drone_${Date.now()}`,
    timestamp: new Date().toISOString(),
    zoneId,
    zoneName,
    type: "alert",
    recipient: "Drone Ground Control Station",
    message: `[Drone Aerial Scan] ${dId} scanned sector at ${alt}ft (Battery: ${batt}%). Live count: ${count} people. Density: ${density}%`,
    status: "completed",
    sid: `DRN_SCAN_${Math.random().toString(36).substring(2, 7).toUpperCase()}`
  });

  res.json({ success: true, zones: dbZones });
});

// Predictive AI Analysis Endpoint (using GoogleGenAI modern SDK)
app.post("/api/predictive-analysis", async (req, res) => {
  const { activeZoneId } = req.body;
  const activeZone = dbZones.find(z => z.id === activeZoneId) || dbZones[1]; // fallback to Stage Front
  
  const prompt = `You are CrowdGuardian AI, an advanced crowd-safety and flow predictive modeling system.
Analyze this active real-time crowd safety situation at a stadium festival venue and provide structural safety insights, 10-minute predictive risk models, and direct action guidelines.

VENUE DATA:
- Active Hazard Zone: ${activeZone.name}
- Current Zone Density: ${activeZone.density}%
- Current Zone Count: ${activeZone.currentCount} people (Maximum Safe Capacity: ${activeZone.capacity})
- Current Zone Status: ${activeZone.status.toUpperCase()}
- Nearest Default Exit: ${activeZone.nearestExit}

OTHER CURRENT STADIUM SECTORS:
${dbZones.map(z => `- ${z.name}: Density ${z.density}%, Status: ${z.status.toUpperCase()}, Capacity: ${z.currentCount}/${z.capacity}`).join("\n")}

Respond with raw, parsed JSON conforming EXACTLY to the following typescript interface without any markdown backticks:
{
  "predictionSummary": "String (2 sentences outlining the crowd behavior trajectory)",
  "predictions": [
    {
      "zoneId": "String (the zone ID)",
      "zoneName": "String (the zone name)",
      "predictedDensityIn10Mins": "Number (0-100 prediction)",
      "riskLevel": "low" | "medium" | "high",
      "recommendedAction": "String (exact physical response advice)"
    }
  ],
  "alternativeEvacuationPaths": [
    {
      "id": "String (path identifier)",
      "pathName": "String",
      "fromZone": "String",
      "toExit": "String",
      "currentFlowRate": "Number",
      "maxCapacity": "Number",
      "status": "clear" | "heavy" | "congested" | "blocked",
      "reasoning": "String explaining why this alternative bypass route should be used"
    }
  ],
  "commandDirectives": [
    "String (Specific instructions to dispatch to Police Command / Security personnel)"
  ]
}`;

  if (geminiClient) {
    try {
      const response = await geminiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });

      let responseText = response.text || "";
      try {
        // Strip markdown code fences if present
        if (responseText.includes("```")) {
          const match = responseText.match(/```(?:json)?([\s\S]*?)```/);
          if (match) {
            responseText = match[1];
          }
        }
        const parsed = JSON.parse(responseText.trim());
        return res.json(parsed);
      } catch (e) {
        console.error("Failed to parse JSON response from Gemini:", responseText);
        // Fall back to heuristic engine below on parsing fail
      }
    } catch (err: any) {
      console.error("Gemini Generation API Error:", err);
      // Fall back to heuristic engine below on API fail
    }
  }

  // Pure deterministic fallback heuristic engine if no key or error
  console.log("Using backend Heuristic engine for predictive analytics fallback.");
  const mockPredictions = dbZones.map(z => {
    let change = 0;
    if (z.id === activeZone.id) {
      change = z.status === "critical" ? -12 : 15; // If critical, starts dispersing due to evacuation
    } else if (z.id === "z5") {
      change = activeZone.status === "critical" ? 40 : 5; // Flow shifts to exit
    } else {
      change = Math.round((Math.sin(simTimeSeconds / 100) * 5));
    }
    const pred = Math.max(0, Math.min(100, z.density + change));
    return {
      zoneId: z.id,
      zoneName: z.name,
      currentDensity: z.density,
      predictedDensityIn10Mins: pred,
      riskLevel: (pred >= 85 ? "high" : pred >= 60 ? "medium" : "low") as "high" | "medium" | "low",
      recommendedAction: pred >= 85 
        ? `Initiate urgent lateral flow venting into East/West buffers.`
        : pred >= 60 
          ? "Pre-position crowd monitors and slow down incoming entry turnstiles."
          : "Maintain normal static supervision."
    };
  });

  const mockAlternativePaths = [
    {
      id: "path_1",
      pathName: "West Perimeter Bypass Route",
      fromZone: activeZone.name,
      toExit: "Exit C (West Gate Bypass)",
      currentFlowRate: activeZone.status === "critical" ? 180 : 35,
      maxCapacity: 300,
      status: activeZone.status === "critical" ? "heavy" : "clear",
      reasoning: "Utilizes outer service ring around Section 4. Safer alternate bypassing high-pressure Stage front bottle-neck."
    },
    {
      id: "path_2",
      pathName: "East Stadium Service Arches",
      fromZone: activeZone.name,
      toExit: "Exit D (East Arched Tunnel)",
      currentFlowRate: activeZone.status === "critical" ? 120 : 15,
      maxCapacity: 250,
      status: "clear",
      reasoning: "Completely isolated from the Main Stage area. Under-utilized pathway directly venting to external parkway."
    }
  ];

  const mockDirectives = activeZone.status === "critical" 
    ? [
        `Deploy Unit Charlie (12 officers) immediately to West Gate fast-track to clear emergency vehicle corridor.`,
        `Instruct PA announcer to execute code-orange verbal prompts: 'Directing all groups in Front of Main Stage to exit via the West Bypass Route calmly'.`,
        `Slow down and hold incoming ticket lanes at North Entrance to reduce further crowd injection.`
      ]
    : [
        `Monitor front stage barricades during performance intervals.`,
        `Verify exit doors of West Concourse and East Tunnel are completely unobstructed.`
      ];

  res.json({
    predictionSummary: `Main Stage is currently at ${activeZone.density}% capacity. Crowd density is projected to ${activeZone.status === "critical" ? "disperse slowly" : "ramp up slightly"} over the next 10 minutes. Alternate bypass corridors are fully open.`,
    predictions: mockPredictions,
    alternativeEvacuationPaths: mockAlternativePaths,
    commandDirectives: mockDirectives
  });
});

// Vite Setup for Development vs Production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CrowdGuardian AI server running on http://localhost:${PORT}`);
  });
}

startServer();
