# Avancement

| Étape | Statut |
|---|---|
| 1. Architecture | ✅ validée le 25/11/2026 |
| 2. Squelette en ligne (mot de passe, mode démo, /test, health-check) | ✅ en ligne sur Railway le 25/11/2026 |
| 3. Ingestion des flux + base de données | ✅ 25/11/2026 |
| 4. Regroupement et classement | ✅ 25/11/2026 |
| 5. Faits, vérification, script, contrôle qualité | ✅ 25/11/2026 |
| 6. Voix OpenAI et post-production audio | à faire |
| 7. Interface complète et lecteur audio | à faire |
| 8. Éditions planifiées et génération à la demande | à faire |
| 9. Comptes, flux RSS personnel, admin, signalements | à faire |
| 10. Tests, mentions légales, production | à faire |

## Étape 2 — contenu
- Monorepo npm : `apps/web` (Next.js 16, Tailwind 4), `packages/core` (logique métier, testée).
- Mot de passe de l'environnement de test (`STAGING_PASSWORD`), cookie de 30 jours.
- Mode démo (`DEMO_MODE=true`) : bulletin d'exemple pour toutes les combinaisons, lu par la voix du navigateur.
- Lecteur : parties cliquables, vitesse 0,8× à 1,5×, transcription surlignée, préférences mémorisées.
- Page `/test` : mode, présence des clés API, plafond de dépenses, test réel des 33 flux RSS.
- Analyse des flux RSS 2.0, RSS 1.0 (RDF) et Atom.
- Déploiement Railway via `Dockerfile` + `railway.json`.

## Étape 3 — contenu
- Base PostgreSQL : tables `sources`, `articles`, `ingestion_runs`, migrations automatiques au démarrage.
- Récupération toutes les 20 min (premier passage 15 s après le démarrage), verrou anti-doublon, 6 flux en parallèle.
- Requêtes conditionnelles (ETag / If-Modified-Since) pour ne pas recharger un flux inchangé.
- On ne stocke que titre, chapô nettoyé (600 caractères max) et lien ; articles de plus de 72 h ignorés ; conservation 7 jours.
- Doublons écartés par lien et par titre normalisé (même source).
- Page /test : bouton « Récupérer maintenant » (1 fois / 2 min max), volumes par pays et par groupe, historique des passages, détail par média, derniers articles filtrables par pays.
- Tests : 12 (dont un test d'intégration sur une vraie base PostgreSQL et un faux flux).

## Étape 4 — contenu
- Regroupement des articles par événement, sans API : similarité TF-IDF (titres ×2, noms propres ×1,6, début du chapô), classification hiérarchique à lien moyen, seuil 0,2, fenêtre 36 h, jamais entre deux langues.
- Seuil réglé sur 400 articles réels du 25/11 : à 0,15 apparaissaient de faux rapprochements, à 0,2 aucun repéré.
- Événement « confirmé » = au moins 2 groupes de presse différents. Score = groupes^1,5 × fraîcheur (demi-vie ≈ 12 h) × fiabilité × volume.
- Thèmes par mots-clés dans les 4 langues (mots entiers) ; une source spécialisée impose son thème. « À la une » détecté par les mots-clés du thème du moment.
- Filtre anti-bruit : paris sportifs, horoscope, jeux, vidéos récapitulatives.
- Royaume-Uni : inclut les sources internationales en anglais (BBC World, DW, France 24).
- Recalcul après chaque récupération ; page /test : événements par pays et thème, aperçu des 5 sujets qu'un bulletin retiendrait.
- Tests : 21.

## Étape 5 — contenu
- Modèle : Claude Sonnet 5.5 (`ANTHROPIC_MODEL`), température 0, réponses JSON forcées par outil.
- 1. Extraction : faits atomiques par événement, avec articles sources, type (fait / déclaration / chiffre), attribution, divergences ; événements qui ne sont pas de l'information écartés.
- 2. Corroboration par le code : un fait doit être rapporté par 2 groupes de presse, sinon il est attribué au média (« selon … »).
- 3. Vérification par un second appel indépendant, exigeant : chaque fait confirmé ou rejeté avec sa raison.
- 4. Choix des sujets : 3 (court) ou 4 (standard) événements ayant ≥ 2 faits retenus dont au moins un corroboré.
- 5. Rédaction pour l'oral, puis contrôle qualité par le code : longueur, mots de jugement hors citation (FR/EN), faits inconnus, chiffres absents des faits vérifiés, passage recopié (12 mots). Jusqu'à 2 réécritures avec la liste des défauts ; sinon le bulletin est refusé.
- Coûts journalisés par appel ; plafond quotidien (`DAILY_BUDGET_EUR`, 2 € par défaut) vérifié avant chaque appel.
- Cache de 15 min par combinaison ; une seule génération simultanée par combinaison.
- Lecteur : vrais bulletins en mode réel, fiche sources par sujet. Page /test : génération, script, faits retenus/rejetés et raisons, coût, historique.
- Tests : 28 (dont circuit complet avec IA simulée et plafond de dépenses).
- Premier bulletin réel (25/11/2026, n° 3, France, généraliste, court) : 3 sujets (BYD à Hambach, saisine de l'IGJ par G. Darmanin, grève Eurostar), 264 mots ≈ 1 min 50, 2 rédactions, 0,14 €, 62 s ; 33 faits extraits, 5 rejetés par le vérificateur (dates déduites, faits non soutenus par tous les articles cités).
- Corrections après les premiers essais réels : sorties structurées `output_config.format` (l'outil forcé n'est pas accepté par Sonnet 5.5), limites de longueur relevées.

## Limites connues
- Sources vérifiées depuis le serveur le 25/11/2026 : 33 actives et fonctionnelles.
  Désactivées : Le Figaro et Les Échos (HTTP 403, refusent les robots — non contourné), ancien flux Corriere et Gazzetta (figés), Le Point, Corriere v2/v3, Corriere dello Sport (en échec).
  Ajoutées : La Tribune, Le Monde Économie, Gazzetta (nouveau flux), ANSA Sport.
  À surveiller : moins de titres classés à droite côté France sans Le Figaro ; Corriere della Sera absent en Italie.
- Le compteur de dépenses affiche 0 € : il sera branché dès les premiers appels API (étape 5).
- La récupération tourne dans le même service que le site (plus simple) ; le worker séparé viendra à l'étape 8, quand les tâches longues (IA, voix) arriveront.
- Railway ne redéploie pas automatiquement à chaque envoi sur GitHub : redéploiement lancé à la main (palette Railway → « Deploy latest commit »).
- L'équilibre politique (règle 4) est demandé à l'IA et contrôlé par le vérificateur, mais pas encore mesuré par le code.
- Les thèmes par mots-clés font quelques erreurs (ex. un sujet budgétaire classé « International ») ; l'étape 5 (IA) pourra les corriger.
- Deux médias reprenant la même dépêche d'agence (AFP, dpa, ANSA…) comptent comme deux confirmations ; à traiter à l'étape 5.
- Un même débat peut être découpé en 2 ou 3 événements proches ; l'étape 5 pourra les fusionner.
- shadcn/ui n'est pas encore utilisé ; les composants sont en Tailwind simple.
