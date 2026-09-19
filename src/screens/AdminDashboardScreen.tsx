import React, { useCallback, useMemo, useRef, useState, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { deleteAllData, fetchSurveyList, listProposalsFromServer } from '../services/apiService';
import { logout, getCurrentUser } from '../services/authService';
import { clearQueue, getQueue } from '../services/queueService';
import { clearAllPackages, syncPackagesFromServer, getPackages, setPackageExecutedEverywhere } from '../services/packageService';
import { clearAllAnnotations } from '../services/annotationService';
import { AuthUser } from '../types';
import { theme } from '../theme';

type PackageStatusFilter = 'all' | 'draft' | 'in_progress' | 'posted';

function getStatusMeta(status: 'draft' | 'in_progress' | 'posted') {
  switch (status) {
    case 'posted':
      return { label: 'Diposting', bg: theme.colors.successBg, color: theme.colors.success };
    case 'in_progress':
      return { label: 'Proses', bg: theme.colors.warningBg, color: theme.colors.warning };
    default:
      return { label: 'Draft', bg: theme.colors.borderSoft, color: theme.colors.textSecondary };
  }
}

// Palet warna lembut untuk avatar inisial surveyor (sama seperti di
// PackageListScreen), agar tampilan konsisten di kedua layar. Warna
// dipilih deterministik dari nama surveyor supaya konsisten antar sesi.
const AVATAR_PALETTE = ['#3b6fd6', '#3fa876', '#dba13a', '#e0685f', '#8b5cf6', '#0891b2', '#c2410c', '#4f46e5'];

function getAvatarColor(name: string): string {
  const trimmed = (name || '?').trim();
  let hash = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) & 0xffffffff;
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

function getAvatarInitial(name: string): string {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

type Props = NativeStackScreenProps<RootStackParamList, 'AdminDashboard'>;

const PackageSummaryCard = memo(function PackageSummaryCard({
  item,
  navigation,
  userName,
  isAdmin,
  togglingId,
  onToggleExecuted,
}: {
  item: PackageSummary;
  navigation: Props['navigation'];
  userName?: string;
  isAdmin?: boolean;
  togglingId?: string | null;
  onToggleExecuted?: (item: PackageSummary) => void;
}) {
  const statusMeta = getStatusMeta(item.status);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.surveyorName || '') }]}>
          <Text style={styles.avatarText}>{getAvatarInitial(item.surveyorName || '')}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.packageName}</Text>
          {!!item.surveyorName && <Text style={styles.cardOwnerText}>oleh {item.surveyorName}</Text>}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
        </View>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.cardCount}>{item.itemCount} data survei tersimpan</Text>
        <Text style={styles.proposalBadge}>📄 {item.proposalCount || 0} Proposal</Text>
      </View>
      {item.executed && (
        <View style={styles.executedBadge}>
          <Text style={styles.executedBadgeText}>✓ Sudah Dilaksanakan</Text>
        </View>
      )}
      {(item.kecamatan || item.desaKelurahan) && (
        <Text style={styles.cardLocation}>
          {[item.kecamatan, item.desaKelurahan].filter(Boolean).join(', ')}
        </Text>
      )}
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
          <Text style={styles.cardLink}>Kelola Data (Edit/Hapus)</Text>
        </TouchableOpacity>
      </View>
      {isAdmin && onToggleExecuted && (
        <TouchableOpacity
          style={[styles.toggleButton, item.executed && styles.toggleButtonActive]}
          onPress={() => onToggleExecuted(item)}
          disabled={togglingId === item.packageId}
        >
          <Text style={[styles.toggleButtonText, item.executed && styles.toggleButtonTextActive]}>
            {togglingId === item.packageId
              ? '...'
              : item.executed
              ? 'Batalkan Tanda Dilaksanakan'
              : 'Tandai Sudah Dilaksanakan'}
          </Text>
        </TouchableOpacity>
      )}
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
  status: 'draft' | 'in_progress' | 'posted';
  surveyorName?: string;
  proposalCount?: number;
  executed?: boolean;
}

const DELETE_ALL_CONFIRM_PHRASE = 'HAPUS SEMUA DATA';

