import React, { useCallback, useMemo, useRef, useState, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { fetchSurveyList, deleteSurvey } from '../services/apiService';
import { getQueue } from '../services/queueService';
import { EDIT_FIELDS } from '../config';
import { getCurrentUser } from '../services/authService';
import { AuthUser } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'PackageData'>;

const DataRowCard = memo(function DataRowCard({
  item,
  navigation,
  isAdmin,
  canEdit,
  canDeleteData,
  currentUsername,
  onDelete,
  packageName,
}: {
  item: any;
  navigation: Props['navigation'];
  isAdmin: boolean;
  canEdit: boolean;
  canDeleteData: boolean;
  currentUsername?: string;
  onDelete: (infrastructureType: string, surveyId: string) => void;
  packageName: string;
}) {
  const isPosted = item['Status'] === 'Diposting';
  const isSending = item.__offlineQueueItem?.status === 'sending';
  // Akuntabilitas per item: baris yang punya "Username Pembuat" (ditulis
  // saat baris ini dibuat) hanya boleh diubah/dihapus oleh pembuatnya
  // sendiri atau admin, meskipun pengguna lain punya izin edit/hapus secara
  // umum. Baris lama tanpa nilai ini (kosong) tetap mengikuti izin umum saja,
  // supaya data lama tidak mendadak terkunci untuk semua orang.
  const creatorUsername = (item['Username Pembuat'] || '').toString().trim().toLowerCase();
  const isOwnItem = !creatorUsername || creatorUsername === (currentUsername || '').trim().toLowerCase();
  const canModifyThis = (!isPosted || isAdmin) && (isAdmin || isOwnItem);
  const canEditThis = canModifyThis && canEdit && !isSending;
  const canDeleteThis = canModifyThis && canDeleteData;

  return (
    <View style={styles.card}>
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>{item._infrastructureType}</Text>
        {isPosted && <Text style={styles.postedBadge}>Survei Selesai</Text>}
      </View>
      <Text style={styles.cardText}>Surveyor: {item['Nama Surveyor']}</Text>
      <Text style={styles.cardText}>Lokasi: {item['Alamat/Keterangan Lokasi'] || '-'}</Text>
      <Text style={styles.cardText}>Status: {item['Status'] || '-'}</Text>
      <Text style={styles.cardDate}>
        {item['Timestamp'] ? new Date(item['Timestamp']).toLocaleString('id-ID') : ''}
      </Text>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.editButton, !canEditThis && styles.buttonDisabled]}
          disabled={!canEditThis}
          onPress={() =>
            navigation.navigate('EditItem', {
              infrastructureType: item._infrastructureType,
              surveyId: item['ID Survei'],
            })
          }
        >
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.deleteButton, !canDeleteThis && styles.buttonDisabled]}
          disabled={!canDeleteThis}
          onPress={() => onDelete(item._infrastructureType, item['ID Survei'])}
        >
          <Text style={styles.deleteButtonText}>Hapus</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function PackageDataScreen({ route, navigation }: Props) {
  const { packageId, packageName } = route.params;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [user, setUser] = useState<AuthUser | null>(null);
  const loadInFlightRef = useRef(false);
  const isAdmin = user?.role === 'admin';

  const offlineRowsForPackage = useCallback((items: any[]) => items
    .filter((item) => item.data?.packageId === packageId)
    .map((item) => {
      const data = item.data || {};
      const detail = data.roadSegment || data.drainageSegment || data.retainingWall || data.culvert || data.bridge || data.dynamicDetail || {};
      const row: Record<string, any> = {
        'ID Survei': data.localId || item.localId,
        'ID Item Pekerjaan': data.itemId,
        'Nama Paket': data.packageName || packageName,
        'Nama Surveyor': data.surveyorName || '',
        'Username Pembuat': data.username || '',
        'Alamat/Keterangan Lokasi': data.locationNote || '',
        'Timestamp': item.createdAt,
        'Status': 'Belum Dikirim',
        _infrastructureType: data.infrastructureType,
        __offlineQueueItem: item,
      };
      (EDIT_FIELDS[data.infrastructureType] || []).forEach((field) => {
        row[field.header] = detail[field.key] ?? '';
      });
      return row;
    }), [packageId, packageName]);

  const loadData = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    try {
      const [currentUser, filtered] = await Promise.all([
        getCurrentUser(),
        fetchSurveyList(undefined, packageId).catch(() => []),
      ]);
      setUser(currentUser);
      const offlineRows = offlineRowsForPackage(await getQueue());
      const serverIds = new Set(filtered.map((row) => row['ID Survei']));
      const combined = [...filtered, ...offlineRows.filter((row) => !serverIds.has(row['ID Survei']))];
      const sorted = combined.sort((a, b) => (a['Timestamp'] < b['Timestamp'] ? 1 : -1));
      setRows(sorted);
    } catch (err: any) {
      Alert.alert('Gagal Memuat', err?.message || 'Tidak dapat mengambil data dari server.');
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }, [packageId, offlineRowsForPackage]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Status paket dianggap "Diposting" jika SEMUA data di dalamnya sudah diposting.
  // Posting/pembatalan posting kini dilakukan dari PackageDetailScreen ("Ubah
  // Paket"); layar ini hanya menampilkan status untuk keperluan kunci CRUD baris.
  const isPackagePosted = rows.length > 0 && rows.every((row) => row['Status'] === 'Diposting');
  const canEdit = isAdmin || user?.permissions?.canEdit !== false;
  const canDeleteData = isAdmin || user?.permissions?.canDelete !== false;

  const handleDelete = (infrastructureType: string, surveyId: string) => {
    Alert.alert('Hapus Data', 'Yakin ingin menghapus data ini? Tindakan ini tidak bisa dibatalkan.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSurvey(infrastructureType, surveyId, user?.username);
            setRows((prev) => prev.filter((row) => row['ID Survei'] !== surveyId));
          } catch (err: any) {
            Alert.alert('Gagal Menghapus', err?.message || 'Terjadi kesalahan saat menghapus data.');
          }
        },
      },
    ]);
  };

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const surveyor = String(row['Nama Surveyor'] || '').toLowerCase();
      const location = String(row['Alamat/Keterangan Lokasi'] || '').toLowerCase();
      const type = String(row._infrastructureType || '').toLowerCase();
      const status = String(row['Status'] || '').toLowerCase();
      return (
        surveyor.includes(query) ||
        location.includes(query) ||
        type.includes(query) ||
        status.includes(query)
      );
    });
  }, [rows, searchText]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{packageName}</Text>
        {isPackagePosted && <Text style={styles.postedBadge}>Survei Selesai</Text>}
      </View>
      <Text style={styles.subtitle}>
        {searchText.trim()
          ? `${filteredRows.length} dari ${rows.length} data ditemukan`
          : `${rows.length} data survei ditemukan`}
      </Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Cari surveyor, lokasi, jenis, atau status..."
        value={searchText}
        onChangeText={setSearchText}
        autoCapitalize="none"
      />

      {loading ? (

        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(item, index) => item['ID Survei'] || String(index)}
          contentContainerStyle={{ paddingBottom: 24 }}
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchText.trim()
                ? 'Tidak ada data yang cocok dengan pencarian.'
                : 'Belum ada data survei di paket ini.'}
            </Text>
          }
          renderItem={({ item }) => (
            <DataRowCard
              item={item}
              navigation={navigation}
              isAdmin={!!isAdmin}
              canEdit={!!canEdit}
              canDeleteData={!!canDeleteData}
              currentUsername={user?.username}
              onDelete={handleDelete}
              packageName={packageName}
            />
          )}

        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  badge: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  postedBadge: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
    marginLeft: 8,
  },
  cardText: {
    fontSize: 13,
    color: '#334155',
  },
  cardDate: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  editButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  editButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  deleteButtonText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});

