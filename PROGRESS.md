# Avancement

| Étape | Statut |
|---|---|
| 1. Architecture | ✅ validée le 25/11/2026 |
| 2. Squelette en ligne (mot de passe, mode démo, /test, health-check) | ✅ en ligne sur Railway le 25/11/2026 |
| 3. Ingestion des flux + base de données | ✅ 25/11/2026 |
| 4. Regroupement et classement | à faire |
| 5. Faits, vérification, script, contrôle qualité | à faire |
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

## Limites connues
- Sources vérifiées depuis le serveur le 25/11/2026 : 33 actives et fonctionnelles.
  Désactivées : Le Figaro et Les Échos (HTTP 403, refusent les robots — non contourné), ancien flux Corriere et Gazzetta (figés), Le Point, Corriere v2/v3, Corriere dello Sport (en échec).
  Ajoutées : La Tribune, Le Monde Économie, Gazzetta (nouveau flux), ANSA Sport.
  À surveiller : moins de titres classés à droite côté France sans Le Figaro ; Corriere della Sera absent en Italie.
- Le compteur de dépenses affiche 0 € : il sera branché dès les premiers appels API (étape 5).
- La récupération tourne dans le même service que le site (plus simple) ; le worker séparé viendra à l'étape 8, quand les tâches longues (IA, voix) arriveront.
- Railway ne redéploie pas automatiquement à chaque envoi sur GitHub : redéploiement lancé à la main (palette Railway → « Deploy latest commit »).
- shadcn/ui n'est pas encore utilisé ; les composants sont en Tailwind simple.
