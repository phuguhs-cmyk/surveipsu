import { getKecamatanNames, getDesaByKecamatan, findKodeDesa, getWilayahList } from '../wilayahService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as apiService from '../apiService';
import { WilayahItem } from '../../types';

jest.mock('../apiService');

const items: WilayahItem[] = [
  { kecamatan: 'Banjarmangu', desa: 'Kalilunjar', kode: '01' } as WilayahItem,
  { kecamatan: 'Banjarmangu', desa: 'Beji', kode: '02' } as WilayahItem,
  { kecamatan: 'Wanadadi', desa: 'Wanakarsa', kode: '03' } as WilayahItem,
];

describe('getKecamatanNames', () => {
  it('mengembalikan nama kecamatan unik, terurut alfabetis', () => {
    expect(getKecamatanNames(items)).toEqual(['Banjarmangu', 'Wanadadi']);
  });
});

describe('getDesaByKecamatan', () => {
  it('memfilter desa berdasarkan kecamatan dan mengurutkan alfabetis', () => {
    const result = getDesaByKecamatan(items, 'Banjarmangu');
    expect(result.map((d) => d.desa)).toEqual(['Beji', 'Kalilunjar']);
  });

  it('mengembalikan array kosong jika kecamatan tidak ditemukan', () => {
    expect(getDesaByKecamatan(items, 'Tidak Ada')).toEqual([]);
  });
});

describe('findKodeDesa', () => {
  it('menemukan kode desa berdasarkan pasangan kecamatan+desa', () => {
    expect(findKodeDesa(items, 'Wanadadi', 'Wanakarsa')).toBe('03');
  });

  it('mengembalikan string kosong jika pasangan tidak ditemukan', () => {
    expect(findKodeDesa(items, 'Wanadadi', 'Tidak Ada')).toBe('');
  });
});

describe('getWilayahList', () => {
  const mockedListWilayah = apiService.listWilayah as jest.Mock;

  afterEach(() => {
    (AsyncStorage as any).__reset();
  });

  it('mengambil dari server dan menyimpannya ke cache saat cache kosong', async () => {
    mockedListWilayah.mockResolvedValue(items);

    const result = await getWilayahList();

    expect(result).toEqual(items);
    const cached = await AsyncStorage.getItem('@survei/wilayah');
    expect(JSON.parse(cached as string)).toEqual(items);
  });

  it('menggunakan cache lokal sebagai fallback saat server gagal dan cache kosong dilewati', async () => {
    await AsyncStorage.setItem('@survei/wilayah', JSON.stringify(items));
    mockedListWilayah.mockRejectedValue(new Error('offline'));

    // forceRefresh=true melewati cache-first, langsung ke server, lalu fallback ke cache saat gagal.
    const result = await getWilayahList(true);

    expect(result).toEqual(items);
  });

  it('melempar error jika server gagal dan tidak ada cache sama sekali', async () => {
    mockedListWilayah.mockRejectedValue(new Error('offline total'));

    await expect(getWilayahList(true)).rejects.toThrow('offline total');
  });
});
