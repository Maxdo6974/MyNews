# Flash Info

Bulletins audio d'actualité de 2 à 3 minutes, construits uniquement à partir de faits recoupés par plusieurs médias indépendants. France, Italie, Allemagne, Royaume-Uni ; en français ou en anglais.

- Cahier des charges : [SPEC.md](SPEC.md)
- Architecture : [ARCHITECTURE.md](ARCHITECTURE.md)
- Règles éditoriales : [EDITORIAL_RULES.md](EDITORIAL_RULES.md)
- Tester l'appli : [GUIDE_TEST.md](GUIDE_TEST.md)
- Avancement : [PROGRESS.md](PROGRESS.md)

## Développement local

```bash
npm install
cp .env.example .env      # puis renseigner les valeurs
npm run dev               # http://localhost:3000
npm test                  # tests du cœur métier
npm run health            # teste tous les flux RSS depuis votre machine
```

## Déploiement

Railway, via `Dockerfile` et `railway.json` — voir [GUIDE_TEST.md](GUIDE_TEST.md).
