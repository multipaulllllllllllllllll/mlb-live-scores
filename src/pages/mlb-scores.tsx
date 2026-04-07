import { useState, useEffect, useCallback } from "react";

interface Hitter {
  rank: number;
  name: string;
  team: string;
  pos: string;
  points: number;
  ab: number;
  hits: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
}

interface Pitcher {
  rank: number;
  name: string;
  team: string;
  points: number;
  ip: number;
  h: number;
  r: number;
  bb: number;
  so: number;
}

interface ScoreData {
  hitters: Hitter[];
  pitchers: Pitcher[];
  lastUpdated: string;
  gamesPlayed: number;
  gamesStatus?: "live" | "completed" | "pre_game";
  nextGameTime?: string | null;
  dataDate?: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
}

function formatNextGameTime(iso: string | null | undefined): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  const et = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return `${et} ET`;
}

export default function MlbScores() {
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"hitters" | "pitchers">("hitters");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scores");
      if (!res.ok) throw new Error("Failed to fetch");
      const json: ScoreData = await res.json();
      setData(json);
      setLastFetch(new Date());
    } catch (e: any) {
      setError(e.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const hitters = data?.hitters || [];
  const pitchers = data?.pitchers || [];
  const active = activeTab === "hitters" ? hitters : pitchers;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-700 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white">MLB Live Scoring</h1>
              <p className="text-slate-400 text-sm">DraftKings Best Ball Points — Top 50</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {lastFetch && (
                <span className="text-slate-500 text-xs">
                  Last pulled: {formatTime(lastFetch.toISOString())}
                </span>
              )}
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="accent-blue-500"
                />
                15min
              </label>
              <button
                onClick={fetchData}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-sm font-medium rounded transition-colors"
              >
                {loading ? "Loading..." : "Refresh Data"}
              </button>
            </div>
          </div>
          {data && (
            <div className="mt-2 text-xs text-slate-500">
              {data.gamesPlayed} games on {data.dataDate} · {hitters.length} hitters · {pitchers.length} pitchers
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("hitters")}
              className={`px-5 py-2 text-sm font-medium rounded-t border-b-2 transition-colors ${
                activeTab === "hitters"
                  ? "border-blue-500 text-blue-400 bg-slate-800"
                  : "border-transparent text-slate-400 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              Hitters
              {hitters.length > 0 && (
                <span className="ml-2 text-xs bg-slate-700 px-2 py-0.5 rounded-full">{hitters.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("pitchers")}
              className={`px-5 py-2 text-sm font-medium rounded-t border-b-2 transition-colors ${
                activeTab === "pitchers"
                  ? "border-blue-500 text-blue-400 bg-slate-800"
                  : "border-transparent text-slate-400 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              Pitchers
              {pitchers.length > 0 && (
                <span className="ml-2 text-xs bg-slate-700 px-2 py-0.5 rounded-full">{pitchers.length}</span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Pre-game notice */}
      {data && data.gamesStatus === "pre_game" && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <div className="bg-blue-900/30 border border-blue-700 rounded p-3 text-sm text-blue-300">
            No games in progress.{" "}
            {data.nextGameTime && (
              <>Next games start at <strong>{formatTime(data.nextGameTime)}</strong>.</>
            )}{" "}
            Showing data from {data.dataDate}.
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-red-900/30 border border-red-700 rounded p-4 text-red-300 text-sm">{error}</div>
        </div>
      )}

      {/* Tables */}
      {data && data.gamesPlayed > 0 && (
        <div className="max-w-7xl mx-auto px-4 py-6">
          {activeTab === "hitters" ? (
            <HitterTable hitters={hitters} />
          ) : (
            <PitcherTable pitchers={pitchers} />
          )}

          {/* Scoring reference */}
          <div className="mt-6 bg-slate-900 rounded p-4 text-xs text-slate-500">
            <strong className="text-slate-400">DraftKings Best Ball Scoring:</strong>
            &nbsp;Hitters: 1B=3, 2B=5, 3B=8, HR=10, RBI=2, R=2, BB=2, HBP=2, SB=5, CS=-1
            &nbsp;·&nbsp;
            Pitchers: IP=2.25, K=2, W=4, ER=-2, H=-0.6, BB=-0.6, HBP=-0.6, CG=2.5, SHO=2.5, NH=5
          </div>
        </div>
      )}
    </div>
  );
}

function HitterTable({ hitters }: { hitters: Hitter[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-800 text-slate-300">
            <th className="px-3 py-2 text-left font-semibold">#</th>
            <th className="px-3 py-2 text-left font-semibold">Name</th>
            <th className="px-3 py-2 text-left font-semibold">Team</th>
            <th className="px-3 py-2 text-left font-semibold">Pos</th>
            <th className="px-3 py-2 text-right font-semibold">Total Pts</th>
            <th className="px-3 py-2 text-right font-semibold">AB</th>
            <th className="px-3 py-2 text-right font-semibold">H</th>
            <th className="px-3 py-2 text-right font-semibold">2B</th>
            <th className="px-3 py-2 text-right font-semibold">3B</th>
            <th className="px-3 py-2 text-right font-semibold">HR</th>
            <th className="px-3 py-2 text-right font-semibold">RBI</th>
          </tr>
        </thead>
        <tbody>
          {hitters.map((h) => (
            <tr key={h.rank} className="border-t border-slate-800 hover:bg-slate-900/50 transition-colors">
              <td className="px-3 py-2 text-slate-400">{h.rank}</td>
              <td className="px-3 py-2 font-medium text-white">{h.name}</td>
              <td className="px-3 py-2 text-slate-400">{h.team}</td>
              <td className="px-3 py-2 text-slate-400">{h.pos}</td>
              <td className="px-3 py-2 text-right font-bold text-green-400">{h.points.toFixed(2)}</td>
              <td className="px-3 py-2 text-right text-slate-300">{h.ab}</td>
              <td className="px-3 py-2 text-right text-slate-300">{h.hits}</td>
              <td className="px-3 py-2 text-right text-slate-300">{h.doubles}</td>
              <td className="px-3 py-2 text-right text-slate-300">{h.triples}</td>
              <td className="px-3 py-2 text-right text-slate-300">{h.hr}</td>
              <td className="px-3 py-2 text-right text-slate-300">{h.rbi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PitcherTable({ pitchers }: { pitchers: Pitcher[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-800 text-slate-300">
            <th className="px-3 py-2 text-left font-semibold">#</th>
            <th className="px-3 py-2 text-left font-semibold">Name</th>
            <th className="px-3 py-2 text-left font-semibold">Team</th>
            <th className="px-3 py-2 text-right font-semibold">Total Pts</th>
            <th className="px-3 py-2 text-right font-semibold">IP</th>
            <th className="px-3 py-2 text-right font-semibold">H</th>
            <th className="px-3 py-2 text-right font-semibold">R</th>
            <th className="px-3 py-2 text-right font-semibold">BB</th>
            <th className="px-3 py-2 text-right font-semibold">SO</th>
          </tr>
        </thead>
        <tbody>
          {pitchers.map((p) => (
            <tr key={p.rank} className="border-t border-slate-800 hover:bg-slate-900/50 transition-colors">
              <td className="px-3 py-2 text-slate-400">{p.rank}</td>
              <td className="px-3 py-2 font-medium text-white">{p.name}</td>
              <td className="px-3 py-2 text-slate-400">{p.team}</td>
              <td className="px-3 py-2 text-right font-bold text-green-400">{p.points.toFixed(2)}</td>
              <td className="px-3 py-2 text-right text-slate-300">{p.ip.toFixed(1)}</td>
              <td className="px-3 py-2 text-right text-slate-300">{p.h}</td>
              <td className="px-3 py-2 text-right text-slate-300">{p.r}</td>
              <td className="px-3 py-2 text-right text-slate-300">{p.bb}</td>
              <td className="px-3 py-2 text-right text-slate-300">{p.so}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
