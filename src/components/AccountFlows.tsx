/** Rubriques « flux » d'un compte : plafond du PEA, versements nets et dividendes reçus. */
import { ListCard, ListRow, Card, ProgressBar, SectionTitle } from '@/components/ui';
import { C, FONT, TABULAR, useStyles } from '@/constants/theme';
import { netContributions } from '@/lib/cashflows';
import { addDays, formatEur, formatPct, todayKey } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { Account } from '@/lib/types';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

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
  const contributions = useMemo(() => netContributions(flows, [account], addDays(today, -365), today), [flows, account, today]);

  const isSynced = !!account.connectionId;
  const hasContributions = contributions.trackedAccountIds.length > 0;
  return (
    <>
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

      {hasContributions && <Text style={styles.note}>{t('flows.note_historique')}</Text>}
    </>
  );
}
