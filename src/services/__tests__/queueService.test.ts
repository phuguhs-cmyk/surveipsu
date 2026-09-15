import { getQueue, addToQueue, clearQueue, deleteQueueItem, processQueue, retryQueueItem, isOnline, updateQueuedSurvey } from '../queueService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import * as apiService from '../apiService';
import { CONFIG } from '../../config';
import { QueuedSurvey } from '../../types';

jest.mock('../apiService');

function makeQueued(overrides: Partial<QueuedSurvey> = {}): QueuedSurvey {
  const localId = overrides.localId || `local-${Math.random().toString(36).slice(2)}`;
  return {
    localId,
    createdAt: new Date().toISOString(),
    status: 'pending',
    data: {
      localId,
      packageId: 'pkg-1',
      packageName: 'Paket A',
      itemId: 'item-1',
      surveyorName: 'Budi',
      infrastructureType: 'Jalan',
      latitude: -7.3,
      longitude: 109.5,
    } as any,
    ...overrides,
  } as QueuedSurvey;
}

describe('queueService', () => {
  afterEach(() => {
    (AsyncStorage as any).__reset();
    jest.clearAllMocks();
  });

  describe('addToQueue / getQueue / clearQueue', () => {
    it('menambahkan item ke antrian dan bisa dibaca kembali', async () => {
      const item = makeQueued({ localId: 'q1' });
      await addToQueue(item);
      await expect(getQueue()).resolves.toEqual([item]);
    });

    it('tidak menduplikasi localId yang sama di indeks', async () => {
      const item = makeQueued({ localId: 'q1' });
      await addToQueue(item);
      await addToQueue({ ...item, status: 'failed' });

      const queue = await getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].status).toBe('failed');
    });

    it('membersihkan id hantu di indeks setelah membaca queue yang mengandung item rusak/terhapus', async () => {
      const validItem = makeQueued({ localId: 'q1' });
      const queueKey = CONFIG.STORAGE_KEYS.QUEUE;
      await AsyncStorage.setItem(`${queueKey}/item/q1`, JSON.stringify(validItem));
      await AsyncStorage.setItem(queueKey, JSON.stringify(['q1', 'ghost-id']));

      const queue = await getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].localId).toBe('q1');
      await expect(AsyncStorage.getItem(queueKey)).resolves.toBe(JSON.stringify(['q1']));
    });

    it('clearQueue mengosongkan seluruh antrian', async () => {
      await addToQueue(makeQueued({ localId: 'q1' }));
      await addToQueue(makeQueued({ localId: 'q2' }));

      await clearQueue();

      await expect(getQueue()).resolves.toEqual([]);
    });
  });

  describe('deleteQueueItem', () => {
    it('menghapus satu item dari antrian berdasarkan localId', async () => {
      await addToQueue(makeQueued({ localId: 'q1' }));
      await addToQueue(makeQueued({ localId: 'q2' }));

      await deleteQueueItem('q1');

      const queue = await getQueue();
      expect(queue.map((q) => q.localId)).toEqual(['q2']);
    });
  });

  describe('updateQueuedSurvey', () => {
    it('mengganti payload tanpa menambah item baru ke antrian', async () => {
      const item = makeQueued({ localId: 'q1' });
      await addToQueue(item);

      await updateQueuedSurvey('q1', { ...item.data, locationNote: 'Lokasi diperbarui' });

      const queue = await getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].localId).toBe('q1');
      expect(queue[0].status).toBe('pending');
      expect(queue[0].data.locationNote).toBe('Lokasi diperbarui');
    });

    it('menolak edit saat item sedang dikirim', async () => {
      const item = makeQueued({ localId: 'q1', status: 'sending' });
      await addToQueue(item);

      await expect(updateQueuedSurvey('q1', item.data)).rejects.toThrow('sedang dikirim');
      await expect(getQueue()).resolves.toEqual([item]);
    });
  });

  describe('isOnline', () => {
    it('mengembalikan true jika terkoneksi dan internet terjangkau', async () => {
      (Network.getNetworkStateAsync as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
      });
      await expect(isOnline()).resolves.toBe(true);
    });

    it('mengembalikan false jika isInternetReachable eksplisit false', async () => {
      (Network.getNetworkStateAsync as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: false,
      });
      await expect(isOnline()).resolves.toBe(false);
    });

    it('mengembalikan true (asumsi online) jika pengecekan jaringan melempar error', async () => {
      (Network.getNetworkStateAsync as jest.Mock).mockRejectedValue(new Error('gagal cek jaringan'));
      await expect(isOnline()).resolves.toBe(true);
    });
  });

  describe('processQueue', () => {
    beforeEach(() => {
      (Network.getNetworkStateAsync as jest.Mock).mockResolvedValue({
        isConnected: true,
        isInternetReachable: true,
      });
    });

    it('mengembalikan sent=0, failed=0 tanpa memproses apa pun jika offline', async () => {
      (Network.getNetworkStateAsync as jest.Mock).mockResolvedValue({
        isConnected: false,
        isInternetReachable: false,
      });
      await addToQueue(makeQueued({ localId: 'q1' }));

      const result = await processQueue();

      expect(result).toEqual({ sent: 0, failed: 0 });
      await expect(getQueue()).resolves.toHaveLength(1);
    });

    it('mengirim item pending yang berhasil dan menghapusnya dari antrian', async () => {
      (apiService.submitSurvey as jest.Mock).mockResolvedValue({ success: true });
      await addToQueue(makeQueued({ localId: 'q1' }));

      const result = await processQueue();

      expect(result).toEqual({ sent: 1, failed: 0 });
      await expect(getQueue()).resolves.toEqual([]);
    });

    it('menandai item gagal sebagai "failed" dengan pesan error, tetap di antrian', async () => {
      (apiService.submitSurvey as jest.Mock).mockRejectedValue(new Error('Server tidak merespons'));
      await addToQueue(makeQueued({ localId: 'q1' }));

      const result = await processQueue();

      expect(result).toEqual({ sent: 0, failed: 1 });
      const queue = await getQueue();
      expect(queue[0]).toMatchObject({ status: 'failed', errorMessage: 'Server tidak merespons' });
    });

    it('melewati item yang berstatus "sending" (sedang diproses)', async () => {
      await addToQueue(makeQueued({ localId: 'q1', status: 'sending' }));
      (apiService.submitSurvey as jest.Mock).mockResolvedValue({ success: true });

      const result = await processQueue();

      expect(result).toEqual({ sent: 0, failed: 0 });
      await expect(getQueue()).resolves.toHaveLength(1);
    });

    it('memproses beberapa item campuran (sebagian berhasil, sebagian gagal)', async () => {
      // addToQueue menyisipkan item baru di AWAL indeks (LIFO), sehingga
      // getQueue()/pending mengembalikan urutan [q2, q1], bukan [q1, q2].
      (apiService.submitSurvey as jest.Mock)
        .mockResolvedValueOnce({ success: true })
        .mockRejectedValueOnce(new Error('gagal'));
      await addToQueue(makeQueued({ localId: 'q1' }));
      await addToQueue(makeQueued({ localId: 'q2' }));

      const result = await processQueue();

      expect(result).toEqual({ sent: 1, failed: 1 });
      const queue = await getQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].localId).toBe('q1');
    });
  });

  describe('retryQueueItem', () => {
    it('mengirim ulang item dan menghapusnya jika berhasil', async () => {
      (apiService.submitSurvey as jest.Mock).mockResolvedValue({ success: true });
      await addToQueue(makeQueued({ localId: 'q1', status: 'failed' }));

      await retryQueueItem('q1');

      await expect(getQueue()).resolves.toEqual([]);
    });

    it('melempar error dan menandai "failed" lagi jika pengiriman ulang gagal', async () => {
      (apiService.submitSurvey as jest.Mock).mockRejectedValue(new Error('Tetap gagal'));
      await addToQueue(makeQueued({ localId: 'q1', status: 'failed' }));

      await expect(retryQueueItem('q1')).rejects.toThrow('Tetap gagal');

      const queue = await getQueue();
      expect(queue[0]).toMatchObject({ status: 'failed', errorMessage: 'Tetap gagal' });
    });

    it('tidak melakukan apa pun jika item sedang berstatus "sending"', async () => {
      await addToQueue(makeQueued({ localId: 'q1', status: 'sending' }));

      await retryQueueItem('q1');

      expect(apiService.submitSurvey).not.toHaveBeenCalled();
    });

    it('tidak melakukan apa pun jika localId tidak ditemukan di antrian', async () => {
      await expect(retryQueueItem('tidak-ada')).resolves.toBeUndefined();
      expect(apiService.submitSurvey).not.toHaveBeenCalled();
    });
  });
});
