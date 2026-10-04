/** Tests du store global persisté (`src/lib/store.ts`) : CRUD des entités, suppressions
 *  en cascade, réglages, persistance AsyncStorage et synchronisations (masquage, langue,
 *  thème). Le store est un singleton : chaque test repart d'un état vidé. */
import { beforeEach, describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, THEMES } from '@/constants/theme';
import { formatEur, formatPct, todayKey } from '@/lib/format';
import i18next from '@/lib/i18n';
import { exportData, useStore, type AppData } from '@/lib/store';
import { DEFAULT_FX_RATES, DEFAULT_PROJECTION_SETTINGS } from '@/lib/types';
import { account, holding, loan, objective, property, snapshot } from './factories';

const S = () => useStore.getState();

beforeEach(() => {
  S().resetAll();
  useStore.setState({
    fxRates: DEFAULT_FX_RATES,
    fxUpdatedAt: undefined,
    houseIndex: undefined,
    houseIndexUpdatedAt: undefined,
    projectionSettings: DEFAULT_PROJECTION_SETTINGS,
  });
});

describe('réglages simples', () => {
  it('horodate les taux de change et l’indice immobilier à l’enregistrement', () => {
    S().setFxRates({ EUR: 1, USD: 0.9, CHF: 1.1 });
    expect(S().fxRates.USD).toBe(0.9);
    expect(Date.parse(S().fxUpdatedAt!)).not.toBeNaN();

    S().setHouseIndex([{ date: '2020-01-01', value: 100 }]);
    expect(S().houseIndex).toEqual([{ date: '2020-01-01', value: 100 }]);
    expect(Date.parse(S().houseIndexUpdatedAt!)).not.toBeNaN();
  });

  it('applique chaque bascule d’affichage', () => {
    S().setPatrimoineNet(false);
    S().setShowRealEstate(false);
    S().setShowImmobilierTab(false);
    S().setShowEmpruntsTab(false);
    S().setShowDiversificationTab(false);
    S().setRiskProfile('dynamique');
    S().setDefaultPeriod('MAX');
    S().setChartMode('percent');
    expect(S()).toMatchObject({
      patrimoineNet: false,
      showRealEstate: false,
      showImmobilierTab: false,
      showEmpruntsTab: false,
      showDiversificationTab: false,
      riskProfile: 'dynamique',
      defaultPeriod: 'MAX',
      chartMode: 'percent',
    });
  });

  it('fusionne partiellement les paramètres de projection', () => {
    S().setProjectionSettings({ horizonYears: 20 });
    S().setProjectionSettings({ monthlyContribution: 300 });
    expect(S().projectionSettings).toEqual({
      ...DEFAULT_PROJECTION_SETTINGS,
      horizonYears: 20,
      monthlyContribution: 300,
    });
  });
});

describe('synchronisations déclenchées par le store', () => {
  it('le mode confidentialité masque les montants mais jamais les pourcentages', () => {
    S().setPrivacyMode(true);
    expect(formatEur(1234)).toBe('••••');
    expect(formatPct(12.5)).not.toContain('•');
    S().setPrivacyMode(false);
    expect(formatEur(1234)).not.toContain('•');
  });

  it('la langue pilote i18next et la locale des montants', () => {
    S().setLanguage('en');
    expect(i18next.language).toBe('en');
    expect(formatEur(1234)).toBe('€1,234');
    S().setLanguage('de');
    expect(i18next.language).toBe('de');
    expect(formatEur(1234)).toMatch(/^1\.234\s€$/);
    S().setLanguage('fr');
    expect(i18next.language).toBe('fr');
  });

  it('le thème recopie la palette active dans `C`', () => {
    S().setThemePref('classique');
    expect(C).toEqual(THEMES.classique);
    S().setThemePref('or');
    expect(C).toEqual(THEMES.or);
  });
});

