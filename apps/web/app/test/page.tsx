import { dailyBudgetEur, hasDatabase, isDemoMode, loadSources } from "@flash-info/core";
import Ingestion from "./Ingestion";
import SourcesHealth from "./SourcesHealth";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: 4, title: "Regrouper et classer", desc: "Regrouper les articles par événement, garder ceux confirmés par ≥ 2 groupes de presse." },
  { n: 5, title: "Extraire et vérifier les faits", desc: "Faits retenus et rejetés, avec la raison de chaque rejet." },
  { n: 5, title: "Écrire le script", desc: "Script du bulletin et résultat du contrôle qualité." },
  { n: 6, title: "Générer l'audio", desc: "Voix OpenAI et post-production, lecteur intégré." },
];

export default function TestPage() {
  const sources = loadSources();
  const demo = isDemoMode();
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
          { k: "Dépenses du jour", v: `0,00 € / ${dailyBudgetEur().toFixed(2).replace(".", ",")} €` },
        ].map((x) => (
          <div key={x.k} className="rounded-xl border border-line bg-card p-4">
            <p className="text-xs uppercase tracking-wider text-ink-soft">{x.k}</p>
            <p className="mt-1 font-semibold">{x.v}</p>
          </div>
        ))}
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
