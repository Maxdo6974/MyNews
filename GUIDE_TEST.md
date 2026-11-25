# Guide de test — Flash Info (étape 2)

## Mettre l'appli en ligne sur Railway (une seule fois, ≈ 10 minutes)

1. Allez sur **railway.com** et cliquez sur **Login** → **Continue with GitHub**.
2. Cliquez sur **New Project** → **Deploy from GitHub repo** → choisissez le dépôt **flash-info**.
   *(Si le dépôt n'apparaît pas : cliquez sur « Configure GitHub App » et donnez à Railway l'accès au dépôt.)*
3. Railway lance la construction automatiquement (2 à 4 minutes). Le fichier `railway.json` lui dit comment faire.
4. Cliquez sur le service créé → onglet **Variables** → **New Variable**, et ajoutez :
   - `STAGING_PASSWORD` = un mot de passe de votre choix
   - `DEMO_MODE` = `true`
5. Onglet **Settings** → rubrique **Networking** → **Generate Domain**. Railway vous donne une adresse du type `flash-info-production-xxxx.up.railway.app`.
6. Ouvrez cette adresse : la page de mot de passe doit s'afficher.

Ensuite, chaque modification que je dépose sur GitHub est remise en ligne automatiquement.

## Ce qu'il faut vérifier à l'étape 2

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Ouvrir l'adresse Railway | Page « Environnement de test » qui demande un mot de passe |
| 2 | Entrer un mauvais mot de passe | Message « Mot de passe incorrect » |
| 3 | Entrer le bon mot de passe | Page d'accueil avec le bandeau rouge « MODE DÉMO » |
| 4 | Choisir France + thème « À la une » | Le thème s'affiche « À la une : Présidentielle 2027 » |
| 5 | Choisir une voix, cliquer « Générer mon flash » | Un bulletin de démonstration s'affiche avec 5 parties |
| 6 | Cliquer sur ▶ | Le texte est lu par la voix du navigateur, la partie en cours est surlignée |
| 7 | Cliquer sur une partie, changer la vitesse | La lecture saute à cette partie, la vitesse change |
| 8 | Fermer et rouvrir la page | Vos choix (pays, thème, voix…) sont conservés |
| 9 | Aller sur **Test** → « Tester les sources » | Tableau des 33 médias, avec un point vert ou rouge pour chacun (≈ 20 s) |
| 10 | Refaire 3 à 8 sur votre téléphone | Même résultat, mise en page adaptée |

**Point 9 est le plus important** : envoyez-moi une capture du tableau ou la liste des médias en rouge, je corrigerai leurs adresses.

## Rappel
- Le contenu du mode démo est un **texte d'exemple**, pas de l'actualité.
- La voix est celle de votre navigateur pour l'instant ; les voix réalistes arrivent à l'étape 6.
