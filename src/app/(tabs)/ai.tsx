import React from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { C, useStyles } from '@/constants/theme';
import { useStore } from '@/lib/store';
import { StockCounselView } from '@/components/StockCounselView';

export default function AiTabScreen() {
  useStore((s) => s.privacyMode);
  const styles = useStyles(makeStyles);
  const params = useLocalSearchParams<{
    symbol?: string;
    isin?: string;
    name?: string;
    holdingId?: string;
  }>();

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <StockCounselView
        initialSymbol={params.symbol}
        initialIsin={params.isin}
        initialName={params.name}
        holdingId={params.holdingId}
      />
    </ScrollView>
  );
}

const makeStyles = () => ({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 48 },
});
