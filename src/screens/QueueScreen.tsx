import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect } from '@react-navigation/native';
import { getQueue, processQueue, retryQueueItem, deleteQueueItem } from '../services/queueService';
import { QueuedSurvey } from '../types';
import { theme } from '../theme';

const STATUS_LABEL: Record<QueuedSurvey['status'], string> = {
  pending: 'Menunggu dikirim',
  sending: 'Sedang mengirim...',
  failed: 'Gagal dikirim',
};

const STATUS_COLOR: Record<QueuedSurvey['status'], string> = {
  pending: theme.colors.warning,
  sending: theme.colors.primary,
  failed: theme.colors.danger,
};

export default function QueueScreen() {
  const [queue, setQueue] = useState<QueuedSurvey[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadQueue = useCallback(async () => {
    const data = await getQueue();
    setQueue(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadQueue();
    }, [loadQueue])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await processQueue();
    } finally {
      await loadQueue();
      setRefreshing(false);
    }
  };

  const handleRetry = async (localId: string) => {
    try {
      await retryQueueItem(localId);
      Alert.alert('Berhasil', 'Data survei berhasil dikirim ke server.');
    } catch (err: any) {
      Alert.alert('Gagal', err?.message || 'Masih gagal mengirim data. Coba lagi nanti.');
    } finally {
      await loadQueue();
    }
  };

  const handleDelete = (localId: string) => {
    Alert.alert('Hapus Data', 'Yakin ingin menghapus data survei ini dari antrian?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          await deleteQueueItem(localId);
          await loadQueue();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Antrian Survei ({queue.length})</Text>
      <FlatList
        data={queue}
        keyExtractor={(item) => item.localId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Tidak ada data survei yang menunggu dikirim.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.data.infrastructureType}</Text>
              <Text style={[styles.statusBadge, { color: STATUS_COLOR[item.status] }]}>
                {STATUS_LABEL[item.status]}
              </Text>
            </View>
            <Text style={styles.cardText}>Paket: {item.data.packageName}</Text>
            {item.data.roadSegment && (
              <Text style={styles.cardText}>
                Segmen {item.data.segmentIndex}/{item.data.segmentTotal} — STA:{' '}
                {item.data.roadSegment.staStart} - {item.data.roadSegment.staEnd} (
                {item.data.roadSegment.condition})
              </Text>
            )}
            {item.data.drainageSegment && (
              <Text style={styles.cardText}>
                Segmen {item.data.segmentIndex}/{item.data.segmentTotal} — STA:{' '}
                {item.data.drainageSegment.staStart} - {item.data.drainageSegment.staEnd} (
                {item.data.drainageSegment.condition})
              </Text>
            )}
            {item.data.retainingWall && (
              <Text style={styles.cardText}>
                Segmen {item.data.segmentIndex}/{item.data.segmentTotal} — STA:{' '}
                {item.data.retainingWall.staStart} - {item.data.retainingWall.staEnd} (
                {item.data.retainingWall.condition})
              </Text>
            )}
            {item.data.culvert && (
              <Text style={styles.cardText}>Kondisi: {item.data.culvert.condition}</Text>
            )}
            {item.data.bridge && (
              <Text style={styles.cardText}>Kondisi: {item.data.bridge.condition}</Text>
            )}
            <Text style={styles.cardText}>
              Lokasi:{' '}
              {item.data.latitude != null && item.data.longitude != null
                ? `${item.data.latitude.toFixed(5)}, ${item.data.longitude.toFixed(5)}`
                : 'Tidak tersedia'}
            </Text>
            {item.data.locationNote ? (
              <Text style={styles.cardText}>Keterangan: {item.data.locationNote}</Text>
            ) : null}
            <Text style={styles.cardText}>Foto: {item.data.photos.length} buah</Text>
            <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleString('id-ID')}</Text>
            {item.errorMessage ? <Text style={styles.errorText}>{item.errorMessage}</Text> : null}


            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.retryButton} onPress={() => handleRetry(item.localId)}>
                <Text style={styles.retryButtonText}>Kirim Ulang</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item.localId)}>
                <Text style={styles.deleteButtonText}>Hapus</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: theme.font.semiBold,
    marginBottom: 12,
    color: theme.colors.textPrimary,
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    marginTop: 40,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: theme.font.semiBold,
    color: theme.colors.textPrimary,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: theme.font.semiBold,
  },
  cardText: {
    fontSize: 13,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  cardDate: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.danger,
    marginTop: 6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  retryButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.xs,
    paddingVertical: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: theme.font.semiBold,
    fontSize: 13,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: theme.colors.dangerBg,
    borderRadius: theme.radius.xs,
    paddingVertical: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: theme.colors.danger,
    fontWeight: theme.font.semiBold,
    fontSize: 13,
  },
});

