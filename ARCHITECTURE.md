# Flash Info — Architecture (étape 1, à valider)

## 1. Vue d'ensemble

```
                 ┌──────────────────────── Railway (un seul compte) ────────────────────────┐
                 │                                                                           │
 Navigateur ───► │  web  (Next.js)          worker (Node)              PostgreSQL + pgvector │
 mobile / PC     │  - interface + lecteur   - ingestion RSS /20 min     Redis (file de jobs)  │
                 │  - API                   - pipeline éditorial        Volume disque (MP3)   │
                 │  - /test, /admin         - synthèse vocale                                 │
                 └────────────┬──────────────────────┬──────────────────────────────────────┘
                              │                      │
                              │            API Anthropic (faits, vérification, script)
                              │            API OpenAI (voix)
                              └── flux RSS des médias (FR, IT, DE, UK, international)
```

**Proposition de changement par rapport au cahier des charges** : héberger *tout* sur Railway (site, worker, base, Redis, stockage des MP3) au lieu de Vercel + Railway + Neon + Upstash + R2.
Raison : **un seul compte, une seule facture, un seul endroit à surveiller**, ce qui est bien plus simple pour vous. On pourra passer les MP3 sur Cloudflare R2 plus tard si le volume grossit ; le code passe par une interface `Storage` pour que ce soit un simple réglage.

## 2. Organisation du code

```
flash-info/
├── apps/
│   ├── web/        Next.js (App Router) + Tailwind + shadcn/ui — interface, lecteur, API, /test, /admin
│   └── worker/     jobs planifiés et à la demande (BullMQ)
├── packages/
│   └── core/       toute la logique métier, testée indépendamment :
│                   ingestion, clustering, classement, extraction des faits,
│                   vérification, rédaction, contrôle qualité, TTS, audio, coûts
├── config/
│   ├── sources.yaml      médias par pays (statut vérifié par le serveur)
│   ├── themes.ts         thèmes + mots-clés + « À la une » par pays
│   └── personas.ts       2 voix (nom affiché, voix OpenAI, instructions de ton)
├── fixtures/       articles enregistrés + MP3 d'exemple pour le mode démo et les tests
├── EDITORIAL_RULES.md
└── docker-compose.yml   (développement local uniquement)
```

## 3. Schéma de données (simplifié)

| Table | Contenu principal |
|---|---|
| `Source` | id, nom, pays, langue, groupe, poids, url, statut (ok / en panne / à vérifier), dernier contrôle |
| `Article` | source, titre, chapô, url, date de publication, langue, thèmes détectés, embedding |
| `Cluster` | événement regroupant ≥ 1 article ; pays, thème, nb de sources indépendantes, score |
| `Fact` | cluster, énoncé, chiffres, attribution, sources qui le confirment, statut (retenu / rejeté + raison) |
| `Bulletin` | pays, thème, langue, durée cible, édition (matin/midi/soir/à la demande), script, chapitres, statut |
| `BulletinAudio` | bulletin, persona, fichier MP3, durée réelle (cache par voix) |
| `BulletinSource` | liens bulletin ↔ articles, pour la fiche sources |
| `FeaturedTopic` | « À la une » par pays : libellé, mots-clés, entités, dates, actif |
| `User` / `Preference` | compte optionnel, préférences, jeton du flux RSS personnel |
| `Feedback` | signalements (fait faux, opinion, prononciation, durée, autre) + commentaire |
| `CostLog` | chaque appel API : fournisseur, modèle, jetons/caractères, coût estimé |

## 4. Pipeline éditorial

