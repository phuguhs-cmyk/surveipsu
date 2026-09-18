import {
  RETRYABLE_HTTP_STATUSES,
  safeJsonParse,
  sleep,
  parseCoordinate,
  isTimeoutOrCancelError,
  isRetryableNetworkError,
  withTimeout,
} from '../commonUtils';

describe('RETRYABLE_HTTP_STATUSES', () => {
  it('berisi status HTTP transient yang layak di-retry', () => {
    [404, 408, 425, 429, 500, 502, 503, 504].forEach((code) => {
      expect(RETRYABLE_HTTP_STATUSES.has(code)).toBe(true);
    });
  });

  it('tidak menganggap status sukses/permanen sebagai retryable', () => {
    [200, 201, 400, 401, 403].forEach((code) => {
      expect(RETRYABLE_HTTP_STATUSES.has(code)).toBe(false);
    });
  });
});

describe('safeJsonParse', () => {
  it('mem-parse JSON valid', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('mengembalikan fallback jika raw null/kosong', () => {
    expect(safeJsonParse(null, { x: 1 })).toEqual({ x: 1 });
    expect(safeJsonParse('', { x: 1 })).toEqual({ x: 1 });
  });

  it('mengembalikan fallback jika JSON tidak valid', () => {
    expect(safeJsonParse('{invalid', { x: 1 })).toEqual({ x: 1 });
  });

  it('mengembalikan fallback jika hasil parse null', () => {
    expect(safeJsonParse('null', { x: 1 })).toEqual({ x: 1 });
  });
});

describe('sleep', () => {
  it('resolve setelah durasi yang ditentukan', async () => {
    jest.useFakeTimers();
    const promise = sleep(1000);
    jest.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
    jest.useRealTimers();
  });
});

describe('parseCoordinate', () => {
  it('mengembalikan angka langsung jika input sudah number valid', () => {
    expect(parseCoordinate(-7.318414862)).toBe(-7.318414862);
  });

  it('mengembalikan undefined untuk number tidak valid (NaN/Infinity)', () => {
    expect(parseCoordinate(NaN)).toBeUndefined();
    expect(parseCoordinate(Infinity)).toBeUndefined();
  });

  it('mem-parse string dengan koma sebagai desimal', () => {
    expect(parseCoordinate('-7,318414862')).toBeCloseTo(-7.318414862);
  });

  it('mem-parse string dengan titik sebagai desimal', () => {
    expect(parseCoordinate('109.51')).toBeCloseTo(109.51);
  });

  it('membuang whitespace berlebih sebelum parse', () => {
    expect(parseCoordinate('  109.51  ')).toBeCloseTo(109.51);
  });

  it('mengembalikan undefined untuk null/undefined/string kosong', () => {
    expect(parseCoordinate(null)).toBeUndefined();
    expect(parseCoordinate(undefined)).toBeUndefined();
    expect(parseCoordinate('')).toBeUndefined();
    expect(parseCoordinate('   ')).toBeUndefined();
  });

  it('mengembalikan undefined untuk string yang tidak bisa di-parse', () => {
    expect(parseCoordinate('abc')).toBeUndefined();
  });

  it('mencoba Number() untuk tipe lain (mis. boolean)', () => {
    expect(parseCoordinate(true)).toBe(1);
    expect(parseCoordinate(false)).toBe(0);
  });
});

describe('isTimeoutOrCancelError', () => {
  it('true untuk AbortError', () => {
    expect(isTimeoutOrCancelError({ name: 'AbortError' })).toBe(true);
  });

  it('true untuk pesan mengandung canceled/cancelled/aborted', () => {
    expect(isTimeoutOrCancelError(new Error('Request canceled'))).toBe(true);
    expect(isTimeoutOrCancelError(new Error('Request cancelled'))).toBe(true);
    expect(isTimeoutOrCancelError(new Error('Operation aborted'))).toBe(true);
  });

  it('false untuk error biasa', () => {
    expect(isTimeoutOrCancelError(new Error('Network failure'))).toBe(false);
  });

  it('menangani error null/undefined dengan aman', () => {
    expect(isTimeoutOrCancelError(null)).toBe(false);
    expect(isTimeoutOrCancelError(undefined)).toBe(false);
  });
});

describe('isRetryableNetworkError', () => {
  it('false jika err falsy', () => {
    expect(isRetryableNetworkError(null)).toBe(false);
    expect(isRetryableNetworkError(undefined)).toBe(false);
  });

  it('true untuk AbortError', () => {
    expect(isRetryableNetworkError({ name: 'AbortError', message: '' })).toBe(true);
  });

  it('true untuk pesan jaringan yang dikenal', () => {
    expect(isRetryableNetworkError(new Error('Network request failed'))).toBe(true);
    expect(isRetryableNetworkError(new Error('failed to fetch'))).toBe(true);
    expect(isRetryableNetworkError(new Error('Network error'))).toBe(true);
    expect(isRetryableNetworkError(new Error('canceled'))).toBe(true);
  });

  it('true untuk TypeError terkait fetch', () => {
    expect(isRetryableNetworkError(new TypeError('fetch failed'))).toBe(true);
  });

  it('false untuk error tidak terkait jaringan', () => {
    expect(isRetryableNetworkError(new Error('Validasi gagal'))).toBe(false);
  });
});

describe('withTimeout', () => {
  it('resolve dengan hasil promise asli jika selesai sebelum timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000);
    expect(result).toBe('ok');
  });

  it('reject dengan timeoutError kustom jika promise terlalu lama', async () => {
    jest.useFakeTimers();
    const neverResolves = new Promise(() => {});
    const customError = new Error('Timeout kustom');
    const promise = withTimeout(neverResolves, 500, customError);
    // Lampirkan handler penolakan SEBELUM memajukan timer agar Node tidak
    // menandai promise ini sebagai "unhandled rejection" secara sesaat.
    const assertion = expect(promise).rejects.toThrow('Timeout kustom');
    jest.advanceTimersByTime(500);
    await assertion;
    jest.useRealTimers();
  });

  it('reject dengan pesan default jika timeoutError tidak diberikan', async () => {
    jest.useFakeTimers();
    const neverResolves = new Promise(() => {});
    const promise = withTimeout(neverResolves, 500);
    const assertion = expect(promise).rejects.toThrow('Operation timeout');
    jest.advanceTimersByTime(500);
    await assertion;
    jest.useRealTimers();
  });
});
