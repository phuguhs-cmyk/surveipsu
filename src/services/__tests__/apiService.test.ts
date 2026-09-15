import { submitSurvey, fetchSurveyList, publicListPackages, createPackage } from '../apiService';

process.env.GAS_WEB_APP_URL = 'https://example.com/exec';

function jsonResponse(body: any, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe('apiService.submitSurvey', () => {
  it('mengirim POST dan mengembalikan response sukses dari server', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ success: true }));
    (global as any).fetch = fetchMock;

    const result = await submitSurvey({ infrastructureType: 'Jalan' } as any);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/exec');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body.infrastructureType).toBe('Jalan');
    // submitSurvey mengganti apiKey dengan sessionToken, tidak pernah
    // mengirim apiKey mentah ke server.
    expect(body.apiKey).toBeUndefined();
    // submitSurvey SENGAJA tidak menyertakan field `action` sama sekali —
    // server (Code.gs doPost, lihat `const action = data.action || 'create';`)
    // menganggap body TANPA field `action` sebagai aksi 'create' (membuat
    // baris survei baru) secara default.
    expect(body.action).toBeUndefined();
  });

  it('melempar error bisnis dari server tanpa retry', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ success: false, message: 'Validasi gagal.' })
    );
    (global as any).fetch = fetchMock;

    await expect(submitSurvey({} as any)).rejects.toThrow('Validasi gagal.');
    // Error bisnis tidak boleh di-retry: fetch hanya dipanggil sekali.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('apiService.fetchSurveyList - caching', () => {
  it('meng-cache hasil baca sehingga panggilan kedua dengan param sama tidak fetch ulang', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ success: true, data: [{ id: 1 }] }));
    (global as any).fetch = fetchMock;

    const first = await fetchSurveyList('Jalan');
    const second = await fetchSurveyList('Jalan');

    expect(first).toEqual([{ id: 1 }]);
    expect(second).toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('melempar error saat server mengembalikan success: false', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ success: false, message: 'Gagal mengambil data.' })
    );
    (global as any).fetch = fetchMock;

    await expect(fetchSurveyList('Jembatan')).rejects.toThrow('Gagal mengambil data.');
  });
});

describe('apiService.publicListPackages', () => {
  it('tidak menyertakan sessionToken pada request publik', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ success: true, packages: [{ packageId: 'p1' }] })
    );
    (global as any).fetch = fetchMock;

    const result = await publicListPackages();

    expect(result).toEqual([{ packageId: 'p1' }]);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('action=publicListPackages');
    expect(String(url)).not.toContain('sessionToken');
  });
});

describe('apiService.createPackage', () => {
  it('mengirim kecamatan, desa/kelurahan, dan koordinat utama paket ke server saat membuat paket', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ success: true, packageId: 'pkg-123' })
    );
    (global as any).fetch = fetchMock;

    await createPackage('Paket A', 'pkg-123', 'Banjarnegara', 'Banjarmangu', -7.39, 109.69);

    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://example.com/exec');
    const body = JSON.parse(options.body);
    expect(body.action).toBe('createPackage');
    expect(body.packageName).toBe('Paket A');
    expect(body.kecamatan).toBe('Banjarnegara');
    expect(body.desaKelurahan).toBe('Banjarmangu');
    expect(body.packageLatitude).toBe(-7.39);
    expect(body.packageLongitude).toBe(109.69);
  });
});

describe('apiService network retry behavior', () => {
  it('mengubah error jaringan yang gagal terus-menerus menjadi pesan yang jelas', async () => {
    jest.useFakeTimers();
    try {
      const fetchMock = jest.fn().mockRejectedValue(new Error('Network request failed'));
      (global as any).fetch = fetchMock;

      const promise = submitSurvey({} as any);
      // Biarkan promise ditangani terlebih dulu agar tidak unhandled rejection.
      // "Network request failed" bukan pesan timeout/pembatalan (AbortError),
      // jadi setelah retry habis, pesan asli dari fetch tetap diteruskan apa
      // adanya (bukan diubah menjadi pesan "koneksi lama merespons").
      const assertion = expect(promise).rejects.toThrow('Network request failed');
      // Jalankan semua timer (delay retry) sampai promise selesai.
      await jest.runAllTimersAsync();
      await assertion;

      // 1 percobaan awal + 2 retry = 3 kali total (NETWORK_RETRY_COUNT = 2).
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });
});