describe('scénarios de projection sauvegardés', () => {
  it('crée un scénario nettoyé (nom et description vides ignorés) en tête de liste', () => {
    const first = S().upsertSavedProjection({ name: '  Prudent ', description: '   ', settings: DEFAULT_PROJECTION_SETTINGS });
    const second = S().upsertSavedProjection({ name: 'Dynamique', description: ' 7 % ', settings: DEFAULT_PROJECTION_SETTINGS });
    expect(first.name).toBe('Prudent');
    expect(first.description).toBeUndefined();
    expect(second.description).toBe('7 %');
    expect(S().savedProjections.map((p) => p.id)).toEqual([second.id, first.id]);
  });

  it('met à jour un scénario existant en conservant sa date de création', () => {
    const created = S().upsertSavedProjection({ name: 'A', settings: DEFAULT_PROJECTION_SETTINGS });
    const settings = { ...DEFAULT_PROJECTION_SETTINGS, horizonYears: 30 };
    const updated = S().upsertSavedProjection({ id: created.id, name: 'B', settings });
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(S().savedProjections).toEqual([updated]);
    expect(S().savedProjections[0].settings.horizonYears).toBe(30);
  });

  it('garde l’id fourni pour un scénario encore inconnu (import)', () => {
    const p = S().upsertSavedProjection({ id: 'fixed', name: 'X', settings: DEFAULT_PROJECTION_SETTINGS });
    expect(p.id).toBe('fixed');
  });

  it('supprime un scénario', () => {
    const p = S().upsertSavedProjection({ name: 'A', settings: DEFAULT_PROJECTION_SETTINGS });
    S().deleteSavedProjection(p.id);
    expect(S().savedProjections).toEqual([]);
  });
});

describe('comptes', () => {
  it('crée un compte avec id et date de création, puis le met à jour en place', () => {
    const a = S().upsertAccount({ name: 'PEA', type: 'pea' });
    expect(a.id).toBeTruthy();
    expect(Date.parse(a.createdAt)).not.toBeNaN();

    const b = S().upsertAccount({ id: a.id, name: 'PEA Bourso', type: 'pea', cashBalance: 10 });
    expect(b).toMatchObject({ id: a.id, createdAt: a.createdAt, name: 'PEA Bourso', cashBalance: 10 });
    expect(S().accounts).toEqual([b]);
  });

  it('supprime ses lignes et son historique, pas ceux des autres comptes', () => {
    const a = S().upsertAccount({ name: 'A', type: 'cto' });
    const b = S().upsertAccount({ name: 'B', type: 'cto' });
    S().upsertHolding({ accountId: a.id, name: 'x', quantity: 1 });
    S().upsertHolding({ accountId: b.id, name: 'y', quantity: 1 });
    S().recordSnapshot(a.id, 100, 'manual', '2024-01-01');
    S().recordSnapshot(b.id, 200, 'manual', '2024-01-01');

    S().deleteAccount(a.id);
    expect(S().accounts.map((x) => x.id)).toEqual([b.id]);
    expect(S().holdings.map((h) => h.accountId)).toEqual([b.id]);
    expect(S().snapshots.map((s) => s.accountId)).toEqual([b.id]);
  });
});

describe('biens et prêts', () => {
  it('valorise un nouveau bien par l’indice par défaut', () => {
    const p = S().upsertProperty({ name: 'T2', kind: 'appartement', purchasePrice: 1, purchaseDate: '2020-01-01' });
    expect(p.valuationMode).toBe('index');
    const q = S().upsertProperty({ ...p, valuationMode: 'manual' });
    expect(q.id).toBe(p.id);
    expect(S().properties).toEqual([q]);
  });

  it('supprime les prêts immo du bien, mais pas les prêts conso', () => {
    const p = S().upsertProperty(property());
    const immo = S().upsertLoan(loan({ propertyId: p.id }));
    const conso = S().upsertLoan(loan());
    S().deleteProperty(p.id);
    expect(S().properties).toEqual([]);
    expect(S().loans.map((l) => l.id)).toEqual([conso.id]);
    expect(immo.id).not.toBe(conso.id);
  });

  it('met à jour puis supprime un prêt', () => {
    const l = S().upsertLoan(loan());
    const updated = S().upsertLoan({ ...l, annualRate: 1.5 });
    expect(S().loans).toEqual([updated]);
    expect(updated.createdAt).toBe(l.createdAt);
    S().deleteLoan(l.id);
    expect(S().loans).toEqual([]);
  });
});

