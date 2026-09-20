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
import { theme } from '../theme';
import { DashboardStatChips } from '../components/DashboardStatChips';

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

      <DashboardStatChips
        items={[
          { key: 'packages', value: packages.length, label: 'Total Paket' },
          {
            key: 'items',
            value: packages.reduce((sum, p) => sum + (p.itemCount || 0), 0),
            label: 'Total Data Survei',
          },
        ]}
      />

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
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 24 }} />
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
    backgroundColor: theme.colors.background,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: theme.font.semiBold,
    marginBottom: 6,
    color: theme.colors.textPrimary,
  },
  logoutLink: {
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: theme.font.semiBold,
    marginLeft: 12,
    paddingVertical: 2,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    marginTop: 24,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
    color: theme.colors.textPrimary,
  },
  searchResultText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: theme.font.semiBold,
    marginBottom: 4,
    color: theme.colors.textPrimary,
  },
  cardText: {
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  cardDate: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  loadMoreButton: {
    backgroundColor: theme.colors.primarySoftBg,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  loadMoreText: {
    color: theme.colors.primaryDark,
    fontWeight: theme.font.semiBold,
  },
  mapLink: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primarySoftBg,
    borderRadius: theme.radius.xs,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  mapLinkText: {
    color: theme.colors.primaryDark,
    fontWeight: theme.font.bold,
    fontSize: 12,
  },
});

