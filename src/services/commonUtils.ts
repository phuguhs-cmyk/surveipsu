/**
 * Utilitas umum yang digunakan di berbagai service modules.
 * Dikonsolidasikan di sini untuk menghindari duplikasi kode.
 */

/** Status HTTP yang dianggap SEMENTARA (transient) dan layak dicoba ulang,
 * bukan kegagalan permanen. Google Apps Script Web App kadang mengembalikan
 * status non-200 seperti ini saat baru "cold start"/redeploy/sedang sibuk. */
export const RETRYABLE_HTTP_STATUSES = new Set([404, 408, 425, 429, 500, 502, 503, 504]);

/** Parse JSON dengan fallback yang aman jika parse gagal */
export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/** Delay eksekusi selama ms milliseconds */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Normalisasi koordinat dari server (mis. "-7,318414862") menjadi angka JS yang valid. */
export function parseCoordinate(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw !== 'string') {
    const num = Number(raw);
    return Number.isFinite(num) ? num : undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed.replace(/\s+/g, '').replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : undefined;
}

/** true jika error adalah timeout atau pembatalan (AbortError) */
export function isTimeoutOrCancelError(err: any): boolean {
  if (err?.name === 'AbortError') return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('canceled') || msg.includes('cancelled') || msg.includes('aborted');
}

/** true jika error kemungkinan besar dari jaringan/timeout (layak di-retry) */
export function isRetryableNetworkError(err: any): boolean {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const msg = String(err.message || err).toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('canceled') ||
    msg.includes('cancelled') ||
    msg.includes('aborted') ||
    (err instanceof TypeError && msg.includes('fetch'))
  );
}

/** Wrapper Promise.race untuk timeout safety */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError?: Error): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(timeoutError || new Error('Operation timeout')),
        timeoutMs
      )
    ),
  ]);
}
