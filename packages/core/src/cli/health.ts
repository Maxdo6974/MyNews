import { checkAllSources, loadSources } from "../index";

const sources = loadSources();
console.log(`Vérification de ${sources.length} sources…\n`);
const results = await checkAllSources(sources);
for (const r of results) {
  const mark = r.ok ? "OK   " : "PANNE";
  console.log(`${mark} ${r.pays.padEnd(3)} ${r.nom.padEnd(26)} ${String(r.items).padStart(3)} éléments  ${r.error ?? ""}`);
}
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} sources fonctionnent.`);
