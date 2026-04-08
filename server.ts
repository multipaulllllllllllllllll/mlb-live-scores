import { serveStatic } from "hono/bun";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer } from "vite";
import config from "./zosite.json";
import { Hono } from "hono";

type Mode = "development" | "production";
const app = new Hono();

const mode: Mode =
  process.env.NODE_ENV === "production" ? "production" : "development";

function calcHitterPoints(stats: any): number {
  const s = stats;
  const singles = Math.max(0, (s.hits || 0) - (s.doubles || 0) - (s.triples || 0) - (s.homeRuns || 0));
  return (
    singles * 3 +
    (s.doubles || 0) * 5 +
    (s.triples || 0) * 8 +
    (s.homeRuns || 0) * 10 +
    (s.rbi || 0) * 2 +
    (s.runs || 0) * 2 +
    (s.walks || 0) * 2 +
    (s.hitByPitch || 0) * 2 +
    (s.stolenBases || 0) * 5 -
    (s.caughtStealing || 0) * 1
  );
}

function calcPitcherPoints(stats: any): number {
  const s = stats;

  // inningsPitched might be "6.1", 6.1, "6", or "6.0"
  const ipRaw = s.inningsPitched ?? 0;
  const [wholeStr, fracStr = '0'] = String(ipRaw).split('.');
  const wholeInnings = parseInt(wholeStr, 10);
  const extraOuts = fracStr === '1' ? 1 : fracStr === '2' ? 2 : 0;
  const outs = wholeInnings * 3 + extraOuts;

  const walks = s.baseOnBalls || 0;      // ✅ correct DK field
  const hitBatters = s.hitBatsmen || 0;  // ✅ correct DK field

  return (
    outs * 0.75 +
    (s.strikeOuts || 0) * 2 +
    (s.wins || 0) * 4 -
    (s.earnedRuns || 0) * 2 -
    (s.hits || 0) * 0.6 -
    walks * 0.6 -
    hitBatters * 0.6 +
    (s.completeGames || 0) * 2.5 +
    (s.shutouts || 0) * 2.5 +
    (s.noHitters || 0) * 5
  );
}


async function fetchScores(dateStr: string) {
  const scheduleRes = await fetch(
    `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateStr}&gameType=R`,
    { headers: { "User-Agent": "mlb-live-scores/1.0" } }
  );
  if (!scheduleRes.ok) throw new Error("Failed to fetch schedule");
  const schedule = await scheduleRes.json();
  const games: any[] = schedule.dates?.[0]?.games || [];

  const liveGames = games.filter(
    (g) => g.status?.abstractGameCode === "L" || g.status?.abstractGameCode === "R"
  );
  const doneGames = games.filter((g) => g.status?.abstractGameCode === "F");
  const preGames = games.filter((g) => g.status?.abstractGameCode === "P" || g.status?.abstractGameCode === "S");

  return { games, liveGames, doneGames, preGames };
}

