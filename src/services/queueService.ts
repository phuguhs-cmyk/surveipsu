import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { CONFIG } from '../config';
import { QueuedSurvey } from '../types';
import { submitSurvey } from './apiService';
import { safeJsonParse } from './commonUtils';

/**
 * Layanan antrian offline-first: setiap survei yang dibuat pengguna
 * disimpan dulu ke AsyncStorage (queue), lalu dicoba dikirim ke server.
 * Jika gagal (misal tidak ada koneksi internet), data tetap tersimpan
 * di queue dan bisa dicoba ulang (retry) nanti.
 *
 * PENTING: setiap item antrian disimpan di KEY AsyncStorage TERPISAH
 * (bukan digabung dalam satu array besar). Key indeks hanya menyimpan
 * daftar localId yang ringan. Ini untuk menghindari error native Android
 * "Row too big to fit into CursorWindow": jika seluruh antrian (termasuk
 * semua foto base64) disimpan sebagai satu nilai/baris, ukuran baris
 * tersebut bisa melebihi batas ~2MB milik SQLite backend AsyncStorage
 * begitu ada beberapa item tersimpan sekaligus.
 */

const INDEX_KEY = CONFIG.STORAGE_KEYS.QUEUE;

/**
 * Mutex sederhana untuk operasi baca-ubah-tulis pada indeks antrian
 * (readIndex -> writeIndex). Tanpa ini, dua operasi yang mengubah indeks
 * secara bersamaan (mis. beberapa item dalam satu batch processQueue()
 * yang dihapus paralel lewat Promise.all) bisa saling menimpa: keduanya
 * membaca indeks yang sama sebelum salah satu sempat menulis, sehingga
 * hasil akhirnya hanya mencerminkan perubahan TERAKHIR yang selesai —
 * item lain yang sebenarnya sudah terkirim & terhapus datanya tetap
 * "menumpuk" sebagai entri hantu (localId basi) di indeks. Semua fungsi
 * yang membaca-lalu-menulis indeks WAJIB lewat withIndexLock agar
 * berjalan berurutan (serial), bukan tumpang tindih.
 */
let indexLock: Promise<any> = Promise.resolve();
function withIndexLock<T>(task: () => Promise<T>): Promise<T> {
  const run = indexLock.then(task, task);
  // Rantai lock dilanjutkan terlepas dari task ini berhasil/gagal, agar
  // satu kegagalan tidak mengunci selamanya operasi antrian berikutnya.
  indexLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function itemKey(localId: string): string {
  return `${CONFIG.STORAGE_KEYS.QUEUE}/item/${localId}`;
}

function normalizeIds(ids: string[]): string[] {
  const unique = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!id || unique.has(id)) continue;
    unique.add(id);
    result.push(id);
  }
  return result;
}

async function readIndex(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  const parsed = safeJsonParse<any>(raw, []);
  if (!Array.isArray(parsed)) return [];

  // Migrasi dari format lama (array of QueuedSurvey lengkap) ke format baru
  // (array of localId) jika ditemukan data lama tersimpan di key indeks.
  if (parsed.length > 0 && typeof parsed[0] === 'object') {
    const oldItems = parsed as QueuedSurvey[];
    for (const item of oldItems) {
      if (!item?.localId) continue;
      await AsyncStorage.setItem(itemKey(item.localId), JSON.stringify(item));
    }
    const ids = normalizeIds(oldItems.map((item) => item.localId));
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ids));
    return ids;
  }

  const ids = normalizeIds(parsed as string[]);
  if (ids.length === 0) return [];

  const pairs = await AsyncStorage.multiGet(ids.map(itemKey));
  const validIds = ids.filter((id, index) => {
    const found = pairs[index];
    return Boolean(found?.[1]);
  });

  if (validIds.length !== ids.length) {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(validIds));
  }
  return validIds;
}

async function writeIndex(ids: string[]): Promise<void> {
  const normalized = normalizeIds(ids);
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(normalized));
}

export async function getQueue(): Promise<QueuedSurvey[]> {
  const ids = await readIndex();
  if (ids.length === 0) return [];
  const pairs = await AsyncStorage.multiGet(ids.map(itemKey));
  const items: QueuedSurvey[] = [];
  for (const [, raw] of pairs) {
    if (!raw) continue;
    const item = safeJsonParse<QueuedSurvey | null>(raw, null);
    if (item && typeof item === 'object' && item.localId) {
      items.push(item);
    }
  }
  return items;
}

export async function clearQueue(): Promise<void> {
  const ids = await readIndex();
  await AsyncStorage.multiRemove([INDEX_KEY, ...ids.map((id) => itemKey(id))]);
}

export async function addToQueue(item: QueuedSurvey): Promise<void> {
  // Ditulis dulu SEBELUM masuk indeks: jika proses terhenti di antara,
  // yang tersisa hanyalah item "yatim" tanpa entri indeks (aman, akan
  // diabaikan saat dibaca), bukan entri indeks tanpa data (yang akan
  // gagal senyap/undefined saat dibaca).
  await AsyncStorage.setItem(itemKey(item.localId), JSON.stringify(item));
  await withIndexLock(async () => {
    const ids = await readIndex();
    // Cegah localId yang sama masuk dua kali ke indeks (mis. akibat
    // pemanggilan ganda yang tidak sengaja) walau isi datanya akan
    // tetap ditimpa dengan versi terbaru di atas.
    if (ids.includes(item.localId)) return;
    const nextIds = normalizeIds([item.localId, ...ids]);
    await writeIndex(nextIds);
  });
}

