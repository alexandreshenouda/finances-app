/** Tests des boîtes de dialogue thématisées (`src/lib/confirm.ts`) : le store qui
 *  alimente `<ThemedDialogContainer />` (le rendu lui-même n'est pas testé). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmAction, notify, useDialogStore } from '@/lib/confirm';

beforeEach(() => useDialogStore.getState().hideDialog());

describe('confirmAction', () => {
  it('ouvre une confirmation destructive « Supprimer / Annuler » par défaut', () => {
    const onConfirm = vi.fn();
    confirmAction('Supprimer ?', 'Irréversible', onConfirm);
    expect(useDialogStore.getState().current).toEqual({
      title: 'Supprimer ?',
      message: 'Irréversible',
      type: 'confirm',
      confirmText: 'Supprimer',
      cancelText: 'Annuler',
      destructive: true,
      onConfirm,
    });
  });

  it('respecte les libellés et le caractère non destructif fournis', () => {
    confirmAction('T', 'M', () => {}, { confirmText: 'Oui', cancelText: 'Non', destructive: false });
    expect(useDialogStore.getState().current).toMatchObject({
      confirmText: 'Oui',
      cancelText: 'Non',
      destructive: false,
    });
  });
});

describe('notify', () => {
  it('ouvre une simple alerte « OK » et transmet le callback de fermeture', () => {
    const onDismiss = vi.fn();
    notify('Info', 'Terminé', onDismiss);
    const current = useDialogStore.getState().current!;
    expect(current).toMatchObject({ title: 'Info', message: 'Terminé', type: 'alert', confirmText: 'OK' });
    current.onConfirm?.();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('se referme', () => {
    notify('Info', 'x');
    useDialogStore.getState().hideDialog();
    expect(useDialogStore.getState().current).toBeNull();
  });
});
