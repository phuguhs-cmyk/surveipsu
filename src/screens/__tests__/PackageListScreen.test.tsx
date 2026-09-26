import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import PackageListScreen from '../PackageListScreen';
import * as packageService from '../../services/packageService';
import * as apiService from '../../services/apiService';
import * as authService from '../../services/authService';
import { Alert } from '../../utils/alert';

// Semua service yang menyentuh AsyncStorage/fetch sungguhan di-mock supaya
// perilaku layar (render, search, load more, hapus paket, logout) bisa
// dikendalikan penuh per skenario, mengikuti pola LoginScreen.test.tsx.
jest.mock('../../services/packageService');
jest.mock('../../services/apiService');
jest.mock('../../services/authService');

const mockedPackageService = packageService as jest.Mocked<typeof packageService>;
const mockedApiService = apiService as jest.Mocked<typeof apiService>;
const mockedAuthService = authService as jest.Mocked<typeof authService>;

afterEach(cleanup);

function makePackage(overrides: Partial<packageService.WorkPackage> = {}): packageService.WorkPackage {
  return {
    id: 'pkg-1',
    name: 'Paket Jalan A',
    createdAt: '2024-01-01T00:00:00.000Z',
    surveyorName: 'Budi',
    itemCount: 2,
    posted: false,
    ...overrides,
  };
}

async function renderScreen(surveyorName = 'Budi') {
  const navigation = {
    navigate: jest.fn(),
    reset: jest.fn(),
  } as any;
  await render(
    <NavigationContainer>
      <PackageListScreen
        navigation={navigation}
        route={{ params: { surveyorName } } as any}
      />
    </NavigationContainer>
  );
  return { navigation };
}

