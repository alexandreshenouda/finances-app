/**
 * Boîtes de dialogue et alertes thématisées multiplateformes.
 * Remplace Alert.alert et confirm/alert natifs par un composant Modal React Native
 * qui respecte scrupuleusement la palette C de l'application (thème or / classique).
 */
import { create } from 'zustand';

export interface DialogOptions {
  title: string;
  message: string;
  type?: 'alert' | 'confirm';
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface DialogStoreState {
  current: DialogOptions | null;
  showDialog: (opts: DialogOptions) => void;
  hideDialog: () => void;
}

export const useDialogStore = create<DialogStoreState>((set) => ({
  current: null,
  showDialog: (opts) => set({ current: opts }),
  hideDialog: () => set({ current: null }),
}));

export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  options?: { confirmText?: string; cancelText?: string; destructive?: boolean }
): void {
  useDialogStore.getState().showDialog({
    title,
    message,
    type: 'confirm',
    confirmText: options?.confirmText ?? 'Supprimer',
    cancelText: options?.cancelText ?? 'Annuler',
    destructive: options?.destructive ?? true,
    onConfirm,
  });
}

export function notify(title: string, message: string, onDismiss?: () => void): void {
  useDialogStore.getState().showDialog({
    title,
    message,
    type: 'alert',
    confirmText: 'OK',
    onConfirm: onDismiss,
  });
}
