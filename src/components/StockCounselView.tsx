/**
 * Vue complète d'analyse boursière et de conseil IA (InvestCounsel AI) :
 * - Recherche par Ticker, Nom ou ISIN + accès rapide aux lignes détenues et à la watchlist
 * - Graphique multi-échelles interactif (1J, 1S, 1M, 1A, 5A) avec SMA 20/50 et cône +12M
 * - Score composite de sentiment & tendance (0–100), pivots S1/S2/R1/R2 et 7 facteurs
 * - Estimation du cours futur (Cône statistique Quant vs Cibles fondamentales Gemini IA)
 * - Comité d'investissement institutionnel Gemini (multiples, 6 facteurs, géopolitique, playbook, rapport 8 sections)
 * - Fil d'actualités de marché
 */
import {
  Button,
  Card,
  Chips,
  Empty,
  Field,
  ProgressBar,
  SectionTitle,
  SelectField,
} from '@/components/ui';
import { C, useStyles } from '@/constants/theme';
import {
  computeTechnicalAnalytics,
  DEFAULT_GEMINI_MODELS,
  fetchAssetData,
  generateGeminiInvestmentCounsel,
  getGeminiApiKey,
  isIsin,
  POPULAR_PRESETS,
  searchMarketProducts,
  TIMEFRAMES,
  type AssetBundle,
  type CounselHorizon,
  type CounselRiskProfile,
  type GeminiCounselReport,
  type PricePoint,
  type SearchQuote,
  type TechnicalAnalytics,
  type TimeframeKey,
} from '@/lib/aiCounsel';
import { notify } from '@/lib/confirm';
import { formatEur, formatPct, formatQuantity } from '@/lib/format';
import { holdingPerfPct, holdingValueEur } from '@/lib/portfolio';
import { useStore } from '@/lib/store';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Polyline,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

export interface StockCounselViewProps {
  /** Ticker initial (ex : NVDA, CW8.PA) */
  initialSymbol?: string;
  /** ISIN initial (ex : IE00B4L5Y983) */
  initialIsin?: string | null;
  /** Nom initial (fallback si ni ticker ni ISIN) */
  initialName?: string;
  /** Id de la ligne détenue si ouvert depuis un compte */
  holdingId?: string;
  /** Mode intégré dans holding-detail (masque la barre de recherche globale) */
  embedded?: boolean;
}

const HORIZONS: readonly CounselHorizon[] = ['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'] as const;
const RISK_MANDATES: readonly CounselRiskProfile[] = [
  'CONSERVATIVE',
  'BALANCED',
  'AGGRESSIVE',
] as const;

function formatAssetCurrency(val: number | null | undefined, currency = 'USD'): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: val >= 1000 ? 2 : val < 1 && val > 0 ? 4 : 2,
      maximumFractionDigits: val >= 1000 ? 2 : val < 1 && val > 0 ? 4 : 2,
    }).format(val);
  } catch {
    return `${val.toFixed(2)} ${currency}`;
  }
}

function formatCompactNumber(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(val);
  } catch {
    return String(Math.round(val));
  }
}