async function updateItem(localId: string, patch: Partial<QueuedSurvey>): Promise<void> {
  const raw = await AsyncStorage.getItem(itemKey(localId));
  if (!raw) return;
  const current = safeJsonParse<QueuedSurvey>(raw, null as any);
  if (!current) return; // abaikan entri yang rusak
  const updated = { ...current, ...patch };
  await AsyncStorage.setItem(itemKey(localId), JSON.stringify(updated));
}

export async function updateQueuedSurvey(localId: string, data: QueuedSurvey['data']): Promise<void> {
  const queue = await getQueue();
  const current = queue.find((item) => item.localId === localId);
  if (!current || current.status === 'sending') {
    throw new Error('Data sedang dikirim. Tunggu proses pengiriman selesai sebelum mengedit.');
  }
  await updateItem(localId, { data, status: 'pending', errorMessage: undefined });
}

async function removeFromQueue(localId: string): Promise<void> {
  await withIndexLock(async () => {
    const ids = await readIndex();
    await writeIndex(ids.filter((id) => id !== localId));
  });
  await AsyncStorage.removeItem(itemKey(localId));
}

export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return Boolean(state.isConnected && state.isInternetReachable !== false);
  } catch {
    // Jika pengecekan gagal, asumsikan online dan biarkan fetch yang menentukan.
    return true;
  }
}

/**
 * Mencoba mengirim semua item berstatus 'pending'/'failed' di queue.
 * Item yang berhasil dikirim akan dihapus dari queue.
 * Mengembalikan ringkasan jumlah sukses & gagal.
 *
 * Dikirim dalam batch paralel (bukan satu-per-satu berurutan) agar total
 * waktu pemrosesan antrian jauh lebih singkat ketika ada banyak item
 * pending sekaligus (mis. setelah offline lama lalu online kembali).
 * Ukuran batch dibatasi agar tidak membanjiri server/koneksi perangkat.
 */
const QUEUE_BATCH_SIZE = 3;

// Menghindari processQueue() berjalan tumpang tindih (mis. dipicu dari layar
// submit form DAN pull-to-refresh di layar Antrian pada waktu yang hampir
// bersamaan). Tanpa ini, dua pemanggilan bisa sama-sama membaca item yang
// sama berstatus 'pending' sebelum salah satunya sempat menandainya
// 'sending', sehingga item tersebut berpotensi dikirim dua kali secara
// paralel (server memang punya proteksi duplikat lewat ID Lokal, tapi lebih
// aman dicegah juga di sisi klien agar tidak boros permintaan jaringan).
let inFlightProcessQueue: Promise<{ sent: number; failed: number }> | null = null;

export async function processQueue(): Promise<{ sent: number; failed: number }> {
  if (inFlightProcessQueue) return inFlightProcessQueue;
  const run = processQueueInternal().finally(() => {
    inFlightProcessQueue = null;
  });
  inFlightProcessQueue = run;
  return run;
}

async function processQueueInternal(): Promise<{ sent: number; failed: number }> {
  const online = await isOnline();
  if (!online) {
    return { sent: 0, failed: 0 };
  }

  const queue = await getQueue();
  let sent = 0;
  let failed = 0;

  const pending = queue.filter((item) => item.status !== 'sending');

  for (let i = 0; i < pending.length; i += QUEUE_BATCH_SIZE) {
    const batch = pending.slice(i, i + QUEUE_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (item) => {
        const itemId = item.localId;
        await updateItem(itemId, { status: 'sending', errorMessage: undefined });
        try {
          await submitSurvey(item.data);
          await removeFromQueue(itemId);
          return true;
        } catch (err: any) {
          await updateItem(itemId, {
            status: 'failed',
            errorMessage: err?.message || 'Gagal mengirim data.',
          });
          return false;
        }
      })
    );
    sent += results.filter(Boolean).length;
    failed += results.filter((ok) => !ok).length;
  }

  return { sent, failed };
}

export async function retryQueueItem(localId: string): Promise<void> {
  const queue = await getQueue();
  const item = queue.find((q) => q.localId === localId);
  if (!item) return;
  // Cegah kirim ganda jika item ini kebetulan sedang diproses oleh
  // processQueue() (mis. dipicu otomatis saat submit) pada saat yang
  // hampir bersamaan dengan pengguna menekan "Kirim Ulang" secara manual.
  if (item.status === 'sending') return;

  await updateItem(localId, { status: 'sending', errorMessage: undefined });
  try {
    await submitSurvey(item.data);
    await removeFromQueue(localId);
  } catch (err: any) {
    await updateItem(localId, {
      status: 'failed',
      errorMessage: err?.message || 'Gagal mengirim data.',
    });
    throw err;
  }
}

export async function deleteQueueItem(localId: string): Promise<void> {
  await removeFromQueue(localId);
}
