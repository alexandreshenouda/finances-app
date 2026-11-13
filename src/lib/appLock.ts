/**
 * Verrouillage de l'app (biométrie / code de l'appareil) : règles pures, sans dépendance
 * native — l'appel à `expo-local-authentication` vit dans `AppLockGate.tsx`.
 */

/** Durée en arrière-plan en deçà de laquelle l'app ne se reverrouille pas (changement d'app bref). */
export const APP_LOCK_GRACE_MS = 60_000;

/** Faut-il redemander l'authentification au retour au premier plan ? */
export function shouldRelock(backgroundedAt: number | undefined, now: number, graceMs = APP_LOCK_GRACE_MS): boolean {
  return backgroundedAt !== undefined && now - backgroundedAt >= graceMs;
}

/**
 * Erreurs d'authentification signifiant que l'appareil n'a plus aucun verrou (ni
 * biométrie ni code) : il n'y a alors rien à quoi comparer l'utilisateur, et rester
 * verrouillé rendrait l'app définitivement inaccessible. On laisse entrer.
 */
const NO_DEVICE_LOCK_ERRORS = new Set(['not_enrolled', 'passcode_not_set', 'not_available']);

/** Issue d'une tentative : l'app est-elle déverrouillée ? */
export function unlocksApp(result: { success: boolean; error?: string }): boolean {
  return result.success || (result.error !== undefined && NO_DEVICE_LOCK_ERRORS.has(result.error));
}