const STATUS_FILTERS: { key: PackageStatusFilter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'draft', label: 'Draft' },
  { key: 'in_progress', label: 'Proses' },
  { key: 'posted', label: 'Diposting' },
];

export default function AdminDashboardScreen({ navigation }: Props) {
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [allRows, setAllRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<PackageStatusFilter>('all');
  const [queuePendingCount, setQueuePendingCount] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [deleteAllModalVisible, setDeleteAllModalVisible] = useState(false);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [deletingAll, setDeletingAll] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const loadInFlightRef = useRef(false);

  const loadData = useCallback(async (isRefresh = false) => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [currentUser, rows, queue] = await Promise.all([
        getCurrentUser(),
        fetchSurveyList(),
        getQueue().catch(() => []),
      ]);
      setUser(currentUser);
      setAllRows(rows);
      setQueuePendingCount(queue.filter((q) => q.status !== 'sending').length);

      // Sinkronkan cache paket lokal dengan sheet master `Packages` di server,
      // lalu ambil daftar paket lokal (termasuk paket yang belum punya data
      // survei sama sekali) beserta jumlah proposal yang sudah diunggah per
      // paket. Ini menggabungkan data yang sebelumnya terpisah di layar
      // "Rekap Paket" ke Daftar Paket Pekerjaan, supaya admin cukup melihat
      // satu layar untuk status survei, jumlah proposal, dan status
      // pelaksanaan.
      await syncPackagesFromServer().catch(() => undefined);
      const [localPackages, allProposals] = await Promise.all([
        getPackages(),
        listProposalsFromServer().catch(() => []),
      ]);
      const proposalCountByPackage = new Map<string, number>();
      allProposals.forEach((p) => {
        proposalCountByPackage.set(p.packageId, (proposalCountByPackage.get(p.packageId) || 0) + 1);
      });

      const map = new Map<string, PackageSummary & { allPosted: boolean }>();
      const seenItemKeys = new Set<string>();
      rows.forEach((row, index) => {
        const packageId = row['ID Paket'];
        if (!packageId) return;
        const timestamp = row['Timestamp'] ? String(row['Timestamp']) : '';
        const itemKey = `${packageId}::${row['ID Item Pekerjaan'] || `__row_${index}`}`;
        const isNewItem = !seenItemKeys.has(itemKey);
        if (isNewItem) seenItemKeys.add(itemKey);
        const isPosted = row['Status'] === 'Diposting';
        const existing = map.get(packageId);
        if (existing) {
          if (isNewItem) existing.itemCount += 1;
          if (timestamp > existing.lastUpdate) existing.lastUpdate = timestamp;
          existing.allPosted = existing.allPosted && isPosted;
        } else {
          map.set(packageId, {
            packageId,
            packageName: row['Nama Paket'] || '(Tanpa nama)',
            kecamatan: row['Kecamatan'] || '',
            desaKelurahan: row['Desa/Kelurahan'] || '',
            itemCount: 1,
            lastUpdate: timestamp,
            allPosted: isPosted,
            status: 'draft',
            surveyorName: row['Nama Surveyor'] || '',
          });
        }
      });

      // Tambahkan paket lokal (mis. baru dibuat, belum ada data survei atau
      // dibuat dari perangkat lain) yang belum tercatat dari data survei di
      // atas, agar semua paket (termasuk yang belum ada item pekerjaan)
      // tetap tampil di Daftar Paket Pekerjaan.
      localPackages.forEach((pkg) => {
        if (map.has(pkg.id)) return;
        map.set(pkg.id, {
          packageId: pkg.id,
          packageName: pkg.name || '(Tanpa nama)',
          kecamatan: pkg.kecamatan || '',
          desaKelurahan: pkg.desaKelurahan || '',
          itemCount: pkg.itemCount || 0,
          lastUpdate: pkg.createdAt || '',
          allPosted: !!pkg.posted,
          status: 'draft',
          surveyorName: pkg.surveyorName || '',
        });
      });

      // Lengkapi jumlah proposal terunggah dan status "Sudah Dilaksanakan"
      // (disimpan di cache paket lokal, bukan di baris data survei).
      const executedByPackage = new Map<string, boolean>();
      localPackages.forEach((pkg) => {
        executedByPackage.set(pkg.id, !!pkg.executed);
      });
      map.forEach((pkg, packageId) => {
        pkg.proposalCount = proposalCountByPackage.get(packageId) || 0;
        pkg.executed = executedByPackage.get(packageId) || false;
      });

      const result = Array.from(map.values())
        .map((pkg) => ({
          ...pkg,
          status: (pkg.itemCount > 0 ? (pkg.allPosted ? 'posted' : 'in_progress') : 'draft') as PackageSummary['status'],
        }))
        .sort((a, b) => (a.lastUpdate < b.lastUpdate ? 1 : -1));
      setPackages(result);
    } catch (err: any) {
      Alert.alert('Gagal Memuat', err?.message || 'Tidak dapat mengambil data dari server.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadInFlightRef.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleRefresh = useCallback(() => {
    loadData(true);
  }, [loadData]);

  const handleToggleExecuted = useCallback(
    (item: PackageSummary) => {
      const nextExecuted = !item.executed;
      Alert.alert(
        nextExecuted ? 'Tandai Sudah Dilaksanakan' : 'Batalkan Tanda Dilaksanakan',
        nextExecuted
          ? `Tandai paket "${item.packageName}" sebagai sudah dilaksanakan di lapangan?`
          : `Batalkan tanda "Sudah Dilaksanakan" untuk paket "${item.packageName}"?`,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Ya',
            onPress: async () => {
              setTogglingId(item.packageId);
              try {
                await setPackageExecutedEverywhere(item.packageId, nextExecuted, user?.username);
                setPackages((prev) =>
                  prev.map((p) => (p.packageId === item.packageId ? { ...p, executed: nextExecuted } : p))
                );
              } catch (err: any) {
                Alert.alert('Gagal', err?.message || 'Terjadi kesalahan saat mengubah status pelaksanaan.');
              } finally {
                setTogglingId(null);
              }
            },
          },
        ]
      );
    },
    [user?.username]
  );

  const handleLogout = () => {
    setMenuVisible(false);
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
    setMenuVisible(false);
    setDeleteAllConfirmText('');
    setDeleteAllModalVisible(true);
  };

  const closeDeleteAllModal = () => {
    if (deletingAll) return;
    setDeleteAllModalVisible(false);
    setDeleteAllConfirmText('');
  };

  const confirmDeleteAll = async () => {
    if (deleteAllConfirmText.trim() !== DELETE_ALL_CONFIRM_PHRASE) return;
    setDeletingAll(true);
    try {
      await deleteAllData(user?.username || '');
      await clearQueue();
      // Bersihkan juga cache paket & anotasi lokal, agar tidak ada data
      // "yatim" (paket/anotasi lokal tanpa induk data survei) yang
      // tertinggal di perangkat setelah data server dihapus.
      await clearAllPackages();
      await clearAllAnnotations();
      await loadData();
      setDeleteAllModalVisible(false);
      setDeleteAllConfirmText('');
      Alert.alert('Berhasil', 'Semua paket dan data survei telah dihapus.');
    } catch (err: any) {
      Alert.alert('Gagal Menghapus', err?.message || 'Terjadi kesalahan saat menghapus semua data.');
    } finally {
      setDeletingAll(false);
    }
  };


  const totalItems = packages.reduce((sum, p) => sum + p.itemCount, 0);

  const filteredPackages = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return packages.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (query && !p.packageName.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [packages, searchText, statusFilter]);

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
            onPress={() => navigation.navigate('Map', {})}
          >
            <Text style={styles.manageUsersLink}>🗺️ Peta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => navigation.navigate('Queue')}
          >
            <Text style={styles.manageUsersLink}>
              📋 Antrian{queuePendingCount > 0 ? ` (${queuePendingCount})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => setMenuVisible(true)}
            accessibilityLabel="Menu lainnya"
          >
            <Text style={styles.menuButtonText}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                navigation.navigate('UserManagement');
              }}
            >
              <Text style={styles.menuItemText}>👤 Kelola Pengguna</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                navigation.navigate('InfraTypeManagement');
              }}
            >
              <Text style={styles.menuItemText}>🏗️ Jenis Infrastruktur</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleDeleteAllData}>
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>🗑️ Hapus Semua Data</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>🚪 Keluar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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

      <Text style={styles.sectionLabel}>Daftar Paket Pekerjaan</Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Cari nama paket pekerjaan..."
        value={searchText}
        onChangeText={setSearchText}
        autoCapitalize="none"
      />

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
            onPress={() => setStatusFilter(f.key)}
          >
            <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme.colors.primary]} />
          }
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
              isAdmin={user?.role === 'admin'}
              togglingId={togglingId}
              onToggleExecuted={handleToggleExecuted}
            />
          )}
        />
      )}

      <Modal
        visible={deleteAllModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteAllModal}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Hapus Semua Data</Text>
            <Text style={styles.modalMessage}>
              Semua paket dan data survei di sheet GAS akan dihapus, beserta seluruh foto
              terkait di Google Drive dan anotasi peta. Tindakan ini tidak dapat dibatalkan.
            </Text>
            <Text style={styles.modalInstruction}>
              Ketik <Text style={styles.modalPhrase}>{DELETE_ALL_CONFIRM_PHRASE}</Text> untuk
              melanjutkan:
            </Text>
            <TextInput
              style={styles.modalInput}
              value={deleteAllConfirmText}
              onChangeText={setDeleteAllConfirmText}
              placeholder={DELETE_ALL_CONFIRM_PHRASE}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!deletingAll}
            />
            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={closeDeleteAllModal}
                disabled={deletingAll}
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.modalConfirmButton,
                  (deleteAllConfirmText.trim() !== DELETE_ALL_CONFIRM_PHRASE || deletingAll) &&
                    styles.buttonDisabled,
                ]}
                onPress={confirmDeleteAll}
                disabled={deleteAllConfirmText.trim() !== DELETE_ALL_CONFIRM_PHRASE || deletingAll}
              >
                {deletingAll ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Hapus Semua</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {
    fontSize: 20,
    fontWeight: theme.font.bold,
    color: theme.colors.textPrimary,
    lineHeight: 20,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 16,
  },
  menuCard: {
    width: 220,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: theme.font.medium,
    color: theme.colors.textPrimary,
  },
  menuItemDanger: {
    color: theme.colors.danger,
  },
  menuDivider: {
    height: 1,
    backgroundColor: theme.colors.borderSoft,
    marginVertical: 4,
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.surface,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: theme.font.medium,
    color: theme.colors.textPrimary,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: theme.font.semiBold,
  },
  cardTitle: { fontSize: 16, fontWeight: theme.font.medium, color: theme.colors.textPrimary },
  cardOwnerText: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 1 },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: theme.font.semiBold,
    fontSize: 13,
  },
  cardCount: { fontSize: 13, color: theme.colors.textPrimary, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  proposalBadge: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: theme.font.medium },
  executedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.successBg,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 6,
  },
  executedBadgeText: { color: theme.colors.success, fontSize: 11, fontWeight: theme.font.semiBold },
  toggleButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleButtonActive: {
    borderColor: theme.colors.danger,
  },
  toggleButtonText: { color: theme.colors.primary, fontSize: 12, fontWeight: theme.font.medium },
  toggleButtonTextActive: { color: theme.colors.danger },
  cardLocation: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: theme.font.semiBold,
    color: theme.colors.textPrimary,
    marginBottom: 10,
  },
  modalMessage: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 14,
    lineHeight: 19,
  },
  modalInstruction: {
    fontSize: 13,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  modalPhrase: {
    fontWeight: theme.font.semiBold,
    color: theme.colors.danger,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: theme.colors.background,
    marginBottom: 16,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: theme.radius.sm,
    minWidth: 96,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: theme.colors.primarySoftBg,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  modalCancelText: {
    color: theme.colors.textPrimary,
    fontWeight: theme.font.medium,
  },
  modalConfirmButton: {
    backgroundColor: theme.colors.danger,
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: theme.font.semiBold,
  },
});
