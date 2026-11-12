/**
 * Boîte de dialogue thématisée globale (alertes et confirmations).
 * Respecte la palette active de l'application (or ou classique) via useStyles(makeStyles).
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, FONT, RADIUS, SCRIM, useStyles } from '@/constants/theme';
import { useDialogStore } from '@/lib/confirm';
import { Button } from './ui';

function makeStyles() {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: SCRIM,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    dialogCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: C.card,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: C.border,
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.5,
      shadowRadius: 20,
      elevation: 12,
    },
    title: {
      color: C.text,
      fontSize: FONT.lg,
      fontWeight: '700',
      marginBottom: 10,
    },
    message: {
      color: C.textDim,
      fontSize: FONT.md,
      lineHeight: 21,
      marginBottom: 20,
    },
    buttonsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 10,
    },
    buttonItem: {
      minWidth: 84,
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginVertical: 0,
    },
  });
}

export function ThemedDialogContainer() {
  const styles = useStyles(makeStyles);
  const current = useDialogStore((s) => s.current);
  const hideDialog = useDialogStore((s) => s.hideDialog);

  if (!current) return null;

  const handleConfirm = () => {
    const fn = current.onConfirm;
    hideDialog();
    fn?.();
  };

  const handleCancel = () => {
    const fn = current.onCancel;
    hideDialog();
    fn?.();
  };

  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <Pressable style={styles.backdrop} onPress={handleCancel}>
        {/* Empêche le clic dans la boîte de dialogue de fermer le modal */}
        <Pressable style={styles.dialogCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.message}>{current.message}</Text>
          <View style={styles.buttonsRow}>
            {current.type === 'confirm' && (
              <Button
                title={current.cancelText ?? 'Annuler'}
                variant="secondary"
                onPress={handleCancel}
                style={styles.buttonItem}
              />
            )}
            <Button
              title={current.confirmText ?? 'OK'}
              variant={current.destructive ? 'danger' : 'primary'}
              onPress={handleConfirm}
              style={styles.buttonItem}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