| Étape | Comment | Garde-fou |
|---|---|---|
| 1. Ingestion | Lecture des flux toutes les 20 min ; on ne garde que titre, chapô, date, lien | Respect de robots.txt, User-Agent identifié, pas de scraping de pages |
| 2. Thème | Thème donné par le flux, complété par un classement (mots-clés + petit modèle) | Un article peut avoir plusieurs thèmes |
| 3. Regroupement | Embeddings + similarité sur 36 h → un cluster = un événement | — |
| 4. Classement | nb de sources **indépendantes** × fraîcheur × poids × thème | Cluster ignoré s'il n'a pas ≥ 2 groupes de presse différents |
| 5. Faits | Claude extrait des faits atomiques en JSON, chacun lié aux articles qui le confirment | Fait à une seule source → rejeté ou attribué |
| 6. Vérification | 2ᵉ appel Claude, indépendant, compare chaque fait aux extraits | Rejet journalisé avec la raison (visible dans /test) |
| 7. Script | Rédaction dans la langue choisie, ≈ 150 mots/min, 3 à 5 sujets, chapitres | Pas de phrase longue recopiée |
| 8. Contrôle qualité | Code (pas d'IA) : longueur, liste de mots d'opinion par langue, attributions, équilibre des partis | Échec → réécriture (max 2) puis blocage |
| 9. Voix | OpenAI `gpt-4o-mini-tts`, découpage par sujet, génération en parallèle | Mention « voix générée par IA » |
| 10. Audio | ffmpeg : concaténation, volume normalisé (−16 LUFS), MP3 128 kbps, chapitres | — |

**Modèles** : Claude pour les faits, la vérification et le script (modèle réglable dans les paramètres) ; OpenAI pour la voix et les embeddings.

**Cache et coûts** : le script est écrit une fois par combinaison pays × thème × langue × édition ; l'audio de chaque voix est créé à la première écoute puis réutilisé. Plafond quotidien de dépenses (2 € par défaut) : au-delà, la génération s'arrête et /test l'indique.

## 4 bis. Ajustements faits pendant le développement
- **Étape 3** : la récupération des flux tourne dans le service web (démarrée par `instrumentation.ts`), protégée par un verrou PostgreSQL. Un service « worker » séparé sera créé à l'étape 8.
- **Étape 3** : pas encore de pgvector. Avec quelques milliers d'articles sur 36 h, le regroupement de l'étape 4 peut calculer les similarités en mémoire ; pgvector sera ajouté si le volume l'exige.

## 5. Environnement de test

- Branche `staging` → service Railway « staging » protégé par mot de passe ; branche `main` → production.
- `DEMO_MODE=true` : aucun appel API, contenus de `fixtures/` (articles et MP3 d'exemple).
- Page `/test` : chaque étape du pipeline lançable à la main, résultats lisibles, état des sources, compteur de coûts.

## 6. Point important sur les sources

Les sites de presse **bloquent l'accès depuis mon environnement de développement** : je n'ai donc pas pu vérifier les 33 URL de `config/sources.yaml`. Elles viennent de ma connaissance des flux publics et sont marquées « à vérifier ». Le worker les teste dès son premier démarrage sur Railway (où cet accès est normal) et /test affiche lesquelles fonctionnent ; je corrigerai les URL mortes à ce moment-là.

Les thèmes Santé, Sciences, Climat et Culture ont peu de flux dédiés dans certains pays : leurs articles viendront surtout des flux généralistes, classés par thème à l'étape 2.

## 7. Ce dont j'ai besoin de vous

| Quand | Quoi | Pourquoi |
|---|---|---|
| Maintenant | Connecter GitHub dans les réglages de claude.ai, et créer un dépôt vide (ex. `flash-info`) | Pour que je puisse y pousser le code |
| Étape 2 | Un compte Railway relié à ce dépôt GitHub | Pour l'URL de test |
| Avant le mode réel | Une clé API Anthropic et une clé API OpenAI, collées dans les réglages Railway | Pour générer de vrais bulletins |

## 8. Plan des étapes

1. ✅ Architecture (ce document) → **votre validation**
2. Squelette en ligne : interface vide, mot de passe, mode démo, page /test
3. Ingestion + health-check des sources
4. Regroupement et classement
5. Faits, vérification, script, contrôle qualité (testés sur fixtures)
6. Voix et post-production audio
7. Interface complète et lecteur à chapitres
8. Éditions planifiées et génération à la demande
9. Comptes, flux RSS personnel, admin, signalements
10. Tests, mentions légales, mise en production