async function fetchAllScores(dateStr: string) {
  const { games, liveGames, doneGames, preGames } = await fetchScores(dateStr);

  let gameDate = dateStr;
  let gamesOnDate = games;
  let liveOrDone = liveGames.length > 0 || doneGames.length > 0;

  if (!liveOrDone) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().split("T")[0];
    const yData = await fetchScores(yesterday);
    gameDate = yesterday;
    gamesOnDate = yData.games;
    liveOrDone = yData.liveGames.length > 0 || yData.doneGames.length > 0;
  }

  // Determine next game start time
  let nextGameTime: string | null = null;
  if (liveOrDone) {
    const futureDates: string[] = [];
    const t = new Date(dateStr);
    for (let i = 1; i <= 7; i++) {
      t.setDate(t.getDate() + i);
      futureDates.push(t.toISOString().split("T")[0]);
    }
    for (const fd of futureDates) {
      const fdData = await fetchScores(fd);
      if (fdData.games.length > 0) {
        const firstPre = fdData.games
          .filter((g) => g.status?.abstractGameCode === "P" || g.status?.abstractGameCode === "S")
          .sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime());
        if (firstPre.length > 0) {
          nextGameTime = firstPre[0].gameDate;
          break;
        }
      }
    }
  } else {
    const earliestPre = [...preGames].sort(
      (a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime()
    );
    if (earliestPre.length > 0) nextGameTime = earliestPre[0].gameDate;
  }

  // Build gamesStatus
  let gamesStatus: "live" | "completed" | "pre_game" = "pre_game";
  if (liveGames.length > 0) gamesStatus = "live";
  else if (doneGames.length > 0) gamesStatus = "completed";
  else gamesStatus = "pre_game";

  // Fetch boxscores for live + completed games
  const relevantGames = gamesOnDate.filter(
    (g) =>
      g.status?.abstractGameCode === "L" ||
      g.status?.abstractGameCode === "R" ||
      g.status?.abstractGameCode === "F"
  );

  // When falling back to yesterday, relevantGames comes from gamesOnDate (yesterday)
  // When today's games are live/done, relevantGames comes from today's games
  // If liveOrDone is false, gamesOnDate = yesterday so relevantGames is correct
  // If liveOrDone is true, gamesOnDate = today so relevantGames is correct

  const hitterMap = new Map();
  const pitcherMap = new Map();

  for (const game of relevantGames) {
    try {
      const bsRes = await fetch(
        `https://statsapi.mlb.com/api/v1/game/${game.gamePk}/boxscore`,
        { headers: { "User-Agent": "mlb-live-scores/1.0" } }
      );
      if (!bsRes.ok) continue;
      const bs = await bsRes.json();
      const teams = [bs.teams?.away, bs.teams?.home].filter(Boolean);

      for (const team of teams) {
        const teamAbbr = team.team?.abbreviation || team.team?.name || "UNK";
        const allPlayers: Record<string, any> = {};
        for (const p of Object.values(team.players || {})) {
          const pp = p as any;
          allPlayers[pp.person?.id] = pp;
        }

        // Pitchers — from boxscore top-level pitchers array
        try {
          for (const pid of team.pitchers || []) {
            const p = allPlayers[pid];
            if (!p) continue;
            const stats = p.stats?.pitching;
            if (!stats || stats.gamesPitched == null) continue;
            const pts = calcPitcherPoints(stats);
            const key = `${pid}-${p.person?.fullName}`;
            const existing = pitcherMap.get(key);
            if (!existing || existing.points < pts) {
              pitcherMap.set(key, {
                pid,
                name: p.person?.fullName || "Unknown",
                team: teamAbbr,
                points: pts,
                ip: parseFloat(parseFloat(String(stats.inningsPitched || "0")).toFixed(1)),
                //h: stats.hitsAllowed || 0,
                h: stats.hits || 0,
                r: stats.runs || 0,
                bb: stats.baseOnBalls  || 0,
                so: stats.strikeOuts || 0,
                wins: stats.wins || 0,
                era: stats.era || "0.00",
              });
            }
          }
        } catch (e) {
          console.error(`Error processing pitchers for game ${game.gamePk}:`, e);
        }

        // Hitters — batting stats
        try {
          for (const [pid, p] of Object.entries(allPlayers)) {
            const pp = p as any;
            const posCode = pp.position?.code;
            if (posCode === "1") continue; // skip pitcher position
            const stats = pp.stats?.batting;
            if (!stats || stats.gamesPlayed == null) continue;
            const ab = stats.atBats || 0;
            const hits = stats.hits || 0;
            if (ab === 0 && hits === 0) continue;
            const pts = calcHitterPoints(stats);
            const key = `${pid}-${pp.person?.fullName}`;
            const existing = hitterMap.get(key);
            if (!existing || existing.points < pts) {
              hitterMap.set(key, {
                pid,
                name: pp.person?.fullName || "Unknown",
                team: teamAbbr,
                pos: pp.position?.abbreviation || "N/A",
                points: pts,
                ab,
                hits,
                doubles: stats.doubles || 0,
                triples: stats.triples || 0,
                hr: stats.homeRuns || 0,
                rbi: stats.rbi || 0,
                runs: stats.runs || 0,
                walks: stats.baseOnBalls || 0,
                hbp: stats.hitByPitch || 0,
                sb: stats.stolenBases || 0,
                cs: stats.caughtStealing || 0,                
              });
            }
          }
        } catch (e) {
          console.error(`Error processing hitters for game ${game.gamePk}:`, e);
        }
      }
    } catch (e) {
      console.error(`Error fetching boxscore for game ${game.gamePk}:`, e);
    }
  }

  const allHitters = [...hitterMap.values()].sort((a, b) => b.points - a.points);
  const allPitchers = [...pitcherMap.values()].sort((a, b) => b.points - a.points);

  const hitters = allHitters.slice(0, 50).map((h, i) => ({ ...h, rank: i + 1 }));
  const pitchers = allPitchers.slice(0, 50).map((p, i) => ({ ...p, rank: i + 1 }));

  return {
    hitters,
    pitchers,
    lastUpdated: new Date().toISOString(),
    gamesPlayed: relevantGames.length,
    gamesStatus,
    nextGameTime,
    dataDate: gameDate,
  };
}