describe('PackageListScreen', () => {
  beforeEach(() => {
    mockedPackageService.getPackages.mockResolvedValue([]);
    mockedPackageService.syncPackagesFromServer.mockResolvedValue(undefined);
    mockedPackageService.derivePackageStatus.mockImplementation(({ itemCount, isPosted }) =>
      isPosted ? 'posted' : itemCount > 0 ? 'in_progress' : 'draft'
    );
    mockedApiService.fetchSurveyList.mockResolvedValue([]);
    mockedAuthService.getCurrentUser.mockResolvedValue({
      username: 'budi',
      role: 'surveyor',
      permissions: { canEdit: true, canDelete: true },
    } as any);
  });

  it('menampilkan pesan kosong ketika belum ada paket tersimpan', async () => {
    await renderScreen();

    // Timeout dinaikkan (default Jest 5000ms) karena test ini sesekali
    // exceed timeout saat dijalankan bersamaan seluruh suite di mesin yang
    // sedang sibuk (CI/paralel test lain memakai CPU), padahal selalu lulus
    // saat dijalankan sendiri. findByText sendiri sudah punya retry-poll
    // internal (waitFor), jadi menaikkan batas waktu di sini aman dan tidak
    // menyembunyikan bug — hanya memberi ruang lebih untuk render async.
    expect(await screen.findByText(
      'Anda belum memiliki paket pekerjaan. Buat paket baru di atas, atau tekan "Semua Paket" untuk melihat paket surveyor lain.',
      {},
      { timeout: 10000 }
    )).toBeTruthy();
  }, 15000);

  it('menampilkan daftar paket yang sudah dimuat dari getPackages', async () => {
    mockedPackageService.getPackages.mockResolvedValue([makePackage()]);

    await renderScreen();

    expect(await screen.findByText('Paket Jalan A')).toBeTruthy();
    expect(screen.getByText('2 item pekerjaan tersimpan')).toBeTruthy();
  });

  it('memfilter paket berdasarkan teks pencarian (nama atau surveyor)', async () => {
    mockedPackageService.getPackages.mockResolvedValue([
      makePackage({ id: 'pkg-1', name: 'Paket Jalan A', surveyorName: 'Budi' }),
      makePackage({ id: 'pkg-2', name: 'Paket Drainase B', surveyorName: 'Siti' }),
    ]);

    await renderScreen();
    await screen.findByText('Paket Jalan A');

    // Paket kedua dimiliki surveyor lain ("Siti"), sedangkan filter cakupan
    // default adalah "Paket Saya" (hanya milik surveyor yang sedang login).
    // Pindah ke "Semua Paket" dulu supaya pencarian mencakup kedua paket.
    fireEvent.press(screen.getByText('Semua Paket'));
    await screen.findByText('Paket Drainase B');

    fireEvent.changeText(
      screen.getByPlaceholderText('Cari nama paket atau surveyor...'),
      'drainase'
    );

    await waitFor(() => {
      expect(screen.queryByText('Paket Jalan A')).toBeNull();
      expect(screen.getByText('Paket Drainase B')).toBeTruthy();
    });
    expect(screen.getByText('1 dari 2 paket ditemukan')).toBeTruthy();
  });

  it('menampilkan tombol "Muat lebih" saat paket melebihi ukuran halaman dan memuat sisanya saat ditekan', async () => {
    const packages = Array.from({ length: 14 }, (_, i) =>
      makePackage({
        id: `pkg-${i}`,
        name: `Paket ${i}`,
        createdAt: new Date(2024, 0, i + 1).toISOString(),
      })
    );
    mockedPackageService.getPackages.mockResolvedValue(packages);

    await renderScreen();
    // Diurutkan terbaru dulu (createdAt descending), jadi "Paket 13" muncul di halaman pertama.
    await screen.findByText('Paket 13');

    expect(screen.queryByText('Paket 1')).toBeNull();
    expect(screen.getByText('Muat lebih')).toBeTruthy();

    fireEvent.press(screen.getByText('Muat lebih'));

    await waitFor(() => {
      expect(screen.getByText('Paket 1')).toBeTruthy();
    });
  });

  it('meminta konfirmasi dan menghapus paket saat "Hapus Paket" ditekan lalu dikonfirmasi', async () => {
    mockedPackageService.getPackages.mockResolvedValue([makePackage()]);
    mockedPackageService.deletePackageEverywhere.mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const destructive = buttons?.find((b: any) => b.style === 'destructive');
      destructive?.onPress?.();
    });

    await renderScreen();
    await screen.findByText('Paket Jalan A');

    fireEvent.press(screen.getByText('Hapus Paket'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Hapus Paket Pekerjaan',
        expect.stringContaining('Paket Jalan A'),
        expect.any(Array)
      );
      expect(mockedPackageService.deletePackageEverywhere).toHaveBeenCalledWith('pkg-1', 'budi');
    });

    alertSpy.mockRestore();
  });

  it('tidak menampilkan tombol "Hapus Paket"/"Ubah Paket" ketika paket sudah posted', async () => {
    mockedPackageService.getPackages.mockResolvedValue([makePackage({ posted: true })]);

    await renderScreen();
    await screen.findByText('Paket Jalan A');

    expect(screen.queryByText('Hapus Paket')).toBeNull();
    expect(screen.queryByText('Ubah Paket')).toBeNull();
  });

  it('memanggil logout dan reset navigasi ke Login saat konfirmasi keluar diterima', async () => {
    mockedAuthService.logout.mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
      const destructive = buttons?.find((b: any) => b.style === 'destructive');
      destructive?.onPress?.();
    });

    const { navigation } = await renderScreen();
    await screen.findByPlaceholderText('Cari nama paket atau surveyor...');

    fireEvent.press(screen.getByText('Keluar'));

    await waitFor(() => {
      expect(mockedAuthService.logout).toHaveBeenCalled();
      expect(navigation.reset).toHaveBeenCalledWith({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    });

    alertSpy.mockRestore();
  });

  it('berpindah ke CreatePackage saat tautan "+ Buat Paket" ditekan', async () => {
    const { navigation } = await renderScreen();
    await screen.findByPlaceholderText('Cari nama paket atau surveyor...');

    fireEvent.press(screen.getByText('+ Buat Paket'));

    expect(navigation.navigate).toHaveBeenCalledWith('CreatePackage', { surveyorName: 'Budi' });
  });
});
