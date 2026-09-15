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
import { deleteAllData, fetchSurveyList } from '../services/apiService';
import { logout, getCurrentUser } from '../services/authService';
import { clearQueue } from '../services/queueService';
import { AuthUser } from '../types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminDashboard'>;

const PackageSummaryCard = memo(function PackageSummaryCard({
  item,
  navigation,
  userName,
}: {
  item: PackageSummary;
  navigation: Props['navigation'];
  userName?: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.packageName}</Text>
      <Text style={styles.cardCount}>{item.itemCount} data survei tersimpan</Text>
      <View style={styles.cardActionRow}>
        <TouchableOpacity
          style={styles.cardActionButton}
          onPress={() =>
            navigation.navigate('PackageDetail', {
              packageId: item.packageId,
              packageName: item.packageName,
              surveyorName: userName || 'Admin',
            })
          }
        >
          <Text style={styles.cardLink}>Detail Paket</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cardActionButton}
          onPress={() =>
            navigation.navigate('CreatePackage', {
              surveyorName: userName || 'Admin',
              editPackageId: item.packageId,
              packageName: item.packageName,
              kecamatan: item.kecamatan || '',
              desaKelurahan: item.desaKelurahan || '',
            })
          }
        >
          <Text style={styles.cardLink}>Ubah Paket</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cardActionButton}
          onPress={() =>
            navigation.navigate('PackageData', {
              packageId: item.packageId,
              packageName: item.packageName,
            })
          }
        >
          <Text style={styles.cardLink}>Hapus Paket</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

interface PackageSummary {
  packageId: string;
  packageName: string;
  kecamatan?: string;
  desaKelurahan?: string;
  itemCount: number;
  lastUpdate: string;
}

