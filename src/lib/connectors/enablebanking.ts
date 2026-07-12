/**
 * Connecteur Enable Banking — accès DSP2 aux banques françaises (comptes de
 * paiement uniquement : comptes courants, certains livrets).
 *
 * Prérequis (gratuit pour un usage personnel, mode « restricted production ») :
 *  1. Créer un compte sur https://enablebanking.com et une application.
 *  2. Enregistrer l'URL de redirection https de la page de rebond (docs/eb-callback.html,
 *     déployée par ex. via GitHub Pages) dans l'application — Enable Banking n'accepte pas
 *     les schémas personnalisés type patrimoine:// en redirect_url.
 *  3. Récupérer l'Application ID et la clé privée PEM, à coller dans l'écran Connexions.
 *
 * Authentification API : JWT RS256 signé avec la clé privée de l'application.
 */
import { KJUR } from 'jsrsasign';
import type { ExternalAccount, SyncResult } from './types';

const BASE = 'https://api.enablebanking.com';

/**
 * Enable Banking n'accepte que des URL de redirection https (pas de schéma
 * personnalisé). L'URL https enregistrée est stockée dans les identifiants ;
 * ce schéma-ci ne sert qu'au retour vers l'app depuis la page de rebond.
 */
export const EB_APP_CALLBACK = 'patrimoine://eb-callback';

export interface EbSessionAccount {
  uid: string;
  name: string;
  iban?: string;
}

export interface EbSession {
  sessionId: string;
  aspspName: string;
  validUntil: string;
  accounts: EbSessionAccount[];
}

export interface EnableBankingCredentials {
  applicationId: string;
  privateKeyPem: string;
  /** URL https enregistrée dans l'application Enable Banking */
  redirectUrl: string;
  sessions: EbSession[];
}

function makeJwt(creds: EnableBankingCredentials): string {
  const iat = Math.floor(Date.now() / 1000);
  const header = { typ: 'JWT', alg: 'RS256', kid: creds.applicationId };
  const payload = { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 };
  return KJUR.jws.JWS.sign('RS256', JSON.stringify(header), JSON.stringify(payload), creds.privateKeyPem);
}

async function api(
  creds: EnableBankingCredentials,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${makeJwt(creds)}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Enable Banking HTTP ${res.status} sur ${path} : ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** Vérifie les identifiants (GET /application). */
export async function checkApplication(creds: EnableBankingCredentials): Promise<{ name: string }> {
  const app = await api(creds, '/application');
  return { name: app?.name ?? 'application' };
}

export interface Aspsp {
  name: string;
  country: string;
}

/** Pays UE/EEE couramment utiles (Revolut = LT, N26 = DE, etc.). */
export const EB_COUNTRIES: { code: string; label: string }[] = [
  { code: 'FR', label: 'France' },
  { code: 'LT', label: 'Lituanie (Revolut, Wise…)' },
  { code: 'DE', label: 'Allemagne (N26, Trade Republic…)' },
  { code: 'BE', label: 'Belgique' },
  { code: 'ES', label: 'Espagne' },
  { code: 'IT', label: 'Italie' },
  { code: 'NL', label: 'Pays-Bas' },
  { code: 'IE', label: 'Irlande' },
  { code: 'PT', label: 'Portugal' },
  { code: 'LU', label: 'Luxembourg' },
];

/** Liste des banques disponibles pour un pays donné (défaut : FR). */
export async function listBanks(creds: EnableBankingCredentials, country = 'FR'): Promise<Aspsp[]> {
  const json = await api(creds, `/aspsps?country=${encodeURIComponent(country)}`);
  return (json?.aspsps ?? []).map((a: any) => ({ name: a.name, country: a.country }));
}

/** Démarre l'autorisation auprès d'une banque ; retourne l'URL à ouvrir. */
export async function startAuth(
  creds: EnableBankingCredentials,
  bank: Aspsp,
  state: string
): Promise<string> {
  const validUntil = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
  const json = await api(creds, '/auth', {
    method: 'POST',
    body: {
      access: { valid_until: validUntil },
      aspsp: { name: bank.name, country: bank.country },
      state,
      redirect_url: creds.redirectUrl,
      psu_type: 'personal',
    },
  });
  if (!json?.url) throw new Error("Enable Banking n'a pas renvoyé d'URL d'autorisation");
  return json.url as string;
}

/** Échange le code de redirection contre une session listant les comptes. */
export async function createSession(
  creds: EnableBankingCredentials,
  code: string,
  aspspName: string
): Promise<EbSession> {
  const json = await api(creds, '/sessions', { method: 'POST', body: { code } });
  const accounts: EbSessionAccount[] = (json?.accounts ?? []).map((a: any) => ({
    uid: a.uid,
    name: a.name || a.product || a.account_id?.iban || 'Compte',
    iban: a.account_id?.iban,
  }));
  return {
    sessionId: json.session_id,
    aspspName,
    validUntil: json?.access?.valid_until ?? '',
    accounts,
  };
}

async function fetchBalanceEur(
  creds: EnableBankingCredentials,
  accountUid: string
): Promise<number | undefined> {
  const json = await api(creds, `/accounts/${accountUid}/balances`);
  const balances: any[] = json?.balances ?? [];
  if (balances.length === 0) return undefined;
  // Priorité au solde comptable (CLBD/BOOKED), sinon le premier disponible.
  const preferred =
    balances.find((b) => ['CLBD', 'BOOK', 'BOOKED', 'XPCD'].includes(b.balance_type)) ?? balances[0];
  const amount = parseFloat(preferred?.balance_amount?.amount);
  const currency = preferred?.balance_amount?.currency;
  if (!Number.isFinite(amount)) return undefined;
  if (currency && currency !== 'EUR') return undefined; // comptes devises non gérés
  return amount;
}

/** Synchronise les soldes de toutes les sessions bancaires actives. */
export async function syncEnableBanking(creds: EnableBankingCredentials): Promise<SyncResult> {
  const warnings: string[] = [];
  const accounts: ExternalAccount[] = [];

  for (const session of creds.sessions) {
    if (session.validUntil && new Date(session.validUntil).getTime() < Date.now()) {
      warnings.push(
        `${session.aspspName} : consentement expiré, reconnectez la banque (valable jusqu'au ${session.validUntil.slice(0, 10)})`
      );
      continue;
    }
    for (const acc of session.accounts) {
      try {
        const balance = await fetchBalanceEur(creds, acc.uid);
        if (balance === undefined) {
          warnings.push(`${session.aspspName} / ${acc.name} : solde indisponible`);
          continue;
        }
        accounts.push({
          externalId: `eb-${acc.uid}`,
          name: acc.name,
          type: 'courant',
          institution: session.aspspName,
          cashBalanceEur: balance,
          holdings: [],
        });
      } catch (e: any) {
        warnings.push(`${session.aspspName} / ${acc.name} : ${e?.message ?? e}`);
      }
    }
  }
  return { accounts, warnings };
}
