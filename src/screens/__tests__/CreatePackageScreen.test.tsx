import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react-native';
import CreatePackageScreen from '../CreatePackageScreen';
import * as packageService from '../../services/packageService';
import * as wilayahService from '../../services/wilayahService';
import * as locationService from '../../services/locationService';
import { Alert } from '../../utils/alert';

// Service async (AsyncStorage/fetch/GPS) di-mock supaya perilaku layar bisa
// dikendalikan penuh per skenario, mengikuti pola LoginScreen.test.tsx.
jest.mock('../../services/packageService');
jest.mock('../../services/wilayahService');
jest.mock('../../services/locationService');

// SearchableSelectModal & CoordinatePickerModal memakai Modal/WebView native
// yang kompleks untuk dites lewat UI sungguhan; di sini kita ganti dengan
// stub sederhana yang cukup untuk memverifikasi bahwa CreatePackageScreen
// memanggil callback onSelect/onConfirm dengan benar saat modal "dipakai".
jest.mock('../../components/SearchableSelectModal', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return function MockSearchableSelectModal({ visible, title, options, onSelect }: any) {
    if (!visible) return null;
    return (
      <TouchableOpacity onPress={() => onSelect(options[0])}>
        <Text>{`mock-select:${title}`}</Text>
      </TouchableOpacity>
    );
  };
});
jest.mock('../../components/CoordinatePickerModal', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return function MockCoordinatePickerModal({ visible, onConfirm }: any) {
    if (!visible) return null;
    return (
      <TouchableOpacity onPress={() => onConfirm(-7.1, 109.5)}>
        <Text>mock-confirm-coordinate</Text>
      </TouchableOpacity>
    );
  };
});

const mockedPackageService = packageService as jest.Mocked<typeof packageService>;
const mockedWilayahService = wilayahService as jest.Mocked<typeof wilayahService>;
const mockedLocationService = locationService as jest.Mocked<typeof locationService>;

afterEach(cleanup);

async function renderScreen(params: Record<string, any> = { surveyorName: 'Budi' }) {
  const navigation = {
    navigate: jest.fn(),
    replace: jest.fn(),
    goBack: jest.fn(),
  } as any;
  await render(<CreatePackageScreen navigation={navigation} route={{ params } as any} />);
  return { navigation };
}

/**
 * Membuka dropdown Kecamatan lalu Desa/Kelurahan berturut-turut memakai
 * mock SearchableSelectModal di atas (yang selalu memilih options[0]).
 * Helper ini dipisah karena dipakai berulang di beberapa skenario submit.
 */