function formatChartTimestamp(ts: number, tf: TimeframeKey): string {
  const d = new Date(ts);
  if (tf === '1D') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (tf === '1W' || tf === '1M') {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function makeStyles() {
  return StyleSheet.create({
    topBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
      flexWrap: 'wrap',
    },
    titleBlock: { flex: 1, minWidth: 180 },
    screenTitle: { color: C.text, fontSize: 18, fontWeight: '700' },
    screenSub: { color: C.textDim, fontSize: 12, marginTop: 2 },
    keyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: C.cardAlt,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    keyDot: { width: 8, height: 8, borderRadius: 4 },
    keyBadgeText: { color: C.text, fontSize: 12, fontWeight: '600' },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.cardAlt,
      borderRadius: 12,
      paddingHorizontal: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      color: C.text,
      fontSize: 14,
      paddingVertical: 10,
    },
    isinTag: {
      backgroundColor: C.accent,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    isinTagText: { color: C.onAccent, fontSize: 10, fontWeight: '700' },
    clearBtn: { padding: 4 },
    clearBtnText: { color: C.textDim, fontSize: 14, fontWeight: '700' },
    dropdownBox: {
      marginTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      paddingTop: 6,
    },
    dropdownBanner: {
      color: C.accent,
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 6,
    },
    dropdownItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
      gap: 8,
    },
    ddSymbolRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    ddSymbol: { color: C.accent, fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
    ddTypePill: {
      backgroundColor: C.cardAlt,
      borderRadius: 4,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    ddTypeText: { color: C.textDim, fontSize: 10, fontWeight: '600' },
    ddIsin: { color: C.textFaint, fontSize: 11, fontFamily: 'monospace' },
    ddName: { color: C.text, fontSize: 13, marginTop: 2 },
    ddExchange: { color: C.textDim, fontSize: 11, textAlign: 'right' },
    stripLabel: {
      color: C.textFaint,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: 10,
      marginBottom: 6,
    },
    chipsScroll: { flexDirection: 'row', gap: 8 },
    presetChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: C.cardAlt,
      borderRadius: 18,
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    presetChipActive: {
      backgroundColor: C.accent,
      borderColor: C.accent,
    },
    presetSym: { color: C.text, fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
    presetName: { color: C.textDim, fontSize: 12, maxWidth: 130 },
    presetTextActive: { color: C.onAccent },
    // Position détenue
    positionBanner: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: C.cardAlt,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.accent,
    },
    positionTitle: { color: C.accent, fontSize: 12, fontWeight: '700' },
    positionSub: { color: C.text, fontSize: 13, fontWeight: '600', marginTop: 2 },
    // En-tête graphique
    badgesRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
    symbolBadge: {
      backgroundColor: C.accent,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    symbolBadgeText: { color: C.onAccent, fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
    metaBadge: {
      backgroundColor: C.cardAlt,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    metaBadgeText: { color: C.textDim, fontSize: 11, fontWeight: '600' },
    favBtn: {
      backgroundColor: C.cardAlt,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    assetTitle: { color: C.text, fontSize: 19, fontWeight: '700' },
    assetSector: { color: C.textDim, fontSize: 12, marginTop: 2 },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      marginTop: 10,
      marginBottom: 10,
      gap: 8,
    },
    spotPrice: { color: C.text, fontSize: 26, fontWeight: '700' },
    deltaText: { fontSize: 14, fontWeight: '600' },
    deltaPeriod: { color: C.textFaint, fontSize: 12, fontWeight: '400' },
    toolbarRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    overlayRow: { flexDirection: 'row', gap: 6 },
    overlayChip: {
      backgroundColor: C.cardAlt,
      borderRadius: 16,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    overlayChipActive: { backgroundColor: C.accent, borderColor: C.accent },
    overlayChipText: { color: C.textDim, fontSize: 11, fontWeight: '600' },
    overlayChipTextActive: { color: C.onAccent },
    hudBar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      backgroundColor: C.cardAlt,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 6,
    },
    hudText: { color: C.textDim, fontSize: 11, fontFamily: 'monospace' },
    legendRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 6,
      marginBottom: 8,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { color: C.textFaint, fontSize: 11 },
    metricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      paddingTop: 10,
    },
    metricBox: {
      flexGrow: 1,
      flexBasis: '45%',
      backgroundColor: C.cardAlt,
      borderRadius: 10,
      padding: 10,
    },
    metricLabel: { color: C.textFaint, fontSize: 11, marginBottom: 3 },
    metricValue: { color: C.text, fontSize: 13, fontWeight: '600', fontFamily: 'monospace' },
    // Sentiment & Tendance
    cardHeadRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 10,
    },
    cardTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
    regimeBadge: {
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
    },
    regimeBadgeText: { fontSize: 11, fontWeight: '700' },
    scoreMainRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    scoreBig: { fontSize: 32, fontWeight: '700', fontFamily: 'monospace' },
    scoreMax: { color: C.textFaint, fontSize: 14, marginLeft: 4 },
    subPillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    subPill: {
      backgroundColor: C.cardAlt,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    subPillText: { color: C.textDim, fontSize: 11 },
    meterScaleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 4,
      marginBottom: 12,
    },
    meterScaleText: { color: C.textFaint, fontSize: 10 },
    pivotsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 12,
    },
    pivotBox: {
      flex: 1,
      minWidth: 80,
      backgroundColor: C.cardAlt,
      borderRadius: 8,
      padding: 8,
      alignItems: 'center',
    },
    pivotTag: { color: C.textFaint, fontSize: 10, marginBottom: 2 },
    pivotVal: { color: C.text, fontSize: 12, fontWeight: '600', fontFamily: 'monospace' },
    signalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      gap: 8,
    },
    signalFactor: { color: C.text, fontSize: 13, fontWeight: '600' },
    signalDetail: { color: C.textDim, fontSize: 11, marginTop: 2 },
    signalTag: {
      borderRadius: 6,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    signalTagText: { fontSize: 10, fontWeight: '700' },
    // Scénarios de cours futur
    horizonCard: {
      backgroundColor: C.cardAlt,
      borderRadius: 10,
      padding: 10,
      marginTop: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    horizonHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      marginBottom: 8,
      gap: 4,
    },
    horizonTitle: { color: C.text, fontSize: 14, fontWeight: '700' },
    horizonSub: { color: C.textFaint, fontSize: 11 },
    expectedPill: {
      backgroundColor: C.card,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    expectedPillText: { color: C.accent, fontSize: 11, fontWeight: '600', fontFamily: 'monospace' },
    triGrid: { flexDirection: 'row', gap: 6 },
    triCell: {
      flex: 1,
      backgroundColor: C.card,
      borderRadius: 8,
      padding: 8,
      alignItems: 'center',
    },
    triLabel: { color: C.textFaint, fontSize: 10, marginBottom: 3 },
    triPrice: { color: C.text, fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
    triPct: { fontSize: 11, fontWeight: '600', fontFamily: 'monospace', marginTop: 2 },
    footnote: { color: C.textFaint, fontSize: 11, lineHeight: 16, marginTop: 10 },
    // Gemini Counselor
    verdictBanner: {
      backgroundColor: C.cardAlt,
      borderRadius: 12,
      padding: 12,
      marginTop: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      gap: 10,
    },
    verdictPill: {
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    verdictPillText: { fontSize: 12, fontWeight: '700' },
    executiveThesis: { color: C.text, fontSize: 13, lineHeight: 19 },
    ivBox: {
      backgroundColor: C.card,
      borderRadius: 10,
      padding: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    ivTitle: { color: C.textFaint, fontSize: 11, fontWeight: '600', marginBottom: 6 },
    ivRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    ivCol: { flex: 1, alignItems: 'center' },
    ivLabel: { color: C.textDim, fontSize: 10 },
    ivVal: { color: C.text, fontSize: 13, fontWeight: '700', fontFamily: 'monospace', marginTop: 2 },
    ivMethod: { color: C.textFaint, fontSize: 11, marginTop: 6 },
    subSectionCard: {
      backgroundColor: C.cardAlt,
      borderRadius: 12,
      padding: 12,
      marginTop: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    subSectionTitle: { color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
    multRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 5,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    multLabel: { color: C.textDim, fontSize: 12 },
    multVal: { color: C.text, fontSize: 12, fontWeight: '600', fontFamily: 'monospace' },
    histCallout: {
      color: C.textDim,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 8,
    },
    factorItem: { marginBottom: 8 },
    factorTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    factorLabel: { color: C.text, fontSize: 12 },
    factorScore: { color: C.textDim, fontSize: 12, fontFamily: 'monospace' },
    geoBlock: { marginTop: 8 },
    geoHeading: { color: C.accent, fontSize: 12, fontWeight: '700', marginBottom: 2 },
    geoBody: { color: C.text, fontSize: 12, lineHeight: 18 },
    bulletRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
    bulletDot: { color: C.accent, fontSize: 13, fontWeight: '700' },
    bulletText: { flex: 1, color: C.text, fontSize: 12, lineHeight: 18 },
    pbItem: {
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.border,
    },
    pbLabel: { color: C.textFaint, fontSize: 11 },
    pbVal: { color: C.text, fontSize: 13, fontWeight: '600', marginTop: 2 },
    // Markdown
    mdH2: {
      color: C.accent,
      fontSize: 15,
      fontWeight: '700',
      marginTop: 14,
      marginBottom: 6,
    },
    mdH3: {
      color: C.text,
      fontSize: 14,
      fontWeight: '700',
      marginTop: 10,
      marginBottom: 4,
    },
    mdP: { color: C.text, fontSize: 13, lineHeight: 20, marginBottom: 8 },
    mdBold: { fontWeight: '700', color: C.text },
    mdCode: {
      fontFamily: 'monospace',
      backgroundColor: C.card,
      color: C.accent,
    },
    // News
    newsItem: {
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
    },
    newsMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
    newsPub: { color: C.accent, fontSize: 11, fontWeight: '600' },
    newsDate: { color: C.textFaint, fontSize: 11 },
    newsTitle: { color: C.text, fontSize: 13, fontWeight: '600', lineHeight: 18 },
    // Modals
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.72)',
      justifyContent: 'center',
      padding: 16,
    },
    disclaimerWrap: {
      backgroundColor: C.cardAlt,
      borderLeftWidth: 3,
      borderLeftColor: C.warning,
      borderRadius: 8,
      padding: 12,
      marginBottom: 12,
    },
    disclaimerTitle: {
      color: C.warning,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    disclaimerText: { color: C.textDim, fontSize: 12, lineHeight: 17 },
    privacyWrap: {
      backgroundColor: C.cardAlt,
      borderLeftWidth: 3,
      borderLeftColor: C.accent,
      borderRadius: 8,
      padding: 10,
      marginTop: 8,
      marginBottom: 4,
    },
    privacyTitle: {
      color: C.accent,
      fontSize: 11,
      fontWeight: '700',
      marginBottom: 3,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    privacyText: { color: C.textDim, fontSize: 11, lineHeight: 16 },
  });
}

function SimpleMarkdownView({ markdown }: { markdown: string }) {
  const styles = useStyles(makeStyles);
  const lines = useMemo(() => markdown.split('\n'), [markdown]);

  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <Text key={idx} style={styles.mdBold}>
            {part.slice(2, -2)}
          </Text>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <Text key={idx} style={styles.mdCode}>
            {part.slice(1, -1)}
          </Text>
        );
      }
      return part;
    });
  };

  return (
    <View>
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return null;
        if (line.startsWith('## ')) {
          return (
            <Text key={idx} style={styles.mdH2}>
              {renderInline(line.slice(3))}
            </Text>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <Text key={idx} style={styles.mdH3}>
              {renderInline(line.slice(4))}
            </Text>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <Text key={idx} style={styles.mdH2}>
              {renderInline(line.slice(2))}
            </Text>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s+/.test(line)) {
          const cleaned = line.replace(/^(-|\*|\d+\.)\s+/, '');
          return (
            <View key={idx} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{renderInline(cleaned)}</Text>
            </View>
          );
        }
        return (
          <Text key={idx} style={styles.mdP}>
            {renderInline(line)}
          </Text>
        );
      })}
    </View>
  );
}

export function StockCounselView({
  initialSymbol,
  initialIsin,
  initialName,
  holdingId,
  embedded = false,
}: StockCounselViewProps) {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const router = useRouter();
  const rawUid = useId();
  const gradId = useMemo(() => rawUid.replace(/[^a-zA-Z0-9_-]/g, ''), [rawUid]);

  // Abonnement au mode confidentialité pour masquer/démasquer la position détenue
  useStore((s) => s.privacyMode);
  const holdings = useStore((s) => s.holdings);
  const accounts = useStore((s) => s.accounts);
  const rates = useStore((s) => s.fxRates);

  const aiWatchlist = useStore((s) => s.aiWatchlist);
  const toggleAiWatchlist = useStore((s) => s.toggleAiWatchlist);
  const aiLastSymbol = useStore((s) => s.aiLastSymbol);
  const aiLastIsin = useStore((s) => s.aiLastIsin);
  const setAiLastSymbol = useStore((s) => s.setAiLastSymbol);
  const aiModel = useStore((s) => s.aiModel);
  const setAiModel = useStore((s) => s.setAiModel);
  const aiCustomPreprompt = useStore((s) => s.aiCustomPreprompt);
  const setAiCustomPreprompt = useStore((s) => s.setAiCustomPreprompt);
  const aiReports = useStore((s) => s.aiReports);
  const setAiReport = useStore((s) => s.setAiReport);

  const resolvedStartQuery =
    initialSymbol?.trim() ||
    initialIsin?.trim() ||
    initialName?.trim() ||
    aiLastSymbol ||
    'NVDA';
  const resolvedStartIsin = initialIsin ?? (initialSymbol ? null : aiLastIsin);

  const [activeSymbol, setActiveSymbol] = useState<string>(resolvedStartQuery);
  const [activeIsin, setActiveIsin] = useState<string | null>(resolvedStartIsin ?? null);
  const [activeTimeframe, setActiveTimeframe] = useState<TimeframeKey>('1Y');
  const [asset, setAsset] = useState<AssetBundle | null>(null);
  const [loadingAsset, setLoadingAsset] = useState<boolean>(true);
  const [assetError, setAssetError] = useState<string | null>(null);

  // Recherche
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchQuote[]>([]);
  const [isIsinMatch, setIsIsinMatch] = useState<boolean>(false);
  const [searching, setSearching] = useState<boolean>(false);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

  // Graphique interactif & options
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showMovingAverages, setShowMovingAverages] = useState<boolean>(true);
  const [showFutureOverlay, setShowFutureOverlay] = useState<boolean>(false);
  const [forecastMode, setForecastMode] = useState<'AUTO' | 'QUANT' | 'GEMINI'>('AUTO');

  // Gemini IA
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(false);
  const [horizon, setHorizon] = useState<CounselHorizon>('MEDIUM_TERM');
  const [riskMandate, setRiskMandate] = useState<CounselRiskProfile>('BALANCED');
  const [userNotes, setUserNotes] = useState<string>('');
  const [runningCounsel, setRunningCounsel] = useState<boolean>(false);
  const [counselError, setCounselError] = useState<string | null>(null);
  const [showFullReport, setShowFullReport] = useState<boolean>(true);

  // Vérification de la clé Gemini dans le stockage sécurisé (SecureStore)
  const refreshKeyStatus = useCallback(() => {
    getGeminiApiKey().then((k) => setHasGeminiKey(Boolean(k)));
  }, []);

  useEffect(() => {
    refreshKeyStatus();
  }, [refreshKeyStatus]);

  useFocusEffect(refreshKeyStatus);

  // Chargement des données de marché Yahoo Finance
  const loadAsset = useCallback(
    async (symbolOrQuery: string, isin?: string | null) => {
      const clean = symbolOrQuery.trim();
      if (!clean && !isin) return;
      setLoadingAsset(true);
      setAssetError(null);
      setHoverIndex(null);
      try {
        const bundle = await fetchAssetData(clean || isin || '', isin);
        setAsset(bundle);
        setActiveSymbol(bundle.symbol);
        setActiveIsin(bundle.isin);
        if (!embedded) {
          setAiLastSymbol(bundle.symbol, bundle.isin);
        }
      } catch (err: any) {
        setAssetError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingAsset(false);
      }
    },
    [embedded, setAiLastSymbol]
  );

  useEffect(() => {
    const q = initialSymbol?.trim() || initialIsin?.trim() || initialName?.trim();
    if (q) {
      const targetIsin = initialIsin?.trim() || null;
      setActiveSymbol(q);
      setActiveIsin(targetIsin);
      loadAsset(q, targetIsin);
    } else if (!embedded && aiLastSymbol) {
      setActiveSymbol(aiLastSymbol);
      setActiveIsin(aiLastIsin ?? null);
      loadAsset(aiLastSymbol, aiLastIsin);
    } else {
      loadAsset(activeSymbol, activeIsin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialSymbol,
    initialIsin,
    initialName,
    embedded ? null : aiLastSymbol,
    embedded ? null : aiLastIsin,
  ]);

  // Recherche avec debounce
  useEffect(() => {
    const clean = searchQuery.trim();
    if (!clean) {
      setSearchResults([]);
      setIsIsinMatch(false);
      setSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchMarketProducts(clean);
        setSearchResults(res.quotes);
        setIsIsinMatch(res.queryIsIsin);
        setDropdownOpen(true);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 240);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectProduct = (symbol: string, isin?: string | null) => {
    setDropdownOpen(false);
    setSearchQuery('');
    setActiveSymbol(symbol);
    setActiveIsin(isin ?? null);
    loadAsset(symbol, isin);
  };

  const handleSearchSubmit = async () => {
    const clean = searchQuery.trim();
    if (!clean) return;
    if (searchResults.length > 0) {
      handleSelectProduct(searchResults[0].symbol, searchResults[0].isin);
      return;
    }
    setDropdownOpen(false);
    handleSelectProduct(clean.toUpperCase(), isIsin(clean) ? clean.toUpperCase() : null);
  };

  // Lignes détenues en portefeuille (hors crypto pure CoinGecko sans ISIN)
  const detainedStockChips = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ key: string; query: string; isin?: string; label: string; sub: string }> = [];
    for (const h of holdings) {
      if (h.priceSource === 'coingecko' && !h.isin) continue;
      const query = h.symbol?.trim() || h.isin?.trim() || h.name.trim();
      if (!query) continue;
      const dedupKey = (h.isin || h.symbol || h.name).toUpperCase();
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      list.push({
        key: h.id,
        query,
        isin: h.isin,
        label: h.symbol || h.isin || h.name.slice(0, 12),
        sub: h.name,
      });
    }
    return list;
  }, [holdings]);

  // Correspondance avec les lignes détenues par l'utilisateur pour l'actif affiché
  const matchingHoldings = useMemo(() => {
    if (!asset && !holdingId) return [];
    return holdings.filter((h) => {
      if (holdingId && h.id === holdingId) return true;
      if (!asset) return false;
      if (asset.isin && h.isin && asset.isin.toUpperCase() === h.isin.toUpperCase()) return true;
      if (asset.symbol && h.symbol && asset.symbol.toUpperCase() === h.symbol.toUpperCase()) {
        return true;
      }
      return false;
    });
  }, [holdings, asset, holdingId]);

  const detainedSummary = useMemo(() => {
    if (matchingHoldings.length === 0) return null;
    let totalQty = 0;
    let totalValEur = 0;
    for (const h of matchingHoldings) {
      const acc = accounts.find((a) => a.id === h.accountId);
      totalQty += h.quantity;
      totalValEur += holdingValueEur(h, acc, rates);
    }
    const perf = holdingPerfPct(matchingHoldings[0]);
    return { totalQty, totalValEur, perf };
  }, [matchingHoldings, accounts, rates]);

  const technicals: TechnicalAnalytics | null = useMemo(() => {
    if (!asset) return null;
    return computeTechnicalAnalytics(asset);
  }, [asset]);

  const currentReport: GeminiCounselReport | null = useMemo(() => {
    if (!asset) return null;
    return aiReports[asset.symbol] ?? null;
  }, [aiReports, asset]);

  const geminiStructured = currentReport?.structured ?? null;

  const isFavorite = useMemo(() => {
    if (!asset) return false;
    return aiWatchlist.some((w) => w.symbol === asset.symbol);
  }, [aiWatchlist, asset]);

  // ── Calculs du graphique de prix ──
  const series: PricePoint[] = useMemo(() => {
    if (!asset) return [];
    const raw = asset.charts[activeTimeframe] || [];
    if (raw.length > 0) return raw;
    return asset.charts['1Y'] || [];
  }, [asset, activeTimeframe]);

  const baselinePrice = useMemo(() => {
    if (!asset) return 0;
    if (activeTimeframe === '1D' && asset.previousClose > 0) {
      return asset.previousClose;
    }
    return series[0]?.close ?? asset.regularMarketPrice;
  }, [asset, activeTimeframe, series]);

  const activePoint = hoverIndex !== null && series[hoverIndex] ? series[hoverIndex] : null;
  const displayedPrice = activePoint ? activePoint.close : (asset?.regularMarketPrice ?? 0);
  const priceChange = displayedPrice - baselinePrice;
  const priceChangePct = baselinePrice > 0 ? (priceChange / baselinePrice) * 100 : 0;
  const isPositive = priceChange >= 0;

  const sma20Series = useMemo(() => {
    if (!showMovingAverages || series.length < 10) return [];
    const windowSize = Math.min(20, Math.floor(series.length / 2));
    return series.map((_, idx) => {
      if (idx < windowSize - 1) return null;
      let sum = 0;
      for (let j = idx - windowSize + 1; j <= idx; j++) sum += series[j].close;
      return sum / windowSize;
    });
  }, [series, showMovingAverages]);

  const sma50Series = useMemo(() => {
    if (!showMovingAverages || series.length < 30) return [];
    const windowSize = Math.min(50, Math.floor(series.length * 0.6));
    return series.map((_, idx) => {
      if (idx < windowSize - 1) return null;
      let sum = 0;
      for (let j = idx - windowSize + 1; j <= idx; j++) sum += series[j].close;
      return sum / windowSize;
    });
  }, [series, showMovingAverages]);

  const futureTargets = useMemo(() => {
    if (geminiStructured?.priceTargets?.twelveMonth?.base) {
      const t12 = geminiStructured.priceTargets.twelveMonth;
      return {
        source: t('ai.source_gemini'),
        bear: t12.bear,
        base: t12.base,
        bull: t12.bull,
      };
    }
    const q = technicals?.quantProjections['1Y'];
    return {
      source: t('ai.source_quant'),
      bear: q?.bearPrice ?? displayedPrice * 0.85,
      base: q?.basePrice ?? displayedPrice * 1.08,
      bull: q?.bullPrice ?? displayedPrice * 1.25,
    };
  }, [geminiStructured, technicals, displayedPrice, t]);

  const winWidth = useWindowDimensions().width;
  const [chartWidth, setChartWidth] = useState(0);
  const chartNodeRef = useRef<HTMLElement | null>(null);
  const chartRoRef = useRef<ResizeObserver | null>(null);

  // react-native-web >= 0.20 ne déclenche plus toujours onLayout : mesure directe du DOM
  // + ResizeObserver, pour que svgWidth corresponde exactement aux pixels affichés (ratio 1:1).
  const chartWrapRef = useCallback((node: unknown) => {
    if (Platform.OS !== 'web') return;
    chartRoRef.current?.disconnect();
    chartRoRef.current = null;
    const el = node as HTMLElement | null;
    chartNodeRef.current = el;
    if (!el) return;
    setChartWidth(el.clientWidth);
    if (typeof ResizeObserver !== 'undefined') {
      chartRoRef.current = new ResizeObserver(() => setChartWidth(el.clientWidth));
      chartRoRef.current.observe(el);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && chartNodeRef.current) {
      setChartWidth(chartNodeRef.current.clientWidth);
    }
  }, [winWidth]);

  const svgWidth = chartWidth > 0 ? chartWidth : Math.max(300, Math.round(winWidth - 64));
  const svgHeight = 230;
  const padLeft = 10;
  const padRight = showFutureOverlay ? 130 : 56;
  const padTop = 16;
  const padBottom = 34;
  const plotWidth = Math.max(60, svgWidth - padLeft - padRight);
  const plotHeight = svgHeight - padTop - padBottom;

  const { minPrice, maxPrice, maxVolume } = useMemo(() => {
    if (series.length === 0) return { minPrice: 0, maxPrice: 100, maxVolume: 1 };
    let min = Infinity;
    let max = -Infinity;
    let maxVol = 0;
    for (const pt of series) {
      if (pt.low < min) min = pt.low;
      if (pt.high > max) max = pt.high;
      if (pt.volume > maxVol) maxVol = pt.volume;
    }
    if (activeTimeframe === '1D' && asset && asset.previousClose > 0) {
      min = Math.min(min, asset.previousClose);
      max = Math.max(max, asset.previousClose);
    }
    if (showFutureOverlay) {
      min = Math.min(min, futureTargets.bear);
      max = Math.max(max, futureTargets.bull);
    }
    const range = max - min || max * 0.05 || 1;
    return {
      minPrice: min - range * 0.06,
      maxPrice: max + range * 0.06,
      maxVolume: maxVol || 1,
    };
  }, [series, activeTimeframe, asset, showFutureOverlay, futureTargets]);

  const getX = useCallback(
    (index: number) => {
      if (series.length <= 1) return padLeft;
      return padLeft + (index / (series.length - 1)) * plotWidth;
    },
    [series.length, plotWidth]
  );

  const getY = useCallback(
    (price: number) => {
      const denom = maxPrice - minPrice || 1;
      return padTop + plotHeight - ((price - minPrice) / denom) * plotHeight;
    },
    [maxPrice, minPrice, plotHeight]
  );

  const linePath = useMemo(() => {
    if (series.length === 0) return '';
    return series
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(pt.close).toFixed(1)}`)
      .join(' ');
  }, [series, getX, getY]);

  const areaPath = useMemo(() => {
    if (series.length === 0 || !linePath) return '';
    const lastX = getX(series.length - 1).toFixed(1);
    const firstX = getX(0).toFixed(1);
    const bottomY = (padTop + plotHeight).toFixed(1);
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [linePath, series.length, getX, plotHeight]);

  const sma20Path = useMemo(() => {
    const pts: string[] = [];
    sma20Series.forEach((val, idx) => {
      if (val !== null) {
        pts.push(`${pts.length === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(val).toFixed(1)}`);
      }
    });
    return pts.join(' ');
  }, [sma20Series, getX, getY]);

  const sma50Path = useMemo(() => {
    const pts: string[] = [];
    sma50Series.forEach((val, idx) => {
      if (val !== null) {
        pts.push(`${pts.length === 0 ? 'M' : 'L'} ${getX(idx).toFixed(1)} ${getY(val).toFixed(1)}`);
      }
    });
    return pts.join(' ');
  }, [sma50Series, getX, getY]);

  const locateChartPoint = useCallback(
    (localX: number) => {
      if (series.length <= 0 || plotWidth <= 0) return;
      const clampedX = Math.max(padLeft, Math.min(padLeft + plotWidth, localX));
      const ratio = (clampedX - padLeft) / plotWidth;
      const idx = Math.round(ratio * (series.length - 1));
      setHoverIndex(Math.max(0, Math.min(series.length - 1, idx)));
    },
    [series.length, plotWidth]
  );

  const handleChartPointerEvent = useCallback(
    (e: any) => {
      if (series.length <= 0) return;
      const ne = e?.nativeEvent ?? e;
      if (
        Platform.OS === 'web' &&
        chartNodeRef.current &&
        typeof chartNodeRef.current.getBoundingClientRect === 'function'
      ) {
        const rect = chartNodeRef.current.getBoundingClientRect();
        const clientX =
          typeof ne?.clientX === 'number'
            ? ne.clientX
            : typeof ne?.touches?.[0]?.clientX === 'number'
              ? ne.touches[0].clientX
              : typeof ne?.changedTouches?.[0]?.clientX === 'number'
                ? ne.changedTouches[0].clientX
                : typeof ne?.pageX === 'number' && typeof window !== 'undefined'
                  ? ne.pageX - window.scrollX
                  : undefined;
        if (typeof clientX === 'number') {
          locateChartPoint(clientX - rect.left);
          return;
        }
      }
      if (typeof ne?.locationX === 'number') {
        locateChartPoint(ne.locationX);
      }
    },
    [series.length, locateChartPoint]
  );

  // ── Exécution de l'analyse Gemini ──
  const handleRunCounsel = async () => {
    if (!asset || !technicals) return;
    const key = await getGeminiApiKey();
    if (!key) {
      setCounselError(t('ai.cle_api_manquante'));
      router.push('/ai-settings');
      return;
    }
    setRunningCounsel(true);
    setCounselError(null);
    try {
      const report = await generateGeminiInvestmentCounsel(asset, technicals, {
        horizon,
        riskProfile: riskMandate,
        model: aiModel,
        userNotes: userNotes.trim() || undefined,
        customSystemPreprompt: aiCustomPreprompt,
      });
      setAiReport(asset.symbol, report);
    } catch (err: any) {
      setCounselError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningCounsel(false);
    }
  };

  const allModels = DEFAULT_GEMINI_MODELS;

  // ── Sentiment & Scénarios ──
  const useGeminiTargets =
    (forecastMode === 'AUTO' && Boolean(geminiStructured?.priceTargets?.twelveMonth?.base)) ||
    (forecastMode === 'GEMINI' && Boolean(geminiStructured?.priceTargets?.twelveMonth?.base));

  const effectiveSentimentScore = useMemo(() => {
    if (!technicals) return 50;
    if (geminiStructured?.sentimentScore !== undefined) {
      return Math.round(0.45 * technicals.sentimentScore + 0.55 * geminiStructured.sentimentScore);
    }
    return technicals.sentimentScore;
  }, [technicals, geminiStructured]);

  const sentimentColor =
    effectiveSentimentScore >= 58
      ? C.positive
      : effectiveSentimentScore <= 42
        ? C.negative
        : C.warning;

  const scenarios = useMemo(() => {
    if (!asset || !technicals) return [];
    const spot = asset.regularMarketPrice || 1;
    const pct = (target: number) => ((target - spot) / spot) * 100;

    if (useGeminiTargets && geminiStructured?.priceTargets) {
      const p3m = geminiStructured.priceTargets.threeMonth;
      const p12m = geminiStructured.priceTargets.twelveMonth;
      const p3y = geminiStructured.priceTargets.threeYear;
      return [
        {
          label: '3M',
          subtitle: p3m.rationale || '',
          bear: p3m.bear,
          base: p3m.base,
          bull: p3m.bull,
          bearPct: pct(p3m.bear),
          basePct: pct(p3m.base),
          bullPct: pct(p3m.bull),
        },
        {
          label: '12M',
          subtitle: p12m.rationale || '',
          bear: p12m.bear,
          base: p12m.base,
          bull: p12m.bull,
          bearPct: pct(p12m.bear),
          basePct: pct(p12m.base),
          bullPct: pct(p12m.bull),
          expected: p12m.expectedPrice,
        },
        {
          label: '3Y (36M)',
          subtitle: p3y.rationale || '',
          bear: p3y.bear,
          base: p3y.base,
          bull: p3y.bull,
          bearPct: pct(p3y.bear),
          basePct: pct(p3y.base),
          bullPct: pct(p3y.bull),
        },
      ];
    }

    const q3 = technicals.quantProjections['3M'];
    const q6 = technicals.quantProjections['6M'];
    const q12 = technicals.quantProjections['1Y'];
    return [
      {
        label: '3M',
        subtitle: 'Log-Normal Drift & Vol Cone',
        bear: q3.bearPrice,
        base: q3.basePrice,
        bull: q3.bullPrice,
        bearPct: q3.bearChangePct,
        basePct: q3.baseChangePct,
        bullPct: q3.bullChangePct,
      },
      {
        label: '6M',
        subtitle: 'Medium-Term Quant Range',
        bear: q6.bearPrice,
        base: q6.basePrice,
        bull: q6.bullPrice,
        bearPct: q6.bearChangePct,
        basePct: q6.baseChangePct,
        bullPct: q6.bullChangePct,
      },
      {
        label: '12M',
        subtitle: '1Y ±0.85σ Confidence Band',
        bear: q12.bearPrice,
        base: q12.basePrice,
        bull: q12.bullPrice,
        bearPct: q12.bearChangePct,
        basePct: q12.baseChangePct,
        bullPct: q12.bullChangePct,
      },
    ];
  }, [asset, technicals, useGeminiTargets, geminiStructured]);

  // Fan Chart (-6M History -> +12M Forecast)
  const fanChart = useMemo(() => {
    if (!asset || !technicals) return null;
    const daily = asset.charts['1Y'] || [];
    const past6M = daily.slice(-126);
    const histSampled = past6M.filter((_, i) => i % 6 === 0 || i === past6M.length - 1);
    const spot = asset.regularMarketPrice || histSampled.at(-1)?.close || 100;

    let bear12 = technicals.quantProjections['1Y'].bearPrice;
    let base12 = technicals.quantProjections['1Y'].basePrice;
    let bull12 = technicals.quantProjections['1Y'].bullPrice;
    let bear3 = technicals.quantProjections['3M'].bearPrice;
    let base3 = technicals.quantProjections['3M'].basePrice;
    let bull3 = technicals.quantProjections['3M'].bullPrice;

    if (useGeminiTargets && geminiStructured?.priceTargets) {
      bear12 = geminiStructured.priceTargets.twelveMonth.bear || bear12;
      base12 = geminiStructured.priceTargets.twelveMonth.base || base12;
      bull12 = geminiStructured.priceTargets.twelveMonth.bull || bull12;
      bear3 = geminiStructured.priceTargets.threeMonth.bear || bear3;
      base3 = geminiStructured.priceTargets.threeMonth.base || base3;
      bull3 = geminiStructured.priceTargets.threeMonth.bull || bull3;
    }

    const allPrices = [
      ...histSampled.map((p) => p.close),
      spot,
      bear3,
      base3,
      bull3,
      bear12,
      base12,
      bull12,
    ];
    const minP = Math.min(...allPrices) * 0.95;
    const maxP = Math.max(...allPrices) * 1.05;

    return { histSampled, spot, bear3, base3, bull3, bear12, base12, bull12, minP, maxP };
  }, [asset, technicals, useGeminiTargets, geminiStructured]);

  const horizonLabels: Record<CounselHorizon, string> = {
    SHORT_TERM: t('ai.horizon_court'),
    MEDIUM_TERM: t('ai.horizon_moyen'),
    LONG_TERM: t('ai.horizon_long'),
  };

  const riskLabels: Record<CounselRiskProfile, string> = {
    CONSERVATIVE: t('ai.risque_prudent'),
    BALANCED: t('ai.risque_equilibre'),
    AGGRESSIVE: t('ai.risque_offensif'),
  };

  const strokeColor = isPositive ? C.positive : C.negative;
  const lastPt = series.at(-1);
  const lastX = series.length > 0 ? getX(series.length - 1) : padLeft;
  const lastY = lastPt ? getY(lastPt.close) : padTop + plotHeight / 2;
  const futureEndX = svgWidth - 14;

  const yTicks = useMemo(() => {
    const count = 4;
    const ticks: number[] = [];
    for (let i = 0; i < count; i++) {
      ticks.push(minPrice + ((maxPrice - minPrice) * i) / (count - 1));
    }
    return ticks;
  }, [minPrice, maxPrice]);

  return (
    <View>
      {/* ── Avertissement réglementaire permanent (Non-CIF / AMF / MiFID II) ── */}
      <View style={styles.disclaimerWrap}>
        <Text style={styles.disclaimerTitle}>{t('ai.avertissement_titre')}</Text>
        <Text style={styles.disclaimerText}>{t('ai.avertissement_legal')}</Text>
      </View>

      {/* ── En-tête & Recherche (affiché sur l'onglet IA, ou compact en mode intégré) ── */}
      <Card>
        <View style={styles.topBar}>
          <View style={styles.titleBlock}>
            <Text style={styles.screenTitle}>{t('ai.titre')}</Text>
            <Text style={styles.screenSub}>{t('ai.sous_titre')}</Text>
          </View>
          <Pressable onPress={() => router.push('/ai-settings')} style={styles.keyBadge}>
            <View
              style={[
                styles.keyDot,
                { backgroundColor: hasGeminiKey ? C.positive : C.warning },
              ]}
            />
            <Text style={styles.keyBadgeText}>
              {hasGeminiKey ? t('ai.cle_configuree') : t('ai.configurer_cle')}
            </Text>
          </Pressable>
        </View>

        {!embedded && (
          <>
            <View style={styles.searchRow}>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearchSubmit}
                placeholder={t('ai.recherche_placeholder')}
                placeholderTextColor={C.textFaint}
                style={styles.searchInput}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {isIsin(searchQuery) && (
                <View style={styles.isinTag}>
                  <Text style={styles.isinTagText}>{t('ai.isin_detecte')}</Text>
                </View>
              )}
              {searching && <ActivityIndicator size="small" color={C.accent} />}
              {searchQuery.length > 0 && (
                <Pressable
                  onPress={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setDropdownOpen(false);
                  }}
                  style={styles.clearBtn}
                >
                  <Text style={styles.clearBtnText}>✕</Text>
                </Pressable>
              )}
            </View>

            {dropdownOpen &&
              (searchResults.length > 0 || (searchQuery.trim().length >= 2 && !searching)) && (
                <View style={styles.dropdownBox}>
                  {isIsinMatch && (
                    <Text style={styles.dropdownBanner}>
                      {t('ai.isin_resolu', { isin: searchQuery.trim().toUpperCase() })}
                    </Text>
                  )}
                  {searchResults.length === 0 ? (
                    <Text style={styles.footnote}>
                      {t('ai.aucun_resultat', { query: searchQuery.trim() })}
                    </Text>
                  ) : (
                    searchResults.slice(0, 6).map((item) => (
                      <Pressable
                        key={`${item.symbol}-${item.exchange}`}
                        onPress={() => handleSelectProduct(item.symbol, item.isin)}
                        style={styles.dropdownItem}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={styles.ddSymbolRow}>
                            <Text style={styles.ddSymbol}>{item.symbol}</Text>
                            <View style={styles.ddTypePill}>
                              <Text style={styles.ddTypeText}>{item.typeDisplay}</Text>
                            </View>
                            {item.isin && <Text style={styles.ddIsin}>ISIN: {item.isin}</Text>}
                          </View>
                          <Text style={styles.ddName} numberOfLines={1}>
                            {item.longName}
                          </Text>
                        </View>
                        <Text style={styles.ddExchange}>{item.exchange}</Text>
                      </Pressable>
                    ))
                  )}
                </View>
              )}

            {/* Lignes détenues en portefeuille */}
            {detainedStockChips.length > 0 && (
              <>
                <Text style={styles.stripLabel}>{t('ai.mes_lignes')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipsScroll}>
                    {detainedStockChips.map((chip) => {
                      const active =
                        asset?.symbol.toUpperCase() === chip.query.toUpperCase() ||
                        (Boolean(chip.isin) &&
                          asset?.isin?.toUpperCase() === chip.isin?.toUpperCase());
                      return (
                        <Pressable
                          key={chip.key}
                          onPress={() => handleSelectProduct(chip.query, chip.isin)}
                          style={[styles.presetChip, active && styles.presetChipActive]}
                        >
                          <Text style={[styles.presetSym, active && styles.presetTextActive]}>
                            {chip.label}
                          </Text>
                          <Text
                            style={[styles.presetName, active && styles.presetTextActive]}
                            numberOfLines={1}
                          >
                            {chip.sub}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Watchlist & Marchés populaires */}
            <Text style={styles.stripLabel}>{t('ai.watchlist_marches')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipsScroll}>
                {aiWatchlist.map((w) => {
                  const active = asset?.symbol === w.symbol;
                  return (
                    <Pressable
                      key={`fav-${w.symbol}`}
                      onPress={() => handleSelectProduct(w.symbol, w.isin)}
                      style={[styles.presetChip, active && styles.presetChipActive]}
                    >
                      <Text style={[styles.presetSym, active && styles.presetTextActive]}>
                        ★ {w.symbol}
                      </Text>
                      <Text
                        style={[styles.presetName, active && styles.presetTextActive]}
                        numberOfLines={1}
                      >
                        {w.name}
                      </Text>
                    </Pressable>
                  );
                })}
                {POPULAR_PRESETS.filter(
                  (p) => !aiWatchlist.some((w) => w.symbol === p.symbol)
                ).map((p) => {
                  const active = asset?.symbol === p.symbol;
                  return (
                    <Pressable
                      key={p.symbol}
                      onPress={() => handleSelectProduct(p.symbol, p.isin)}
                      style={[styles.presetChip, active && styles.presetChipActive]}
                    >
                      <Text style={[styles.presetSym, active && styles.presetTextActive]}>
                        {p.symbol}
                      </Text>
                      <Text
                        style={[styles.presetName, active && styles.presetTextActive]}
                        numberOfLines={1}
                      >
                        {p.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </>
        )}
      </Card>

      {/* ── Bandeau Position détenue (si l'actif est en portefeuille) ── */}
      {detainedSummary && !embedded && (
        <View style={styles.positionBanner}>
          <View>
            <Text style={styles.positionTitle}>{t('ai.position_detenue')}</Text>
            <Text style={styles.positionSub}>
              {t('ai.position_detail', {
                qty: formatQuantity(detainedSummary.totalQty),
                value: formatEur(detainedSummary.totalValEur),
              })}
            </Text>
          </View>
          {detainedSummary.perf !== undefined && (
            <Text
              style={{
                color: detainedSummary.perf >= 0 ? C.positive : C.negative,
                fontSize: 14,
                fontWeight: '700',
              }}
            >
              {formatPct(detainedSummary.perf, true)}
            </Text>
          )}
        </View>
      )}

      {/* ── État de chargement ou d'erreur ── */}
      {loadingAsset && !asset && (
        <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={[styles.footnote, { textAlign: 'center', marginTop: 10 }]}>
            {t('ai.chargement_marche', { symbol: activeSymbol })}
          </Text>
        </Card>
      )}

      {assetError && (
        <Card>
          <Text style={[styles.cardTitle, { color: C.negative, marginBottom: 4 }]}>
            {t('ai.erreur_marche_titre')}
          </Text>
          <Text style={styles.footnote}>{assetError}</Text>
          <View style={{ marginTop: 10 }}>
            <Button
              title={t('ai.reessayer')}
              variant="secondary"
              onPress={() => loadAsset(activeSymbol, activeIsin)}
            />
          </View>
        </Card>
      )}

      {asset && technicals && (
        <>
          {/* ── 1. Carte Prix & Graphique Multi-Échelles (1D, 1W, 1M, 1Y, 5Y) ── */}
          <Card>
            <View style={styles.badgesRow}>
              <View style={styles.symbolBadge}>
                <Text style={styles.symbolBadgeText}>{asset.symbol}</Text>
              </View>
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>{asset.instrumentType}</Text>
              </View>
              {asset.exchangeName ? (
                <View style={styles.metaBadge}>
                  <Text style={styles.metaBadgeText}>{asset.exchangeName}</Text>
                </View>
              ) : null}
              {asset.isin ? (
                <Pressable
                  onPress={async () => {
                    await Clipboard.setStringAsync(asset.isin!);
                    notify(t('ai.isin_copie'), asset.isin!);
                  }}
                  style={styles.metaBadge}
                >
                  <Text style={styles.metaBadgeText}>ISIN: {asset.isin} ⧉</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() =>
                  toggleAiWatchlist({
                    symbol: asset.symbol,
                    name: asset.shortName,
                    isin: asset.isin,
                    type: asset.instrumentType,
                  })
                }
                style={styles.favBtn}
                accessibilityLabel={isFavorite ? t('ai.favori_retirer') : t('ai.favori_ajouter')}
              >
                <Text style={{ color: isFavorite ? C.accent : C.textDim, fontSize: 13 }}>
                  {isFavorite ? '★' : '☆'}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.assetTitle}>{asset.longName}</Text>
            {(asset.sector || asset.industry) && (
              <Text style={styles.assetSector}>
                {asset.sector}
                {asset.sector && asset.industry ? ' • ' : ''}
                {asset.industry}
              </Text>
            )}

            <View style={styles.priceRow}>
              <Text style={styles.spotPrice}>
                {formatAssetCurrency(displayedPrice, asset.currency)}
              </Text>
              <Text style={[styles.deltaText, { color: strokeColor }]}>
                {isPositive ? '+' : ''}
                {priceChange.toFixed(2)} ({isPositive ? '+' : ''}
                {priceChangePct.toFixed(2)}%){' '}
                <Text style={styles.deltaPeriod}>
                  {activePoint
                    ? formatChartTimestamp(activePoint.timestamp, activeTimeframe)
                    : activeTimeframe}
                </Text>
              </Text>
            </View>

            <View style={styles.toolbarRow}>
              <Chips<TimeframeKey>
                options={TIMEFRAMES}
                value={activeTimeframe}
                onChange={(tf) => {
                  setHoverIndex(null);
                  setActiveTimeframe(tf);
                }}
                style={{ marginBottom: 0 }}
              />
              <View style={styles.overlayRow}>
                <Pressable
                  onPress={() => setShowMovingAverages((v) => !v)}
                  style={[styles.overlayChip, showMovingAverages && styles.overlayChipActive]}
                >
                  <Text
                    style={[
                      styles.overlayChipText,
                      showMovingAverages && styles.overlayChipTextActive,
                    ]}
                  >
                    {t('ai.sma_toggle')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowFutureOverlay((v) => !v)}
                  style={[styles.overlayChip, showFutureOverlay && styles.overlayChipActive]}
                >
                  <Text
                    style={[
                      styles.overlayChipText,
                      showFutureOverlay && styles.overlayChipTextActive,
                    ]}
                  >
                    {t('ai.cone_toggle')}
                  </Text>
                </Pressable>
              </View>
            </View>

            {(activePoint ?? series.at(-1)) && (() => {
              const hudPt = (activePoint ?? series.at(-1))!;
              return (
                <View style={styles.hudBar}>
                  <Text style={styles.hudText}>
                    {formatChartTimestamp(hudPt.timestamp, activeTimeframe)}
                  </Text>
                  <Text style={styles.hudText}>O: {hudPt.open.toFixed(2)}</Text>
                  <Text style={styles.hudText}>H: {hudPt.high.toFixed(2)}</Text>
                  <Text style={styles.hudText}>L: {hudPt.low.toFixed(2)}</Text>
                  <Text style={styles.hudText}>C: {hudPt.close.toFixed(2)}</Text>
                  {hudPt.volume > 0 && (
                    <Text style={styles.hudText}>
                      Vol: {formatCompactNumber(hudPt.volume)}
                    </Text>
                  )}
                </View>
              );
            })()}

            <View
              ref={chartWrapRef as any}
              onLayout={(e) => {
                if (Platform.OS !== 'web') {
                  setChartWidth(e.nativeEvent.layout.width);
                }
              }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={handleChartPointerEvent}
              onResponderMove={handleChartPointerEvent}
              onResponderRelease={(e) => {
                if (Platform.OS !== 'web' || e.nativeEvent.changedTouches?.length) {
                  setHoverIndex(null);
                }
              }}
              onResponderTerminate={() => setHoverIndex(null)}
              {...(Platform.OS === 'web'
                ? ({
                    onMouseMove: handleChartPointerEvent,
                    onMouseLeave: () => setHoverIndex(null),
                  } as any)
                : {})}
            >
              <Svg width={svgWidth} height={svgHeight} pointerEvents="none">
                <Defs>
                  <LinearGradient id={`priceArea-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
                    <Stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                  </LinearGradient>
                  <LinearGradient id={`cone-${gradId}`} x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0%" stopColor={C.accent} stopOpacity="0.08" />
                    <Stop offset="100%" stopColor={C.accent} stopOpacity="0.24" />
                  </LinearGradient>
                </Defs>

                {/* Lignes de grille horizontales */}
                {yTicks.map((tick, i) => {
                  const y = getY(tick);
                  return (
                    <G key={i}>
                      <Line
                        x1={padLeft}
                        y1={y}
                        x2={padLeft + plotWidth}
                        y2={y}
                        stroke={C.border}
                        strokeDasharray="3 3"
                        strokeWidth={1}
                      />
                      <SvgText
                        x={padLeft + plotWidth + 6}
                        y={y + 4}
                        fill={C.textFaint}
                        fontSize="10"
                      >
                        {tick.toFixed(tick >= 100 ? 1 : 2)}
                      </SvgText>
                    </G>
                  );
                })}

                {/* Clôture précédente sur 1D */}
                {activeTimeframe === '1D' && asset.previousClose > 0 && (
                  <Line
                    x1={padLeft}
                    y1={getY(asset.previousClose)}
                    x2={padLeft + plotWidth}
                    y2={getY(asset.previousClose)}
                    stroke={C.textFaint}
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                )}

                {/* Histogramme des volumes */}
                {series.map((pt, idx) => {
                  if (!pt.volume || maxVolume <= 0) return null;
                  const volHeight = (pt.volume / maxVolume) * 36;
                  const x = getX(idx);
                  const barWidth = Math.max(1.2, Math.min(6, plotWidth / series.length - 1));
                  const upBar = idx === 0 || pt.close >= series[idx - 1].close;
                  return (
                    <Rect
                      key={idx}
                      x={x - barWidth / 2}
                      y={padTop + plotHeight - volHeight}
                      width={barWidth}
                      height={volHeight}
                      fill={upBar ? C.positive : C.negative}
                      opacity={0.22}
                    />
                  );
                })}

                {/* Aire et courbe de prix */}
                {areaPath ? <Path d={areaPath} fill={`url(#priceArea-${gradId})`} /> : null}
                {linePath ? (
                  <Path
                    d={linePath}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}

                {/* Moyennes mobiles SMA 20 & SMA 50 */}
                {showMovingAverages && sma20Path ? (
                  <Path
                    d={sma20Path}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={1.4}
                    strokeDasharray="3 2"
                  />
                ) : null}
                {showMovingAverages && sma50Path ? (
                  <Path d={sma50Path} fill="none" stroke={C.warning} strokeWidth={1.4} />
                ) : null}

                {/* Cône de cible +12M optionnel */}
                {showFutureOverlay && series.length > 0 && (
                  <G>
                    <Polygon
                      points={`${lastX},${lastY} ${futureEndX},${getY(
                        futureTargets.bull
                      )} ${futureEndX},${getY(futureTargets.bear)}`}
                      fill={`url(#cone-${gradId})`}
                    />
                    <Line
                      x1={lastX}
                      y1={lastY}
                      x2={futureEndX}
                      y2={getY(futureTargets.bull)}
                      stroke={C.positive}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                    <SvgText
                      x={futureEndX - 4}
                      y={getY(futureTargets.bull) - 4}
                      textAnchor="end"
                      fill={C.positive}
                      fontSize="10"
                    >
                      Bull {futureTargets.bull.toFixed(1)}
                    </SvgText>
                    <Line
                      x1={lastX}
                      y1={lastY}
                      x2={futureEndX}
                      y2={getY(futureTargets.base)}
                      stroke={C.accent}
                      strokeWidth={1.8}
                      strokeDasharray="4 3"
                    />
                    <SvgText
                      x={futureEndX - 4}
                      y={getY(futureTargets.base) - 4}
                      textAnchor="end"
                      fill={C.accent}
                      fontSize="10"
                      fontWeight="bold"
                    >
                      Base {futureTargets.base.toFixed(1)}
                    </SvgText>
                    <Line
                      x1={lastX}
                      y1={lastY}
                      x2={futureEndX}
                      y2={getY(futureTargets.bear)}
                      stroke={C.negative}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                    />
                    <SvgText
                      x={futureEndX - 4}
                      y={getY(futureTargets.bear) + 11}
                      textAnchor="end"
                      fill={C.negative}
                      fontSize="10"
                    >
                      Bear {futureTargets.bear.toFixed(1)}
                    </SvgText>
                  </G>
                )}

                {/* Crosshair actif */}
                {hoverIndex !== null && activePoint && (
                  <G>
                    <Line
                      x1={getX(hoverIndex)}
                      y1={padTop}
                      x2={getX(hoverIndex)}
                      y2={padTop + plotHeight}
                      stroke={C.textDim}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    <Circle
                      cx={getX(hoverIndex)}
                      cy={getY(activePoint.close)}
                      r={4.5}
                      fill={strokeColor}
                      stroke={C.bg}
                      strokeWidth={2}
                    />
                  </G>
                )}

                {/* Dates axe X */}
                {series.length > 1 && (
                  <G>
                    <SvgText x={padLeft} y={svgHeight - 8} fill={C.textFaint} fontSize="10">
                      {formatChartTimestamp(series[0].timestamp, activeTimeframe)}
                    </SvgText>
                    <SvgText
                      x={padLeft + plotWidth / 2}
                      y={svgHeight - 8}
                      fill={C.textFaint}
                      fontSize="10"
                      textAnchor="middle"
                    >
                      {formatChartTimestamp(
                        series[Math.floor(series.length / 2)].timestamp,
                        activeTimeframe
                      )}
                    </SvgText>
                    <SvgText
                      x={padLeft + plotWidth}
                      y={svgHeight - 8}
                      fill={C.textFaint}
                      fontSize="10"
                      textAnchor="end"
                    >
                      {formatChartTimestamp(series[series.length - 1].timestamp, activeTimeframe)}
                    </SvgText>
                  </G>
                )}
              </Svg>
            </View>

            {showMovingAverages && (
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: strokeColor }]} />
                  <Text style={styles.legendText}>
                    {t('ai.legende_prix', { tf: activeTimeframe })}
                  </Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#38bdf8' }]} />
                  <Text style={styles.legendText}>{t('ai.legende_sma20')}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: C.warning }]} />
                  <Text style={styles.legendText}>{t('ai.legende_sma50')}</Text>
                </View>
                {showFutureOverlay && (
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: C.accent }]} />
                    <Text style={styles.legendText}>{futureTargets.source}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Bandeau des 6 indicateurs clés */}
            <View style={styles.metricsGrid}>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>{t('ai.stat_jour')}</Text>
                <Text style={styles.metricValue}>
                  {asset.regularMarketDayLow?.toFixed(2) ?? '—'} –{' '}
                  {asset.regularMarketDayHigh?.toFixed(2) ?? '—'}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>
                  {t('ai.stat_52s', { pct: technicals.fiftyTwoWeekPositionPct.toFixed(0) })}
                </Text>
                <Text style={styles.metricValue}>
                  {asset.fiftyTwoWeekLow?.toFixed(2) ?? '—'} –{' '}
                  {asset.fiftyTwoWeekHigh?.toFixed(2) ?? '—'}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>{t('ai.stat_sma200')}</Text>
                <Text style={styles.metricValue}>
                  {technicals.sma200 ? technicals.sma200.toFixed(2) : '—'}
                  {technicals.priceVsSma200Pct !== null
                    ? ` (${technicals.priceVsSma200Pct >= 0 ? '+' : ''}${technicals.priceVsSma200Pct.toFixed(1)}%)`
                    : ''}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>{t('ai.stat_rsi_vol')}</Text>
                <Text style={styles.metricValue}>
                  {technicals.rsi14.toFixed(1)} / {technicals.annualizedVolatilityPct.toFixed(1)}%
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>{t('ai.stat_perf_1a_5a')}</Text>
                <Text style={styles.metricValue}>
                  <Text
                    style={{ color: technicals.return1Y >= 0 ? C.positive : C.negative }}
                  >
                    {technicals.return1Y >= 0 ? '+' : ''}
                    {technicals.return1Y.toFixed(1)}%
                  </Text>
                  {' / '}
                  {technicals.return5Y !== null ? (
                    <Text
                      style={{ color: technicals.return5Y >= 0 ? C.positive : C.negative }}
                    >
                      {technicals.return5Y >= 0 ? '+' : ''}
                      {technicals.return5Y.toFixed(1)}%
                    </Text>
                  ) : (
                    '—'
                  )}
                </Text>
              </View>
              <View style={styles.metricBox}>
                <Text style={styles.metricLabel}>{t('ai.stat_dividende')}</Text>
                <Text style={styles.metricValue}>
                  {technicals.trailingDividendYieldPct > 0
                    ? `${technicals.trailingDividendYieldPct.toFixed(2)}%`
                    : '0.00%'}
                </Text>
              </View>
            </View>
          </Card>

          {/* ── 2. Sentiment de Marché & Tendance (0–100) ── */}
          <Card>
            <View style={styles.cardHeadRow}>
              <Text style={styles.cardTitle}>{t('ai.sentiment_titre')}</Text>
              <View
                style={[
                  styles.regimeBadge,
                  { borderColor: sentimentColor, backgroundColor: C.cardAlt },
                ]}
              >
                <Text style={[styles.regimeBadgeText, { color: sentimentColor }]}>
                  {geminiStructured?.sentimentLabel || technicals.sentimentRegime}
                </Text>
              </View>
            </View>

            <View style={styles.scoreMainRow}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={[styles.scoreBig, { color: sentimentColor }]}>
                  {effectiveSentimentScore}
                </Text>
                <Text style={styles.scoreMax}>/ 100</Text>
              </View>
              <View style={styles.subPillsWrap}>
                <View style={styles.subPill}>
                  <Text style={styles.subPillText}>
                    {t('ai.score_quant')} : {technicals.sentimentScore}/100
                  </Text>
                </View>
                {geminiStructured && (
                  <View style={styles.subPill}>
                    <Text style={[styles.subPillText, { color: C.accent, fontWeight: '600' }]}>
                      {t('ai.score_gemini')} : {geminiStructured.sentimentScore}/100
                    </Text>
                  </View>
                )}
                <View style={styles.subPill}>
                  <Text style={styles.subPillText}>
                    {t('ai.tendance')} : {technicals.trendDirection}
                  </Text>
                </View>
              </View>
            </View>

            <ProgressBar ratio={effectiveSentimentScore / 100} color={sentimentColor} height={10} />
            <View style={styles.meterScaleRow}>
              <Text style={styles.meterScaleText}>{t('ai.echelle_baissier')}</Text>
              <Text style={styles.meterScaleText}>{t('ai.echelle_neutre')}</Text>
              <Text style={styles.meterScaleText}>{t('ai.echelle_haussier')}</Text>
            </View>

            {/* Pivots Support & Résistance */}
            <View style={styles.pivotsRow}>
              <View style={styles.pivotBox}>
                <Text style={styles.pivotTag}>{t('ai.support_s2')}</Text>
                <Text style={[styles.pivotVal, { color: C.positive }]}>
                  {formatAssetCurrency(technicals.support2, asset.currency)}
                </Text>
              </View>
              <View style={styles.pivotBox}>
                <Text style={styles.pivotTag}>{t('ai.support_s1')}</Text>
                <Text style={[styles.pivotVal, { color: C.positive }]}>
                  {formatAssetCurrency(technicals.support1, asset.currency)}
                </Text>
              </View>
              <View style={styles.pivotBox}>
                <Text style={styles.pivotTag}>{t('ai.cours_spot')}</Text>
                <Text style={styles.pivotVal}>
                  {formatAssetCurrency(asset.regularMarketPrice, asset.currency)}
                </Text>
              </View>
              <View style={styles.pivotBox}>
                <Text style={styles.pivotTag}>{t('ai.resistance_r1')}</Text>
                <Text style={[styles.pivotVal, { color: C.negative }]}>
                  {formatAssetCurrency(technicals.resistance1, asset.currency)}
                </Text>
              </View>
              <View style={styles.pivotBox}>
                <Text style={styles.pivotTag}>{t('ai.resistance_r2')}</Text>
                <Text style={[styles.pivotVal, { color: C.negative }]}>
                  {formatAssetCurrency(technicals.resistance2, asset.currency)}
                </Text>
              </View>
            </View>

            {/* Décomposition des 7 signaux */}
            {technicals.signalBreakdown.map((sig, idx) => {
              const sigColor =
                sig.signal === 'BULLISH'
                  ? C.positive
                  : sig.signal === 'BEARISH'
                    ? C.negative
                    : C.warning;
              return (
                <View key={idx} style={styles.signalRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.signalFactor}>{sig.factor}</Text>
                    <Text style={styles.signalDetail}>{sig.detail}</Text>
                  </View>
                  <View style={[styles.signalTag, { backgroundColor: C.cardAlt }]}>
                    <Text style={[styles.signalTagText, { color: sigColor }]}>{sig.signal}</Text>
                  </View>
                </View>
              );
            })}
          </Card>

          {/* ── 3. Estimation du Cours Futur & Cône de Confiance ── */}
          <Card>
            <View style={styles.cardHeadRow}>
              <Text style={styles.cardTitle}>{t('ai.prevision_titre')}</Text>
              <View style={styles.overlayRow}>
                <Pressable
                  onPress={() => setForecastMode('QUANT')}
                  style={[styles.overlayChip, !useGeminiTargets && styles.overlayChipActive]}
                >
                  <Text
                    style={[
                      styles.overlayChipText,
                      !useGeminiTargets && styles.overlayChipTextActive,
                    ]}
                  >
                    {t('ai.source_quant')}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={!geminiStructured}
                  onPress={() => setForecastMode('GEMINI')}
                  style={[
                    styles.overlayChip,
                    useGeminiTargets && styles.overlayChipActive,
                    !geminiStructured && { opacity: 0.45 },
                  ]}
                >
                  <Text
                    style={[
                      styles.overlayChipText,
                      useGeminiTargets && styles.overlayChipTextActive,
                    ]}
                  >
                    {t('ai.source_gemini')}
                  </Text>
                </Pressable>
              </View>
            </View>

            {fanChart && (
              <FanChartSvg
                fanChart={fanChart}
                width={svgWidth}
                currency={asset.currency}
                gradId={gradId}
                todayLabel={t('ai.aujourdhui')}
                histLabel={t('ai.historique_6m')}
                forecastLabel={t('ai.prevision_12m')}
              />
            )}

            {scenarios.map((sc, idx) => (
              <View key={idx} style={styles.horizonCard}>
                <View style={styles.horizonHead}>
                  <View>
                    <Text style={styles.horizonTitle}>{sc.label}</Text>
                    {sc.subtitle ? <Text style={styles.horizonSub}>{sc.subtitle}</Text> : null}
                  </View>
                  {'expected' in sc && sc.expected ? (
                    <View style={styles.expectedPill}>
                      <Text style={styles.expectedPillText}>
                        {t('ai.pondere_proba', {
                          price: formatAssetCurrency(sc.expected, asset.currency),
                        })}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.triGrid}>
                  <View style={styles.triCell}>
                    <Text style={styles.triLabel}>{t('ai.scenario_baissier')}</Text>
                    <Text style={styles.triPrice}>
                      {formatAssetCurrency(sc.bear, asset.currency)}
                    </Text>
                    <Text
                      style={[
                        styles.triPct,
                        { color: sc.bearPct >= 0 ? C.positive : C.negative },
                      ]}
                    >
                      {sc.bearPct >= 0 ? '+' : ''}
                      {sc.bearPct.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.triCell}>
                    <Text style={styles.triLabel}>{t('ai.scenario_central')}</Text>
                    <Text style={styles.triPrice}>
                      {formatAssetCurrency(sc.base, asset.currency)}
                    </Text>
                    <Text
                      style={[
                        styles.triPct,
                        { color: sc.basePct >= 0 ? C.positive : C.negative },
                      ]}
                    >
                      {sc.basePct >= 0 ? '+' : ''}
                      {sc.basePct.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={styles.triCell}>
                    <Text style={styles.triLabel}>{t('ai.scenario_haussier')}</Text>
                    <Text style={styles.triPrice}>
                      {formatAssetCurrency(sc.bull, asset.currency)}
                    </Text>
                    <Text
                      style={[
                        styles.triPct,
                        { color: sc.bullPct >= 0 ? C.positive : C.negative },
                      ]}
                    >
                      {sc.bullPct >= 0 ? '+' : ''}
                      {sc.bullPct.toFixed(1)}%
                    </Text>
                  </View>
                </View>
              </View>
            ))}

            <Text style={styles.footnote}>
              {useGeminiTargets ? t('ai.note_prevision_gemini') : t('ai.note_prevision_quant')}
            </Text>
          </Card>

          {/* ── 4. Comité d'Investissement Institutionnel Gemini IA ── */}
          <Card>
            <View style={styles.cardHeadRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{t('ai.conseiller_titre')}</Text>
                <Text style={styles.screenSub}>{t('ai.conseiller_sous_titre')}</Text>
              </View>
              <Pressable
                onPress={() => router.push('/ai-settings')}
                style={styles.keyBadge}
              >
                <Text style={styles.keyBadgeText}>{t('ai.voir_preprompt')}</Text>
              </Pressable>
            </View>

            <SelectField
              label={t('ai.modele_gemini')}
              value={aiModel}
              onChange={setAiModel}
              options={allModels.map((m) => ({ value: m.id, label: m.label }))}
            />

            <Text style={styles.stripLabel}>{t('ai.horizon_cible')}</Text>
            <Chips<CounselHorizon>
              options={HORIZONS}
              value={horizon}
              onChange={setHorizon}
              labels={horizonLabels}
            />

            <Text style={styles.stripLabel}>{t('ai.mandat_risque')}</Text>
            <Chips<CounselRiskProfile>
              options={RISK_MANDATES}
              value={riskMandate}
              onChange={setRiskMandate}
              labels={riskLabels}
            />

            <Field
              label={t('ai.focus_label')}
              value={userNotes}
              onChangeText={setUserNotes}
              placeholder={t('ai.focus_placeholder')}
            />

            <Button
              title={
                runningCounsel
                  ? t('ai.analyse_en_cours')
                  : currentReport
                    ? t('ai.actualiser_analyse')
                    : t('ai.lancer_analyse')
              }
              onPress={handleRunCounsel}
              loading={runningCounsel}
            />

            <View style={styles.privacyWrap}>
              <Text style={styles.privacyTitle}>{t('ai.confidentialite_ia_titre')}</Text>
              <Text style={styles.privacyText}>{t('ai.confidentialite_ia_texte')}</Text>
            </View>

            {counselError && (
              <View style={[styles.subSectionCard, { borderColor: C.negative }]}>
                <Text style={{ color: C.negative, fontSize: 13, marginBottom: 8 }}>
                  {counselError}
                </Text>
                <Button
                  title={t('ai.configurer_cle')}
                  variant="secondary"
                  onPress={() => router.push('/ai-settings')}
                />
              </View>
            )}

            {runningCounsel && (
              <View style={[styles.subSectionCard, { alignItems: 'center', paddingVertical: 20 }]}>
                <ActivityIndicator size="large" color={C.accent} />
                <Text
                  style={[
                    styles.subSectionTitle,
                    { textAlign: 'center', marginTop: 10, marginBottom: 6 },
                  ]}
                >
                  {t('ai.synthese_en_cours', { name: asset.longName, symbol: asset.symbol })}
                </Text>
                <Text style={styles.footnote}>{t('ai.etape_1')}</Text>
                <Text style={styles.footnote}>{t('ai.etape_2')}</Text>
                <Text style={styles.footnote}>{t('ai.etape_3')}</Text>
                <Text style={styles.footnote}>{t('ai.etape_4')}</Text>
              </View>
            )}

            {!runningCounsel && !currentReport && !counselError && (
              <View style={styles.subSectionCard}>
                <Text style={styles.subSectionTitle}>
                  {t('ai.pret_titre', { name: asset.longName, symbol: asset.symbol })}
                </Text>
                <Text style={styles.histCallout}>{t('ai.pret_desc')}</Text>
              </View>
            )}

            {!runningCounsel && currentReport && (
              <View>
                {geminiStructured && (
                  <>
                    {/* 1. Verdict Exécutif & Valeur Intrinsèque */}
                    <View style={styles.verdictBanner}>
                      <View style={styles.badgesRow}>
                        <View
                          style={[
                            styles.verdictPill,
                            {
                              backgroundColor:
                                geminiStructured.verdict === 'STRONG BUY' ||
                                geminiStructured.verdict === 'BUY' ||
                                geminiStructured.verdict === 'ACCUMULATE'
                                  ? C.positive
                                  : geminiStructured.verdict === 'REDUCE' ||
                                      geminiStructured.verdict === 'SELL'
                                    ? C.negative
                                    : C.warning,
                            },
                          ]}
                        >
                          <Text style={[styles.verdictPillText, { color: '#0A0A0A' }]}>
                            {geminiStructured.verdict}
                          </Text>
                        </View>
                        <View style={styles.metaBadge}>
                          <Text style={styles.metaBadgeText}>
                            {t('ai.conviction', { score: geminiStructured.confidenceScore })}
                          </Text>
                        </View>
                        {geminiStructured.intrinsicValueEstimate?.valuationStatus && (
                          <View style={styles.metaBadge}>
                            <Text style={styles.metaBadgeText}>
                              {geminiStructured.intrinsicValueEstimate.valuationStatus}
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text style={styles.executiveThesis}>
                        {geminiStructured.executiveThesis}
                      </Text>

                      {geminiStructured.intrinsicValueEstimate && (
                        <View style={styles.ivBox}>
                          <Text style={styles.ivTitle}>{t('ai.valeur_intrinseque')}</Text>
                          <View style={styles.ivRow}>
                            <View style={styles.ivCol}>
                              <Text style={styles.ivLabel}>{t('ai.vi_conservateur')}</Text>
                              <Text style={styles.ivVal}>
                                {formatAssetCurrency(
                                  geminiStructured.intrinsicValueEstimate.low,
                                  asset.currency
                                )}
                              </Text>
                            </View>
                            <View style={styles.ivCol}>
                              <Text style={[styles.ivLabel, { color: C.accent }]}>
                                {t('ai.vi_juste')}
                              </Text>
                              <Text style={[styles.ivVal, { color: C.accent }]}>
                                {formatAssetCurrency(
                                  geminiStructured.intrinsicValueEstimate.fair,
                                  asset.currency
                                )}
                              </Text>
                            </View>
                            <View style={styles.ivCol}>
                              <Text style={styles.ivLabel}>{t('ai.vi_optimiste')}</Text>
                              <Text style={styles.ivVal}>
                                {formatAssetCurrency(
                                  geminiStructured.intrinsicValueEstimate.high,
                                  asset.currency
                                )}
                              </Text>
                            </View>
                          </View>
                          {geminiStructured.intrinsicValueEstimate.methodology ? (
                            <Text style={styles.ivMethod}>
                              {geminiStructured.intrinsicValueEstimate.methodology}
                            </Text>
                          ) : null}
                        </View>
                      )}
                    </View>

                    {/* 2. Multiples de valorisation */}
                    {geminiStructured.valuationMultiples && (
                      <View style={styles.subSectionCard}>
                        <Text style={styles.subSectionTitle}>{t('ai.multiples_titre')}</Text>
                        <View style={styles.multRow}>
                          <Text style={styles.multLabel}>{t('ai.pe_trailing')}</Text>
                          <Text style={styles.multVal}>
                            {geminiStructured.valuationMultiples.trailingPE || '—'}
                          </Text>
                        </View>
                        <View style={styles.multRow}>
                          <Text style={styles.multLabel}>{t('ai.pe_forward')}</Text>
                          <Text style={styles.multVal}>
                            {geminiStructured.valuationMultiples.forwardPE || '—'}
                          </Text>
                        </View>
                        <View style={styles.multRow}>
                          <Text style={styles.multLabel}>{t('ai.peg_ev')}</Text>
                          <Text style={styles.multVal}>
                            {geminiStructured.valuationMultiples.pegOrEvEbitda || '—'}
                          </Text>
                        </View>
                        <View style={styles.multRow}>
                          <Text style={styles.multLabel}>{t('ai.ps_pb')}</Text>
                          <Text style={styles.multVal}>
                            {geminiStructured.valuationMultiples.priceToBookOrSales || '—'}
                          </Text>
                        </View>
                        <View style={[styles.multRow, { borderBottomWidth: 0 }]}>
                          <Text style={styles.multLabel}>{t('ai.rendement_ter')}</Text>
                          <Text style={styles.multVal}>
                            {geminiStructured.valuationMultiples.dividendOrExpenseRatio || '—'}
                          </Text>
                        </View>
                        {geminiStructured.valuationMultiples.historicalComparison ? (
                          <Text style={styles.histCallout}>
                            <Text style={{ fontWeight: '700', color: C.text }}>
                              {t('ai.comparaison_5a')}{' '}
                            </Text>
                            {geminiStructured.valuationMultiples.historicalComparison}
                          </Text>
                        ) : null}
                      </View>
                    )}

                    {/* 3. Matrice factorielle 6 facteurs */}
                    {geminiStructured.factorScores && (
                      <View style={styles.subSectionCard}>
                        <Text style={styles.subSectionTitle}>{t('ai.facteurs_titre')}</Text>
                        {[
                          {
                            label: t('ai.facteur_valorisation'),
                            val: geminiStructured.factorScores.valuation ?? 50,
                          },
                          {
                            label: t('ai.facteur_fondamentaux'),
                            val: geminiStructured.factorScores.fundamentals ?? 50,
                          },
                          {
                            label: t('ai.facteur_technique'),
                            val: geminiStructured.factorScores.technicals ?? 50,
                          },
                          {
                            label: t('ai.facteur_macro'),
                            val: geminiStructured.factorScores.macroResilience ?? 50,
                          },
                          {
                            label: t('ai.facteur_geopolitique'),
                            val: geminiStructured.factorScores.geopoliticalSafety ?? 50,
                          },
                          {
                            label: t('ai.facteur_momentum'),
                            val: geminiStructured.factorScores.momentum ?? 50,
                          },
                        ].map((f, i) => {
                          const fColor =
                            f.val >= 65 ? C.positive : f.val <= 40 ? C.negative : C.accent;
                          return (
                            <View key={i} style={styles.factorItem}>
                              <View style={styles.factorTop}>
                                <Text style={styles.factorLabel}>{f.label}</Text>
                                <Text style={styles.factorScore}>{f.val}/100</Text>
                              </View>
                              <ProgressBar ratio={f.val / 100} color={fColor} height={7} />
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* 4. Situation mondiale & Risques géopolitiques */}
                    {geminiStructured.geopoliticalAssessment && (
                      <View style={styles.subSectionCard}>
                        <View style={styles.cardHeadRow}>
                          <Text style={[styles.subSectionTitle, { marginBottom: 0, flex: 1 }]}>
                            {t('ai.geopolitique_titre')}
                          </Text>
                          <View style={styles.metaBadge}>
                            <Text style={styles.metaBadgeText}>
                              {t('ai.risque_geo', {
                                level: geminiStructured.geopoliticalAssessment.riskLevel,
                              })}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.geoBlock}>
                          <Text style={styles.geoHeading}>{t('ai.geo_conflits')}</Text>
                          <Text style={styles.geoBody}>
                            {geminiStructured.geopoliticalAssessment.conflictAndWarImpact}
                          </Text>
                        </View>
                        <View style={styles.geoBlock}>
                          <Text style={styles.geoHeading}>{t('ai.geo_supply')}</Text>
                          <Text style={styles.geoBody}>
                            {geminiStructured.geopoliticalAssessment.supplyChainAndTradeExposure}
                          </Text>
                        </View>
                        <View style={styles.geoBlock}>
                          <Text style={styles.geoHeading}>{t('ai.geo_macro')}</Text>
                          <Text style={styles.geoBody}>
                            {geminiStructured.geopoliticalAssessment.regionalMacroSensitivity}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* 5. Catalyseurs & Risques */}
                    {(geminiStructured.keyCatalysts?.length > 0 ||
                      geminiStructured.keyRisks?.length > 0) && (
                      <View style={styles.subSectionCard}>
                        {geminiStructured.keyCatalysts?.length > 0 && (
                          <View style={{ marginBottom: 10 }}>
                            <Text style={[styles.subSectionTitle, { color: C.positive }]}>
                              {t('ai.catalyseurs_titre')}
                            </Text>
                            {geminiStructured.keyCatalysts.map((c, idx) => (
                              <View key={idx} style={styles.bulletRow}>
                                <Text style={[styles.bulletDot, { color: C.positive }]}>+</Text>
                                <Text style={styles.bulletText}>{c}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        {geminiStructured.keyRisks?.length > 0 && (
                          <View>
                            <Text style={[styles.subSectionTitle, { color: C.negative }]}>
                              {t('ai.risques_titre')}
                            </Text>
                            {geminiStructured.keyRisks.map((r, idx) => (
                              <View key={idx} style={styles.bulletRow}>
                                <Text style={[styles.bulletDot, { color: C.negative }]}>!</Text>
                                <Text style={styles.bulletText}>{r}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    )}

                    {/* 6. Playbook de positionnement */}
                    {geminiStructured.tradeAndPositioning && (
                      <View style={styles.subSectionCard}>
                        <Text style={styles.subSectionTitle}>{t('ai.playbook_titre')}</Text>
                        <View style={styles.pbItem}>
                          <Text style={styles.pbLabel}>{t('ai.pb_entree')}</Text>
                          <Text style={styles.pbVal}>
                            {geminiStructured.tradeAndPositioning.idealEntryZone}
                          </Text>
                        </View>
                        <View style={styles.pbItem}>
                          <Text style={styles.pbLabel}>{t('ai.pb_stoploss')}</Text>
                          <Text style={[styles.pbVal, { color: C.negative }]}>
                            {geminiStructured.tradeAndPositioning.invalidationStopLoss}
                          </Text>
                        </View>
                        <View style={styles.pbItem}>
                          <Text style={styles.pbLabel}>{t('ai.pb_objectifs')}</Text>
                          <Text style={[styles.pbVal, { color: C.positive }]}>
                            {geminiStructured.tradeAndPositioning.takeProfitTargets}
                          </Text>
                        </View>
                        <View style={[styles.pbItem, { borderBottomWidth: 0 }]}>
                          <Text style={styles.pbLabel}>{t('ai.pb_allocation')}</Text>
                          <Text style={styles.pbVal}>
                            {geminiStructured.tradeAndPositioning.portfolioAllocationGuidance} (
                            {geminiStructured.tradeAndPositioning.recommendedHorizon})
                          </Text>
                        </View>
                      </View>
                    )}
                  </>
                )}

                {/* 7. Rapport Markdown complet en 8 sections */}
                <View style={styles.subSectionCard}>
                  <View style={styles.cardHeadRow}>
                    <Text style={[styles.subSectionTitle, { marginBottom: 0 }]}>
                      {t('ai.rapport_complet')} ({currentReport.model})
                    </Text>
                    <Pressable onPress={() => setShowFullReport((v) => !v)}>
                      <Text style={{ color: C.accent, fontSize: 12, fontWeight: '600' }}>
                        {showFullReport ? t('ai.masquer_rapport') : t('ai.afficher_rapport')}
                      </Text>
                    </Pressable>
                  </View>
                  {showFullReport && <SimpleMarkdownView markdown={currentReport.markdownReport} />}
                </View>

                {/* 8. Sources Google Search Grounding */}
                {currentReport.groundingSources.length > 0 && (
                  <View style={styles.subSectionCard}>
                    <Text style={styles.subSectionTitle}>
                      {t('ai.sources_grounding', {
                        count: currentReport.groundingSources.length,
                      })}
                    </Text>
                    <View style={styles.badgesRow}>
                      {currentReport.groundingSources.map((src, i) => (
                        <Pressable
                          key={i}
                          onPress={() => Linking.openURL(src.uri)}
                          style={styles.metaBadge}
                        >
                          <Text style={[styles.metaBadgeText, { color: C.accent }]}>
                            {src.title} ↗
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </Card>

          {/* ── 5. Fil d'actualités de marché ── */}
          {asset.news && asset.news.length > 0 && (
            <Card>
              <Text style={styles.cardTitle}>
                {t('ai.actualites_titre', { symbol: asset.symbol })}
              </Text>
              {asset.news.slice(0, 6).map((item, idx) => (
                <Pressable
                  key={item.uuid || idx}
                  onPress={() => item.link && Linking.openURL(item.link)}
                  style={styles.newsItem}
                >
                  <View style={styles.newsMeta}>
                    <Text style={styles.newsPub}>{item.publisher}</Text>
                    <Text style={styles.newsDate}>
                      {new Date(item.publishTime).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text style={styles.newsTitle}>{item.title}</Text>
                </Pressable>
              ))}
            </Card>
          )}
        </>
      )}
    </View>
  );
}

function FanChartSvg({
  fanChart,
  width,
  currency,
  gradId,
  todayLabel,
  histLabel,
  forecastLabel,
}: {
  fanChart: {
    histSampled: PricePoint[];
    spot: number;
    bear3: number;
    base3: number;
    bull3: number;
    bear12: number;
    base12: number;
    bull12: number;
    minP: number;
    maxP: number;
  };
  width: number;
  currency: string;
  gradId: string;
  todayLabel: string;
  histLabel: string;
  forecastLabel: string;
}) {
  const fanWidth = Math.max(300, width);
  const fanHeight = 185;
  const splitX = Math.round(fanWidth * 0.46);
  const x3M = Math.round(fanWidth * 0.62);
  const x12M = fanWidth - 24;

  const mapY = (price: number) => {
    const denom = fanChart.maxP - fanChart.minP || 1;
    return 18 + (fanHeight - 42) * (1 - (price - fanChart.minP) / denom);
  };

  const histPath = fanChart.histSampled
    .map((p, idx) => {
      const x = 16 + (idx / Math.max(1, fanChart.histSampled.length - 1)) * (splitX - 16);
      const y = mapY(p.close);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const spotY = mapY(fanChart.spot);
  const bull3Y = mapY(fanChart.bull3);
  const base3Y = mapY(fanChart.base3);
  const bear3Y = mapY(fanChart.bear3);
  const bull12Y = mapY(fanChart.bull12);
  const base12Y = mapY(fanChart.base12);
  const bear12Y = mapY(fanChart.bear12);

  return (
    <Svg width={fanWidth} height={fanHeight}>
      <Defs>
        <LinearGradient id={`fanBull-${gradId}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor={C.positive} stopOpacity="0.06" />
          <Stop offset="100%" stopColor={C.positive} stopOpacity="0.22" />
        </LinearGradient>
        <LinearGradient id={`fanBear-${gradId}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%" stopColor={C.negative} stopOpacity="0.06" />
          <Stop offset="100%" stopColor={C.negative} stopOpacity="0.22" />
        </LinearGradient>
      </Defs>

      <Polygon
        points={`${splitX},${spotY} ${x3M},${bull3Y} ${x12M},${bull12Y} ${x12M},${base12Y} ${x3M},${base3Y}`}
        fill={`url(#fanBull-${gradId})`}
      />
      <Polygon
        points={`${splitX},${spotY} ${x3M},${base3Y} ${x12M},${base12Y} ${x12M},${bear12Y} ${x3M},${bear3Y}`}
        fill={`url(#fanBear-${gradId})`}
      />

      <Line
        x1={splitX}
        y1={14}
        x2={splitX}
        y2={fanHeight - 22}
        stroke={C.border}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <SvgText x={splitX} y={fanHeight - 6} textAnchor="middle" fill={C.textDim} fontSize="10">
        {todayLabel} ({formatAssetCurrency(fanChart.spot, currency)})
      </SvgText>
      <SvgText x={20} y={fanHeight - 6} textAnchor="start" fill={C.textFaint} fontSize="10">
        {histLabel}
      </SvgText>
      <SvgText x={x3M} y={fanHeight - 6} textAnchor="middle" fill={C.textFaint} fontSize="10">
        +3M
      </SvgText>
      <SvgText x={x12M} y={fanHeight - 6} textAnchor="end" fill={C.textDim} fontSize="10">
        {forecastLabel}
      </SvgText>

      {histPath ? (
        <Path d={histPath} fill="none" stroke={C.accent} strokeWidth={2.2} strokeLinecap="round" />
      ) : null}

      <Polyline
        points={`${splitX},${spotY} ${x3M},${bull3Y} ${x12M},${bull12Y}`}
        fill="none"
        stroke={C.positive}
        strokeWidth={1.8}
        strokeDasharray="4 3"
      />
      <Polyline
        points={`${splitX},${spotY} ${x3M},${base3Y} ${x12M},${base12Y}`}
        fill="none"
        stroke={C.text}
        strokeWidth={2}
      />
      <Polyline
        points={`${splitX},${spotY} ${x3M},${bear3Y} ${x12M},${bear12Y}`}
        fill="none"
        stroke={C.negative}
        strokeWidth={1.8}
        strokeDasharray="4 3"
      />

      <Circle cx={splitX} cy={spotY} r={4} fill={C.accent} />
      <Circle cx={x12M} cy={bull12Y} r={3.5} fill={C.positive} />
      <Circle cx={x12M} cy={base12Y} r={4} fill={C.text} />
      <Circle cx={x12M} cy={bear12Y} r={3.5} fill={C.negative} />

      <SvgText
        x={x12M - 6}
        y={Math.max(13, bull12Y - 6)}
        textAnchor="end"
        fill={C.positive}
        fontSize="10"
        fontWeight="bold"
      >
        Bull: {formatAssetCurrency(fanChart.bull12, currency)}
      </SvgText>
      <SvgText
        x={x12M - 6}
        y={base12Y - 6}
        textAnchor="end"
        fill={C.text}
        fontSize="10"
        fontWeight="bold"
      >
        Base: {formatAssetCurrency(fanChart.base12, currency)}
      </SvgText>
      <SvgText
        x={x12M - 6}
        y={Math.min(fanHeight - 24, bear12Y + 12)}
        textAnchor="end"
        fill={C.negative}
        fontSize="10"
        fontWeight="bold"
      >
        Bear: {formatAssetCurrency(fanChart.bear12, currency)}
      </SvgText>
    </Svg>
  );
}
