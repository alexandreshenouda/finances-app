/**
 * Semi-anonymisation du journal de debug : ce qui identifie une personne ou un compte est
 * masqué en ne gardant que ses extrémités, pour qu'un journal puisse être partagé tel quel
 * tout en restant lisible (on reconnaît deux fois le même compte, pas à qui il appartient).
 * Appliquée à l'écriture de chaque entrée ET à l'export : rien d'identifiant n'est stocké, et
 * les entrées enregistrées avant cette protection sont masquées en sortant. Idempotente.
 *
 * Ne sont PAS masqués, car indispensables au diagnostic : montants, dates, ISIN, noms de
 * titres, types d'opération.
 */

const BULLET = '•';

/** Garde `keep` caractères à chaque bout ; tout masquer si la chaîne est trop courte pour ça. */
export function maskMiddle(value: string, keep = 2): string {
  if (value.length <= keep * 2) return BULLET.repeat(value.length);
  return value.slice(0, keep) + BULLET.repeat(value.length - keep * 2) + value.slice(-keep);
}

/** Nom de personne ou de commerce : première et dernière lettre de chaque mot. */
export function maskName(value: string): string {
  return value.replace(/\p{L}[\p{L}'’-]*/gu, (word) =>
    word.length <= 2 ? word[0] + BULLET.repeat(word.length - 1) : maskMiddle(word, 1)
  );
}

// ─── Masquage par clé (réponses JSON) ───────────────────────────────────────

/** Clés dont la valeur désigne une personne (titulaire, émetteur, bénéficiaire, libellé libre). */
const NAME_KEYS =
  /^(owner|owner_?name|holder|holder_?name|account_?holder|creditor|creditor_?name|debtor|debtor_?name|counterparty|counterparty_?name|first_?name|last_?name|full_?name|display_?name|customer_?name|remittance_?information|remittance_?information_?unstructured)$/i;
/** Clés dont la valeur est un identifiant de compte ou de client. */
const ACCOUNT_KEYS =
  /^(iban|bban|bic|account_?number|cash_?account_?number|securities_?account_?number|sec_?acc_?no|account_?id|auth_?account_?id|customer_?id|uid)$/i;
/** Libellé d'une opération : nom d'un tiers ou d'un commerce, sauf pour les types ci-dessous. */
const LABEL_KEYS = /^(title)$/i;
/**
 * Types d'opération Trade Republic dont le libellé est un titre coté ou un mot générique
 * (« Interest »), utile au diagnostic. Tout autre type — virement, carte, type inconnu —
 * porte potentiellement un nom : son libellé est masqué par défaut.
 */
const NON_PERSONAL_EVENT_TYPES = new Set(['INTEREST_PAYOUT', 'SSP_CORPORATE_ACTION_CASH', 'TRADING_TRADE_EXECUTED']);

function mapStrings(node: unknown, fn: (s: string) => string): unknown {
  if (typeof node === 'string') return fn(node);
  if (Array.isArray(node)) return node.map((v) => mapStrings(v, fn));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, mapStrings(v, fn)]));
  }
  return node;
}

function maskNode(node: unknown, maskLabels: boolean): unknown {
  if (Array.isArray(node)) return node.map((v) => maskNode(v, maskLabels));
  if (!node || typeof node !== 'object') return node;
  const obj = node as Record<string, unknown>;
  // Une opération décide pour tout son sous-arbre (son libellé y est répété).
  const labels = typeof obj.eventType === 'string' ? !NON_PERSONAL_EVENT_TYPES.has(obj.eventType) : maskLabels;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (NAME_KEYS.test(key)) out[key] = mapStrings(value, maskName);
    else if (ACCOUNT_KEYS.test(key)) out[key] = mapStrings(value, (s) => maskMiddle(s));
    else if (labels && LABEL_KEYS.test(key) && typeof value === 'string') out[key] = maskName(value);
    else out[key] = maskNode(value, labels);
  }
  return out;
}

// ─── Masquage par motif (tout texte : messages, URL, corps non JSON) ────────

const TEXT_RULES: [RegExp, (...m: string[]) => string][] = [
  // Adresse saisie pour le géocodage.
  [/(geocodage\/search\?q=)[^&#\s"]*/g, (_m, prefix) => `${prefix}${BULLET.repeat(6)}`],
  // Code commune INSEE : on ne garde que le département.
  [/(\/commune\/)(\w{2})\w{3}\b/g, (_m, prefix, dep) => `${prefix}${dep}${BULLET.repeat(3)}`],
  // Adresse e-mail.
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, (m) => maskMiddle(m)],
  // IBAN (15 caractères au moins : un ISIN, 12 caractères, n'est pas concerné).
  [/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, (m) => maskMiddle(m)],
  // UUID (identifiants de client, de session, d'opération) : 4 caractères de chaque côté.
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, (m) => maskMiddle(m, 4)],
  // Longue suite de chiffres : numéro de compte, de téléphone, identifiant numérique.
  [/\b\d{8,}\b/g, (m) => maskMiddle(m)],
];

/** Valeurs de libellé / de nom dans un JSON illisible (entrée tronquée) : masquées sans distinction. */
const JSON_NAME_FALLBACK = new RegExp(
  `("(?:title|${NAME_KEYS.source.slice(2, -2)})"\\s*:\\s*")((?:[^"\\\\]|\\\\.)*)"`,
  'gi'
);

function maskText(text: string): string {
  return TEXT_RULES.reduce((acc, [pattern, replace]) => acc.replace(pattern, replace), text);
}

/** Semi-anonymise un message ou un détail de journal (JSON ou texte libre). */
export function anonymizeLog(text: string): string {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return maskText(JSON.stringify(maskNode(JSON.parse(text), false)));
    } catch {
      // JSON tronqué ou invalide : repli sur les motifs, libellés masqués par prudence.
      return maskText(text.replace(JSON_NAME_FALLBACK, (_m, prefix, value) => `${prefix}${maskName(value)}"`));
    }
  }
  return maskText(text);
}
