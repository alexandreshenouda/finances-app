/** Diversification : avertissement légal, comparaison à un profil de référence, suggestions. */
import { AlphaVantageHint } from '@/components/AlphaVantageHint';
import { InsightCard } from '@/components/InsightCard';
import { LegalDisclaimer } from '@/components/LegalDisclaimer';
import { Button, Card, Chips, Empty, ProgressBar, SectionTitle } from '@/components/ui';
import { C, useStyles } from '@/constants/theme';
import { computeAllocationComparison, computeClassificationBreakdown, computeInsights } from '@/lib/diversification';
import { formatEur, formatPct } from '@/lib/format';
import { accountCurrentValue, accountShare } from '@/lib/portfolio';
import { classifyHoldings } from '@/lib/prices/classification';
import { houseIndexSeries } from '@/lib/prices/houseIndex';
import { realEstateTotals } from '@/lib/realestate';
import { ALPHA_VANTAGE_SECRET_KEY, getSecret } from '@/lib/secure';
import { useStore } from '@/lib/store';
import {
    ALLOCATION_BUCKET_LABELS,
    COUNTRY_LABELS,
    RISK_PROFILE_LABELS,
    RISK_PROFILE_ORDER,
    SECTOR_LABELS,
    type AccountType,
} from '@/lib/types';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

function gapColor(actualPct: number, targetPct: number): string {
  const gap = Math.abs(actualPct - targetPct);
  if (gap <= 8) return C.positive;
  if (gap <= 15) return C.warning;
  return C.negative;
}

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40, gap: 10 },
    row: { paddingVertical: 10 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    rowHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    rowLabel: { color: C.text, fontSize: 14, fontWeight: '600' },
    rowValues: { color: C.textDim, fontSize: 12 },
    excluded: { color: C.textFaint, fontSize: 12, marginTop: 12, lineHeight: 16 },
    cardTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 10 },
    coverage: { color: C.textDim, fontSize: 12, marginBottom: 8 },
    classifyMessage: { color: C.textFaint, fontSize: 12, marginTop: 10, lineHeight: 16 },
  });
}