app.get("/api/scores", async (c) => {
  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const result = await fetchAllScores(todayStr);
    return c.json(result);
  } catch (err) {
    console.error("Error fetching MLB data:", err);
    return c.json({ error: "Failed to fetch MLB data", detail: String(err) }, 500);
  }
});

if (mode === "production") {
  configureProduction(app);
} else {
  await configureDevelopment(app);
}

const port = process.env.PORT
  ? parseInt(process.env.PORT, 10)
  : mode === "production"
    ? (config.publish?.published_port ?? config.local_port)
    : config.local_port;

export default { fetch: app.fetch, port, idleTimeout: 255 };

function configureProduction(app: Hono) {
  app.use("/assets/*", serveStatic({ root: "./dist" }));
  app.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 302));
  app.use(async (c, next) => {
    if (c.req.method !== "GET") return next();
    const path = c.req.path;
    if (path.startsWith("/api/") || path.startsWith("/assets/")) return next();
    const file = Bun.file(`./dist${path}`);
    if (await file.exists()) {
      const stat = await file.stat();
      if (stat && !stat.isDirectory()) return new Response(file);
    }
    return serveStatic({ path: "./dist/index.html" })(c, next);
  });
}

async function configureDevelopment(app: Hono): Promise<ViteDevServer> {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return next();
    if (c.req.path === "/favicon.ico") return c.redirect("/favicon.svg", 302);
    const url = c.req.path;
    try {
      if (url === "/" || url === "/index.html") {
        let template = await Bun.file("./index.html").text();
        template = await vite.transformIndexHtml(url, template);
        return c.html(template, { headers: { "Cache-Control": "no-store, must-revalidate" } });
      }
      const publicFile = Bun.file(`./public${url}`);
      if (await publicFile.exists()) {
        const stat = await publicFile.stat();
        if (stat && !stat.isDirectory()) return new Response(publicFile, { headers: { "Cache-Control": "no-store, must-revalidate" } });
      }
      let result;
      try { result = await vite.transformRequest(url); } catch { result = null; }
      if (result) return new Response(result.code, { headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store, must-revalidate" } });
      let template = await Bun.file("./index.html").text();
      template = await vite.transformIndexHtml("/", template);
      return c.html(template, { headers: { "Cache-Control": "no-store, must-revalidate" } });
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      console.error(error);
      return c.text("Internal Server Error", 500);
    }
  });
  return vite;
}
