/** Tests de la semi-anonymisation du journal de debug (`src/lib/logAnonymize.ts`). */
import { describe, expect, it } from 'vitest';
import { anonymizeLog, maskMiddle, maskName } from '@/lib/logAnonymize';

describe('maskMiddle / maskName', () => {
  it('garde les extrémités et masque tout ce qui est trop court pour ça', () => {
    expect(maskMiddle('0123456789')).toBe('01••••••89');
    expect(maskMiddle('abcdefgh', 3)).toBe('abc••fgh');
    expect(maskMiddle('1234')).toBe('••••');
    expect(maskMiddle('')).toBe('');
  });

  it('garde la première et la dernière lettre de chaque mot d’un nom', () => {
    expect(maskName('DUPONT Marie-Hélène')).toBe('D••••T M••••••••••e');
    expect(maskName("Léa d'Arc Li")).toBe('L•a d•••c L•');
    // Ce qui n'est pas un mot (montant, date) n'est pas touché.
    expect(maskName('+€1,000.00')).toBe('+€1,000.00');
    expect(maskName('Café 42')).toBe('C••é 42');
  });
});

describe('anonymizeLog — texte libre et URL', () => {
  it('masque numéros de compte, téléphone, e-mail, IBAN et UUID, où qu’ils soient', () => {
    expect(anonymizeLog('TAX_WRAPPER (0123456789) : 6 titre(s), cash=144.67€')).toBe('TAX_WRAPPER (01••••••89) : 6 titre(s), cash=144.67€');
    expect(anonymizeLog('GET /tx?pageSize=50&cashAccountNumbers%5B%5D=0123456789 → HTTP 200')).toBe(
      'GET /tx?pageSize=50&cashAccountNumbers%5B%5D=01••••••89 → HTTP 200'
    );
    expect(anonymizeLog('tel +33612345678, mail jean.dupont@example.org')).toBe('tel +33•••••••78, mail je•••••••••••••••••••rg');
    expect(anonymizeLog('IBAN FR7630006000011234567890189 ok')).toBe('IBAN FR•••••••••••••••••••••••89 ok');
    expect(anonymizeLog('GET .../processes/123e4567-e89b-42d3-a456-426614174000 → HTTP 200')).toBe(
      'GET .../processes/123e••••••••••••••••••••••••••••4000 → HTTP 200'
    );
  });

  it('masque l’adresse géocodée et réduit le code commune à son département', () => {
    expect(anonymizeLog('GET https://data.geopf.fr/geocodage/search?q=12%20rue%20des%20Lilas%20Lyon&limit=1 → HTTP 200 (80 ms)')).toBe(
      'GET https://data.geopf.fr/geocodage/search?q=••••••&limit=1 → HTTP 200 (80 ms)'
    );
    expect(anonymizeLog('GET https://dvf-api.data.gouv.fr/commune/69123 → HTTP 200')).toBe('GET https://dvf-api.data.gouv.fr/commune/69••• → HTTP 200');
    expect(anonymizeLog('GET https://dvf-api.data.gouv.fr/commune/2A004 → HTTP 200')).toContain('/commune/2A•••');
    expect(anonymizeLog('GET https://dvf-api.data.gouv.fr/departement/69 → HTTP 200')).toContain('/departement/69 ');
  });

  it('laisse intact ce qui sert au diagnostic : ISIN, montants, dates, durées, recherche de titre', () => {
    for (const line of [
      'Cours de LU3176111881 via EQT (absent de LSX)',
      'WS ticker FR0000120271.LSX → 59.87',
      'GET https://query1.finance.yahoo.com/v1/finance/search?q=IE00B4L5Y983&quotesCount=8 → HTTP 200 (212 ms)',
      '[2026-11-12T19:32:23.022Z] versements PEA=18824.6',
      'HTTP 429 après 1234567 ms',
    ]) {
      expect(anonymizeLog(line)).toBe(line);
    }
  });
});

