import React, { useState } from "react";
import { AlertLogEntry, exportAlertLogCSV, exportIncidentSummaryTXT } from "../utils/exportReport";

/**
 * AlertHistoryPanel
 * ------------------------------------------------------------------
 * Drop this file into: src/components/AlertHistoryPanel.tsx
 * (also requires src/utils/exportReport.ts from the same batch)
 *
 * Usage:
 *
 *   import AlertHistoryPanel from "./components/AlertHistoryPanel";
 *   ...
 *   <AlertHistoryPanel entries={alertLog} venueName="Main Stadium" />
 *
 * WIRING IT TO YOUR EXISTING ALERT PIPELINE:
 * Wherever your app currently fires an SMS/Call (likely near your
 * Twilio call in server.ts / sms-alert-system.js, surfaced to the
 * frontend via your existing log stream), push a matching entry into
 * an `alertLog` state array, e.g.:
 *
 *   setAlertLog(prev => [...prev, {
 *     id: crypto.randomUUID(),
 *     timestamp: new Date().toISOString(),
 *     zoneName: zone.name,
 *     densityPercent: zone.density,
 *     channel: "SMS",
 *     recipient: alertRecipientNumber,
 *     status: "sent",       // or "simulated" / "failed"
 *     twilioSid: result.sid // if available
 *   }, ...prev]);
 *
 * If you don't want to wire it up yet, this component works fine
 * with an empty array and still demos the export buttons.
 * ------------------------------------------------------------------
 */

interface AlertHistoryPanelProps {
  entries: AlertLogEntry[];
  venueName?: string;
}

export default function AlertHistoryPanel({ entries, venueName }: AlertHistoryPanelProps) {
  const [filter, setFilter] = useState<"all" | "SMS" | "CALL">("all");

  const filtered = entries.filter((e) => filter === "all" || e.channel === filter);
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const statusColor: Record<AlertLogEntry["status"], string> = {
    sent: "text-green-400",
    simulated: "text-yellow-400",
    failed: "text-red-400",
  };

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4 text-gray-100 shadow-lg flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-gray-300">
          Alert History Log
        </h3>
        <span className="text-xs text-gray-400">{entries.length} total</span>
      </div>

      <div className="flex items-center gap-2">
        {(["all", "SMS", "CALL"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2 py-1 rounded text-xs font-medium border ${
              filter === f
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-transparent border-gray-700 text-gray-400 hover:text-gray-200"
            }`}
          >
            {f}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => exportAlertLogCSV(entries)}
          disabled={entries.length === 0}
          className="px-2 py-1 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Export CSV
        </button>
        <button
          onClick={() => exportIncidentSummaryTXT(entries, { venueName })}
          disabled={entries.length === 0}
          className="px-2 py-1 rounded text-xs font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Export Summary
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="text-xs text-gray-500 italic py-4 text-center">
            No alerts logged yet. They'll appear here as they fire.
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-gray-400 border-b border-gray-700">
              <tr>
                <th className="text-left py-1 pr-2">Time</th>
                <th className="text-left py-1 pr-2">Zone</th>
                <th className="text-left py-1 pr-2">Density</th>
                <th className="text-left py-1 pr-2">Channel</th>
                <th className="text-left py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id} className="border-b border-gray-800/60">
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-1 pr-2">{e.zoneName}</td>
                  <td className="py-1 pr-2">{e.densityPercent}%</td>
                  <td className="py-1 pr-2">{e.channel}</td>
                  <td className={`py-1 font-medium ${statusColor[e.status]}`}>{e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
