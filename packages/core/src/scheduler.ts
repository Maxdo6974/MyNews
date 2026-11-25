import { hasDatabase, migrate } from "./db";
import { purgeOldAudio } from "./audio";
import { computeAllEvents } from "./events";
import { ingestAll } from "./ingest";

const g = globalThis as unknown as { __flashScheduler?: NodeJS.Timeout };

function log(msg: string) {
  console.log(`[flash-info] ${new Date().toISOString()} ${msg}`);
}

/**
 * Démarre la récupération planifiée des flux (toutes les INGEST_INTERVAL_MIN minutes, 20 par défaut).
 * Appelé une fois au démarrage du serveur. Sans base de données, ne fait rien.
 */
export async function startScheduler(): Promise<void> {
  if (g.__flashScheduler) return;
  if (!hasDatabase()) {
    log("DATABASE_URL absente : récupération des flux désactivée.");
    return;
  }
  if (process.env.INGEST_ENABLED === "false") {
    log("INGEST_ENABLED=false : récupération planifiée désactivée.");
    return;
  }
  const applied = await migrate();
  if (applied.length) log(`Migrations appliquées : ${applied.join(", ")}`);

  const minutes = Math.max(5, Number(process.env.INGEST_INTERVAL_MIN ?? "20"));
  const run = async (trigger: "planifie" | "demarrage") => {
    try {
      const r = await ingestAll(trigger);
      if (r.skipped) log(`Récupération ignorée : ${r.reason}`);
      else log(`Récupération ${r.runId} : ${r.newArticles} nouveaux articles, ${r.sourcesOk} sources OK, ${r.sourcesKo} en échec (${Math.round(r.durationMs / 1000)} s)`);
      const ev = await computeAllEvents();
      log(`Événements : ${ev.map((e) => `${e.pays} ${e.confirmed} confirmés`).join(", ")}`);
      const purged = await purgeOldAudio();
      if (purged) log(`Audio de plus de 7 jours supprimé : ${purged} fichier(s).`);
    } catch (e) {
      log(`Erreur de récupération : ${(e as Error).message}`);
    }
  };
  g.__flashScheduler = setInterval(() => run("planifie"), minutes * 60_000);
  setTimeout(() => run("demarrage"), 15_000);
  log(`Récupération planifiée toutes les ${minutes} min.`);
}
