<p align="center">
  <img src="assets/images/icon.png" width="88" alt="" />
</p>

<h1 align="center">Finances</h1>
<p align="center">
  Suivi de patrimoine personnel — comptes, bourse, crypto, immobilier et crédits.<br/>
  <b>React Native (Expo)</b>, un seul codebase pour Android, iOS, Web et Windows. Sans backend.
</p>

<p align="center">
  <img alt="Plateformes" src="https://img.shields.io/badge/plateformes-Android%20%7C%20iOS%20%7C%20Web%20%7C%20Windows-5B8DEF">
  <img alt="Expo SDK" src="https://img.shields.io/badge/Expo%20SDK-57-000020?logo=expo&logoColor=white">
  <img alt="Licence" src="https://img.shields.io/badge/licence-MIT-34D399">
  <img alt="Backend" src="https://img.shields.io/badge/backend-aucun%2C%20100%25%20local-16233D">
</p>

Toutes les données et tous les identifiants restent sur l'appareil : pas de compte, pas de
serveur, pas de tracking. Les comptes se remplissent à la main ou se synchronisent depuis
quelques sources publiques (Binance, Kraken, banques françaises via Enable Banking, Trade
Republic) — voir [Pourquoi certaines choses sont comme elles sont](#pourquoi-certaines-choses-sont-comme-elles-sont)
pour le détail des contraintes.

## Aperçu

<table>
  <tr>
    <td align="center" width="33%">
      <img src="docs/screenshots/synthese.png" width="230" alt="Synthèse : patrimoine total, courbe et répartition"><br/>
      <sub>Synthèse</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/comptes.png" width="230" alt="Liste des comptes groupés par type"><br/>
      <sub>Comptes</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/compte-detail.png" width="230" alt="Détail d'un compte PEA avec ses lignes"><br/>
      <sub>Détail d'un compte</sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <img src="docs/screenshots/immobilier.png" width="230" alt="Détail d'un bien : estimation, équité et crédit"><br/>
      <sub>Immobilier</sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/emprunts.png" width="230" alt="Onglet Emprunts : crédit immobilier et prêt conso"><br/>
      <sub>Emprunts</sub>
    </td>
    <td width="33%"></td>
  </tr>
</table>

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Lancer l'app](#lancer-lapp)
- [Windows (application de bureau)](#windows-application-de-bureau)
- [Configurer les synchronisations](#configurer-les-synchronisations)
- [Architecture](#architecture)
- [Pourquoi certaines choses sont comme elles sont](#pourquoi-certaines-choses-sont-comme-elles-sont)
- [Avertissement](#avertissement)

## Fonctionnalités

**Vue d'ensemble**
- **Patrimoine net ou brut** : la synthèse totalise comptes + immobilier, avec un basculement
  **Net** (actifs − crédits) / **Brut**, et une case pour **inclure ou non les biens immobiliers**
  dans le total (les comptes bancaires de type immobilier, eux, sont toujours comptés).
- **Courbes de suivi** du patrimoine total et de chaque compte sur 1J / 1S / 1M / 3M / 6M / 1A /
  YTD / Max — les 5 échelles courantes en puces, les autres dans un menu déroulant (inspection au
  doigt, variation absolue et en %).
- **Répartition du patrimoine** par type de compte, en **barre empilée ou camembert**.

**Comptes & placements**
- **Comptes classés par type** : compte courant, livret, PEA, CTO, assurance vie, PER, crypto,
  immobilier, autre.
- **Lignes / fonds par compte** : quantité, cours, valeur, plus/moins-value vs PRU, frais.
- **Plus/moins-value latente par compte** : agrégée sur les lignes à PRU connu, affichée dans la
  liste des comptes et sur le détail (en € et en %, convertie en EUR pour les comptes multi-devises).
- **Frais** : frais d'entrée, de gestion, droits de garde par compte ; frais courants par fonds.
- **Ajout manuel** de comptes et de lignes quand la synchro est impossible (cas notamment des
  PEA / CTO / assurances vie, non couverts par les API bancaires).
- **Cours automatiques** pour valoriser les lignes manuelles : actions / ETF / fonds cotés via
  Yahoo Finance (ticker, ex. `WPEA.PA`, conversion en € automatique) ; crypto via CoinGecko
  (id, ex. `bitcoin`).
- **Scraping JustETF automatique** : récupération en direct de la composition réelle des ETFs
  (ventilation multi-pays look-through, ventilation sectorielle, top 10 des positions pondérées,
  frais de gestion TER) et des actions individuelles (pays, secteur) par simple saisie de l'ISIN.

**Diversification & Analyse**
- **Diversification sectorielle & géographique** : onglet dédié comparant votre patrimoine à un
  profil de référence (Prudent, Équilibré, Dynamique) et alertant sur les concentrations excessives.
- **Classification multi-sources** : JustETF (scraping temps réel pour ETFs UCITS et actions) →
  Yahoo Finance (secteur actions) → Alpha Vantage (clé gratuite optionnelle pour valeurs US) →
  table locale de repli (`referenceEtfs.ts`).

**Immobilier & crédits**
- **Immobilier** : onglet dédié pour les biens physiques (appartement, maison, terrain…) —
  - **valeur estimée** réévaluée automatiquement via un indice national des prix des logements
    (INSEE, embarqué pour un fonctionnement hors-ligne), avec surcharge manuelle possible ;
  - **plus-value latente** (valeur − prix de revient), en € et en % ;
  - **quote-part détenue** (SCI / indivision) sur un bien ou un compte immobilier : le montant
    complet reste affiché, mais seule votre part est comptée dans le patrimoine.
- **Emprunts** : onglet dédié regroupant tous les prêts — crédits immobiliers (toujours
  rattachables à un bien) et **prêts conso** (sans rattachement), créables et modifiables
  depuis l'onglet ; les prêts conso sont déduits du patrimoine net. Échéancier d'amortissement
  calculé (mensualité, capital restant dû, coût total, temps restant), en mensualités
  **constantes** ou **échelonnées par paliers** (différé total/partiel géré), avec courbe du
  capital restant dû.

**Synchronisation automatique**
- **Binance** et **Kraken** : clé API *lecture seule*, valorisation EUR via les cours de l'exchange.
- **Banques via Enable Banking** (DSP2) : soldes des comptes de paiement — banques françaises,
  et **Revolut** via la Lituanie (sélecteur de pays).
- **Trade Republic** : API *non officielle* (login téléphone/PIN + 2FA), liquidités + positions
  valorisées en EUR. Android uniquement, à utiliser en connaissance de cause (voir plus bas).
- **Snapshots quotidiens** : chaque mise à jour (cours, synchro ou saisie) enregistre au plus un
  point par jour et par compte ; les courbes se construisent à partir de ces points (report de la
  dernière valeur connue pour les comptes non mis à jour).

**Confidentialité & personnalisation**
- **Thèmes** : choix entre le thème **Or** (sombre et or clair, par défaut) et le thème
  **Classique** (bleu-ardoise historique) dans **Paramètres → Affichage**.
- **Mode confidentialité** : icône œil dans l'en-tête de chaque onglet pour masquer
  instantanément tous les montants (les pourcentages de répartition et de performance restent
  visibles).
- **Personnalisation de l'affichage** : choix de la période par défaut des graphiques et de
  la variation, visibilité configurable des onglets (Immobilier, Emprunts, Diversification).
- **Multi-devises** : comptes et lignes en EUR (défaut), USD ou CHF — saisie dans la devise
  d'origine, affichage et courbes convertis en € avec les taux BCE
  ([frankfurter.dev](https://frankfurter.dev), rafraîchis à chaque mise à jour, derniers taux
  conservés hors ligne).
- **Export / import** JSON (sans les identifiants) : presse-papiers partout, et fichier
  (partage / sélecteur de documents) sur Android. Les exports V1 sans devise restent importables
  (traités en EUR).

## Lancer l'app

```bash
npm install
npm run web        # version web (http://localhost:8081)
npm run android    # sur émulateur/appareil avec Android Studio, ou scannez le QR avec Expo Go
npm run ios        # sur simulateur/appareil iOS (macOS + Xcode requis)
```

Le plus simple sur téléphone : installer **Expo Go** (Play Store / App Store), lancer
`npx expo start`, scanner le QR code. Pour un binaire autonome :

```bash
npm install -g eas-cli                    # ou préfixer les commandes par `npx`
eas build -p android --profile preview    # APK — nécessite un compte Expo (gratuit)
eas build -p ios --profile preview        # .ipa — nécessite un compte Apple Developer (payant)
```

Le build iOS se fait sur le cloud EAS (pas besoin de macOS pour builder) ; EAS gère le
provisioning (certificat + profil) au premier build via votre login Apple. L'app déclare
`ios.bundleIdentifier` et `android.package` = `fr.perso.patrimoine`. Pour un build local,
`npx expo run:android` (Android Studio) ou `npx expo run:ios` (macOS + Xcode).

## Windows (application de bureau)

La version Windows empaquette l'export web dans une coquille **Electron**. Un petit serveur HTTP
local (port fixe `8099`) sert le build, et `webSecurity` est désactivé pour lever le CORS : les
connecteurs (Binance, Kraken, Enable Banking, Yahoo, Trade Republic) **fonctionnent** sur Windows,
contrairement à la version navigateur.

```bash
npm run windows:dev     # export web + lancement Electron (test rapide)
npm run windows:build   # génère un installeur .exe dans release/
```

`windows:build` produit un installeur NSIS dans `release/`. Notes :

- Les données (comptes, historique) sont dans le `localStorage` de l'origine `localhost:8099` —
  d'où le **port fixe**, pour les conserver d'un lancement à l'autre.
- Les secrets (clés API, identifiants) utilisent le repli `localStorage` d'`expo-secure-store`
  (pas de coffre-fort OS comme l'Android Keystore) : **moins protégés que sur Android**. À garder
  à l'esprit sur un poste partagé.

## Configurer les synchronisations

### Binance / Kraken

1. Créez une clé API **lecture seule** (Binance : Gestion API, décochez trading/retraits ;
   Kraken : Settings → API, permission « Query Funds » uniquement).
2. Onglet **Connexions** → Binance ou Kraken → collez clé + secret.
3. Les clés sont stockées chiffrées dans l'Android Keystore (via `expo-secure-store`).

### Banques françaises (Enable Banking)

1. Créez un compte sur [enablebanking.com](https://enablebanking.com) et une **application**
   (environnement Production). En mode « restricted production » (gratuit, sans contrat),
   seuls les comptes que **vous** liez sont accessibles.
2. Enable Banking **n'accepte que des URL de redirection https** (pas de schéma
   `patrimoine://`). Deux options :
   - **Recommandé (GitHub Pages)** : la page [`docs/eb-callback.html`](docs/eb-callback.html)
     est prête à être déployée. Sur GitHub : *Settings → Pages → Deploy from a branch →*
     votre branche *→ dossier `/docs`*. L'URL à enregistrer chez Enable Banking sera
     `https://<votre-pseudo>.github.io/<nom-du-repo>/eb-callback.html`. Après validation chez
     la banque, cette page renvoie automatiquement vers l'app (`patrimoine://eb-callback`).
   - Tout autre hébergement statique (Cloudflare Pages, Netlify…) fonctionne aussi : servez le
     même fichier et enregistrez son URL https.
   - À défaut : enregistrez n'importe quelle URL https que vous contrôlez ; après validation,
     copiez l'URL complète de la page atteinte (elle contient `?code=…`) et collez-la dans
     l'app (champ « URL de redirection reçue »).
3. Onglet **Connexions** → « Banques françaises via Enable Banking » → collez l'Application ID,
   la clé privée PEM et la même URL https.
4. Choisissez votre banque, validez le consentement DSP2 chez elle (valable ~90 jours),
   les soldes sont importés.

## Architecture

```
src/
  app/                 écrans (expo-router) : onglets Synthèse / Comptes / Immobilier /
                       Emprunts / Paramètres (connexions, sauvegarde, affichage, entretien
                       de l'historique), détail de compte et de bien, formulaires (compte,
                       ligne, bien, prêt), flux Enable Banking
  components/          LineChart (SVG), AllocationBar, PieChart, ProgressBar, primitives UI
  lib/
    types.ts           modèle : Account, Holding, Snapshot, Connection, Property, Loan
    store.ts           store zustand persisté (AsyncStorage)
    secure.ts          secrets (expo-secure-store, repli localStorage sur web)
    portfolio.ts       valorisation comptes + construction des séries temporelles
    realestate.ts      estimation des biens, amortissement des crédits (constant/paliers)
    prices/            Yahoo Finance, CoinGecko, JustETF scraper (ETFs & actions), Alpha Vantage & indice INSEE
    connectors/        Binance, Kraken, Enable Banking (JWT RS256)
```

Données locales : documents (comptes, lignes, snapshots, connexions, biens et crédits immobiliers)
en JSON dans AsyncStorage ; secrets à part dans le stockage sécurisé. La valeur d'un bien et le
capital restant dû d'un crédit étant calculables analytiquement à toute date, la courbe immobilière
est dérivée sans stocker de snapshots. Aucun serveur tiers autre que les API officielles citées.

## Pourquoi certaines choses sont comme elles sont

<details>
<summary>DSP2, agrégateurs, Trade Republic, CORS — les contraintes qui façonnent l'app</summary>
<br/>

- **DSP2 ne couvre que les comptes de paiement.** Les PEA, CTO, assurances vie et PER ne sont
  accessibles que via les connecteurs propriétaires d'agrégateurs B2B payants (Powens, Linxo…).
  Sans backend ni contrat B2B, la seule voie est la saisie manuelle + valorisation automatique
  par les cours publics. C'est le choix de cette app.
- **Enable Banking** est le seul agrégateur agréé avec un mode gratuit self-service
  (« restricted production ») limité à **vos propres comptes** — exactement le cas d'usage ici.
  Revolut, Fortuneo et BoursoBank n'exposent **pas** d'API directe pour les particuliers (DSP2
  réservé aux prestataires agréés) : on passe donc par Enable Banking (Revolut = entité
  lituanienne, Fortuneo et BoursoBank = France).
- **Trade Republic** n'a aucune API officielle : le connecteur reprend le protocole non officiel
  du web-login (téléphone/PIN → code 2FA) et du flux WebSocket. Conséquences : validation 2FA à
  **chaque** synchronisation (pas de synchro silencieuse), fonctionne uniquement en natif Android,
  et **peut casser** si Trade Republic change son protocole ou active son pare-feu applicatif.
- **Yuh** (néobanque suisse) est hors périmètre DSP2 et n'expose pas d'API personnelle : suivi
  manuel uniquement.
- **CORS** : dans un navigateur, les API Binance, Kraken, Yahoo, Enable Banking et Trade Republic
  refusent les appels cross-origin. Ces fonctions marchent dans les apps natives (**Android**,
  **iOS** — pas de CORS en natif ; Trade Republic reste toutefois Android uniquement). Sur le web,
  le suivi manuel et CoinGecko fonctionnent.

</details>

## Avertissement

Outil de suivi personnel : les valorisations proviennent d'API publiques non garanties et
peuvent être approximatives (notamment la conversion EUR). Ce n'est pas un outil de conseil
en investissement.
