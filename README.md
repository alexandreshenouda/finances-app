# Patrimoine

Application de suivi des investissements financiers — **React Native (Expo)**, un seul codebase
pour **Android** et **Web**. Sans backend : toutes les données et tous les identifiants restent
sur l'appareil.

## Fonctionnalités

- **Courbes de suivi** du patrimoine total et de chaque compte sur 1M / 3M / 6M / 1A / YTD / Max
  (inspection au doigt, variation absolue et en %).
- **Comptes classés par type** : compte courant, livret, PEA, CTO, assurance vie, PER, crypto,
  immobilier, autre — avec répartition du patrimoine par type.
- **Lignes / fonds par compte** : quantité, cours, valeur, plus/moins-value vs PRU, frais.
- **Frais** : frais d'entrée, de gestion, droits de garde par compte ; frais courants par fonds.
- **Ajout manuel** de comptes et de lignes quand la synchro est impossible (cas notamment des
  PEA / CTO / assurances vie, non couverts par les API bancaires — voir plus bas).
- **Cours automatiques** pour valoriser les lignes manuelles :
  - actions / ETF / fonds cotés : Yahoo Finance (ticker, ex. `WPEA.PA`), conversion en € automatique ;
  - crypto : CoinGecko (id, ex. `bitcoin`).
- **Synchronisation automatique** :
  - **Binance** et **Kraken** : clé API *lecture seule*, valorisation EUR via les cours de l'exchange ;
  - **Banques via Enable Banking** (DSP2) : soldes des comptes de paiement — banques françaises,
    et **Revolut** via la Lituanie (sélecteur de pays) ;
  - **Trade Republic** : API *non officielle* (login téléphone/PIN + 2FA), liquidités + positions
    valorisées en EUR. Android uniquement, à utiliser en connaissance de cause (voir plus bas).
- **Snapshots quotidiens** : chaque mise à jour (cours, synchro ou saisie) enregistre au plus un
  point par jour et par compte ; les courbes se construisent à partir de ces points (report de la
  dernière valeur connue pour les comptes non mis à jour).
- **Multi-devises** : comptes et lignes en EUR (défaut), USD ou CHF — saisie dans la devise
  d'origine, affichage et courbes convertis en € avec les taux BCE
  ([frankfurter.dev](https://frankfurter.dev), rafraîchis à chaque mise à jour, derniers taux
  conservés hors ligne).
- **Export / import** JSON (sans les identifiants) : presse-papiers partout, et fichier
  (partage / sélecteur de documents) sur Android. Les exports V1 sans devise restent importables
  (traités en EUR).

## Pourquoi certaines choses sont comme elles sont

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
  refusent les appels cross-origin. Ces fonctions marchent dans l'app **Android** (pas de CORS en
  natif). Sur le web, le suivi manuel et CoinGecko fonctionnent.

## Lancer l'app

```bash
npm install
npm run web        # version web (http://localhost:8081)
npm run android    # sur émulateur/appareil avec Android Studio, ou scannez le QR avec Expo Go
```

Le plus simple sur téléphone : installer **Expo Go** (Play Store), lancer `npx expo start`,
scanner le QR code. Pour un APK autonome :

```bash
npm install -g eas-cli
eas build -p android --profile preview   # nécessite un compte Expo (gratuit)
```

(ou `npx expo run:android` avec Android Studio installé pour un build local).

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
  app/                 écrans (expo-router) : onglets Synthèse / Comptes / Connexions,
                       détail de compte, formulaires, flux Enable Banking
  components/          LineChart (SVG), AllocationBar, primitives UI
  lib/
    types.ts           modèle : Account, Holding, Snapshot, Connection
    store.ts           store zustand persisté (AsyncStorage)
    secure.ts          secrets (expo-secure-store, repli localStorage sur web)
    portfolio.ts       valorisation + construction des séries temporelles
    prices/            Yahoo Finance & CoinGecko
    connectors/        Binance, Kraken, Enable Banking (JWT RS256)
```

Données locales : documents (comptes, lignes, snapshots, connexions) en JSON dans AsyncStorage ;
secrets à part dans le stockage sécurisé. Aucun serveur tiers autre que les API officielles
citées ci-dessus.

## Avertissement

Outil de suivi personnel : les valorisations proviennent d'API publiques non garanties et
peuvent être approximatives (notamment la conversion EUR). Ce n'est pas un outil de conseil
en investissement.
