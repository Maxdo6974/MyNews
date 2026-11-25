import type { SourceLanguage } from "./types";

/** Mots vides par langue : trop fréquents pour distinguer deux événements. */
const STOPWORDS: Record<SourceLanguage, string> = {
  fr: `a au aux avec ce ces cet cette dans de des du elle elles en est et eux il ils je la le les leur leurs lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous c d j l m n s t y ete etre avoir a ont sont fait faire plus moins tres tout tous toute toutes apres avant selon depuis entre sans sous contre chez comme alors aussi encore deja ici la-bas bien peu cela ca dont lors quand ou donc car si oui non vers pendant direct live video photos ce mercredi jeudi vendredi samedi dimanche lundi mardi hier aujourd demain an ans annee mois semaine jour jours heure heures fois premier premiere deux trois nouveau nouvelle nouveaux veut doit peut va vont selon apres-midi matin soir`,
  en: `a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its just more most new no not of on one or our out over said says she so some than that the their them then there these they this to up us was we were what when where which who why will with would you your after before about against amid also back being between both during first get got make may might much must now off only other own same should since still such through two under until very via while live latest news video watch wednesday thursday friday saturday sunday monday tuesday year years week day days today yesterday`,
  it: `a ad al alla alle allo agli ai anche che chi ci con cui da dal dalla dalle dai degli dei del della delle dello di e ed era gli ha hanno ho i il in io la le lei lo loro lui ma mi ne nel nella nelle nei negli noi non o per piu poi quale quando quello questa questo se si sono su sua suo sue suoi sul sulla tra tu un una uno vi anni anno oggi ieri domani dopo prima ecco come dove ancora gia mercoledi giovedi venerdi sabato domenica lunedi martedi diretta video foto nuovo nuova due tre essere stato stata fa fare`,
  de: `aber als am an auch auf aus bei bin bis da das dass dem den der des die doch du durch ein eine einem einen einer eines er es fur hat hatte ich ihr im in ist ja jetzt kann kein keine man mehr mit nach nicht noch nun nur oder ohne sein seine sich sie sind so uber um und uns unter vom von vor war was wenn werden wie wir wird zu zum zur heute gestern morgen jahr jahre jahren mittwoch donnerstag freitag samstag sonntag montag dienstag neue neuer neues zwei drei soll sollen will wollen gibt viele live ticker video`,
};

const STOP: Record<SourceLanguage, Set<string>> = Object.fromEntries(
  Object.entries(STOPWORDS).map(([k, v]) => [k, new Set(v.split(/\s+/))]),
) as Record<SourceLanguage, Set<string>>;

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
}

/** Racinisation volontairement simple et multilingue : on coupe les mots longs à 7 lettres. */
function stem(token: string): string {
  let t = token;
  if (t.length > 4 && /[sx]$/.test(t)) t = t.slice(0, -1);
  return t.length > 7 ? t.slice(0, 7) : t;
}

/**
 * Découpe un texte en racines significatives.
 * Les mots à majuscule au milieu d'un titre (noms propres) sont marqués : ils pèsent davantage.
 */
export function tokenize(text: string, lang: SourceLanguage): { stem: string; proper: boolean }[] {
  const out: { stem: string; proper: boolean }[] = [];
  const words = text.replace(/[’']/g, " ").split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
  words.forEach((w, i) => {
    for (const part of w.split("-")) {
      if (!part) continue;
      const plain = stripAccents(part).toLowerCase();
      if (plain.length < 3 && !/^\d+$/.test(plain)) continue;
      if (STOP[lang].has(plain)) continue;
      const proper = i > 0 && /^\p{Lu}/u.test(part) && part.length > 2;
      out.push({ stem: stem(plain), proper });
    }
  });
  return out;
}
