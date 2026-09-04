/**
 * Carte interactive de Projection patrimoniale sur la Synthèse.
 * Permet de simuler l'évolution future du patrimoine (brut/net, amortissement des dettes,
 * rendements personnalisés ou historiques, épargne mensuelle, frais, inflation, objectifs).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LineChart } from '@/components/LineChart';
import { Button, Card, Checkbox, Chips, Field } from '@/components/ui';
import { C, useStyles } from '@/constants/theme';
import { confirmAction, notify } from '@/lib/confirm';
import { formatDate, formatDuration, formatEur, formatPct } from '@/lib/format';
import {
  simulatePatrimoineProjection,
  type ObjectiveProjectionReach,
  type ProjectionSettings,
  type SavedProjection,
} from '@/lib/projection';
import { toPerformanceSeries, type SeriesPoint } from '@/lib/portfolio';
import { useStore } from '@/lib/store';
import {
  CHART_MODES,
  type Account,
  type ChartMode,
  type FxRates,
  type Holding,
  type HousePricePoint,
  type Loan,
  type Objective,
  type Period,
  type Property,
  type Snapshot,
} from '@/lib/types';

const HORIZONS = [3, 5, 10, 15, 20, 30] as const;
type HorizonYear = (typeof HORIZONS)[number];
const HORIZON_LABELS: Record<string, string> = {
  '3': '3A',
  '5': '5A',
  '10': '10A',
  '15': '15A',
  '20': '20A',
  '30': '30A',
};
const HORIZON_OPTIONS = HORIZONS.map((h) => String(h));

const RATE_QUICK_OPTIONS = ['3', '5', '7', '10'] as const;
const HISTORICAL_PERIODS: Period[] = ['1M', '3M', '6M', '1A', 'MAX'];

function makeStyles() {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    titleRow: { flex: 1, marginRight: 8 },
    title: { color: C.textDim, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' },
    horizonBadge: { color: C.accent, fontSize: 13, fontWeight: '600', marginTop: 2 },
    headlineRow: { marginVertical: 4 },
    projectedTotal: { color: C.text, fontSize: 32, fontWeight: '700' },
    deltaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    deltaText: { fontSize: 14, fontWeight: '600' },
    debtNote: { color: C.textFaint, fontSize: 12, marginTop: 4 },
    chartControls: {
      marginTop: 10,
      marginBottom: 6,
    },
    chartModeRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginBottom: 2,
    },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 14,
      marginBottom: 10,
    },
    metricBox: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: C.cardAlt,
      borderRadius: 10,
      padding: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    metricLabel: { color: C.textFaint, fontSize: 11, marginBottom: 2 },
    metricVal: { color: C.text, fontSize: 15, fontWeight: '600' },
    controlsSection: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      paddingTop: 12,
      marginTop: 8,
    },
    controlLabel: { color: C.textDim, fontSize: 13, fontWeight: '600', marginBottom: 8 },
    rateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    customRateInput: { width: 100 },
    cagrBadge: {
      backgroundColor: C.cardAlt,
      borderRadius: 8,
      padding: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      marginBottom: 10,
    },
    cagrText: { color: C.accent, fontSize: 13, fontWeight: '600' },
    cagrSub: { color: C.textFaint, fontSize: 11, marginTop: 2 },
    advancedToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      marginTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    advancedToggleText: { color: C.accent, fontSize: 13, fontWeight: '600' },
    advancedPanel: { marginTop: 8 },
    checkboxWrap: { marginVertical: 6 },
    objectivesSection: {
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    objectiveItem: {
      backgroundColor: C.cardAlt,
      borderRadius: 8,
      padding: 8,
      marginBottom: 6,
      borderLeftWidth: 3,
      borderLeftColor: C.accent,
    },
    objectiveReached: { borderLeftColor: C.positive },
    objectiveTitle: { color: C.text, fontSize: 13, fontWeight: '600' },
    objectiveSubtitle: { color: C.textDim, fontSize: 11, marginTop: 2 },
    disclaimer: {
      color: C.textFaint,
      fontSize: 11,
      fontStyle: 'italic',
      marginTop: 10,
      textAlign: 'center',
      lineHeight: 15,
    },
    scenariosSection: {
      marginTop: 8,
      marginBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      paddingTop: 8,
    },
    scenariosHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    scenariosLabel: {
      color: C.textDim,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    saveBtnSmall: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
      backgroundColor: C.cardAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    saveBtnSmallText: {
      color: C.accent,
      fontSize: 12,
      fontWeight: '600',
    },
    scenariosScroll: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 4,
    },
    scenarioCard: {
      backgroundColor: C.cardAlt,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: C.border,
      minWidth: 130,
      maxWidth: 200,
    },
    scenarioCardActive: {
      borderColor: C.accent,
      backgroundColor: C.card,
    },
    scenarioCardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
    },
    scenarioName: {
      color: C.text,
      fontSize: 13,
      fontWeight: '600',
      flex: 1,
    },
    scenarioNameActive: {
      color: C.accent,
      fontWeight: '700',
    },
    scenarioDesc: {
      color: C.textFaint,
      fontSize: 11,
      marginTop: 2,
    },
    scenarioParam: {
      color: C.textDim,
      fontSize: 10,
      marginTop: 3,
    },
    scenarioActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    scenarioIconBtn: {
      padding: 2,
    },
    scenarioIconText: {
      color: C.textFaint,
      fontSize: 13,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.72)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: C.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: C.border,
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 12,
    },
    modalTitle: {
      color: C.text,
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 12,
    },
    summaryTag: {
      backgroundColor: C.cardAlt,
      borderRadius: 8,
      padding: 8,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    summaryTagText: {
      color: C.textDim,
      fontSize: 12,
      lineHeight: 16,
    },
    modalButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 10,
      marginTop: 10,
    },
  });
}

export function ProjectionCard({
  accounts,
  holdings,
  snapshots,
  rates,
  properties,
  loans,
  houseSeries,
  objectives = [],
  historicalSeries = [],
}: {
  accounts: Account[];
  holdings: Holding[];
  snapshots: Snapshot[];
  rates: FxRates;
  properties: Property[];
  loans: Loan[];
  houseSeries: HousePricePoint[];
  objectives?: Objective[];
  historicalSeries?: SeriesPoint[];
}) {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  useStore((s) => s.privacyMode); // Re-render quand le mode confidentialité bascule

  const settings = useStore((s) => s.projectionSettings);
  const setSettings = useStore((s) => s.setProjectionSettings);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>('value');

  // États texte locaux pour permettre la saisie naturelle des décimales (ex: "1.", "1,5") sans réinitialisation
  const [customRateText, setCustomRateText] = useState(String(settings.customRatePct));
  const [feesText, setFeesText] = useState(settings.annualFeesPct > 0 ? String(settings.annualFeesPct) : '');
  const [monthlyContribText, setMonthlyContribText] = useState(
    settings.monthlyContribution > 0 ? String(settings.monthlyContribution) : ''
  );

  useEffect(() => {
    const parsed = parseFloat(customRateText.replace(',', '.'));
    if (parsed !== settings.customRatePct && !customRateText.endsWith('.') && !customRateText.endsWith(',')) {
      setCustomRateText(String(settings.customRatePct));
    }
  }, [settings.customRatePct]);

  useEffect(() => {
    const parsed = parseFloat(feesText.replace(',', '.'));
    if (parsed !== settings.annualFeesPct && !feesText.endsWith('.') && !feesText.endsWith(',')) {
      setFeesText(settings.annualFeesPct > 0 ? String(settings.annualFeesPct) : '');
    }
  }, [settings.annualFeesPct]);

  useEffect(() => {
    const parsed = parseFloat(monthlyContribText.replace(',', '.'));
    if (parsed !== settings.monthlyContribution && !monthlyContribText.endsWith('.') && !monthlyContribText.endsWith(',')) {
      setMonthlyContribText(settings.monthlyContribution > 0 ? String(settings.monthlyContribution) : '');
    }
  }, [settings.monthlyContribution]);

  const savedProjections = useStore((s) => s.savedProjections);
  const upsertSavedProjection = useStore((s) => s.upsertSavedProjection);
  const deleteSavedProjection = useStore((s) => s.deleteSavedProjection);

  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);

  const handleOpenSaveModal = (scenarioToEdit?: SavedProjection) => {
    if (scenarioToEdit) {
      setEditingScenarioId(scenarioToEdit.id);
      setSaveName(scenarioToEdit.name);
      setSaveDesc(scenarioToEdit.description ?? '');
    } else {
      setEditingScenarioId(activeScenarioId);
      const current = savedProjections.find((s) => s.id === activeScenarioId);
      setSaveName(current?.name ?? '');
      setSaveDesc(current?.description ?? '');
    }
    setShowSaveModal(true);
  };

  const handleSaveScenario = () => {
    if (!saveName.trim()) return;
    const saved = upsertSavedProjection({
      name: saveName.trim(),
      description: saveDesc.trim() || undefined,
      settings,
      id: editingScenarioId ?? undefined,
    });
    setActiveScenarioId(saved.id);
    setShowSaveModal(false);
    notify(t('projection.scenario_saved_notify'), saved.name);
  };

  const handleLoadScenario = (s: SavedProjection) => {
    setActiveScenarioId(s.id);
    setSettings(s.settings);
    setCustomRateText(String(s.settings.customRatePct));
    setFeesText(s.settings.annualFeesPct > 0 ? String(s.settings.annualFeesPct) : '');
    setMonthlyContribText(s.settings.monthlyContribution > 0 ? String(s.settings.monthlyContribution) : '');
  };

  const handleDeleteScenario = (s: SavedProjection) => {
    confirmAction(
      t('projection.delete_scenario_title'),
      t('projection.delete_scenario_confirm', { name: s.name }),
      () => {
        deleteSavedProjection(s.id);
        if (activeScenarioId === s.id) setActiveScenarioId(null);
      }
    );
  };

  const hasRealEstate = properties.some((p) => !p.archived);

  // Simulation calculée
  const projection = useMemo(() => {
    return simulatePatrimoineProjection(settings, {
      accounts,
      holdings,
      snapshots,
      rates,
      properties,
      loans,
      houseSeries,
      objectives,
      historicalSeries,
    });
  }, [settings, accounts, holdings, snapshots, rates, properties, loans, houseSeries, objectives, historicalSeries]);

  const displayPoints = useMemo(() => {
    return chartMode === 'percent' ? toPerformanceSeries(projection.points) : projection.points;
  }, [chartMode, projection.points]);

  const b = projection.breakdown;
  const deltaAbs = b.finalTotal - (settings.net ? b.startNet : b.startGross);
  const startRef = settings.net ? b.startNet : b.startGross;
  const deltaPct = startRef > 0 ? (deltaAbs / startRef) * 100 : 0;
  const deltaColor = deltaAbs >= 0 ? C.positive : C.negative;

  const WORTH_MODES = ['net', 'brut'] as const;
  const WORTH_LABELS = {
    net: t('index.net'),
    brut: t('index.brut'),
  };

  const RATE_MODES = ['custom', 'historical'] as const;
  const RATE_MODE_LABELS = {
    custom: t('projection.rate_custom'),
    historical: t('projection.rate_historical'),
  };

  const CHART_MODE_LABELS: Record<ChartMode, string> = {
    value: t('chart.mode_valeur'),
    percent: t('chart.mode_performance'),
  };

  return (
    <Card>
      {/* En-tête : Titre & Bascule Net/Brut */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('projection.title')}</Text>
          <Text style={styles.horizonBadge}>{t('projection.dans_horizon', { years: settings.horizonYears })}</Text>
        </View>
        <Chips
          options={WORTH_MODES}
          value={settings.net ? 'net' : 'brut'}
          onChange={(v) => {
            setSettings({ net: v === 'net' });
            setActiveScenarioId(null);
          }}
          labels={WORTH_LABELS}
          style={{ marginBottom: 0 }}
        />
      </View>

      {/* Barre des scénarios sauvegardés & bouton de sauvegarde */}
      <View style={styles.scenariosSection}>
        <View style={styles.scenariosHeader}>
          <Text style={styles.scenariosLabel}>{t('projection.saved_scenarios')}</Text>
          <Pressable style={styles.saveBtnSmall} onPress={() => handleOpenSaveModal()} hitSlop={6}>
            <Text style={styles.saveBtnSmallText}>＋ {t('projection.save_scenario')}</Text>
          </Pressable>
        </View>

        {savedProjections.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scenariosScroll}>
            {savedProjections.map((sc) => {
              const isActive = activeScenarioId === sc.id;
              return (
                <Pressable
                  key={sc.id}
                  style={[styles.scenarioCard, isActive && styles.scenarioCardActive]}
                  onPress={() => handleLoadScenario(sc)}
                >
                  <View style={styles.scenarioCardHead}>
                    <Text style={[styles.scenarioName, isActive && styles.scenarioNameActive]} numberOfLines={1}>
                      {sc.name}
                    </Text>
                    <View style={styles.scenarioActions}>
                      <Pressable
                        style={styles.scenarioIconBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleOpenSaveModal(sc);
                        }}
                        hitSlop={6}
                      >
                        <Text style={styles.scenarioIconText}>✎</Text>
                      </Pressable>
                      <Pressable
                        style={styles.scenarioIconBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDeleteScenario(sc);
                        }}
                        hitSlop={6}
                      >
                        <Text style={[styles.scenarioIconText, { color: C.negative }]}>✕</Text>
                      </Pressable>
                    </View>
                  </View>
                  {sc.description ? (
                    <Text style={styles.scenarioDesc} numberOfLines={1}>
                      {sc.description}
                    </Text>
                  ) : null}
                  <Text style={styles.scenarioParam}>
                    {sc.settings.horizonYears}A ·{' '}
                    {sc.settings.rateMode === 'custom' ? `${sc.settings.customRatePct}%` : 'Hist.'} ·{' '}
                    {sc.settings.net ? 'Net' : 'Brut'}
                    {sc.settings.monthlyContribution > 0 ? ` · +${sc.settings.monthlyContribution}€/m` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Montant projeté et delta */}
      <View style={styles.headlineRow}>
        <Text style={styles.projectedTotal}>{formatEur(b.finalTotal)}</Text>
        <View style={styles.deltaRow}>
          <Text style={[styles.deltaText, { color: deltaColor }]}>
            {deltaAbs >= 0 ? '+' : ''}
            {formatEur(deltaAbs)} ({formatPct(deltaPct, true)})
          </Text>
        </View>
        {settings.net && b.finalDebt > 0 && (
          <Text style={styles.debtNote}>
            {t('projection.remaining_debt', { amount: formatEur(b.finalDebt) })}
            {b.totalDebtAmortized > 0 ? ` · +${formatEur(b.totalDebtAmortized)} amortis` : ''}
          </Text>
        )}
      </View>

      {/* Commandes du graphique */}
      <View style={styles.chartControls}>
        <Chips
          options={HORIZON_OPTIONS}
          value={String(settings.horizonYears)}
          onChange={(val) => setSettings({ horizonYears: Number(val) as HorizonYear })}
          labels={HORIZON_LABELS}
          style={{ marginBottom: 6 }}
        />
        <View style={styles.chartModeRow}>
          <Chips
            options={CHART_MODES}
            value={chartMode}
            onChange={setChartMode}
            labels={CHART_MODE_LABELS}
            style={{ marginBottom: 0 }}
          />
        </View>
      </View>

      {/* Graphique de projection */}
      <LineChart points={displayPoints} mode={chartMode} color={C.accent} />

      {/* Métriques détaillées de la projection */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>{t('projection.start_capital')}</Text>
          <Text style={styles.metricVal}>{formatEur(settings.net ? b.startNet : b.startGross)}</Text>
        </View>
        {b.totalContributions > 0 && (
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>{t('projection.total_contributions')}</Text>
            <Text style={styles.metricVal}>+{formatEur(b.totalContributions)}</Text>
          </View>
        )}
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>{t('projection.total_gains')}</Text>
          <Text style={[styles.metricVal, { color: C.positive }]}>+{formatEur(b.totalGains)}</Text>
        </View>
        {settings.net && b.totalDebtAmortized > 0 && (
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>{t('projection.debt_amortized')}</Text>
            <Text style={[styles.metricVal, { color: C.accent }]}>+{formatEur(b.totalDebtAmortized)}</Text>
          </View>
        )}
        {b.totalFeesCost > 0 && (
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>{t('projection.fees_cost')}</Text>
            <Text style={[styles.metricVal, { color: C.negative }]}>-{formatEur(b.totalFeesCost)}</Text>
          </View>
        )}
      </View>

      {/* Réglage du taux de rendement */}
      <View style={styles.controlsSection}>
        <Text style={styles.controlLabel}>{t('projection.rate_source')}</Text>
        <Chips
          options={RATE_MODES}
          value={settings.rateMode}
          onChange={(m) => setSettings({ rateMode: m })}
          labels={RATE_MODE_LABELS}
          style={{ marginBottom: 8 }}
        />

        {settings.rateMode === 'custom' ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Chips
                options={RATE_QUICK_OPTIONS}
                value={
                  RATE_QUICK_OPTIONS.includes(String(settings.customRatePct) as any)
                    ? (String(settings.customRatePct) as any)
                    : ('' as any)
                }
                onChange={(v) => {
                  setSettings({ customRatePct: Number(v) });
                  setCustomRateText(v);
                }}
                labels={{ '3': '3 %', '5': '5 %', '7': '7 %', '10': '10 %' }}
                style={{ marginBottom: 0 }}
              />
            </View>
            <Field
              label={`${t('projection.rate_custom')} (%)`}
              value={customRateText}
              onChangeText={(text) => {
                setCustomRateText(text);
                const val = parseFloat(text.replace(',', '.'));
                if (!Number.isNaN(val)) setSettings({ customRatePct: val });
                else if (text === '' || text === '-') setSettings({ customRatePct: 0 });
              }}
              onBlur={() => {
                if (customRateText.endsWith('.') || customRateText.endsWith(',')) {
                  setCustomRateText(customRateText.slice(0, -1));
                }
              }}
              keyboardType="numeric"
              style={{ marginBottom: 4 }}
            />
          </View>
        ) : (
          <View>
            <Chips
              options={HISTORICAL_PERIODS}
              value={settings.historicalPeriod}
              onChange={(p) => setSettings({ historicalPeriod: p })}
              style={{ marginBottom: 8 }}
            />
            <View style={styles.cagrBadge}>
              {b.cagrCalculated !== undefined ? (
                <>
                  <Text style={styles.cagrText}>
                    {t('projection.historical_cagr_label', {
                      rate: formatPct(b.cagrCalculated, true),
                    })}
                  </Text>
                  <Text style={styles.cagrSub}>
                    {t('projection.historical_cagr_period', { period: settings.historicalPeriod })}
                  </Text>
                </>
              ) : (
                <Text style={styles.cagrSub}>{t('projection.historical_too_short')}</Text>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Options avancées (dépliables) */}
      <Pressable style={styles.advancedToggle} onPress={() => setShowAdvanced(!showAdvanced)}>
        <Text style={styles.advancedToggleText}>
          {showAdvanced ? `▲ ${t('projection.hide_advanced')}` : `▼ ${t('projection.advanced_options')}`}
        </Text>
      </Pressable>

      {showAdvanced && (
        <View style={styles.advancedPanel}>
          <Field
            label={`${t('projection.monthly_contribution')} (€)`}
            value={monthlyContribText}
            placeholder="0"
            onChangeText={(text) => {
              setMonthlyContribText(text);
              const val = parseFloat(text.replace(',', '.'));
              if (!Number.isNaN(val)) setSettings({ monthlyContribution: Math.max(0, val) });
              else if (text === '') setSettings({ monthlyContribution: 0 });
            }}
            onBlur={() => {
              if (monthlyContribText.endsWith('.') || monthlyContribText.endsWith(',')) {
                setMonthlyContribText(monthlyContribText.slice(0, -1));
              }
            }}
            keyboardType="numeric"
          />

          <Field
            label={`${t('projection.annual_fees')} (%)`}
            value={feesText}
            placeholder="0.0"
            onChangeText={(text) => {
              setFeesText(text);
              const val = parseFloat(text.replace(',', '.'));
              if (!Number.isNaN(val)) setSettings({ annualFeesPct: Math.max(0, val) });
              else if (text === '') setSettings({ annualFeesPct: 0 });
            }}
            onBlur={() => {
              if (feesText.endsWith('.') || feesText.endsWith(',')) {
                setFeesText(feesText.slice(0, -1));
              }
            }}
            keyboardType="numeric"
          />

          {hasRealEstate && (
            <View style={styles.checkboxWrap}>
              <Checkbox
                label={t('projection.include_real_estate')}
                value={settings.includeRealEstate}
                onChange={(val) => setSettings({ includeRealEstate: val })}
              />
            </View>
          )}

          <View style={styles.checkboxWrap}>
            <Checkbox
              label={t('projection.inflation_adjust')}
              value={settings.adjustForInflation}
              onChange={(val) => setSettings({ adjustForInflation: val })}
            />
          </View>
        </View>
      )}

      {/* Suivi des objectifs de l'utilisateur par rapport à la projection */}
      {projection.reachedObjectives.length > 0 && (
        <View style={styles.objectivesSection}>
          <Text style={styles.controlLabel}>{t('objectives.title')}</Text>
          {projection.reachedObjectives.map((reach: ObjectiveProjectionReach) => {
            const name = reach.objective.name || t(`objectiveCategories.${reach.objective.category}`);
            return (
              <View
                key={reach.objective.id}
                style={[styles.objectiveItem, reach.reachedAtHorizon && styles.objectiveReached]}
              >
                {reach.reachedAtHorizon && reach.monthsToReach !== undefined ? (
                  <>
                    <Text style={styles.objectiveTitle}>
                      {t('projection.objective_reached', {
                        name,
                        duration: formatDuration(reach.monthsToReach),
                        date: reach.reachedDate ? formatDate(`${reach.reachedDate}T12:00:00`) : '',
                      })}
                    </Text>
                    <Text style={styles.objectiveSubtitle}>
                      {t('projection.target_amount', { amount: formatEur(reach.targetAmount) })}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.objectiveTitle}>
                      {t('projection.objective_not_reached', {
                        name,
                        target: formatEur(reach.targetAmount),
                      })}
                    </Text>
                    <Text style={styles.objectiveSubtitle}>
                      {t('projection.projected_at_horizon', {
                        years: settings.horizonYears,
                        amount: formatEur(reach.projectedAmountAtHorizon),
                      })}
                    </Text>
                  </>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Mentions légales / Avertissement */}
      <Text style={styles.disclaimer}>{t('projection.disclaimer')}</Text>

      {/* Modal de sauvegarde / édition de scénario */}
      <Modal visible={showSaveModal} transparent animationType="fade" onRequestClose={() => setShowSaveModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSaveModal(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {editingScenarioId ? t('projection.edit_modal_title') : t('projection.save_modal_title')}
            </Text>
            <View style={styles.summaryTag}>
              <Text style={styles.summaryTagText}>
                {t('projection.scenario_summary')} : {settings.horizonYears} {t('common.years', { count: settings.horizonYears })} ·{' '}
                {settings.rateMode === 'custom'
                  ? `${settings.customRatePct} %`
                  : `${t('projection.rate_historical')} (${settings.historicalPeriod})`}{' '}
                · {settings.net ? t('index.net') : t('index.brut')}
                {settings.monthlyContribution > 0 ? ` · ${formatEur(settings.monthlyContribution)}/m` : ''}
                {settings.annualFeesPct > 0 ? ` · ${settings.annualFeesPct} % frais` : ''}
              </Text>
            </View>
            <Field
              label={t('projection.scenario_name')}
              placeholder={t('projection.scenario_name_placeholder')}
              value={saveName}
              onChangeText={setSaveName}
              autoFocus
            />
            <Field
              label={t('projection.scenario_description')}
              placeholder={t('projection.scenario_desc_placeholder')}
              value={saveDesc}
              onChangeText={setSaveDesc}
            />
            <View style={styles.modalButtons}>
              <Button
                title={t('projection.cancel_button')}
                variant="secondary"
                onPress={() => setShowSaveModal(false)}
                style={{ minWidth: 84, paddingVertical: 8 }}
              />
              <Button
                title={t('projection.save_button')}
                variant="primary"
                onPress={handleSaveScenario}
                disabled={!saveName.trim()}
                style={{ minWidth: 84, paddingVertical: 8 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Card>
  );
}