async function pilihWilayah() {
  // getWilayahList() dipanggil async di useEffect; tunggu sampai daftar
  // opsi Kecamatan benar-benar termuat sebelum membuka dropdown, supaya
  // mock SearchableSelectModal (yang memilih options[0]) tidak memanggil
  // onSelect(undefined) akibat options masih kosong.
  await waitFor(() => {
    expect(mockedWilayahService.getWilayahList).toHaveBeenCalled();
  });
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.press(screen.getByText('Pilih Kecamatan'));
  const kecamatanOption = await screen.findByText('mock-select:Pilih Kecamatan');
  await act(async () => {
    fireEvent.press(kecamatanOption);
    await Promise.resolve();
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(screen.getByText('Pilih Desa/Kelurahan')).toBeTruthy();
  });
  fireEvent.press(screen.getByText('Pilih Desa/Kelurahan'));
  const desaOption = await screen.findByText('mock-select:Pilih Desa/Kelurahan');
  await act(async () => {
    fireEvent.press(desaOption);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('CreatePackageScreen', () => {
  beforeEach(() => {
    mockedWilayahService.getWilayahList.mockResolvedValue([
      { kecamatan: 'Banjarnegara', desa: 'Kutabanjarnegara', kode: '01' } as any,
    ]);
    mockedWilayahService.getKecamatanNames.mockReturnValue(['Banjarnegara']);
    mockedWilayahService.getDesaByKecamatan.mockReturnValue([
      { kecamatan: 'Banjarnegara', desa: 'Kutabanjarnegara', kode: '01' } as any,
    ]);
    mockedLocationService.getCurrentLocation.mockResolvedValue({ latitude: -7.5, longitude: 109.7 } as any);
  });

  it('menampilkan judul mode buat paket baru', async () => {
    await renderScreen();
    expect(await screen.findByText('Buat Paket Pekerjaan')).toBeTruthy();
    expect(screen.getByText('+ Buat Paket')).toBeTruthy();
  });

  it('menampilkan judul mode ubah paket ketika editPackageId diberikan', async () => {
    mockedPackageService.getPackageById.mockResolvedValue({
      id: 'pkg-1',
      name: 'Paket Lama',
      latitude: -7.2,
      longitude: 109.6,
    } as any);

    await renderScreen({ surveyorName: 'Budi', editPackageId: 'pkg-1', packageName: 'Paket Lama' });

    expect(await screen.findByText('Ubah Paket')).toBeTruthy();
    expect(screen.getByText('Simpan Perubahan')).toBeTruthy();
  });

  it('menampilkan alert saat wilayah belum dipilih meski nama sudah diisi', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderScreen();
    await screen.findByText('Buat Paket Pekerjaan');

    // Tombol dinonaktifkan saat nama kosong (lihat disabled={!newPackageName.trim()}),
    // jadi untuk memicu cabang validasi "Wilayah Wajib" di handleCreatePackage
    // kita isi nama tapi TIDAK memilih kecamatan/desa.
    fireEvent.changeText(
      screen.getByPlaceholderText('Contoh: Peningkatan Jalan Desa Sukamaju 2026'),
      'Paket Baru'
    );
    await waitFor(() => {
      expect(screen.getByDisplayValue('Paket Baru')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('+ Buat Paket'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Wilayah Wajib Dipilih',
        'Pilih kecamatan dan desa/kelurahan paket terlebih dahulu.'
      );
    });
    alertSpy.mockRestore();
  });

  it('menampilkan alert saat jenis pekerjaan belum dipilih meski nama & wilayah sudah diisi', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderScreen();
    await screen.findByText('Buat Paket Pekerjaan');

    fireEvent.changeText(
      screen.getByPlaceholderText('Contoh: Peningkatan Jalan Desa Sukamaju 2026'),
      'Paket Baru'
    );
    await pilihWilayah();

    fireEvent.press(screen.getByText('+ Buat Paket'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Pilih Jenis Pekerjaan',
        'Pilih minimal satu jenis pekerjaan untuk paket ini.'
      );
    });
    alertSpy.mockRestore();
  });

  it('mengambil koordinat GPS saat tombol "Ambil GPS Saat Ini" ditekan', async () => {
    await renderScreen();
    await screen.findByText('Buat Paket Pekerjaan');

    fireEvent.press(screen.getByText('Ambil GPS Saat Ini'));

    await waitFor(() => {
      expect(mockedLocationService.getCurrentLocation).toHaveBeenCalled();
    });
    expect(await screen.findByDisplayValue('-7.5')).toBeTruthy();
    expect(screen.getByDisplayValue('109.7')).toBeTruthy();
  });

  it('menampilkan alert saat gagal mengambil GPS', async () => {
    mockedLocationService.getCurrentLocation.mockRejectedValueOnce(new Error('GPS mati'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderScreen();
    await screen.findByText('Buat Paket Pekerjaan');

    fireEvent.press(screen.getByText('Ambil GPS Saat Ini'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Lokasi Saat Ini Tidak Tersedia', 'GPS mati');
    });
    alertSpy.mockRestore();
  });

  it('menampilkan koordinat hasil pilih di peta setelah CoordinatePickerModal dikonfirmasi', async () => {
    await renderScreen();
    await screen.findByText('Buat Paket Pekerjaan');

    fireEvent.press(screen.getByText('🗺️ Pilih di Peta'));
    fireEvent.press(await screen.findByText('mock-confirm-coordinate'));

    expect(await screen.findByDisplayValue('-7.1')).toBeTruthy();
    expect(screen.getByDisplayValue('109.5')).toBeTruthy();
  });

  it('navigasi ke layar Antrian saat link Antrian ditekan', async () => {
    const { navigation } = await renderScreen();
    await screen.findByText('Buat Paket Pekerjaan');

    fireEvent.press(screen.getByText('Antrian'));

    expect(navigation.navigate).toHaveBeenCalledWith('Queue');
  });

  it('membuat paket baru dan navigasi ke PackageDetail saat submit berhasil', async () => {
    mockedPackageService.createPackage.mockResolvedValue({ id: 'pkg-9', name: 'Paket Baru' } as any);
    const { navigation } = await renderScreen();
    await screen.findByText('Buat Paket Pekerjaan');

    fireEvent.changeText(
      screen.getByPlaceholderText('Contoh: Peningkatan Jalan Desa Sukamaju 2026'),
      'Paket Baru'
    );
    await pilihWilayah();
    fireEvent.press(screen.getByText('Jalan'));
    await waitFor(() => {
      expect(screen.getByText('✓ Jalan')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('+ Buat Paket'));

    await waitFor(() => {
      expect(mockedPackageService.createPackage).toHaveBeenCalledWith(
        'Paket Baru',
        'Budi',
        ['Jalan'],
        'Banjarnegara',
        'Kutabanjarnegara',
        undefined,
        undefined
      );
    });
    expect(navigation.replace).toHaveBeenCalledWith('PackageDetail', {
      packageId: 'pkg-9',
      packageName: 'Paket Baru',
      surveyorName: 'Budi',
    });
  });

  it('menampilkan alert gagal saat createPackage melempar error', async () => {
    mockedPackageService.createPackage.mockRejectedValue(new Error('Server sibuk'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderScreen();
    await screen.findByText('Buat Paket Pekerjaan');

    fireEvent.changeText(
      screen.getByPlaceholderText('Contoh: Peningkatan Jalan Desa Sukamaju 2026'),
      'Paket Baru'
    );
    await pilihWilayah();
    fireEvent.press(screen.getByText('Jalan'));
    await waitFor(() => {
      expect(screen.getByText('✓ Jalan')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('+ Buat Paket'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Gagal Membuat Paket', 'Server sibuk');
    });
    alertSpy.mockRestore();
  });

  it('menyimpan perubahan nama paket saat mode ubah paket disubmit', async () => {
    mockedPackageService.getPackageById.mockResolvedValue({
      id: 'pkg-1',
      name: 'Paket Lama',
    } as any);
    mockedPackageService.renamePackageEverywhere.mockResolvedValue(undefined as any);

    const { navigation } = await renderScreen({
      surveyorName: 'Budi',
      editPackageId: 'pkg-1',
      packageName: 'Paket Lama',
      kecamatan: 'Banjarnegara',
      desaKelurahan: 'Kutabanjarnegara',
    });
    await screen.findByText('Ubah Paket');

    fireEvent.changeText(screen.getByDisplayValue('Paket Lama'), 'Paket Lama Diubah');
    await waitFor(() => {
      expect(screen.getByDisplayValue('Paket Lama Diubah')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Simpan Perubahan'));

    await waitFor(() => {
      expect(mockedPackageService.renamePackageEverywhere).toHaveBeenCalledWith(
        'pkg-1',
        'Paket Lama Diubah',
        undefined,
        'Banjarnegara',
        'Kutabanjarnegara',
        undefined,
        undefined
      );
    });
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
