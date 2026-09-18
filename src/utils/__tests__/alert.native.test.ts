/**
 * Cabang NATIVE dari Alert.alert (Platform.OS !== 'web'): hanya
 * mendelegasikan langsung ke RNAlert.alert bawaan, tanpa logic tambahan.
 * Dites terpisah dari alert.test.ts (yang menguji cabang web) karena
 * modul 'react-native' di-mock berbeda per file (Platform.OS berbeda).
 */
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Alert: { alert: jest.fn() },
}));

import { Alert as RNAlert } from 'react-native';
import { Alert } from '../alert';

describe('Alert.alert (native)', () => {
  it('mendelegasikan langsung ke RNAlert.alert dengan title, message, dan buttons', () => {
    const buttons = [{ text: 'OK' }];
    Alert.alert('Judul', 'Pesan', buttons);

    expect(RNAlert.alert).toHaveBeenCalledWith('Judul', 'Pesan', buttons);
  });

  it('mendelegasikan tanpa message/buttons jika tidak diberikan', () => {
    Alert.alert('Hanya Judul');
    expect(RNAlert.alert).toHaveBeenCalledWith('Hanya Judul', undefined, undefined);
  });
});
