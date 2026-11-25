# Avancement

| Étape | Statut |
|---|---|
| 1. Architecture | ✅ validée le 25/11/2026 |
| 2. Squelette en ligne (mot de passe, mode démo, /test, health-check) | ✅ en ligne sur Railway le 25/11/2026 |
| 3. Ingestion des flux + base de données | à faire |
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

## Limites connues
- Sources vérifiées depuis le serveur le 25/11/2026 : 33 actives et fonctionnelles.
  Désactivées : Le Figaro et Les Échos (HTTP 403, refusent les robots — non contourné), ancien flux Corriere et Gazzetta (figés), Le Point, Corriere v2/v3, Corriere dello Sport (en échec).
  Ajoutées : La Tribune, Le Monde Économie, Gazzetta (nouveau flux), ANSA Sport.
  À surveiller : moins de titres classés à droite côté France sans Le Figaro ; Corriere della Sera absent en Italie.
- Le compteur de dépenses affiche 0 € : il sera branché dès les premiers appels API (étape 5).
- Le worker séparé (`apps/worker`) arrive à l'étape 3 avec la base de données.
- shadcn/ui n'est pas encore utilisé ; les composants sont en Tailwind simple.
