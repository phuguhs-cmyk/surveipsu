/**
 * @jest-environment jsdom
 *
 * Alert.alert bercabang berdasarkan Platform.OS: di web ia memakai
 * window.alert/window.confirm milik browser (karena react-native-web
 * mengekspos Alert.alert sebagai no-op), sedangkan di native ia mendelegasikan
 * langsung ke RNAlert.alert. Untuk menguji cabang WEB, test ini di-render di
 * environment jsdom (window tersedia) dan me-mock 'react-native' agar
 * Platform.OS === 'web' (berbeda dari mock global 'android' di
 * test/mocks/react-native.js yang dipakai unit test lain).
 */
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Alert: { alert: jest.fn() },
}));

import { Alert } from '../alert';

describe('Alert.alert (web)', () => {
  let alertSpy: jest.SpyInstance;
  let confirmSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    alertSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it('memakai window.alert ketika hanya ada 1 tombol (atau tanpa tombol)', () => {
    const onPress = jest.fn();
    Alert.alert('Judul', 'Pesan', [{ text: 'OK', onPress }]);

    expect(alertSpy).toHaveBeenCalledWith('Judul\n\nPesan');
    expect(onPress).toHaveBeenCalled();
  });

  it('menggabungkan title & message dengan baris kosong, tanpa message jika tidak diberikan', () => {
    Alert.alert('Hanya Judul');
    expect(alertSpy).toHaveBeenCalledWith('Hanya Judul');
  });

  it('memakai window.alert default "OK" ketika buttons tidak diberikan sama sekali', () => {
    Alert.alert('Judul', 'Pesan');
    expect(alertSpy).toHaveBeenCalledWith('Judul\n\nPesan');
  });

  it('memakai window.confirm ketika ada tombol cancel, memanggil onPress destructive saat dikonfirmasi', () => {
    confirmSpy.mockReturnValue(true);
    const onCancel = jest.fn();
    const onDestructive = jest.fn();

    Alert.alert('Hapus?', 'Yakin?', [
      { text: 'Batal', style: 'cancel', onPress: onCancel },
      { text: 'Hapus', style: 'destructive', onPress: onDestructive },
    ]);

    expect(confirmSpy).toHaveBeenCalledWith('Hapus?\n\nYakin?');
    expect(onDestructive).toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('memanggil onPress cancel ketika window.confirm dibatalkan (return false)', () => {
    confirmSpy.mockReturnValue(false);
    const onCancel = jest.fn();
    const onConfirm = jest.fn();

    Alert.alert('Hapus?', 'Yakin?', [
      { text: 'Batal', style: 'cancel', onPress: onCancel },
      { text: 'Hapus', style: 'default', onPress: onConfirm },
    ]);

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('memilih tombol non-cancel pertama jika tidak ada tombol destructive saat dikonfirmasi', () => {
    confirmSpy.mockReturnValue(true);
    const onFirst = jest.fn();
    const onSecond = jest.fn();

    Alert.alert('Judul', 'Pesan', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Pilihan 1', style: 'default', onPress: onFirst },
      { text: 'Pilihan 2', style: 'default', onPress: onSecond },
    ]);

    expect(onFirst).toHaveBeenCalled();
    expect(onSecond).not.toHaveBeenCalled();
  });

  it('memakai window.alert (bukan confirm) ketika ada >1 tombol tanpa cancel', () => {
    const onFirst = jest.fn();
    Alert.alert('Judul', 'Pesan', [
      { text: 'Pilihan 1', onPress: onFirst },
      { text: 'Pilihan 2' },
    ]);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Judul\n\nPesan');
    expect(onFirst).toHaveBeenCalled();
  });

  it('tidak melempar error jika tombol tidak memiliki onPress', () => {
    expect(() => Alert.alert('Judul', 'Pesan', [{ text: 'OK' }])).not.toThrow();
  });
});
