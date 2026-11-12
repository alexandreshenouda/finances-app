/** Rubrique Comptes (onglet Patrimoine) : liste des comptes, groupés par type. */
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TabIcon } from '@/components/TabIcons';
import { Button, EmptyState, GroupHeader, ListCard, ListRow } from '@/components/ui';
import { C, CONTENT, useStyles } from '@/constants/theme';
import { formatEur, formatPct } from '@/lib/format';
import { accountCurrentValue, accountGain } from '@/lib/portfolio';
import { useStore } from '@/lib/store';
import {
  ACCOUNT_TYPE_COLORS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_ORDER,
  type Account,
} from '@/lib/types';

function makeStyles() {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    content: { padding: 16, paddingBottom: 40, ...CONTENT },
  });
}

export function AccountsSection() {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const accounts = useStore((s) => s.accounts);
  const holdings = useStore((s) => s.holdings);
  const snapshots = useStore((s) => s.snapshots);
  const rates = useStore((s) => s.fxRates);
  useStore((s) => s.privacyMode); // re-render au changement de mode confidentialité (masquage dans format.ts)

  const groups = useMemo(() => {
    const active = accounts.filter((a) => !a.archived);
    return ACCOUNT_TYPE_ORDER.map((type) => ({
      type,
      items: active.filter((a) => a.type === type),
    })).filter((g) => g.items.length > 0);
  }, [accounts]);

  const value = (a: Account) => accountCurrentValue(a, holdings, snapshots, rates);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {groups.length === 0 ? (
        <EmptyState
          icon={<TabIcon name="comptes" color={C.textDim} size={30} />}
          text={t('accounts.aucun_detail')}
          actionLabel={t('accounts.ajouter')}
          onAction={() => router.push('/account-form')}
        />
      ) : (
        <Button title={t('accounts.ajouter')} onPress={() => router.push('/account-form')} />
      )}
      {groups.map((g) => (
        <View key={g.type}>
          <GroupHeader
            title={ACCOUNT_TYPE_LABELS[g.type]}
            color={ACCOUNT_TYPE_COLORS[g.type]}
            total={formatEur(g.items.reduce((acc, a) => acc + value(a), 0))}
          />
          <ListCard>
            {g.items.map((a, i) => {
              const gain = accountGain(a, holdings, rates);
              const sub = [
                a.institution ?? '—',
                a.currency && a.currency !== 'EUR' ? a.currency : '',
                a.ownershipPct !== undefined && a.ownershipPct < 100
                  ? t('accounts.detenu_a', { pct: formatPct(a.ownershipPct) })
                  : '',
                a.connectionId ? t('accounts.synchronise') : '',
              ]
                .filter(Boolean)
                .join('  ·  ');
              return (
                <ListRow
                  key={a.id}
                  title={a.name}
                  subtitle={sub}
                  value={formatEur(value(a))}
                  valueSub={
                    gain
                      ? `${gain.abs >= 0 ? '+' : ''}${formatEur(gain.abs)}${
                          gain.pct !== undefined ? `  ·  ${formatPct(gain.pct, true)}` : ''
                        }`
                      : undefined
                  }
                  valueSubColor={gain ? (gain.abs >= 0 ? C.positive : C.negative) : undefined}
                  onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })}
                  last={i === g.items.length - 1}
                />
              );
            })}
          </ListCard>
        </View>
      ))}
    </ScrollView>
  );
}