export default function AdminDashboardScreen({ navigation }: Props) {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [allRows, setAllRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [searchText, setSearchText] = useState('');
  const loadInFlightRef = useRef(false);

  const loadData = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    try {
      const [currentUser, rows] = await Promise.all([
        getCurrentUser(),
        fetchSurveyList(),
      ]);
      setUser(currentUser);
      setAllRows(rows);

      const map = new Map<string, PackageSummary>();
      const seenItemKeys = new Set<string>();
      rows.forEach((row, index) => {
        const packageId = row['ID Paket'];
        if (!packageId) return;
        const timestamp = row['Timestamp'] ? String(row['Timestamp']) : '';
        const itemKey = `${packageId}::${row['ID Item Pekerjaan'] || `__row_${index}`}`;
        const isNewItem = !seenItemKeys.has(itemKey);
        if (isNewItem) seenItemKeys.add(itemKey);
        const existing = map.get(packageId);
        if (existing) {
          if (isNewItem) existing.itemCount += 1;
          if (timestamp > existing.lastUpdate) existing.lastUpdate = timestamp;
        } else {
          map.set(packageId, {
            packageId,
            packageName: row['Nama Paket'] || '(Tanpa nama)',
            kecamatan: row['Kecamatan'] || '',
            desaKelurahan: row['Desa/Kelurahan'] || '',
            itemCount: 1,
            lastUpdate: timestamp,
          });
        }
      });

      const result = Array.from(map.values()).sort((a, b) => (a.lastUpdate < b.lastUpdate ? 1 : -1));
      setPackages(result);
    } catch (err: any) {
      Alert.alert('Gagal Memuat', err?.message || 'Tidak dapat mengambil data dari server.');
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
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

  const handleDeleteAllData = () => {
    Alert.alert(
      'Hapus Semua Data',
      'Semua paket dan data survei di sheet GAS akan dihapus. Foto di Drive tetap dipertahankan. Tindakan ini tidak dapat dibatalkan.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus Semua',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAllData(user?.username || '');
              await clearQueue();
              await loadData();
              Alert.alert('Berhasil', 'Semua paket dan data survei telah dihapus.');
            } catch (err: any) {
              Alert.alert('Gagal Menghapus', err?.message || 'Terjadi kesalahan saat menghapus semua data.');
            }
          },
        },
      ]
    );
  };

  const totalItems = packages.reduce((sum, p) => sum + p.itemCount, 0);

  const filteredPackages = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return packages;
    return packages.filter((p) => p.packageName.toLowerCase().includes(query));
  }, [packages, searchText]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>Dashboard Admin</Text>
          <Text style={styles.subtitle}>{user ? `Masuk sebagai ${user.name}` : ''}</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => navigation.navigate('UserManagement')}
          >
            <Text style={styles.manageUsersLink}>Kelola Pengguna</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => navigation.navigate('InfraTypeManagement')}
          >
            <Text style={styles.manageUsersLink}>Jenis Infrastruktur</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => navigation.navigate('Map', {})}
          >
            <Text style={styles.manageUsersLink}>Lihat Peta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => navigation.navigate('Queue')}
          >
            <Text style={styles.manageUsersLink}>Antrian</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.headerAction, styles.logoutAction]} onPress={handleLogout}>
            <Text style={styles.logoutText}>Keluar</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.totalRow}>
        <View style={[styles.totalCard, { marginRight: 8 }]}>
          <Text style={styles.totalLabel}>Total Paket</Text>
          <Text style={styles.totalValue}>{packages.length}</Text>
        </View>
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total Data Survei</Text>
          <Text style={styles.totalValue}>{totalItems}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.allReportBtn, (loading || packages.length === 0) && styles.buttonDisabled]}
        disabled={loading || packages.length === 0}
        onPress={() => navigation.navigate('AllPackagesReport', { allRows })}
      >
        <Text style={styles.allReportBtnText}>Laporan Semua Paket (PDF)</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteAllButton} onPress={handleDeleteAllData}>
        <Text style={styles.deleteAllButtonText}>Hapus Semua Data</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Daftar Paket Pekerjaan</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Cari nama paket pekerjaan..."
        value={searchText}
        onChangeText={setSearchText}
        autoCapitalize="none"
      />

      {loading ? (
        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filteredPackages}
          keyExtractor={(item) => item.packageId}
          contentContainerStyle={{ paddingBottom: 24 }}
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchText.trim()
                ? 'Tidak ada paket yang cocok dengan pencarian.'
                : 'Belum ada paket pekerjaan yang tersurvei.'}
            </Text>
          }
          renderItem={({ item }) => (
            <PackageSummaryCard
              item={item}
              navigation={navigation}
              userName={user?.name}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  headerAction: {
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: theme.colors.primarySoftBg,
  },
  logoutAction: {
    borderColor: '#f5c9c6',
    backgroundColor: theme.colors.dangerBg,
  },
  title: { fontSize: 22, fontWeight: theme.font.semiBold, color: theme.colors.textPrimary },
  subtitle: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  logoutText: { color: theme.colors.danger, fontWeight: theme.font.medium },
  manageUsersLink: { color: theme.colors.primary, fontWeight: theme.font.medium },
  totalCard: { flex: 1, backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, padding: 16 },
  totalRow: { flexDirection: 'row', marginBottom: 12 },
  totalLabel: { color: theme.colors.primaryLight, fontSize: 12 },
  totalValue: { color: '#fff', fontSize: 26, fontWeight: theme.font.semiBold, marginTop: 4 },
  allReportBtn: {
    backgroundColor: theme.colors.textPrimary,
    borderRadius: theme.radius.sm,
    paddingVertical: 11,
    alignItems: 'center',
    marginBottom: 14,
  },
  allReportBtnText: { color: '#fff', fontWeight: theme.font.semiBold, fontSize: 14 },
  deleteAllButton: {
    borderWidth: 1,
    borderColor: '#eeb3ae',
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  deleteAllButtonText: { color: theme.colors.danger, fontWeight: theme.font.semiBold, fontSize: 14 },
  buttonDisabled: { opacity: 0.4 },
  sectionLabel: { fontSize: 14, fontWeight: theme.font.medium, color: theme.colors.textPrimary, marginBottom: 8, marginTop: 4 },
  searchInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: theme.colors.surface,
    marginBottom: 12,
  },
  emptyText: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 24 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: theme.font.medium, color: theme.colors.textPrimary },
  cardCount: { fontSize: 13, color: theme.colors.textPrimary, marginTop: 4 },
  cardLink: { fontSize: 12, color: theme.colors.primary, marginTop: 6, fontWeight: theme.font.medium },
  cardActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 8,
  },
  cardActionButton: {
    paddingVertical: 4,
  },
});