export default function Diversification() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const accounts = useStore((s) => s.accounts);
  const holdings = useStore((s) => s.holdings);
  const snapshots = useStore((s) => s.snapshots);
  const rates = useStore((s) => s.fxRates);
  const properties = useStore((s) => s.properties);
  const loans = useStore((s) => s.loans);
  const objectives = useStore((s) => s.objectives);
  const houseIndex = useStore((s) => s.houseIndex);
  const patrimoineNet = useStore((s) => s.patrimoineNet);
  const showRealEstate = useStore((s) => s.showRealEstate);
  const riskProfile = useStore((s) => s.riskProfile);
  const setRiskProfile = useStore((s) => s.setRiskProfile);
  const dismissedAlphaVantageHint = useStore((s) => s.dismissedAlphaVantageHint);
  const setDismissedAlphaVantageHint = useStore((s) => s.setDismissedAlphaVantageHint);
  useStore((s) => s.privacyMode); // re-render au changement de mode confidentialité

  // Statut de la clé Alpha Vantage + auto-classification des lignes non traitées
  const [hasAvKey, setHasAvKey] = useState<boolean | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getSecret(ALPHA_VANTAGE_SECRET_KEY).then((v) => {
        if (!cancelled) setHasAvKey(!!v?.trim());
      });

      // Auto-classification en arrière-plan des lignes non classées ou sans secteurs
      const state = useStore.getState();
      const needsClassification = state.holdings.some(
        (h) => !h.classifiedAt || (!h.sectorWeights && !!h.isin?.trim()),
      );
      if (needsClassification) {
        setClassifying(true);
        classifyHoldings()
          .then((res) => {
            if (!cancelled && res.classified > 0) {
              setClassifyMessage(
                res.errors.length > 0
                  ? t('diversification.classer_partiel', {
                      count: res.classified,
                      issues: res.errors.slice(0, 3).join(' · '),
                    })
                  : t('diversification.classer_ok', { count: res.classified }),
              );
            }
          })
          .catch((e) => {
            if (!cancelled) setClassifyMessage(String(e?.message ?? e));
          })
          .finally(() => {
            if (!cancelled) setClassifying(false);
          });
      }

      return () => {
        cancelled = true;
      };
    }, [t])
  );

  const [classifying, setClassifying] = useState(false);
  const [classifyMessage, setClassifyMessage] = useState<string | null>(null);
  const onClassify = async () => {
    setClassifying(true);
    setClassifyMessage(null);
    try {
      const result = await classifyHoldings({ forceAll: true });
      setClassifyMessage(
        result.errors.length > 0
          ? t('diversification.classer_partiel', {
              count: result.classified,
              issues: result.errors.slice(0, 3).join(' · '),
            })
          : t('diversification.classer_ok', { count: result.classified }),
      );
    } catch (e: any) {
      setClassifyMessage(String(e?.message ?? e));
    } finally {
      setClassifying(false);
    }
  };

  const active = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const series0 = useMemo(() => houseIndexSeries(), [houseIndex]);
  const re = useMemo(
    () => realEstateTotals(properties, loans, series0, rates),
    [properties, loans, series0, rates]
  );

  const byType = useMemo(() => {
    const m = new Map<AccountType, number>();
    for (const a of active) {
      const v = accountCurrentValue(a, holdings, snapshots, rates) * accountShare(a);
      if (v > 0) m.set(a.type, (m.get(a.type) ?? 0) + v);
    }
    const immo = showRealEstate ? (patrimoineNet ? re.equity : re.gross) : 0;
    if (immo > 0) m.set('immobilier', (m.get('immobilier') ?? 0) + immo);
    return m;
  }, [active, holdings, snapshots, rates, re, patrimoineNet, showRealEstate]);

  const totalValue = useMemo(() => Array.from(byType.values()).reduce((a, b) => a + b, 0), [byType]);

  const comparison = useMemo(
    () => computeAllocationComparison(byType, riskProfile),
    [byType, riskProfile]
  );

  const insights = useMemo(
    () =>
      computeInsights({ accounts: active, holdings, snapshots, byType, totalValue, rates, objectives, riskProfile }),
    [active, holdings, snapshots, byType, totalValue, rates, objectives, riskProfile]
  );

  const breakdown = useMemo(
    () => computeClassificationBreakdown(holdings, active, rates, byType),
    [holdings, active, rates, byType]
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <LegalDisclaimer />

      <SectionTitle>{t('diversification.profil_reference')}</SectionTitle>
      <Chips options={RISK_PROFILE_ORDER} value={riskProfile} onChange={setRiskProfile} labels={RISK_PROFILE_LABELS} />

      {comparison.modeledTotal > 0 ? (
        <Card>
          {comparison.rows.map((row, i) => (
            <View key={row.bucket} style={[styles.row, i > 0 && styles.rowBorder]}>
              <View style={styles.rowHead}>
                <Text style={styles.rowLabel}>{ALLOCATION_BUCKET_LABELS[row.bucket]}</Text>
                <Text style={styles.rowValues}>
                  {t('diversification.cible_actuel', {
                    target: formatPct(row.targetPct),
                    actual: formatPct(row.actualPct),
                  })}
                </Text>
              </View>
              <ProgressBar ratio={row.actualPct / 100} color={gapColor(row.actualPct, row.targetPct)} />
            </View>
          ))}
          {comparison.excludedTotal > 0 && (
            <Text style={styles.excluded}>
              {t('diversification.hors_modele', { amount: formatEur(comparison.excludedTotal) })}
            </Text>
          )}
        </Card>
      ) : (
        <Card>
          <Empty text={t('diversification.vide')} />
        </Card>
      )}

      <SectionTitle>{t('diversification.secteur_geo')}</SectionTitle>
      {hasAvKey === false && !dismissedAlphaVantageHint && (
        <AlphaVantageHint
          onPress={() => router.push('/connections')}
          onDismiss={() => setDismissedAlphaVantageHint(true)}
        />
      )}

      {/* ── Répartition sectorielle ── */}
      <Card>
        <Text style={styles.cardTitle}>{t('diversification.secteur_titre')}</Text>
        {breakdown.topSectors.length > 0 ? (
          <>
            <Text style={styles.coverage}>
              {t('diversification.couverture_secteur', { pct: formatPct(breakdown.sectorCoverage * 100) })}
            </Text>
            {breakdown.topSectors.map((s, i) => (
              <View key={s.sector} style={[styles.row, i > 0 && styles.rowBorder]}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowLabel}>{SECTOR_LABELS[s.sector]}</Text>
                  <Text style={styles.rowValues}>{formatPct(s.pct)}</Text>
                </View>
                <ProgressBar ratio={s.pct / 100} color={C.accent} />
              </View>
            ))}
          </>
        ) : (
          <Empty text={t('diversification.secteur_geo_vide')} />
        )}
      </Card>

      {/* ── Répartition géographique ── */}
      <Card>
        <Text style={styles.cardTitle}>{t('diversification.geo_titre')}</Text>
        {breakdown.topCountries.length > 0 ? (
          <>
            <Text style={styles.coverage}>
              {t('diversification.couverture_geo', { pct: formatPct(breakdown.geoCoverage * 100) })}
            </Text>
            {breakdown.topCountries.map((c, i) => (
              <View key={c.country} style={[styles.row, i > 0 && styles.rowBorder]}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowLabel}>{COUNTRY_LABELS[c.country]}</Text>
                  <Text style={styles.rowValues}>{formatPct(c.pct)}</Text>
                </View>
                <ProgressBar ratio={c.pct / 100} color={C.accent} />
              </View>
            ))}
          </>
        ) : (
          <Empty text={t('diversification.geo_vide')} />
        )}
      </Card>

      {/* ── Bouton de classification ── */}
      <Card>
        <Button
          title={t('diversification.classer')}
          variant="secondary"
          onPress={onClassify}
          loading={classifying}
        />
        {classifyMessage && <Text style={styles.classifyMessage}>{classifyMessage}</Text>}
      </Card>

      <SectionTitle>{t('diversification.section_title')}</SectionTitle>
      {insights.length === 0 ? (
        <Card>
          <Empty text={t('diversification.vide')} />
        </Card>
      ) : (
        insights.map((insight) => <InsightCard key={insight.id} insight={insight} />)
      )}
    </ScrollView>
  );
}