describe('objectifs', () => {
  it('crée, met à jour et supprime un objectif', () => {
    const o = S().upsertObjective(objective({ name: 'Voiture', targetAmount: 10_000 }));
    const u = S().upsertObjective({ ...o, targetAmount: 12_000 });
    expect(S().objectives).toEqual([u]);
    expect(u.targetAmount).toBe(12_000);
    S().deleteObjective(o.id);
    expect(S().objectives).toEqual([]);
  });

  it('génère un id pour un objectif sans id', () => {
    const o = S().upsertObjective({ category: 'epargne_precaution', securityMonths: 6 });
    expect(o.id).toBeTruthy();
    expect(o.createdAt).toBeTruthy();
  });
});

describe('lignes', () => {
  it('prend une source de prix manuelle par défaut et se met à jour en place', () => {
    const h = S().upsertHolding({ accountId: 'a', name: 'ETF', quantity: 2 });
    expect(h.priceSource).toBe('manual');
    const u = S().upsertHolding({ ...h, quantity: 3, priceSource: 'yahoo' });
    expect(S().holdings).toEqual([u]);
    expect(u).toMatchObject({ id: h.id, quantity: 3, priceSource: 'yahoo' });
    S().deleteHolding(h.id);
    expect(S().holdings).toEqual([]);
  });
});

describe('historique (snapshots)', () => {
  it('écrase le snapshot du même jour et du même compte', () => {
    S().recordSnapshot('a', 100, 'manual', '2024-01-01');
    S().recordSnapshot('a', 150, 'sync', '2024-01-01');
    S().recordSnapshot('a', 160, 'sync', '2024-01-02');
    S().recordSnapshot('b', 999, 'manual', '2024-01-01');
    const a = S().snapshots.filter((s) => s.accountId === 'a').sort((x, y) => x.date.localeCompare(y.date));
    expect(a.map((s) => [s.date, s.value, s.source])).toEqual([
      ['2024-01-01', 150, 'sync'],
      ['2024-01-02', 160, 'sync'],
    ]);
    expect(S().snapshots).toHaveLength(3);
  });

  it('date le snapshot du jour par défaut', () => {
    S().recordSnapshot('a', 1, 'auto');
    expect(S().snapshots[0].date).toBe(todayKey());
  });

  it('supprime un snapshot, ou un lot de snapshots', () => {
    S().importData({
      accounts: [],
      holdings: [],
      connections: [],
      properties: [],
      loans: [],
      objectives: [],
      snapshots: [
        snapshot({ id: 's1', accountId: 'a', date: '2024-01-01', value: 1 }),
        snapshot({ id: 's2', accountId: 'a', date: '2024-01-02', value: 2 }),
        snapshot({ id: 's3', accountId: 'a', date: '2024-01-03', value: 3 }),
        snapshot({ id: 's4', accountId: 'a', date: '2024-01-04', value: 4 }),
      ],
    });
    S().deleteSnapshot('s1');
    S().deleteSnapshotsByIds(['s2', 's4', 'inconnu']);
    expect(S().snapshots.map((s) => s.id)).toEqual(['s3']);
  });
});

