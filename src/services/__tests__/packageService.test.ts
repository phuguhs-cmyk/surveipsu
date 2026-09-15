import {
  getPackages,
  getPackageById,
  deletePackage,
  updatePackageAllowedTypes,
  syncPackagesFromServer,
  updatePackageCenterLocation,
  buildPackageMapMarkers,
  derivePackageStatus,
  createPackage,
  WorkPackage,
} from '../packageService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as apiService from '../apiService';
import { CONFIG } from '../../config';
import { parseCoordinate } from '../commonUtils';

jest.mock('../apiService');

function makePackage(overrides: Partial<WorkPackage> = {}): WorkPackage {
  return {
    id: 'pkg-1',
    name: 'Paket A',
    createdAt: '2024-01-01T00:00:00.000Z',
    surveyorName: 'Budi',
    itemCount: 0,
    ...overrides,
  };
}

async function seedPackages(packages: WorkPackage[]) {
  await AsyncStorage.setItem(CONFIG.STORAGE_KEYS.PACKAGES, JSON.stringify(packages));
}

describe('packageService', () => {
  afterEach(() => {
    (AsyncStorage as any).__reset();
    jest.clearAllMocks();
  });

  describe('getPackages', () => {
    it('mengurutkan paket dari yang terbaru (createdAt) di atas', async () => {
      const older = makePackage({ id: 'p1', createdAt: '2024-01-01T00:00:00.000Z' });
      const newer = makePackage({ id: 'p2', createdAt: '2024-06-01T00:00:00.000Z' });
      await seedPackages([older, newer]);

      const result = await getPackages();

      expect(result.map((p) => p.id)).toEqual(['p2', 'p1']);
    });

    it('mengembalikan array kosong jika belum ada paket tersimpan', async () => {
      await expect(getPackages()).resolves.toEqual([]);
    });
  });

  describe('getPackageById', () => {
    it('menemukan paket berdasarkan id', async () => {
      const pkg = makePackage({ id: 'p1' });
      await seedPackages([pkg]);
      await expect(getPackageById('p1')).resolves.toEqual(pkg);
    });

    it('mengembalikan undefined jika id tidak ditemukan', async () => {
      await seedPackages([makePackage({ id: 'p1' })]);
      await expect(getPackageById('tidak-ada')).resolves.toBeUndefined();
    });
  });

  describe('deletePackage', () => {
    it('menghapus paket dari penyimpanan lokal berdasarkan id', async () => {
      await seedPackages([makePackage({ id: 'p1' }), makePackage({ id: 'p2' })]);

      await deletePackage('p1');

      const remaining = await getPackages();
      expect(remaining.map((p) => p.id)).toEqual(['p2']);
    });
  });

  describe('updatePackageCenterLocation', () => {
    it('mengupdate koordinat pusat paket dari lokasi survei yang baru disimpan', async () => {
      await seedPackages([makePackage({ id: 'p1', latitude: -7.30, longitude: 109.40 })]);

      await updatePackageCenterLocation('p1', -7.31, 109.41);

      const updated = await getPackageById('p1');
      expect(updated?.latitude).toBeCloseTo(-7.31);
      expect(updated?.longitude).toBeCloseTo(109.41);
    });

    it('mengganti koordinat paket dengan nilai paling baru, bukan rata-rata dari koordinat lama', async () => {
      await seedPackages([makePackage({ id: 'p1', latitude: -7.30, longitude: 109.40 })]);

      await updatePackageCenterLocation('p1', -7.50, 109.70);

      const updated = await getPackageById('p1');
      expect(updated?.latitude).toBeCloseTo(-7.50);
      expect(updated?.longitude).toBeCloseTo(109.70);
    });
  });

  describe('buildPackageMapMarkers', () => {
    it('mengambil koordinat titik paket untuk peta semua paket, bukan koordinat segmen/STA', () => {
      const packages = [
        makePackage({ id: 'p1', name: 'Paket A', latitude: -7.10, longitude: 109.10 }),
        makePackage({ id: 'p2', name: 'Paket B', latitude: -7.20, longitude: 109.20 }),
      ];

      const result = buildPackageMapMarkers({ packages });

      expect(result).toEqual([
        {
          lat: -7.10,
          lng: 109.10,
          infrastructureType: 'Paket Pekerjaan',
          locationNote: 'Paket A',
          packageId: 'p1',
          packageName: 'Paket A',
          status: 'draft',
        },
        {
          lat: -7.20,
          lng: 109.20,
          infrastructureType: 'Paket Pekerjaan',
          locationNote: 'Paket B',
          packageId: 'p2',
          packageName: 'Paket B',
          status: 'draft',
        },
      ]);
    });
  });

  describe('createPackage', () => {
    it('tidak menunggu server lama sebelum paket lokal selesai dibuat', async () => {
      const slowCreate = jest.spyOn(apiService, 'createPackage').mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true, packageId: 'remote-pkg-1' } as any), 400))
      );

      const start = Date.now();
      const result = await createPackage('Paket Cepat', 'Budi', ['Jalan']);
      const elapsed = Date.now() - start;

      expect(result.name).toBe('Paket Cepat');
      expect(result.id).toBeTruthy();
      expect(elapsed).toBeLessThan(150);
      expect(slowCreate).toHaveBeenCalled();
    });

    it('tidak membuat duplikasi paket dengan nama dan wilayah yang sama', async () => {
      await seedPackages([
        makePackage({ id: 'p1', name: 'Paket Sama', surveyorName: 'Budi', kecamatan: 'Banjarnegara', desaKelurahan: 'Banjarmangu' }),
      ]);

      const result = await createPackage('Paket Sama', 'Budi', ['Jalan'], 'Banjarnegara', 'Banjarmangu');

      const all = await getPackages();
      expect(all).toHaveLength(1);
      expect(result.id).toBe('p1');
      expect(result.name).toBe('Paket Sama');
    });
  });

  describe('parseCoordinate', () => {
    it('mengubah koordinat dengan koma desimal dari server menjadi angka yang valid', () => {
      expect(parseCoordinate('-7,318414862')).toBeCloseTo(-7.318414862);
      expect(parseCoordinate('109,7942525')).toBeCloseTo(109.7942525);
      expect(parseCoordinate('-7,373848768')).toBeCloseTo(-7.373848768);
      expect(parseCoordinate('109,7370607')).toBeCloseTo(109.7370607);
    });
  });

  describe('derivePackageStatus', () => {
    it('menganggap paket sebagai in_progress ketika sudah ada data survei tapi belum diposting', () => {
      expect(derivePackageStatus({ itemCount: 3, isPosted: false })).toBe('in_progress');
    });

    it('menganggap paket sebagai posted ketika semua data survei sudah diposting', () => {
      expect(derivePackageStatus({ itemCount: 3, isPosted: true })).toBe('posted');
    });

    it('menganggap paket sebagai draft ketika belum ada data survei', () => {
      expect(derivePackageStatus({ itemCount: 0, isPosted: false })).toBe('draft');
    });
  });

  describe('updatePackageAllowedTypes', () => {
    it('memperbarui allowedInfraTypes pada paket yang ditemukan', async () => {
      await seedPackages([makePackage({ id: 'p1' })]);

      await updatePackageAllowedTypes('p1', ['Jalan', 'Drainase']);

      const updated = await getPackageById('p1');
      expect(updated?.allowedInfraTypes).toEqual(['Jalan', 'Drainase']);
    });

    it('menyimpan undefined (bukan array kosong) jika allowedInfraTypes dikosongkan', async () => {
      await seedPackages([makePackage({ id: 'p1', allowedInfraTypes: ['Jalan'] })]);

      await updatePackageAllowedTypes('p1', []);

      const updated = await getPackageById('p1');
      expect(updated?.allowedInfraTypes).toBeUndefined();
    });

    it('tidak melakukan apa pun jika id paket tidak ditemukan', async () => {
      await seedPackages([makePackage({ id: 'p1' })]);
      await expect(updatePackageAllowedTypes('tidak-ada', ['Jalan'])).resolves.toBeUndefined();
      const all = await getPackages();
      expect(all).toHaveLength(1);
    });
  });

  describe('syncPackagesFromServer', () => {
    it('menambahkan paket server yang belum ada secara lokal sambil menjaga paket yang masih aktif di server', async () => {
      await seedPackages([makePackage({ id: 'p1' })]);
      (apiService.listPackages as jest.Mock).mockResolvedValue([
        { packageId: 'p1', packageName: 'Paket Lokal', createdAt: '2024-02-01T00:00:00.000Z', createdBy: 'Andi' },
        { packageId: 'p2', packageName: 'Paket Server', createdAt: '2024-02-02T00:00:00.000Z', createdBy: 'Andi' },
      ]);

      await syncPackagesFromServer();

      const all = await getPackages();
      expect(all.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
      const synced = all.find((p) => p.id === 'p2');
      expect(synced).toMatchObject({ name: 'Paket Server', surveyorName: 'Andi', itemCount: 0 });
    });

    it('tidak menimpa paket lokal yang sudah ada dengan id sama', async () => {
      const localPkg = makePackage({ id: 'p1', name: 'Nama Lokal' });
      await seedPackages([localPkg]);
      (apiService.listPackages as jest.Mock).mockResolvedValue([
        { packageId: 'p1', packageName: 'Nama Server Berbeda', createdAt: '2024-02-01T00:00:00.000Z' },
      ]);

      await syncPackagesFromServer();

      const all = await getPackages();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('Nama Lokal');
    });

    it('menghapus paket lokal yang sudah dihapus secara manual di server', async () => {
      await seedPackages([
        makePackage({ id: 'p1', name: 'Paket Lama' }),
        makePackage({ id: 'p2', name: 'Paket Masih Ada' }),
      ]);
      (apiService.listPackages as jest.Mock).mockResolvedValue([
        { packageId: 'p2', packageName: 'Paket Masih Ada', createdAt: '2024-02-01T00:00:00.000Z' },
      ]);

      await syncPackagesFromServer();

      const all = await getPackages();
      expect(all.map((p) => p.id)).toEqual(['p2']);
    });

    it('mengabaikan kegagalan (offline) tanpa melempar error', async () => {
      await seedPackages([makePackage({ id: 'p1' })]);
      (apiService.listPackages as jest.Mock).mockRejectedValue(new Error('offline'));

      await expect(syncPackagesFromServer()).resolves.toBeUndefined();
      await expect(getPackages()).resolves.toHaveLength(1);
    });

    it('tidak melakukan apa pun jika server mengembalikan daftar kosong', async () => {
      await seedPackages([makePackage({ id: 'p1' })]);
      (apiService.listPackages as jest.Mock).mockResolvedValue([]);

      await syncPackagesFromServer();

      await expect(getPackages()).resolves.toHaveLength(1);
    });
  });
});
