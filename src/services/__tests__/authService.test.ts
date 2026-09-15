import { login, getCurrentUser, getSessionToken, logout, __resetAuthCacheForTests } from '../authService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// authService membaca CONFIG.GAS_WEB_APP_URL dari src/config.ts, yang pada
// gilirannya membaca dari expo-constants (di-mock) / process.env. Di test
// ini kita isi langsung process.env sebelum import config ter-resolve.
process.env.GAS_WEB_APP_URL = 'https://example.com/exec';

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<any> }) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    ...response,
  });
}

describe('authService.login', () => {
  afterEach(() => {
    (AsyncStorage as any).__reset();
        __resetAuthCacheForTests();
  });

  it('menyimpan sesi ke AsyncStorage saat login berhasil', async () => {
    mockFetchOnce({
      json: async () => ({
        success: true,
        user: { username: 'budi', name: 'Budi', role: 'surveyor' },
        sessionToken: 'token-123',
      }),
    });

    const user = await login('budi', 'rahasia');

    expect(user.sessionToken).toBe('token-123');
    expect(user.name).toBe('Budi');
    await expect(getSessionToken()).resolves.toBe('token-123');
    await expect(getCurrentUser()).resolves.toMatchObject({ username: 'budi', name: 'Budi' });
  });

  it('melempar error dengan pesan server saat login gagal (business error)', async () => {
    mockFetchOnce({
      json: async () => ({ success: false, message: 'Username atau password salah.' }),
    });

    await expect(login('budi', 'salah')).rejects.toThrow('Username atau password salah.');
  });

  it('melempar error status HTTP saat response tidak ok', async () => {
    mockFetchOnce({ ok: false, status: 500 });

    await expect(login('budi', 'x')).rejects.toThrow('Server merespons dengan status 500');
  });

  it('mengubah error pembatalan/timeout menjadi pesan yang jelas bagi pengguna', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(
      Object.assign(new Error('request has been canceled'), { name: 'AbortError' })
    );

    await expect(login('budi', 'x')).rejects.toThrow(
      'Koneksi ke server terlalu lama merespons. Periksa jaringan internet Anda dan coba lagi.'
    );
  });

  it('logout tidak menunggu request jaringan yang menggantung sebelum membersihkan sesi', async () => {
    await AsyncStorage.setItem('@survei/authUser', JSON.stringify({ username: 'budi', name: 'Budi', role: 'surveyor' }));
    await AsyncStorage.setItem('@survei/sessionToken', 'token-123');
    __resetAuthCacheForTests();

    const fetchSpy = jest.fn(() => new Promise<Response>(() => undefined));
    (global as any).fetch = fetchSpy;

    await expect(logout()).resolves.toBeUndefined();
    await expect(getSessionToken()).resolves.toBeNull();
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('authService.getCurrentUser', () => {
  afterEach(() => {
    (AsyncStorage as any).__reset();
        __resetAuthCacheForTests();
  });

  it('mengembalikan null jika tidak ada data tersimpan', async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it('mengembalikan null jika data tersimpan bukan JSON valid', async () => {
    await AsyncStorage.setItem('@survei/authUser', 'bukan-json{{{');
    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

describe('authService.logout', () => {
  afterEach(() => {
    (AsyncStorage as any).__reset();
        __resetAuthCacheForTests();
  });

  it('menghapus data sesi dari AsyncStorage meskipun request logout ke server gagal', async () => {
    await AsyncStorage.setItem('@survei/authUser', JSON.stringify({ username: 'budi' }));
    await AsyncStorage.setItem('@survei/sessionToken', 'token-123');
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('network down'));

    await logout();

    await expect(getSessionToken()).resolves.toBeNull();
    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

