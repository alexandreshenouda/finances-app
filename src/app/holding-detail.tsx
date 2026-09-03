/** Détail d'une ligne de portefeuille : secteurs, géographie, top holdings, TER. */
import { Card, ProgressBar, SectionTitle } from '@/components/ui';
import { C, useStyles } from '@/constants/theme';
import { formatDate, formatEur, formatMoney, formatPct } from '@/lib/format';
import { holdingCurrency, holdingPerfPct, holdingValueEur } from '@/lib/portfolio';
import { useStore } from '@/lib/store';
import { COUNTRY_LABELS, SECTOR_LABELS } from '@/lib/types';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40, gap: 2 },
    name: { color: C.text, fontSize: 20, fontWeight: '700', marginBottom: 4 },
    isin: { color: C.textFaint, fontSize: 13, fontFamily: 'monospace', marginBottom: 6 },
    sourceBadge: {
      alignSelf: 'flex-start',
      backgroundColor: C.cardAlt,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginBottom: 4,
    },
    sourceBadgeText: { color: C.textDim, fontSize: 12, fontWeight: '600' },
    classifiedAt: { color: C.textFaint, fontSize: 12, marginBottom: 2 },
    // valeurs
    valueRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
    valueRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
    valueLabel: { color: C.textDim, fontSize: 14 },
    valueText: { color: C.text, fontSize: 14, fontWeight: '600' },
    gainText: { fontSize: 14, fontWeight: '600' },
    // barres de répartition
    barRow: { paddingVertical: 10 },
    barBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    barLabel: { color: C.text, fontSize: 14, fontWeight: '500' },
    barPct: { color: C.textDim, fontSize: 12 },
    // top holdings
    topRow: { paddingVertical: 8 },
    topBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    topName: { color: C.text, fontSize: 14 },
    topMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
    topIsin: { color: C.textFaint, fontSize: 12 },
    topPct: { color: C.textDim, fontSize: 12, fontWeight: '600' },
    // pas de données
    noData: { color: C.textFaint, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
    footnote: { color: C.textFaint, fontSize: 12, lineHeight: 18, marginTop: 4 },
  });
}

const SOURCE_ICONS: Record<string, string> = {
  justetf: 'JustETF',
  yahoo: 'Yahoo Finance',
  coingecko: 'CoinGecko',
  reference: 'Réf. locale',
  isin: 'Préfixe ISIN',
};

