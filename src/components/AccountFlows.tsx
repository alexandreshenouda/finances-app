/** Rubriques « flux » d'un compte : plafond du PEA, versements nets et dividendes reçus. */
import { ListCard, ListRow, Card, ProgressBar, SectionTitle } from '@/components/ui';
import { C, FONT, TABULAR, useStyles } from '@/constants/theme';
import { dividendSummary, netContributions, peaCeilingStatus } from '@/lib/cashflows';
import { addDays, formatEur, formatPct, todayKey } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { Account } from '@/lib/types';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

/** Nombre de titres payeurs listés. */
const TOP_PAYERS = 5;

function makeStyles() {
  return StyleSheet.create({
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
    headLabel: { color: C.textDim, fontSize: FONT.sm },
    headValue: { color: C.text, fontSize: FONT.md, fontWeight: '600', ...TABULAR },
    note: { color: C.textFaint, fontSize: FONT.sm, marginTop: 8 },
  });
}

export function AccountFlows({ account }: { account: Account }) {
  const { t } = useTranslation();
  const styles = useStyles(makeStyles);
  useStore((s) => s.privacyMode);
  const cashFlows = useStore((s) => s.cashFlows);
  const allHoldings = useStore((s) => s.holdings);
  const rates = useStore((s) => s.fxRates);

  const flows = useMemo(() => cashFlows.filter((f) => f.accountId === account.id), [cashFlows, account.id]);
  const holdings = useMemo(() => allHoldings.filter((h) => h.accountId === account.id), [allHoldings, account.id]);
  const today = todayKey();
  const dividends = useMemo(() => dividendSummary(flows, holdings, [account], rates, today), [flows, holdings, account, rates, today]);
  const contributions = useMemo(() => netContributions(flows, [account], addDays(today, -365), today), [flows, account, today]);

  const pea = peaCeilingStatus(account);
  const isSynced = !!account.connectionId;
  const hasContributions = contributions.trackedAccountIds.length > 0;
  const hasIncome = dividends.byYear.length > 0 || dividends.interest12m > 0;
  const payers = dividends.byIsin.slice(0, TOP_PAYERS);

  return (
    <>
      {account.type === 'pea' && (pea || !isSynced) && (
        <>
          <SectionTitle>{t('flows.plafond_titre')}</SectionTitle>
          <Card>
            {pea ? (
              <>
                <View style={styles.head}>
                  <Text style={styles.headLabel}>{t('flows.plafond_verse', { pct: formatPct(pea.ratio * 100) })}</Text>
                  <Text style={styles.headValue}>
                    {t('flows.plafond_sur', { deposits: formatEur(pea.deposits), ceiling: formatEur(pea.ceiling) })}
                  </Text>
                </View>
                <ProgressBar ratio={pea.ratio} color={pea.remaining === 0 ? C.warning : C.accent} />
                <Text style={styles.note}>
                  {pea.remaining === 0
                    ? t('flows.plafond_atteint')
                    : t('flows.plafond_reste', { remaining: formatEur(pea.remaining) })}{' '}
                  {t(isSynced ? 'flows.plafond_source_synchro' : 'flows.plafond_source_saisie')}
                </Text>
              </>
            ) : (
              <Text style={[styles.note, { marginTop: 0 }]}>{t('flows.plafond_a_renseigner')}</Text>
            )}
          </Card>
        </>
      )}

      {hasContributions && (
        <>
          <SectionTitle>{t('flows.versements_titre')}</SectionTitle>
          <ListCard>
            <ListRow title={t('flows.versements')} value={formatEur(contributions.deposits)} />
            <ListRow title={t('flows.retraits')} value={formatEur(contributions.withdrawals)} />
            <ListRow
              title={t('flows.versements_nets')}
              value={formatEur(contributions.net)}
              valueColor={contributions.net >= 0 ? C.positive : C.negative}
              last
            />
          </ListCard>
        </>
      )}

      {hasIncome && (
        <>
          <SectionTitle>{t('flows.dividendes_titre')}</SectionTitle>
          <ListCard>
            <ListRow
              title={t('flows.dividendes_12m')}
              subtitle={
                dividends.yieldOnCostPct !== undefined
                  ? t('flows.rendement_pru', { pct: formatPct(dividends.yieldOnCostPct, false, 2) })
                  : undefined
              }
              value={formatEur(dividends.last12m, true)}
              valueColor={C.positive}
              last={dividends.interest12m === 0 && dividends.byYear.length === 0}
            />
            {dividends.interest12m > 0 && (
              <ListRow
                title={t('flows.interets_12m')}
                value={formatEur(dividends.interest12m, true)}
                last={dividends.byYear.length === 0}
              />
            )}
            {dividends.byYear.map((y, i) => (
              <ListRow
                key={y.year}
                title={t('flows.dividendes_annee', { year: y.year })}
                value={formatEur(y.total, true)}
                last={i === dividends.byYear.length - 1}
              />
            ))}
          </ListCard>
          {payers.length > 0 && (
            <>
              <SectionTitle>{t('flows.payeurs_titre')}</SectionTitle>
              <ListCard>
                {payers.map((p, i) => (
                  <ListRow
                    key={p.isin}
                    title={p.label}
                    subtitle={p.label !== p.isin ? p.isin : undefined}
                    value={formatEur(p.total, true)}
                    last={i === payers.length - 1}
                  />
                ))}
              </ListCard>
            </>
          )}
        </>
      )}

      {(hasContributions || hasIncome) && <Text style={styles.note}>{t('flows.note_historique')}</Text>}
    </>
  );
}
