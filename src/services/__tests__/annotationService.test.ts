import {
  getPackageAnnotations,
  savePackageAnnotations,
  addPackageAnnotation,
  removePackageAnnotation,
  syncPackageAnnotationsFromServer,
  pickPreferredSegmentLocationLabel,
  getLocationLabelChoices,
  MapAnnotation,
} from '../annotationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import * as apiService from '../apiService';

jest.mock('../apiService', () => ({
  saveAnnotationToServer: jest.fn().mockResolvedValue({ success: true, message: 'OK' }),
  deleteAnnotationFromServer: jest.fn().mockResolvedValue({ success: true, message: 'OK' }),
  listAnnotationsFromServer: jest.fn().mockResolvedValue([]),
}));

const sampleAnnotation: MapAnnotation = {
  id: 'a1',
  type: 'polyline',
  points: [{ lat: -7.3, lng: 109.5 }, { lat: -7.31, lng: 109.51 }],
  color: '#ff0000',
  createdAt: new Date().toISOString(),
};

describe('annotationService', () => {
  afterEach(() => {
    (AsyncStorage as any).__reset();
  });

  it('mengembalikan array kosong jika belum ada anotasi tersimpan', async () => {
    await expect(getPackageAnnotations('pkg-1')).resolves.toEqual([]);
  });

  it('menyimpan dan mengambil kembali anotasi untuk sebuah paket', async () => {
    await savePackageAnnotations('pkg-1', [sampleAnnotation]);
    await expect(getPackageAnnotations('pkg-1')).resolves.toEqual([sampleAnnotation]);
  });

  it('tidak memengaruhi anotasi paket lain (terpisah per packageId)', async () => {
    await savePackageAnnotations('pkg-1', [sampleAnnotation]);
    await savePackageAnnotations('pkg-2', []);
    await expect(getPackageAnnotations('pkg-1')).resolves.toEqual([sampleAnnotation]);
    await expect(getPackageAnnotations('pkg-2')).resolves.toEqual([]);
  });

  it('addPackageAnnotation menambahkan anotasi baru dan mengembalikan daftar lengkap', async () => {
    await savePackageAnnotations('pkg-1', [sampleAnnotation]);
    const second: MapAnnotation = { ...sampleAnnotation, id: 'a2', type: 'polygon' };

    const updated = await addPackageAnnotation('pkg-1', second);

    expect(updated).toEqual([sampleAnnotation, second]);
    await expect(getPackageAnnotations('pkg-1')).resolves.toEqual([sampleAnnotation, second]);
  });

  it('removePackageAnnotation menghapus anotasi berdasarkan id', async () => {
    const second: MapAnnotation = { ...sampleAnnotation, id: 'a2' };
    await savePackageAnnotations('pkg-1', [sampleAnnotation, second]);

    const updated = await removePackageAnnotation('pkg-1', 'a1');

    expect(updated).toEqual([second]);
  });

  it('removePackageAnnotation tanpa efek jika id tidak ditemukan', async () => {
    await savePackageAnnotations('pkg-1', [sampleAnnotation]);
    const updated = await removePackageAnnotation('pkg-1', 'tidak-ada');
    expect(updated).toEqual([sampleAnnotation]);
  });

  it('addPackageAnnotation mengirim anotasi ke server saat online', async () => {
    await addPackageAnnotation('pkg-1', sampleAnnotation);
    // Beri kesempatan promise fire-and-forget selesai.
    await Promise.resolve();
    await Promise.resolve();
    expect(apiService.saveAnnotationToServer).toHaveBeenCalledWith(
      expect.objectContaining({ packageId: 'pkg-1', annotationId: 'a1' })
    );
  });

  it('addPackageAnnotation tidak mengirim ke server saat offline', async () => {
    (Network.getNetworkStateAsync as jest.Mock).mockResolvedValueOnce({
      isConnected: false,
      isInternetReachable: false,
    });
    await addPackageAnnotation('pkg-1', sampleAnnotation);
    await Promise.resolve();
    await Promise.resolve();
    expect(apiService.saveAnnotationToServer).not.toHaveBeenCalled();
  });

  it('removePackageAnnotation mengirim penghapusan ke server saat online', async () => {
    await savePackageAnnotations('pkg-1', [sampleAnnotation]);
    await removePackageAnnotation('pkg-1', 'a1');
    expect(apiService.deleteAnnotationFromServer).toHaveBeenCalledWith('pkg-1', 'a1');
  });

  it('syncPackageAnnotationsFromServer menggabungkan anotasi server dengan lokal', async () => {
    await savePackageAnnotations('pkg-1', [sampleAnnotation]);
    (apiService.listAnnotationsFromServer as jest.Mock).mockResolvedValueOnce([
      { id: 'a2', type: 'polygon', color: '#00ff00', label: '', points: [{ lat: 1, lng: 2 }], createdAt: '2024-01-01' },
    ]);

    const merged = await syncPackageAnnotationsFromServer('pkg-1');

    expect(merged).toEqual([
      sampleAnnotation,
      { id: 'a2', type: 'polygon', color: '#00ff00', label: undefined, points: [{ lat: 1, lng: 2 }], createdAt: '2024-01-01' },
    ]);
    await expect(getPackageAnnotations('pkg-1')).resolves.toEqual(merged);
  });

  it('syncPackageAnnotationsFromServer mengembalikan data lokal jika server gagal', async () => {
    await savePackageAnnotations('pkg-1', [sampleAnnotation]);
    (apiService.listAnnotationsFromServer as jest.Mock).mockRejectedValueOnce(new Error('offline'));

    const result = await syncPackageAnnotationsFromServer('pkg-1');

    expect(result).toEqual([sampleAnnotation]);
  });

  it('memilih alamat/keterangan lokasi segmen yang paling dominan dari paket', () => {
    const result = pickPreferredSegmentLocationLabel([
      'Jl. Raya Banjarnegara',
      'Jl. Raya Banjarnegara',
      'Kampung Karangjati',
      'Jl. Raya Banjarnegara',
    ], 'Nama Paket');

    expect(result).toBe('Jl. Raya Banjarnegara');
  });

  it('menggunakan nama paket sebagai fallback bila tidak ada alamat lokasi segmen', () => {
    expect(pickPreferredSegmentLocationLabel(['', undefined], 'Nama Paket')).toBe('Nama Paket');
  });

  it('mengembalikan daftar pilihan lokasi untuk memilih saat blur lokasi paket', () => {
    const result = getLocationLabelChoices([
      { locationNote: 'RT 3 RW 1' },
      { locationNote: 'Groundsil RT 2 RW 1' },
      { locationNote: 'RT 3 RW 1' },
      { locationNote: 'RT 2 RW 1' },
    ], 'Nama Paket');

    expect(result).toEqual(['RT 3 RW 1', 'Groundsil RT 2 RW 1', 'RT 2 RW 1', 'Nama Paket']);
  });
});

