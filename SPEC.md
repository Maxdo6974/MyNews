# PROMPT — Application « Flash Info » : podcasts d'actualité factuels générés à la demande

## Ton rôle
Tu es un ingénieur full-stack senior et un éditeur de presse rigoureux. Tu vas concevoir et coder une application web **complète, déployable en production**, qui génère des podcasts audio courts (2 à 3 minutes) d'actualité **strictement factuelle**. Travaille par étapes, valide chaque étape (tests, lint, lancement local) avant de passer à la suivante, et tiens un fichier `PROGRESS.md` à jour.

Avant d'écrire du code, présente-moi : l'architecture, le schéma de données, la liste des sources par pays (URL des flux RSS **vérifiées par une requête réelle**, jamais de mémoire) et le plan d'implémentation. Attends ma validation.

---

## 1. Le produit en une phrase
L'utilisateur choisit **un pays**, **un thème**, **une langue** et **une voix**, puis écoute un bulletin d'information de 2 à 3 minutes, lu par une voix de synthèse aussi naturelle que possible, construit uniquement à partir de faits vérifiés par plusieurs sources.

## 2. Paramètres choisis par l'utilisateur

| Paramètre | Valeurs |
|---|---|
| Pays | 🇫🇷 France · 🇮🇹 Italie · 🇩🇪 Allemagne · 🇬🇧 Royaume-Uni (architecture prévue pour en ajouter d'autres) |
| Langue du podcast | Français · Anglais (indépendante du pays : on peut écouter l'actu italienne en français) |
| Thème | Généraliste · Politique · Économie · International · Sport · Tech & Sciences · Climat & Environnement · Santé · Culture & Médias · **À la une** (catégorie du moment, voir §5) |
| Voix | 2 personas (voir §7) |
| Durée | Court (≈ 2 min) · Standard (≈ 3 min) |

## 3. Règles éditoriales — NON NÉGOCIABLES
C'est le cœur du produit. Écris ces règles dans un fichier `EDITORIAL_RULES.md` et injecte-les dans tous les prompts du LLM.

1. **Des faits, pas d'opinions.** Qui, quoi, où, quand, combien. Aucun adjectif qui juge (« catastrophique », « courageux », « polémique »), aucune spéculation, aucune prédiction, aucun éditorial.
2. **Corroboration.** Un fait n'entre dans le script que s'il est rapporté par **au moins 2 sources indépendantes** (deux titres d'un même groupe ne comptent pas comme indépendants). Si une seule source le donne, on l'écarte ou on l'attribue explicitement (« selon Le Monde… »).
3. **Attribution.** Toute déclaration, tout chiffre contesté ou toute accusation est attribué à sa source (« a déclaré le ministre », « selon l'Insee », « selon la police »). Une accusation n'est jamais présentée comme un fait établi.
4. **Pluralisme en politique.** Dans les thèmes Politique et À la une électorale : on rapporte des actes et des déclarations, sans hiérarchiser les camps. On équilibre le temps de parole entre les formations concernées par un même sujet et on vérifie automatiquement les mentions par parti ou candidat.
5. **Chiffres exacts.** Les nombres, dates et noms propres sont recopiés depuis les sources et comparés entre elles. En cas de divergence, on donne la fourchette ou on attribue chaque chiffre.
6. **Ton neutre et sobre**, celui d'un journal radio du service public.
7. **Pas de reproduction d'articles.** On reformule les faits. On ne lit jamais un paragraphe d'article et on ne cite pas plus de quelques mots.
8. **Traçabilité.** Chaque bulletin est accompagné de sa fiche sources (titre, média, lien, heure) visible dans l'appli.

## 4. Sources d'information
- **Priorité aux flux RSS/Atom officiels** et aux API publiques. Pas de scraping de pages si un flux existe. Respecter `robots.txt` et les conditions d'utilisation, et ne récupérer que titres, chapôs et métadonnées.
- Pour chaque pays, viser 6 à 10 sources de sensibilités éditoriales différentes, plus des sources spécialisées (sport, économie). Point de départ à **vérifier et compléter** :
  - **France** : franceinfo, Le Monde, Le Figaro, Libération, Les Échos, France 24, L'Équipe, Ouest-France, 20 Minutes
  - **Italie** : ANSA, Corriere della Sera, la Repubblica, Il Sole 24 Ore, RaiNews, La Stampa, Gazzetta dello Sport
  - **Allemagne** : Tagesschau, Deutsche Welle, Der Spiegel, FAZ, Süddeutsche Zeitung, Die Zeit, Handelsblatt, Kicker
  - **Royaume-Uni** : BBC News, The Guardian, Sky News, The Independent, The Telegraph, BBC Sport
  - **International** : DW, France 24, BBC World, AP (si un flux est accessible)
- Configuration des sources dans un fichier versionné (`config/sources.yaml`) : URL, pays, langue, thèmes, groupe de presse (pour la règle d'indépendance), poids de fiabilité, actif ou non.
- Un **health-check** quotidien signale les flux morts ou modifiés.

## 5. Catégorie « À la une » (thème du moment)
- Pour chaque pays, un thème du moment **configurable par un admin** (exemple pour la France : « Présidentielle 2027 », avec mots-clés, entités et période).
- En complément, une **détection automatique** propose à l'admin des sujets dominants : clusters d'articles qui grossissent le plus vite sur 48 h, dans au moins 3 sources.
- L'interface affiche le libellé dynamique (par exemple « À la une : Présidentielle 2027 »).

## 6. Pipeline de génération

```
Ingestion RSS → Normalisation → Déduplication / Clustering → Classement → Extraction des faits
→ Vérification croisée → Rédaction du script → Contrôle qualité → Synthèse vocale → Stockage → Diffusion
```

1. **Ingestion** (toutes les 15 à 30 min) : récupération des flux, normalisation (titre, chapô, date, source, langue, URL), stockage.
2. **Déduplication et clustering** : regroupement des articles traitant du même événement (embeddings et similarité, fenêtre de 24 à 36 h).
3. **Classement** : score par cluster = nombre de sources indépendantes × fraîcheur × poids des sources × pertinence du thème. On retient 3 à 5 sujets par bulletin.
4. **Extraction des faits** (LLM, API Anthropic, modèle `claude-sonnet-5-5` ou plus récent, configurable) : pour chaque cluster, sortie **JSON structurée** listant les faits atomiques, chacun avec les sources qui le confirment, les chiffres, les attributions et les divergences.
5. **Vérification croisée** : un second appel LLM, indépendant, relit les faits face aux extraits sources et rejette tout fait non corroboré ou formulé de manière orientée. Rejets journalisés.
6. **Rédaction du script** dans la langue choisie (traduction incluse si la langue diffère de celle des sources) :
   - Environ 150 mots par minute, soit **300 à 450 mots** au total, à ajuster selon la durée choisie.
   - Structure : générique d'ouverture (date, heure, thème, pays), puis les titres, puis 3 à 5 sujets de 25 à 40 secondes chacun, puis la clôture (« C'était votre flash… »).
   - Écriture pour l'oreille : phrases courtes, chiffres arrondis à l'oral quand c'est pertinent, sigles développés à la première mention, transitions naturelles.
   - Normalisation pour la synthèse vocale : dates, nombres, noms étrangers (prononciation), ponctuation marquant les pauses.
7. **Contrôle qualité automatique** : longueur, absence de mots d'opinion (liste noire par langue), présence des attributions, équilibre politique, aucune phrase longue recopiée d'une source.
8. **Synthèse vocale** : voir §7. Découpage par paragraphes, génération en parallèle, concaténation et normalisation du volume (ffmpeg, −16 LUFS), petit jingle d'intro et d'outro libre de droits (optionnel), export MP3 128 kbps.
9. **Stockage** : MP3 sur un stockage objet (S3 / Cloudflare R2), métadonnées et script en base.

### Modes de génération (les deux sont à implémenter)
- **Éditions planifiées** : matin (7 h), midi (12 h 30) et soir (19 h), heure locale de chaque pays, pour chaque combinaison pays × langue × thème. Le **script** est généré une seule fois par combinaison, et l'**audio** de chaque voix est généré au premier lancement, puis mis en cache.
- **À la demande** : bouton « Générer un flash maintenant » avec les toutes dernières infos. File d'attente (jobs asynchrones), indicateur de progression, objectif de moins de 60 s. Limite de débit par utilisateur et cache de 15 min pour une même combinaison.

## 7. Voix (OpenAI TTS)
- Modèle : `gpt-4o-mini-tts` (ou le plus récent disponible), qui accepte un paramètre `instructions` pour piloter le ton. **Vérifie dans la documentation actuelle d'OpenAI** les modèles et voix disponibles avant d'implémenter.
- Deux **personas** définies dans `config/personas.ts` : nom affiché, voix OpenAI, instructions de style, langues.
  - **Persona 1, voix masculine** : timbre grave, débit posé, autorité calme, ton de journal télévisé classique, pauses marquées entre les sujets.
  - **Persona 2, voix féminine** : timbre clair et chaleureux, élégante, articulation impeccable, ton de journal télévisé du soir.
- Les noms affichés et les instructions sont modifiables dans la configuration. La synthèse utilise les voix prédéfinies d'OpenAI : **aucun clonage vocal d'une personne réelle**.
- Abstraction `TTSProvider` (interface) pour pouvoir brancher plus tard ElevenLabs ou un autre moteur sans toucher au reste.
- Mentionner dans l'appli que la voix est générée par IA (obligation de transparence, AI Act européen).

## 8. Expérience utilisateur et design
**Esprit : très pro, sobre, efficace**, dans la lignée d'une appli de radio d'information haut de gamme.

- **Écran principal** : sélecteurs compacts pays, thème, langue et voix (mémorisés), puis un grand bouton Lecture sur l'édition la plus récente, avec un bouton secondaire « Flash maintenant ».
- **Lecteur** : lecture/pause, avance et recul de 15 s, vitesse (0,8× à 1,5×), barre de progression **découpée par sujet** (cliquer sur un chapitre saute au sujet), transcription synchronisée, fiche sources dépliable.
- **Historique** : éditions précédentes par thème, téléchargement MP3, partage d'un lien.
- **Flux podcast personnel** : chaque utilisateur obtient une URL RSS privée avec ses thèmes préférés, pour s'abonner dans Apple Podcasts, Spotify ou une autre appli.
- **Design** : typographie soignée (par exemple Inter ou IBM Plex), palette neutre (anthracite, blanc cassé, un seul accent), mode clair et sombre, beaucoup d'espace, pas d'images décoratives, micro-animations discrètes. Responsive avec le mobile en priorité, installable en **PWA** avec lecture en arrière-plan (Media Session API).
- **Accessibilité** : WCAG 2.1 AA, navigation au clavier, transcription toujours disponible.
- **Interface bilingue** FR/EN (i18n), indépendante de la langue du podcast.

## 9. Comptes, admin et légal
- Comptes optionnels (connexion par e-mail par lien magique ou OAuth) pour les préférences, l'historique et le flux RSS personnel. L'écoute des éditions planifiées reste possible sans compte.
- **Back-office admin** : sources (activer ou désactiver), thème « À la une » par pays, bulletins générés (script, faits, rejets, coûts), bouton de retrait d'un bulletin, tableau des coûts API.
- **Légal** : mentions légales, politique de confidentialité RGPD, bannière de cookies minimale (pas de traceurs publicitaires), mention « contenu généré automatiquement à partir de sources citées », mention que la voix est synthétique.

## 10. Stack technique imposée (sauf meilleure proposition argumentée)
- **Front et API** : Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui
- **Base de données** : PostgreSQL (Supabase ou Neon) + Prisma, avec pgvector pour les embeddings
- **Jobs** : BullMQ + Redis (Upstash) ou équivalent ; cron pour les éditions planifiées
- **Stockage audio** : Cloudflare R2 ou S3
- **LLM** : API Anthropic. **Synthèse vocale** : API OpenAI. **Audio** : ffmpeg
- **Déploiement** : Vercel (front) et un worker séparé (Railway, Fly.io ou Render) pour l'ingestion, le LLM et la synthèse vocale. Fournir `docker-compose.yml` pour le développement local
- Secrets dans `.env` (fournir `.env.example`) : `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `R2_*`…

## 11. Qualité et tests
- Tests unitaires (parsing RSS, clustering, contrôle qualité), tests d'intégration du pipeline avec des flux enregistrés (fixtures), tests end-to-end (Playwright) sur le parcours principal.
- **Jeu d'évaluation éditorial** : 20 clusters réels enregistrés, avec des vérifications automatiques (aucun mot d'opinion, toutes les attributions présentes, aucun fait à source unique, durée dans la cible).
- Journalisation et suivi : durée et coût de chaque bulletin, taux de rejet des faits, erreurs de flux.
- Estimation des coûts mensuels fournie dans le README, selon le nombre d'éditions et d'utilisateurs.

## 12. Environnement de test accessible (obligatoire dès le début)
Je ne suis pas développeur : je dois pouvoir tester ton travail **depuis un simple navigateur, sur ordinateur ou sur téléphone**, sans rien installer.

- **URL de test en ligne dès la première étape** : déploie un environnement de test (staging) sur Vercel pour le site et sur Railway ou Render pour le programme de génération, même si l'appli est encore vide. Chaque étape terminée y est redéployée automatiquement à partir de la branche `staging`. La production reste séparée, sur la branche `main`.
- **Accès protégé** par un mot de passe simple (variable `STAGING_PASSWORD`) pour que l'appli de test ne soit pas publique.
- **Mode démo sans clés API** (`DEMO_MODE=true`) : l'appli fonctionne avec des articles enregistrés et des MP3 d'exemple déjà générés. Je peux ainsi tester l'interface gratuitement, avant même d'avoir créé mes comptes OpenAI et Anthropic. Un bandeau « Mode démo » est visible.
- **Mode réel** : dès que j'ai renseigné mes clés API dans les réglages de l'hébergeur, l'appli génère de vrais bulletins. Donne-moi la marche à suivre, clic par clic, avec captures des écrans attendus décrites en texte.
- **Page `/test`** réservée au staging, avec :
  - un bouton par étape du pipeline (récupérer les flux, regrouper, extraire les faits, écrire le script, générer l'audio) affichant le résultat lisible : liste des articles, faits retenus et rejetés avec la raison, script, lecteur audio ;
  - un bouton « Générer un bulletin complet » pour n'importe quelle combinaison pays × thème × langue × voix, avec durée et coût affichés ;
  - l'état de santé des sources (flux en ligne ou en panne) ;
  - un compteur de dépenses API du jour, avec un **plafond configurable** (par défaut 2 € par jour) au-delà duquel la génération s'arrête.
- **Bouton « Signaler un problème »** sur chaque bulletin du staging : je coche le type de problème (fait faux, opinion, prononciation, durée, autre), j'ajoute un commentaire, et le retour est enregistré dans l'admin pour que tu le corriges ensuite.
- **À chaque fin d'étape**, donne-moi : l'URL de test, ce qui a changé, et une liste courte de choses précises à vérifier (« Ouvrez /test, cliquez sur… vous devez voir… »).
- Si un déploiement nécessite une action de ma part (création de compte, carte bancaire, clé API), arrête-toi et explique-moi exactement quoi faire.

## 13. Livrables attendus
1. Le code complet, dans un dépôt structuré (`/apps/web`, `/apps/worker`, `/packages/core`, `/config`)
2. `README.md` : installation, configuration, lancement local, déploiement pas à pas, coûts
3. `EDITORIAL_RULES.md`, `config/sources.yaml` vérifié, `config/personas.ts`
4. Un script `npm run demo` qui génère un vrai bulletin (France, Généraliste, FR, persona 1) de bout en bout et produit le MP3
5. `PROGRESS.md` à jour, avec les limites connues et les prochaines étapes
6. L'URL de l'environnement de test, le mode démo et la page `/test` opérationnels (§12)
7. Un guide `GUIDE_TEST.md` en français simple : comment se connecter au staging, activer le mode réel, tester chaque fonction et signaler un problème

## 14. Ordre de travail suggéré
1. Architecture et validation par moi
2. Squelette de l'appli déployé sur l'URL de test, avec mot de passe et mode démo (§12)
3. Ingestion et sources (avec health-check)
3. Clustering et classement
5. Extraction des faits, vérification croisée et rédaction du script, testés sur des fixtures
6. Synthèse vocale et post-production audio
7. Interface et lecteur
8. Éditions planifiées et génération à la demande
9. Comptes, flux RSS personnel et admin
10. Tests, légal, mise en production

À chaque étape : redéploie sur l'URL de test, montre-moi un exemple concret de sortie (un JSON de faits, un script, un MP3) et donne-moi la liste des points à vérifier avant de continuer.
