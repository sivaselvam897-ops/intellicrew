#!/usr/bin/env node

/**
 * CrowdGuardian AI — SMS Alert System CLI Executable
 * 
 * This CLI tool allows operators to manually trigger and execute the emergency 
 * SMS Alert and Dispatch System from the command line.
 * 
 * Usage:
 *   node sms-alert-system.js --zone <zoneId> --message "<customMessage>" [--recipient <phoneNumber>] [--victim]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Parse CLI Arguments
const args = process.argv.slice(2);
const params = {
  zoneId: "z2", // Default to Stage Front
  message: "",
  recipient: "",
  isVictim: false,
};

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--zone" || args[i] === "-z") {
    params.zoneId = args[i + 1] || "z2";
    i++;
  } else if (args[i] === "--message" || args[i] === "-m") {
    params.message = args[i + 1] || "";
    i++;
  } else if (args[i] === "--recipient" || args[i] === "-r") {
    params.recipient = args[i + 1] || "";
    i++;
  } else if (args[i] === "--victim" || args[i] === "-v") {
    params.isVictim = true;
  }
}

// Map of zones for high-fidelity fallback logging
const zoneNames = {
  z1: "North Plaza Entrance",
  z2: "Main Stage Front",
  z3: "West Concourse",
  z4: "East Food Court",
  z5: "South Gate Exit"
};

const zoneName = zoneNames[params.zoneId] || "Manual Overwatch Section";

// Format visual log header
console.log("\x1b[36m%s\x1b[0m", "==========================================================");
console.log("\x1b[35m%s\x1b[0m", " 🛡️  CROWDGUARDIAN AI — EMERGENCY SMS SYSTEM EXECUTABLE");
console.log("\x1b[36m%s\x1b[0m", "==========================================================");
console.log(`📡 TARGETING ZONE : ${params.zoneId.toUpperCase()} (${zoneName})`);
console.log(`👤 AUDIENCE       : ${params.isVictim ? "TRAPPED VICTIMS" : "SECURITY COMMANDERS"}`);
console.log(`✉️  MESSAGE        : "${params.message || "No custom message specified (Using emergency templates)"}"`);

// Attempt to dispatch via the local running CrowdGuardian server to sync UI in real-time
async function dispatch() {
  const payload = {
    zoneId: params.zoneId,
    density: 90, // Emulated density for manual override
    status: "critical",
    recipientNumber: params.recipient || undefined,
    customMessage: params.message || undefined,
    isVictim: params.isVictim,
  };

  try {
    console.log("\n🔄 Initiating connection to central Express command server...");
    const response = await fetch("http://localhost:3000/api/alert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      console.log("\x1b[32m%s\x1b[0m", "✅ SERVER TRANSACTION REGISTERED SUCCESSFULLY!");
      if (result.smsSid) {
        console.log(`📱 SMS GATEWAY TRANSMISSION SID: \x1b[33m${result.smsSid}\x1b[0m`);
      }
      if (result.callSid && result.callSid !== "N/A") {
        console.log(`📞 VOICE CALL TRANSMISSION SID:  \x1b[33m${result.callSid}\x1b[0m`);
      }
      console.log("\x1b[36m%s\x1b[0m", "==========================================================");
      process.exit(0);
    } else {
      console.error("\x1b[31m%s\x1b[0m", "❌ Server returned status code: " + response.status);
    }
  } catch (err) {
    console.log("\x1b[33m%s\x1b[0m", "⚠️  Central server offline or unreachable. Executing independent Twilio dispatch fallback...");
    
    // Direct Twilio Dispatch fallback
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    const recipient = params.recipient || process.env.ALERT_RECIPIENT_NUMBER || "+15550199";

    const finalMsg = params.message || `EMERGENCY ACTION DIRECTIVE: Section "${zoneName}" has breached safety density thresholds. Safe dispersal evacuation route is: Exit A (North Plaza). Move calmly.`;

    if (!accountSid || !authToken || !fromNumber) {
      console.log("\x1b[33m%s\x1b[0m", "\n[MOCK TELEMETRY WARNING] Twilio credentials omitted in environment. Emulating carrier dispatch logs.");
      console.log(`📲 [CARRIER SMS LOG] TO: ${recipient} | BODY: "${finalMsg}"`);
      console.log("\x1b[32m%s\x1b[0m", `✅ SIMULATED SMS SENT SUCCESSFULLY! [SID: MOCK_CLI_${Math.random().toString(36).substring(2, 9).toUpperCase()}]`);
      console.log("\x1b[36m%s\x1b[0m", "==========================================================");
      process.exit(0);
    }

    // Direct fetch to Twilio REST endpoint
    try {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const urlParams = new URLSearchParams();
      urlParams.append("To", recipient);
      urlParams.append("From", fromNumber);
      urlParams.append("Body", finalMsg);

      const twRes = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: urlParams
      });

      const data = await twRes.json();
      if (twRes.ok) {
        console.log("\x1b[32m%s\x1b[0m", `✅ TWILIO GATEWAY DISPATCH SUCCESSFUL! [SID: ${data.sid}]`);
      } else {
        console.error("\x1b[31m%s\x1b[0m", `❌ Twilio Dispatch Failed: ${data.message || "Unknown Error"}`);
      }
    } catch (twErr) {
      console.error("\x1b[31m%s\x1b[0m", "❌ Direct Twilio Gateway network request failed:", twErr.message);
    }
    console.log("\x1b[36m%s\x1b[0m", "==========================================================");
  }
}

dispatch();