describe('anonymizeLog — réponses JSON', () => {
  const transfer = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    title: 'DUPONT MARIE',
    subtitle: 'Completed',
    amount: { currency: 'EUR', value: 1000 },
    cashAccountNumber: '0123456789',
    eventType: 'BANK_TRANSACTION_INCOMING',
    presentation: { content: { title: 'DUPONT MARIE', subtitle: '30 Oct • Completed' }, trailing: { title: '+€1,000.00' } },
  };

  it('masque le libellé d’un virement dans tout son sous-arbre, pas ses montants', () => {
    expect(JSON.parse(anonymizeLog(JSON.stringify({ items: [transfer] })))).toEqual({
      items: [
        {
          ...transfer,
          id: '123e••••••••••••••••••••••••••••4000',
          title: 'D••••T M•••E',
          cashAccountNumber: '01••••••89',
          presentation: { content: { title: 'D••••T M•••E', subtitle: '30 Oct • Completed' }, trailing: { title: '+€1,000.00' } },
        },
      ],
    });
  });

  it('garde le libellé d’un dividende, d’un ordre ou d’intérêts ; masque celui d’un type inconnu', () => {
    const item = (eventType: string, title: string) => JSON.parse(anonymizeLog(JSON.stringify([{ title, eventType }])))[0].title;
    expect(item('SSP_CORPORATE_ACTION_CASH', 'Alphabet (C)')).toBe('Alphabet (C)');
    expect(item('TRADING_TRADE_EXECUTED', 'Core MSCI World')).toBe('Core MSCI World');
    expect(item('INTEREST_PAYOUT', 'Interest')).toBe('Interest');
    expect(item('CARD_TRANSACTION', 'Boulangerie Martin')).toBe('B•••••••••e M••••n');
    // Hors opération (pas d'eventType), un `title` ou un `name` n'est pas un nom de personne.
    expect(JSON.parse(anonymizeLog('{"title":"Stocks","name":"Physical Gold"}'))).toEqual({ title: 'Stocks', name: 'Physical Gold' });
  });

  it('masque identifiants et noms désignés par leur clé, valeurs imbriquées comprises', () => {
    const out = JSON.parse(
      anonymizeLog(
        JSON.stringify({
          accounts: [{ securitiesAccountNumber: '0123', secAccNo: 'AB12', account_id: { iban: 'FR76 3000 6000' }, uid: 'abcdefgh' }],
          owner: 'Jean Dupont',
          creditor: { name: 'ACME SARL', lines: ['Paul Martin'] },
          remittance_information: ['Loyer novembre'],
          authAccountId: 42,
          balance: 1234.5,
        })
      )
    );
    expect(out).toEqual({
      accounts: [{ securitiesAccountNumber: '••••', secAccNo: '••••', account_id: { iban: 'FR••••••••••00' }, uid: 'ab••••gh' }],
      owner: 'J••n D••••t',
      creditor: { name: 'A••E S••L', lines: ['P••l M••••n'] },
      remittance_information: ['L•••r n••••••e'],
      authAccountId: 42,
      balance: 1234.5,
    });
  });

  it('JSON tronqué : repli sur les motifs, tous les libellés masqués par prudence', () => {
    const cut = `{"items":[{"title":"DUPONT \\"M\\" MARIE","eventType":"X","cashAccountNumber":"0123456789"},{"title":"Alphabet","owner":"Jean`;
    const out = anonymizeLog(cut);
    expect(out).toContain('"title":"D••••T \\"M\\" M•••E"');
    expect(out).toContain('"cashAccountNumber":"01••••••89"');
    expect(out).toContain('"title":"A••••••t"');
  });

  it('est idempotente', () => {
    const once = anonymizeLog(JSON.stringify({ items: [transfer], owner: 'Jean Dupont' }));
    expect(anonymizeLog(once)).toBe(once);
    const line = anonymizeLog('compte 0123456789 de jean.dupont@example.org, /commune/69123');
    expect(anonymizeLog(line)).toBe(line);
  });
});
