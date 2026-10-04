/** Faux `fetch` pour les tests des modules réseau (cours, scrapers, connecteurs) :
 *  aucune requête HTTP réelle ne part — la CI n'a ni réseau garanti ni secrets.
 *
 *  Chaque route associe un motif d'URL (sous-chaîne ou RegExp) à une réponse. La
 *  première route qui correspond gagne ; une URL sans route lève une erreur réseau,
 *  comme un `fetch` hors-ligne. Les appels sont enregistrés pour les assertions. */
import { vi } from 'vitest';

export type RouteReply =
  | Response
  | ((url: string, init?: RequestInit) => Response | Promise<Response>);

export interface FetchCall {
  url: string;
  init?: RequestInit;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function text(body: string, status = 200): Response {
  return new Response(body, { status });
}

/** Réponse qui lève à l'appel (coupure réseau, CORS, timeout…). */
export function networkError(message = 'Failed to fetch'): () => never {
  return () => {
    throw new TypeError(message);
  };
}

/** Installe le faux `fetch` global ; `vi.unstubAllGlobals()` le retire. */
export function mockFetch(routes: [string | RegExp, RouteReply][]): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes.find(([pattern]) =>
      typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url)
    );
    if (!route) throw new TypeError(`fetch non simulé : ${url}`);
    const reply = route[1];
    // Une Response ne se lit qu'une fois : on clone pour qu'une route serve plusieurs appels.
    return typeof reply === 'function' ? reply(url, init) : reply.clone();
  });
  return calls;
}
