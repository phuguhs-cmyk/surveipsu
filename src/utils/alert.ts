import { Alert as RNAlert, Platform } from 'react-native';

export type AlertButton = {
  text?: string;
  onPress?: (value?: string) => void;
  style?: 'default' | 'cancel' | 'destructive';
};

/**
 * Cross-platform replacement for React Native's `Alert.alert`.
 *
 * `react-native-web` ships `Alert.alert` as a no-op (`static alert() {}`),
 * so on web browsers none of the app's confirmation/info dialogs (e.g.
 * "Keluar", "Hapus") ever appear and their `onPress` callbacks never run.
 * This wrapper falls back to native browser `window.confirm`/`window.alert`
 * on web, while delegating to the real `Alert.alert` on native platforms.
 */
function alert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    RNAlert.alert(title, message, buttons as any);
    return;
  }

  const text = [title, message].filter(Boolean).join('\n\n');
  const list = buttons && buttons.length > 0 ? buttons : [{ text: 'OK', style: 'default' as const }];

  const hasCancel = list.some((b) => b.style === 'cancel');
  const actionButtons = list.filter((b) => b.style !== 'cancel');

  if (list.length === 1) {
    window.alert(text);
    list[0].onPress?.();
    return;
  }

  if (hasCancel) {
    const confirmed = window.confirm(text);
    if (confirmed) {
      const confirmButton =
        actionButtons.find((b) => b.style === 'destructive') || actionButtons[0];
      confirmButton?.onPress?.();
    } else {
      list.find((b) => b.style === 'cancel')?.onPress?.();
    }
    return;
  }

  window.alert(text);
  list[0]?.onPress?.();
}

export const Alert = { alert };
export default Alert;
