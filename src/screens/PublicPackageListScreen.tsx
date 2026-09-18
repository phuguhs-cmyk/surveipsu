import React, { useCallback, useMemo, useRef, useState, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { publicListPackages, publicFetchSurveyList, ServerPackage } from '../services/apiService';
import { logout } from '../services/authService';

type Props = NativeStackScreenProps<RootStackParamList, 'PublicPackageList'>;

const LIST_PAGE_SIZE = 12;

const PublicPackageCard = memo(function PublicPackageCard({
  item,
  navigation,
}: {
  item: PublicPackageRow;
  navigation: Props['navigation'];
}) {
  return (
    <View style={styles.card}>
      <TouchableOpacity
        onPress={() =>
          navigation.navigate('PublicPackageData', {
            packageId: item.packageId,
            packageName: item.packageName,
          })
        }
      >
        <Text style={styles.cardTitle}>{item.packageName}</Text>
        <Text style={styles.cardText}>{item.itemCount} item pekerjaan tersimpan</Text>
        <Text style={styles.cardDate}>
          {item.createdAt ? new Date(item.createdAt).toLocaleString('id-ID') : ''}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.mapLink}
        onPress={() =>
          navigation.navigate('Map', {
            packageId: item.packageId,
            packageName: item.packageName,
          })
        }
      >
        <Text style={styles.mapLinkText}>🗺️ Lihat Peta Lokasi</Text>
      </TouchableOpacity>
    </View>
  );
});

interface PublicPackageRow extends ServerPackage {
  itemCount: number;
}

/**
 * Layar untuk akun Viewer (hanya bisa melihat laporan): menampilkan daftar
 * paket pekerjaan dan jumlah data survei di dalamnya. Layar ini murni
 * bersifat baca (read-only) — TIDAK ada tombol tambah/ubah/hapus/posting
 * apa pun, dan hanya memanggil endpoint publicListPackages/publicList di
 * server (tanpa sessionToken untuk pengambilan data), sehingga tidak
 * mungkin mengubah data.
 */
export default function PublicPackageListScreen({ navigation }: Props) {
  const [packages, setPackages] = useState<PublicPackageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  const [searchText, setSearchText] = useState('');
  const loadInFlightRef = useRef(false);

  const filteredPackages = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return packages;
    return packages.filter((p) => p.packageName?.toLowerCase().includes(query));
  }, [packages, searchText]);

  const visiblePackages = filteredPackages.slice(0, visibleCount);
  const hasMorePackages = visibleCount < filteredPackages.length;


  const loadPackages = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    try {
      const [serverPackages, allRows] = await Promise.all([
        publicListPackages(),
        publicFetchSurveyList(),
      ]);
      // Jumlah "item pekerjaan" harus dihitung berdasarkan LOKASI (ID Item
      // Pekerjaan unik), bukan jumlah baris — karena Jalan/Drainase/DPT
      // bersegmen menyimpan satu baris per segmen STA untuk satu lokasi.
      const seenItems = new Map<string, Set<string>>();
      allRows.forEach((row, index) => {
        const packageId = row['ID Paket'];
        if (!packageId) return;
        const itemKey = String(row['ID Item Pekerjaan'] || `__row_${index}`);
        if (!seenItems.has(packageId)) seenItems.set(packageId, new Set());
        seenItems.get(packageId)!.add(itemKey);
      });
      const result = serverPackages
        .map((p) => ({ ...p, itemCount: seenItems.get(p.packageId)?.size || 0 }))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setPackages(result);
      setVisibleCount(LIST_PAGE_SIZE);

    } catch (err: any) {
      Alert.alert('Gagal Memuat', err?.message || 'Tidak dapat mengambil data dari server.');
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPackages();
    }, [loadPackages])
  );

  const handleLogout = () => {
    Alert.alert('Keluar', 'Yakin ingin keluar dari akun ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Keluar',
        style: 'destructive',
        onPress: async () => {
          await logout();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Data Publik Paket Pekerjaan</Text>
          <Text style={styles.subtitle}>
            Halaman ini hanya untuk melihat data survei infrastruktur. Data tidak dapat diubah
            dari sini.
          </Text>
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutLink}>Keluar</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Cari nama paket pekerjaan..."
        value={searchText}
        onChangeText={setSearchText}
        autoCapitalize="none"
      />
      {searchText.trim() ? (
        <Text style={styles.searchResultText}>
          {filteredPackages.length} dari {packages.length} paket ditemukan
        </Text>
      ) : null}

      {loading && packages.length === 0 ? (
        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={visiblePackages}
          keyExtractor={(item) => item.packageId}
          contentContainerStyle={{ paddingBottom: 24 }}
          removeClippedSubviews
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          onEndReached={() => {
            if (hasMorePackages && !loading) {
              setVisibleCount((prev) => Math.min(prev + LIST_PAGE_SIZE, filteredPackages.length));
            }
          }}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchText.trim()
                ? 'Tidak ada paket yang cocok dengan pencarian.'
                : 'Belum ada paket pekerjaan.'}
            </Text>
          }
          ListFooterComponent={
            hasMorePackages ? (
              <TouchableOpacity
                style={styles.loadMoreButton}
                onPress={() => setVisibleCount((prev) => Math.min(prev + LIST_PAGE_SIZE, filteredPackages.length))}
              >
                <Text style={styles.loadMoreText}>Muat lebih</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => (
            <PublicPackageCard item={item} navigation={navigation} />
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  logoutLink: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
    paddingVertical: 2,
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
    lineHeight: 18,
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginTop: 24,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  searchResultText: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
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
  loadMoreButton: {
    backgroundColor: '#e0e7ff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  loadMoreText: {
    color: '#1d4ed8',
    fontWeight: '600',
  },
  mapLink: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  mapLinkText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 12,
  },
});
