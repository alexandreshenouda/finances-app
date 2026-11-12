/** Carte enrichie d'une suggestion de diversification :
 * - Pastille de sévérité + Titre + Badge de catégorie
 * - Constat factuel et chiffré
 * - Accordéon interactif : Pourquoi c'est important + Piste d'action conforme AMF */
import { Card, Dot, FadeInView } from '@/components/ui';
import { C, FONT, RADIUS, useStyles } from '@/constants/theme';
import type { Insight, InsightCategory } from '@/lib/diversification';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

function makeStyles() {
  return StyleSheet.create({
    card: { paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    titleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 8,
      gap: 6,
    },
    title: {
      color: C.text,
      fontSize: FONT.md,
      fontWeight: '700',
      flexShrink: 1,
    },
    categoryBadge: {
      backgroundColor: C.cardAlt,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: RADIUS.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
    },
    categoryText: {
      color: C.textDim,
      fontSize: FONT.xs,
      fontWeight: '600',
    },
    observation: {
      color: C.text,
      fontSize: FONT.sm,
      lineHeight: 19,
    },
    toggleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      marginTop: 8,
      paddingVertical: 4,
    },
    toggleText: {
      color: C.accent,
      fontSize: FONT.sm,
      fontWeight: '600',
    },
    expandedContainer: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.border,
      gap: 8,
    },
    sectionBox: {
      backgroundColor: C.cardAlt,
      padding: 10,
      borderRadius: RADIUS.sm,
      borderLeftWidth: 3,
    },
    sectionBoxWhy: {
      borderLeftColor: C.accent,
    },
    sectionBoxAction: {
      borderLeftColor: C.positive,
    },
    sectionLabel: {
      fontSize: FONT.xs,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    labelWhy: {
      color: C.accent,
    },
    labelAction: {
      color: C.positive,
    },
    sectionContent: {
      color: C.text,
      fontSize: FONT.sm,
      lineHeight: 18,
    },
  });
}

export function InsightCard({ insight }: { insight: Insight }) {
  const styles = useStyles(makeStyles);
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const severityColors: Record<Insight['severity'], string> = {
    warning: C.warning,
    info: C.accent,
    positive: C.positive,
  };

  const hasAccordion = Boolean(insight.whyKey || insight.actionKey);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Dot color={severityColors[insight.severity]} size={8} />
          <Text style={styles.title}>{t(insight.titleKey, insight.params)}</Text>
        </View>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>
            {t(`diversification.category_${insight.category}`)}
          </Text>
        </View>
      </View>

      <Text style={styles.observation}>{t(insight.observationKey, insight.params)}</Text>

      {hasAccordion && (
        <>
          <Pressable
            style={({ pressed }) => [styles.toggleBtn, pressed && { opacity: 0.65 }]}
            onPress={() => setExpanded((prev) => !prev)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
          >
            <Text style={styles.toggleText}>
              {expanded ? t('diversification.replier') : t('diversification.comprendre_agir')}
            </Text>
          </Pressable>

          {expanded && (
            <FadeInView style={styles.expandedContainer}>
              {insight.whyKey && (
                <View style={[styles.sectionBox, styles.sectionBoxWhy]}>
                  <Text style={[styles.sectionLabel, styles.labelWhy]}>
                    💡 {t('diversification.pourquoi_important')}
                  </Text>
                  <Text style={styles.sectionContent}>{t(insight.whyKey, insight.params)}</Text>
                </View>
              )}

              {insight.actionKey && (
                <View style={[styles.sectionBox, styles.sectionBoxAction]}>
                  <Text style={[styles.sectionLabel, styles.labelAction]}>
                    🎯 {t('diversification.piste_action')}
                  </Text>
                  <Text style={styles.sectionContent}>{t(insight.actionKey, insight.params)}</Text>
                </View>
              )}
            </FadeInView>
          )}
        </>
      )}
    </Card>
  );
}