describe('connexions', () => {
  it('crée puis met à jour une connexion', () => {
    const c = S().upsertConnection({ provider: 'binance', label: 'Binance' });
    const u = S().upsertConnection({ ...c, lastError: 'boom' });
    expect(S().connections).toEqual([u]);
    expect(u.createdAt).toBe(c.createdAt);
  });

  it('à la suppression, ses comptes redeviennent manuels et gardent leur historique', () => {
    const c = S().upsertConnection({ provider: 'kraken', label: 'Kraken' });
    const linked = S().upsertAccount({ name: 'K', type: 'crypto', connectionId: c.id, externalId: 'kraken-main' });
    const other = S().upsertAccount({ name: 'Manuel', type: 'livret' });
    S().recordSnapshot(linked.id, 100, 'sync', '2024-01-01');

    S().deleteConnection(c.id);
    expect(S().connections).toEqual([]);
    const after = S().accounts.find((a) => a.id === linked.id)!;
    expect(after.connectionId).toBeUndefined();
    expect(after.externalId).toBeUndefined();
    expect(S().accounts.find((a) => a.id === other.id)).toEqual(other);
    expect(S().snapshots).toHaveLength(1);
  });
});

describe('import / export / remise à zéro', () => {
  const data: AppData = {
    accounts: [account({ id: 'a1' })],
    holdings: [holding({ accountId: 'a1' })],
    snapshots: [snapshot({ accountId: 'a1', date: '2024-01-01', value: 10 })],
    connections: [],
    properties: [property()],
    loans: [loan()],
    objectives: [objective()],
    savedProjections: [
      { id: 'p', name: 'P', createdAt: '2024-01-01T00:00:00.000Z', settings: DEFAULT_PROJECTION_SETTINGS },
    ],
  };

  it('restitue à l’export exactement ce qui a été importé', () => {
    S().importData(data);
    expect(exportData()).toEqual(data);
  });

  it('accepte un ancien export auquel il manque des collections', () => {
    S().importData({ accounts: data.accounts } as AppData);
    expect(exportData()).toEqual({
      accounts: data.accounts,
      holdings: [],
      snapshots: [],
      connections: [],
      properties: [],
      loans: [],
      objectives: [],
      savedProjections: [],
    });
  });

  it('remet données et réglages par défaut', () => {
    S().importData(data);
    S().setPrivacyMode(true);
    S().setThemePref('classique');
    S().setChartMode('percent');
    S().resetAll();
    expect(exportData()).toEqual({
      accounts: [],
      holdings: [],
      snapshots: [],
      connections: [],
      properties: [],
      loans: [],
      objectives: [],
      savedProjections: [],
    });
    expect(S()).toMatchObject({ privacyMode: false, theme: 'or', chartMode: 'value', language: 'fr' });
  });
});

describe('persistance AsyncStorage', () => {
  it('ne persiste que les données et réglages (ni `hydrated`, ni les actions)', async () => {
    S().upsertAccount({ name: 'Livret A', type: 'livret' });
    const raw = await AsyncStorage.getItem('patrimoine.data');
    const persisted = JSON.parse(raw!).state;
    expect(persisted.accounts[0].name).toBe('Livret A');
    expect(persisted).toHaveProperty('projectionSettings');
    expect(persisted).not.toHaveProperty('hydrated');
    expect(persisted).not.toHaveProperty('upsertAccount');
  });

  it('se réhydrate depuis le stockage et se marque comme hydraté', async () => {
    // `setState` persiste aussitôt : on le fait AVANT d'écrire le stockage simulé.
    useStore.setState({ hydrated: false });
    const stored = { ...JSON.parse((await AsyncStorage.getItem('patrimoine.data'))!) };
    stored.state = { ...stored.state, accounts: [account({ id: 'restored', name: 'Restauré' })], theme: 'classique' };
    await AsyncStorage.setItem('patrimoine.data', JSON.stringify(stored));

    await useStore.persist.rehydrate();
    expect(S().hydrated).toBe(true);
    expect(S().accounts.map((a) => a.id)).toEqual(['restored']);
    expect(C).toEqual(THEMES.classique);
  });
});
