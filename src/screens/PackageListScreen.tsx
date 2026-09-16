import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import {
  getPackages,
  syncPackagesFromServer,
  deletePackageEverywhere,
  derivePackageStatus,
  WorkPackage,
} from '../services/packageService';
import { fetchSurveyList } from '../services/apiService';
import { logout, getCurrentUser } from '../services/authService';
import { AuthUser } from '../types';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PackageList'>;

const LIST_PAGE_SIZE = 12;

let packageListLoadLock: Promise<void> | null = null;

export default function PackageListScreen({ route, navigation }: Props) {
  const { surveyorName } = route.params;
  const [packages, setPackages] = useState<WorkPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [searchText, setSearchText] = useState('');
  const [visibleCount, setVisibleCount] = useState(LIST_PAGE_SIZE);
  const loadInFlightRef = useRef(false);
  const lastServerSyncRef = useRef(0);

  const isAdmin = user?.role === 'admin';
  const canEditPackage = isAdmin || user?.permissions?.canEdit !== false;
  const canDeletePackage = isAdmin || user?.permissions?.canDelete !== false;

  const filteredPackages = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return packages;
    return packages.filter((p) => {
      const name = String(p.name || '').toLowerCase();
      const surveyor = String(p.surveyorName || '').toLowerCase();
      return name.includes(query) || surveyor.includes(query);
    });
  }, [packages, searchText]);

  const visiblePackages = filteredPackages.slice(0, visibleCount);
  const hasMorePackages = visibleCount < filteredPackages.length;

  const loadMorePackages = useCallback(() => {
    if (visibleCount >= filteredPackages.length) return;
    setVisibleCount((prev) => Math.min(prev + LIST_PAGE_SIZE, filteredPackages.length));
  }, [filteredPackages.length, visibleCount]);

  const loadPackages = useCallback(async () => {
    if (packageListLoadLock || loadInFlightRef.current) {
      return packageListLoadLock || Promise.resolve();
    }

    const run = (async () => {
      loadInFlightRef.current = true;
      setLoading(true);
      try {
        const localPackagesResult = await getPackages();
        const currentUser = await getCurrentUser().catch(() => null);
        setUser((prev) => prev ?? currentUser);
        setPackages(localPackagesResult);
        setVisibleCount(LIST_PAGE_SIZE);

        const shouldSyncServerPackages = Date.now() - lastServerSyncRef.current > 30000 || localPackagesResult.length === 0;
        // OPTIMASI: Jangan read AsyncStorage lagi (redundant). Gunakan cache yang sudah dibaca di atas.
        // Setelah sync, cache invalid, jadi getPackages() akan read fresh dari AsyncStorage.
        const merged = new Map<string, WorkPackage>();
        localPackagesResult.forEach((p) => merged.set(p.id, p));

        try {
          // OPTIMASI: Jalankan sync & fetch PARALLEL, bukan sequential.
          // Ini mengurangi waktu tunggu dari ~60s menjadi ~35s saat kedua call lambat.
          let allRows: any[] = [];
          if (shouldSyncServerPackages) {
            lastServerSyncRef.current = Date.now();
            // Jalankan sync & fetch bersamaan dengan Promise.all(), bukan await sequential
            [, allRows] = await Promise.all([
              syncPackagesFromServer().catch(() => undefined),
              fetchSurveyList(),
            ]);
          } else {
            allRows = await fetchSurveyList();
          }
          const byPackage = new Map<
            string,
            {
              name: string;
              count: number;
              lastUpdate: string;
              surveyorName: string;
              posted: boolean;
              kecamatan?: string;
              desaKelurahan?: string;
            }
          >();
          const seenItemKeys = new Set<string>();
          allRows.forEach((row, index) => {
            const packageId = row['ID Paket'];
            if (!packageId) return;
            const timestamp = row['Timestamp'] ? String(row['Timestamp']) : '';
            const isRowPosted = row['Status'] === 'Diposting';
            const itemKey = `${packageId}::${row['ID Item Pekerjaan'] || `__row_${index}`}`;
            const isNewItem = !seenItemKeys.has(itemKey);
            if (isNewItem) seenItemKeys.add(itemKey);
            const existing = byPackage.get(packageId);
            if (existing) {
              if (isNewItem) existing.count += 1;
              if (timestamp > existing.lastUpdate) existing.lastUpdate = timestamp;
              existing.posted = existing.posted && isRowPosted;
              existing.kecamatan = existing.kecamatan || row['Kecamatan'] || '';
              existing.desaKelurahan = existing.desaKelurahan || row['Desa/Kelurahan'] || '';
            } else {
              byPackage.set(packageId, {
                name: row['Nama Paket'] || '(Tanpa nama)',
                count: 1,
                lastUpdate: timestamp,
                surveyorName: row['Nama Surveyor'] || '',
                posted: isRowPosted,
                kecamatan: row['Kecamatan'] || '',
                desaKelurahan: row['Desa/Kelurahan'] || '',
              });
            }
          });

          byPackage.forEach((info, packageId) => {
            const existingLocal = merged.get(packageId);
            const itemCount = info.count;
            const derivedStatus = derivePackageStatus({ itemCount, isPosted: info.posted });
            if (existingLocal) {
              merged.set(packageId, {
                ...existingLocal,
                itemCount,
                posted: info.posted,
                status: derivedStatus,
                kecamatan: existingLocal.kecamatan || info.kecamatan,
                desaKelurahan: existingLocal.desaKelurahan || info.desaKelurahan,
              });
            } else {
              merged.set(packageId, {
                id: packageId,
                name: info.name,
                createdAt: info.lastUpdate || new Date().toISOString(),
                surveyorName: info.surveyorName,
                itemCount,
                posted: info.posted,
                status: derivedStatus,
              });
            }
          });
        } catch {
          // Offline atau gagal fetch: tetap pakai data lokal yang sudah ada.
        }

        const result = Array.from(merged.values()).sort((a, b) =>
          a.createdAt < b.createdAt ? 1 : -1
        );
        setPackages(result);
        setVisibleCount(LIST_PAGE_SIZE);
      } finally {
        setLoading(false);
        loadInFlightRef.current = false;
      }
    })();

    packageListLoadLock = run.finally(() => {
      packageListLoadLock = null;
    });
    return packageListLoadLock;
  }, [surveyorName]);


  useFocusEffect(
    useCallback(() => {
      loadPackages();
    }, [loadPackages])
  );

  const handleDeletePackage = (pkg: WorkPackage) => {
    Alert.alert(
      'Hapus Paket Pekerjaan',
      `Yakin ingin menghapus paket "${pkg.name}"? SELURUH data survei dan foto di dalam paket ini akan ikut terhapus permanen dan tidak dapat dikembalikan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePackageEverywhere(pkg.id, user?.username);
              await loadPackages();
            } catch (err: any) {
              Alert.alert('Gagal Menghapus', err?.message || 'Terjadi kesalahan.');
            }
          },
        },
      ]
    );
  };

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={24}
        extraHeight={120}
      >
        <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Paket Pekerjaan</Text>
        </View>
        <View style={styles.headerLinks}>
          <TouchableOpacity onPress={() => navigation.navigate('CreatePackage', { surveyorName })}>
            <Text style={styles.link}>+ Buat Paket</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Map', {})}>
            <Text style={styles.link}>🗺️ Lihat Peta</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshButton} onPress={() => { void loadPackages(); }} disabled={loading}>
            <Text style={styles.refreshButtonText}>{loading ? '⏳' : '↻'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Queue')}>
            <Text style={styles.link}>Antrian</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={styles.logoutLink}>Keluar</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.surveyorLabel}>Surveyor: {surveyorName}</Text>
      <Text style={styles.label}>Daftar Paket Tersimpan</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Cari nama paket atau surveyor..."
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
        <ActivityIndicator size="small" color="#2563eb" style={{ marginTop: 12 }} />
      ) : filteredPackages.length === 0 ? (
        <Text style={styles.emptyText}>
          {searchText.trim()
            ? 'Tidak ada paket yang cocok dengan pencarian.'
            : 'Belum ada paket pekerjaan. Buat paket baru di atas.'}
        </Text>
      ) : (
        <>
          {visiblePackages.map((item) => {
            const status = derivePackageStatus({ itemCount: item.itemCount || 0, isPosted: !!item.posted });
            const canModify = !item.posted;
            const statusLabel = status === 'posted' ? 'Survei Selesai' : status === 'in_progress' ? 'Dalam Proses' : 'Belum Ada Data';
            return (
              <View key={item.id} style={styles.card}>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('PackageDetail', {
                      packageId: item.id,
                      packageName: item.name,
                      surveyorName,
                    })
                  }
                >
                  <Text style={styles.cardTitle}>{item.name}</Text>
                </TouchableOpacity>
                <Text style={styles.cardText}>{item.itemCount} item pekerjaan tersimpan</Text>
                {item.surveyorName && item.surveyorName !== surveyorName && (
                  <Text style={styles.cardText}>Surveyor: {item.surveyorName}</Text>
                )}
                <Text style={status === 'posted' ? styles.postedBadge : status === 'in_progress' ? styles.inProgressBadge : styles.draftBadge}>{statusLabel}</Text>
                <Text style={styles.cardDate}>{new Date(item.createdAt).toLocaleString('id-ID')}</Text>

                <View style={styles.cardActionRow}>
                  <TouchableOpacity
                    style={styles.viewDataButton}
                    onPress={() =>
                      navigation.navigate('PackageDetail', {
                        packageId: item.id,
                        packageName: item.name,
                        surveyorName,
                      })
                    }
                  >
                    <Text style={styles.viewDataButtonText}>Detail Paket</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.viewDataButton}
                    onPress={() =>
                      navigation.navigate('PackageData', {
                        packageId: item.id,
                        packageName: item.name,
                      })
                    }
                  >
                    <Text style={styles.viewDataButtonText}>Kelola Data (Edit/Hapus)</Text>
                  </TouchableOpacity>

                  {canEditPackage && canModify && (
                    <TouchableOpacity
                      style={styles.viewDataButton}
                      onPress={() =>
                        navigation.navigate('CreatePackage', {
                          surveyorName,
                          editPackageId: item.id,
                          packageName: item.name,
                          kecamatan: item.kecamatan,
                          desaKelurahan: item.desaKelurahan,
                        })
                      }
                    >
                      <Text style={styles.viewDataButtonText}>Ubah Paket</Text>
                    </TouchableOpacity>
                  )}

                  {canDeletePackage && canModify && (
                    <TouchableOpacity style={styles.deletePackageButton} onPress={() => handleDeletePackage(item)}>
                      <Text style={styles.deletePackageButtonText}>Hapus Paket</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          {hasMorePackages && (
            <TouchableOpacity style={styles.loadMoreButton} onPress={loadMorePackages}>
              <Text style={styles.loadMoreText}>Muat lebih</Text>
            </TouchableOpacity>
          )}
        </>
      )}
      </KeyboardAwareScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 4,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: theme.font.semiBold,
    color: theme.colors.textPrimary,
  },
  link: {
    color: theme.colors.primary,
    fontWeight: theme.font.medium,
  },
  headerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  refreshButton: {
    minWidth: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  refreshButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: theme.font.medium,
  },
  logoutLink: {
    color: theme.colors.danger,
    fontWeight: theme.font.medium,
  },

  surveyorLabel: {
    color: theme.colors.textSecondary,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: theme.font.medium,
    color: theme.colors.textPrimary,
    marginTop: 8,
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: theme.font.medium,
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  typeChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  typeChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
  },
  typeChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  typeChipText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: theme.font.medium,
  },
  typeChipTextActive: {
    color: '#fff',
  },

  newRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  newInput: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: theme.colors.surface,
    marginBottom: 6,
    color: theme.colors.textPrimary,
  },
  searchResultText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  addButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: theme.colors.disabled,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: theme.font.medium,
  },
  regionRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    alignItems: 'stretch',
  },
  dropdownInput: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
    maxWidth: 360,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  dropdownDisabled: {
    opacity: 0.5,
  },
  dropdownValueText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
  },
  dropdownPlaceholderText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    marginTop: 24,
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
    fontWeight: theme.font.medium,
    color: theme.colors.textPrimary,
    marginBottom: 4,
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
  cardActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  addItemButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  addItemButtonText: {
    color: '#fff',
    fontWeight: theme.font.medium,
    fontSize: 13,
  },
  viewDataButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  viewDataButtonText: {
    color: theme.colors.primary,
    fontWeight: theme.font.medium,
    fontSize: 13,
  },
  deletePackageButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  deletePackageButtonText: {
    color: theme.colors.danger,
    fontWeight: theme.font.medium,
    fontSize: 13,
  },
  postedBadge: {
    color: theme.colors.success,
    fontSize: 11,
    fontWeight: theme.font.semiBold,
    marginTop: 2,
  },
  inProgressBadge: {
    color: '#2563eb',
    fontSize: 11,
    fontWeight: theme.font.semiBold,
    marginTop: 2,
  },
  draftBadge: {
    color: '#475569',
    fontSize: 11,
    fontWeight: theme.font.semiBold,
    marginTop: 2,
  },
});

