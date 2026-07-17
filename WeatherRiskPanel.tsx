import React, { useEffect, useState } from "react";

/**
 * WeatherRiskPanel
 * ------------------------------------------------------------------
 * Drop this file into: src/components/WeatherRiskPanel.tsx
 *
 * Zero new dependencies. Uses the free, keyless Open-Meteo API,
 * so it will work immediately with no .env changes.
 *
 * Usage in your app (e.g. App.tsx or your center column):
 *
 *   import WeatherRiskPanel from "./components/WeatherRiskPanel";
 *   ...
 *   <WeatherRiskPanel lat={13.0827} lon={80.2707} />
 *
 * (Swap lat/lon for your venue's coordinates, or wire it to whatever
 * "selected zone" location state you already have.)
 * ------------------------------------------------------------------
 */

interface WeatherRiskPanelProps {
  lat: number;
  lon: number;
  venueName?: string;
}

interface WeatherSnapshot {
  temperatureC: number;
  windSpeedKmh: number;
  precipitationMm: number;
  weatherCode: number;
}

// Minimal WMO weather code -> label map (covers common cases)
const WEATHER_LABELS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  51: "Light drizzle",
  61: "Light rain",
  63: "Moderate rain",
  65: "Heavy rain",
  80: "Rain showers",
  95: "Thunderstorm",
};

function describeWeather(code: number): string {
  return WEATHER_LABELS[code] ?? "Unknown conditions";
}

/**
 * Very simple, explainable heuristic: each factor adds a bounded
 * amount to a 0-100 "environmental risk multiplier" that you can
 * combine with your existing density score. Tune freely.
 */
function computeEnvironmentalRisk(snapshot: WeatherSnapshot): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  if (snapshot.temperatureC >= 35) {
    score += 30;
    reasons.push("Extreme heat increases fatigue & medical incident risk");
  } else if (snapshot.temperatureC >= 30) {
    score += 15;
    reasons.push("High heat raises crowd fatigue risk");
  }

  if (snapshot.windSpeedKmh >= 40) {
    score += 25;
    reasons.push("High winds — structural/canopy hazard");
  } else if (snapshot.windSpeedKmh >= 25) {
    score += 10;
    reasons.push("Moderate winds may affect signage/temp structures");
  }

  if (snapshot.precipitationMm >= 5) {
    score += 25;
    reasons.push("Active rainfall — slip hazard, bottlenecked exits");
  } else if (snapshot.precipitationMm > 0) {
    score += 10;
    reasons.push("Light rain — surfaces may be slick");
  }

  if (snapshot.weatherCode >= 95) {
    score += 20;
    reasons.push("Thunderstorm risk — consider evacuation readiness");
  }

  return { score: Math.min(score, 100), reasons };
}

export default function WeatherRiskPanel({ lat, lon, venueName }: WeatherRiskPanelProps) {
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchWeather() {
      setLoading(true);
      setError(null);
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,precipitation,weather_code`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Weather API returned ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setSnapshot({
          temperatureC: data.current.temperature_2m,
          windSpeedKmh: data.current.wind_speed_10m,
          precipitationMm: data.current.precipitation,
          weatherCode: data.current.weather_code,
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load weather");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchWeather();
    const interval = setInterval(fetchWeather, 5 * 60 * 1000); // refresh every 5 min
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [lat, lon]);

  const risk = snapshot ? computeEnvironmentalRisk(snapshot) : null;

  const riskColor =
    risk == null
      ? "bg-gray-500"
      : risk.score >= 60
      ? "bg-red-600"
      : risk.score >= 30
      ? "bg-yellow-500"
      : "bg-green-600";

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4 text-gray-100 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold tracking-wide uppercase text-gray-300">
          Environmental Risk {venueName ? `— ${venueName}` : ""}
        </h3>
        {risk && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold text-white ${riskColor}`}>
            {risk.score}/100
          </span>
        )}
      </div>

      {loading && <p className="text-sm text-gray-400">Fetching live weather…</p>}
      {error && <p className="text-sm text-red-400">Weather unavailable: {error}</p>}

      {snapshot && !loading && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <div>
              <div className="text-lg font-bold">{snapshot.temperatureC.toFixed(1)}°C</div>
              <div className="text-xs text-gray-400">Temp</div>
            </div>
            <div>
              <div className="text-lg font-bold">{snapshot.windSpeedKmh.toFixed(0)} km/h</div>
              <div className="text-xs text-gray-400">Wind</div>
            </div>
            <div>
              <div className="text-lg font-bold">{snapshot.precipitationMm.toFixed(1)} mm</div>
              <div className="text-xs text-gray-400">Precip</div>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-2">{describeWeather(snapshot.weatherCode)}</p>

          {risk && risk.reasons.length > 0 && (
            <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
              {risk.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          {risk && risk.reasons.length === 0 && (
            <p className="text-xs text-green-400">No elevated environmental risk factors.</p>
          )}
        </>
      )}
    </div>
  );
}

// Optional named export so callers can fold this into their own
// combined density+environment score without re-fetching.
export { computeEnvironmentalRisk };
export type { WeatherSnapshot };
