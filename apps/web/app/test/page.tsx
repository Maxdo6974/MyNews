import { THEMES, dailyBudget, hasDatabase, isDemoMode, loadSources, spentToday } from "@flash-info/core";
import Bulletins from "./Bulletins";
import Events from "./Events";
import Ingestion from "./Ingestion";
import SourcesHealth from "./SourcesHealth";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: 6, title: "Générer l'audio", desc: "Voix OpenAI et post-production, lecteur intégré." },
];

export default async function TestPage() {
  const sources = loadSources();
  const demo = isDemoMode();
  const spent = hasDatabase() ? await spentToday().catch(() => 0) : 0;
  const keys = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
  };
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Page de test</h1>
        <p className="text-sm text-ink-soft mt-1">Réservée à l'environnement de test. Chaque étape du pipeline pourra être lancée ici.</p>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { k: "Mode", v: demo ? "Démo" : "Réel" },
          { k: "Clé Anthropic", v: keys.anthropic ? "Renseignée" : "Absente" },
          { k: "Clé OpenAI", v: keys.openai ? "Renseignée" : "Absente" },
          { k: "Base de données", v: hasDatabase() ? "Connectée" : "Absente" },
          { k: "Dépenses du jour", v: `${spent.toFixed(2).replace(".", ",")} € / ${dailyBudget().toFixed(2).replace(".", ",")} €` },
        ].map((x) => (
          <div key={x.k} className="rounded-xl border border-line bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-ink-soft">{x.k}</p>
            <p className="mt-1 font-semibold">{x.v}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Bulletins réels</h2>
        <p className="text-sm text-ink-soft mt-1">
          Extraction des faits, vérification indépendante, rédaction, puis contrôle qualité par le code. Chaque fait rejeté est affiché avec sa raison.
        </p>
        {hasDatabase() ? (
          <Bulletins themes={THEMES.map((t) => ({ id: t.id, label: t.label.fr }))} demo={demo} hasKey={keys.anthropic} />
        ) : (
          <p className="mt-3 text-sm text-accent">Base de données non configurée.</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Événements détectés</h2>
        <p className="text-sm text-ink-soft mt-1">
          Articles regroupés par événement (36 dernières heures), classés par nombre de groupes de presse indépendants, fraîcheur et fiabilité.
          Recalculés après chaque récupération.
        </p>
        {hasDatabase() ? (
          <Events themes={THEMES.map((t) => ({ id: t.id, label: t.label.fr }))} />
        ) : (
          <p className="mt-3 text-sm text-accent">Base de données non configurée.</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">Articles récupérés</h2>
        <p className="text-sm text-ink-soft mt-1">
          Titres, chapôs et liens de chaque média, récupérés toutes les 20 minutes et conservés 7 jours.
        </p>
        {hasDatabase() ? (
          <Ingestion />
        ) : (
          <p className="mt-3 text-sm text-accent">Base de données non configurée (variable DATABASE_URL absente).</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">État des sources</h2>
        <p className="text-sm text-ink-soft mt-1">
          {sources.length} médias configurés. Le test interroge réellement chaque flux depuis le serveur.
        </p>
        <SourcesHealth />
      </section>

      <section>
        <h2 className="text-lg font-semibold">Étapes du pipeline</h2>
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-card">
          {STEPS.map((s) => (
            <li key={s.title} className="p-4 flex items-start gap-4">
              <div className="flex-1">
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-ink-soft">{s.desc}</p>
              </div>
              <span className="text-xs rounded-full border border-line px-2.5 py-1 text-ink-soft whitespace-nowrap">Étape {s.n}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
