/** Liste des comptes, groupés par type. */
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Card, Dot, Empty } from '@/components/ui';
import { C } from '@/constants/theme';
import { formatEur, formatPct } from '@/lib/format';
import { accountCurrentValue, accountGain } from '@/lib/portfolio';
import { useStore } from '@/lib/store';
import {
  ACCOUNT_TYPE_COLORS,
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPE_ORDER,
  type Account,
} from '@/lib/types';

export default function Accounts() {
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
      <Button title={t('accounts.ajouter')} onPress={() => router.push('/account-form')} />
      {groups.length === 0 && <Empty text={t('accounts.aucun_detail')} />}
      {groups.map((g) => (
        <View key={g.type}>
          <View style={styles.groupHeader}>
            <Dot color={ACCOUNT_TYPE_COLORS[g.type]} />
            <Text style={styles.groupTitle}>{ACCOUNT_TYPE_LABELS[g.type]}</Text>
            <Text style={styles.groupTotal}>
              {formatEur(g.items.reduce((acc, a) => acc + value(a), 0))}
            </Text>
          </View>
          <Card style={{ paddingVertical: 4 }}>
            {g.items.map((a, i) => (
              <Pressable
                key={a.id}
                onPress={() => router.push({ pathname: '/account/[id]', params: { id: a.id } })}
                style={[styles.row, i < g.items.length - 1 && styles.rowBorder]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{a.name}</Text>
                  <Text style={styles.rowSub}>
                    {a.institution ?? '—'}
                    {a.currency && a.currency !== 'EUR' ? `  ·  ${a.currency}` : ''}
                    {a.ownershipPct !== undefined && a.ownershipPct < 100
                      ? `  ·  ${t('accounts.detenu_a', { pct: formatPct(a.ownershipPct) })}`
                      : ''}
                    {a.connectionId ? `  ·  ${t('accounts.synchronise')}` : ''}
                  </Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowValue}>{formatEur(value(a))}</Text>
                  {(() => {
                    const g = accountGain(a, holdings, rates);
                    return g ? (
                      <Text style={[styles.rowPerf, { color: g.abs >= 0 ? C.positive : C.negative }]}>
                        {g.abs >= 0 ? '+' : ''}
                        {formatEur(g.abs)}
                        {g.pct !== undefined ? `  ·  ${formatPct(g.pct, true)}` : ''}
                      </Text>
                    ) : null;
                  })()}
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </Card>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8 },
  groupTitle: { color: C.textDim, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, flex: 1 },
  groupTotal: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  rowName: { color: C.text, fontSize: 15, fontWeight: '500' },
  rowSub: { color: C.textFaint, fontSize: 12, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', marginLeft: 8 },
  rowValue: { color: C.text, fontSize: 15, fontWeight: '600' },
  rowPerf: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  chevron: { color: C.textFaint, fontSize: 20, marginLeft: 8 },
});