export default function HoldingDetail() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const { holdingId } = useLocalSearchParams<{ holdingId: string }>();

  const holding = useStore((s) => s.holdings.find((h) => h.id === holdingId));
  const account = useStore((s) => s.accounts.find((a) => a.id === holding?.accountId));
  const rates = useStore((s) => s.fxRates);
  useStore((s) => s.privacyMode); // re-render pour masquage des montants

  if (!holding) {
    return (
      <>
        <Stack.Screen options={{ title: t('holdingDetail.titre') }} />
        <Text style={styles.noData}>{t('holdingDetail.introuvable')}</Text>
      </>
    );
  }

  const hasClassification =
    (holding.sectorWeights && holding.sectorWeights.length > 0) ||
    (holding.countryWeights && holding.countryWeights.length > 0) ||
    !!holding.country;

  const hCur = holdingCurrency(holding, account);
  const valueEur = holdingValueEur(holding, account, rates);
  const perf = holdingPerfPct(holding);
  const sourceName = holding.classificationSource ? (SOURCE_ICONS[holding.classificationSource] ?? holding.classificationSource) : null;

  return (
    <>
      <Stack.Screen options={{ title: t('holdingDetail.titre') }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

        {/* ── En-tête ── */}
        <Card>
          <Text style={styles.name}>{holding.name}</Text>
          {holding.isin ? <Text style={styles.isin}>{holding.isin}</Text> : null}
          {sourceName && (
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeText}>
                {t('holdingDetail.source_label', { source: sourceName })}
              </Text>
            </View>
          )}
          {holding.classifiedAt && (
            <Text style={styles.classifiedAt}>
              {t('holdingDetail.classe_le', { date: formatDate(holding.classifiedAt) })}
            </Text>
          )}
        </Card>

        {/* ── Données de marché ── */}
        <SectionTitle>{t('holdingDetail.marche')}</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          <ValueRow
            label={t('holdingDetail.quantite')}
            value={String(holding.quantity)}
            last={false}
          />
          {holding.unitPrice !== undefined && (
            <ValueRow
              label={t('holdingDetail.cours_unitaire')}
              value={formatMoney(holding.unitPrice, hCur, true)}
              last={false}
            />
          )}
          {holding.buyPrice !== undefined && (
            <ValueRow
              label={t('holdingDetail.pru')}
              value={formatMoney(holding.buyPrice, hCur, true)}
              last={false}
            />
          )}
          <ValueRow
            label={t('holdingDetail.valeur_totale')}
            value={formatEur(valueEur)}
            last={holding.feesPct === undefined}
          />
          {holding.feesPct !== undefined && (
            <ValueRow
              label={t('holdingDetail.frais_courants')}
              value={formatPct(holding.feesPct, false, 2)}
              last
            />
          )}
          {perf !== undefined && (
            <View style={[styles.valueRow]}>
              <Text style={styles.valueLabel}>{t('holdingDetail.plus_value')}</Text>
              <Text style={[styles.gainText, { color: perf >= 0 ? C.positive : C.negative }]}>
                {perf >= 0 ? '+' : ''}{formatPct(perf, true)}
              </Text>
            </View>
          )}
        </Card>

        {/* ── Répartition sectorielle ── */}
        {holding.sectorWeights && holding.sectorWeights.length > 0 && (
          <>
            <SectionTitle>{t('holdingDetail.secteurs')}</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {holding.sectorWeights
                .slice()
                .sort((a, b) => b.weight - a.weight)
                .map((sw, i) => (
                  <View key={sw.sector} style={[styles.barRow, i > 0 && styles.barBorder]}>
                    <View style={styles.barHead}>
                      <Text style={styles.barLabel}>{SECTOR_LABELS[sw.sector]}</Text>
                      <Text style={styles.barPct}>{formatPct(sw.weight * 100)}</Text>
                    </View>
                    <ProgressBar ratio={sw.weight} color={C.accent} />
                  </View>
                ))}
            </Card>
          </>
        )}

        {/* ── Répartition géographique ── */}
        {holding.countryWeights && holding.countryWeights.length > 0 ? (
          <>
            <SectionTitle>{t('holdingDetail.geographie')}</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {holding.countryWeights
                .slice()
                .sort((a, b) => b.weight - a.weight)
                .map((cw, i) => (
                  <View key={cw.country} style={[styles.barRow, i > 0 && styles.barBorder]}>
                    <View style={styles.barHead}>
                      <Text style={styles.barLabel}>{COUNTRY_LABELS[cw.country]}</Text>
                      <Text style={styles.barPct}>{formatPct(cw.weight * 100)}</Text>
                    </View>
                    <ProgressBar ratio={cw.weight} color={C.accent} />
                  </View>
                ))}
            </Card>
          </>
        ) : holding.country ? (
          <>
            <SectionTitle>{t('holdingDetail.geographie')}</SectionTitle>
            <Card>
              <Text style={styles.valueText}>{COUNTRY_LABELS[holding.country]}</Text>
            </Card>
          </>
        ) : null}

        {/* ── Top positions (ETF) ── */}
        {holding.topHoldings && holding.topHoldings.length > 0 && (
          <>
            <SectionTitle>{t('holdingDetail.top_positions')}</SectionTitle>
            <Card style={{ paddingVertical: 4 }}>
              {holding.topHoldings.map((th, i) => (
                <View key={i} style={[styles.topRow, i > 0 && styles.topBorder]}>
                  <Text style={styles.topName}>{th.name}</Text>
                  <View style={styles.topMeta}>
                    <Text style={styles.topIsin}>{th.isin ?? '—'}</Text>
                    <Text style={styles.topPct}>{formatPct(th.weight * 100)}</Text>
                  </View>
                </View>
              ))}
            </Card>
          </>
        )}

        {/* ── Aucune classification ── */}
        {!hasClassification && (
          <Card>
            <Text style={styles.noData}>{t('holdingDetail.aucune_donnee')}</Text>
          </Card>
        )}

        {/* ── Note de bas de page ── */}
        {hasClassification && (
          <Text style={styles.footnote}>{t('holdingDetail.note_source')}</Text>
        )}

      </ScrollView>
    </>
  );
}

function ValueRow({ label, value, last }: { label: string; value: string; last: boolean }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.valueRow, !last && styles.valueRowBorder]}>
      <Text style={styles.valueLabel}>{label}</Text>
      <Text style={styles.valueText}>{value}</Text>
    </View>
  );
}
