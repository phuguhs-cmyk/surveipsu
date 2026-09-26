import React, { useCallback, useMemo, useRef, useState, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
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
import { deleteAllData, fetchSurveyList, listProposalsFromServer , ExecutedOutputEntry } from '../services/apiService';
import { logout, getCurrentUser } from '../services/authService';
import { clearQueue, getQueue } from '../services/queueService';
import {
  clearAllPackages,
  syncPackagesFromServer,
  getPackages,
  setPackageExecutedEverywhere,
  deletePackageEverywhere,
} from '../services/packageService';

import { clearAllAnnotations } from '../services/annotationService';
import { AuthUser } from '../types';
import { theme } from '../theme';
import { INFRASTRUCTURE_TYPES } from '../config';
import { getAvatarColor, getAvatarInitial } from '../utils/avatar';
import { DashboardStatChips } from '../components/DashboardStatChips';
import SearchableSelectModal from '../components/SearchableSelectModal';
import { printPackageExecutionReport, printExecutionRecapReport } from '../services/reportService';


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

// Palet warna lembut untuk avatar inisial surveyor kini diekstrak ke
// `utils/avatar.ts` (dipakai bersama PackageListScreen) agar tampilan
// konsisten dan tidak terduplikasi.

type Props = NativeStackScreenProps<RootStackParamList, 'AdminDashboard'>;

const PackageSummaryCard = memo(function PackageSummaryCard({
  item,
  navigation,
  userName,
  isAdmin,
  togglingId,
  onToggleExecuted,
  onDeletePackage,
  deletingId,
  onViewReport,
  onOpenReportMenu,
}: {
  item: PackageSummary;
  navigation: Props['navigation'];
  userName?: string;
  isAdmin?: boolean;
  togglingId?: string | null;
  onToggleExecuted?: (item: PackageSummary) => void;
  onDeletePackage?: (item: PackageSummary) => void;
  deletingId?: string | null;
  onViewReport?: (item: PackageSummary) => void;
  onOpenReportMenu?: (item: PackageSummary) => void;
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
          <Text style={styles.executedBadgeText}>✓ Sudah Dilaksanakan{item.executedYear ? ` (${item.executedYear})` : ''}</Text>
          {!!item.executedContractor && (
            <Text style={styles.executedDetailText}>Penyedia Jasa: {item.executedContractor}</Text>
          )}
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
          <Text style={styles.cardActionButtonText}>Ubah Paket</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cardActionButton}
          onPress={() =>
            navigation.navigate('Map', {
              packageId: item.packageId,
              packageName: item.packageName,
              surveyorName: userName || 'Admin',
            })
          }
        >
          <Text style={styles.cardActionButtonText}>Peta Lokasi</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.cardActionRowSecondary}>
        <TouchableOpacity
          style={styles.cardActionButton}
          onPress={() => (onOpenReportMenu ? onOpenReportMenu(item) : onViewReport && onViewReport(item))}
        >
          <Text style={styles.cardActionButtonText}>Laporan</Text>
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
          <Text style={styles.cardActionButtonText}>Kelola Data</Text>
        </TouchableOpacity>
      </View>
      {((item.status !== 'posted' && onDeletePackage) || (isAdmin && onToggleExecuted)) && (
        <View style={styles.cardActionRowSecondary}>
          {item.status !== 'posted' && onDeletePackage && (
            <TouchableOpacity
              style={[styles.cardActionButton, styles.cardActionButtonDanger]}
              onPress={() => onDeletePackage(item)}
              disabled={deletingId === item.packageId}
            >
              <Text style={[styles.cardActionButtonText, styles.cardActionButtonTextDanger]}>
                {deletingId === item.packageId ? 'Menghapus...' : 'Hapus Paket'}
              </Text>
            </TouchableOpacity>
          )}
          {isAdmin && onToggleExecuted && (
            <TouchableOpacity
              style={[styles.cardActionButton, item.executed && styles.toggleButtonActive]}
              onPress={() => onToggleExecuted(item)}
              disabled={togglingId === item.packageId}
            >
              <Text style={[styles.cardActionButtonText, item.executed && styles.toggleButtonTextActive]}>
                {togglingId === item.packageId
                  ? '...'
                  : item.executed
                  ? 'Ubah Info Pelaksanaan'
                  : 'Tandai Sudah Dilaksanakan'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
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
  executedYear?: number;
  executedContractor?: string;
  executedOutput?: ExecutedOutputEntry[];
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [printingExecutionId, setPrintingExecutionId] = useState<string | null>(null);
  const [printingRecap, setPrintingRecap] = useState(false);
  const [reportMenuVisible, setReportMenuVisible] = useState(false);
  const [reportMenuTarget, setReportMenuTarget] = useState<PackageSummary | null>(null);
  const [executedModalVisible, setExecutedModalVisible] = useState(false);
  const [executedTarget, setExecutedTarget] = useState<PackageSummary | null>(null);
  const [executedYear, setExecutedYear] = useState('');
  const [executedContractor, setExecutedContractor] = useState('');
  const [executedOutputRows, setExecutedOutputRows] = useState<ExecutedOutputEntry[]>([]);
  const [infraPickerVisible, setInfraPickerVisible] = useState(false);
  const [infraPickerRowIndex, setInfraPickerRowIndex] = useState<number | null>(null);
  const [savingExecuted, setSavingExecuted] = useState(false);


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
      const executedYearByPackage = new Map<string, number | undefined>();
      const executedContractorByPackage = new Map<string, string | undefined>();
      const executedOutputByPackage = new Map<string, ExecutedOutputEntry[] | undefined>();
      localPackages.forEach((pkg) => {
        executedByPackage.set(pkg.id, !!pkg.executed);
        executedYearByPackage.set(pkg.id, pkg.executedYear);
        executedContractorByPackage.set(pkg.id, pkg.executedContractor);
        executedOutputByPackage.set(pkg.id, pkg.executedOutput);
      });
      map.forEach((pkg, packageId) => {
        pkg.proposalCount = proposalCountByPackage.get(packageId) || 0;
        pkg.executed = executedByPackage.get(packageId) || false;
        pkg.executedYear = executedYearByPackage.get(packageId);
        pkg.executedContractor = executedContractorByPackage.get(packageId);
        pkg.executedOutput = executedOutputByPackage.get(packageId);
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

  const openExecutedModal = useCallback((item: PackageSummary) => {
    setExecutedTarget(item);
    setExecutedYear(item.executed && item.executedYear ? String(item.executedYear) : String(new Date().getFullYear()));
    setExecutedContractor(item.executed ? item.executedContractor || '' : '');
    setExecutedOutputRows(
      item.executed && item.executedOutput && item.executedOutput.length > 0
        ? item.executedOutput.map((row) => ({ ...row }))
        : [{ infraType: INFRASTRUCTURE_TYPES[0] || '', panjang: '', tinggi: '', catatan: '' }]
    );
    setExecutedModalVisible(true);
  }, []);

  const closeExecutedModal = () => {
    if (savingExecuted) return;
    setExecutedModalVisible(false);
    setExecutedTarget(null);
  };

  const handleCancelExecuted = () => {
    if (!executedTarget) return;
    const item = executedTarget;
    Alert.alert(
      'Batalkan Tanda Dilaksanakan',
      `Batalkan tanda "Sudah Dilaksanakan" untuk paket "${item.packageName}"? Info pelaksanaan yang sudah diisi akan ikut terhapus.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya, Batalkan',
          style: 'destructive',
          onPress: async () => {
            setSavingExecuted(true);
            try {
              await setPackageExecutedEverywhere(item.packageId, false, user?.username);
              setPackages((prev) =>
                prev.map((p) =>
                  p.packageId === item.packageId
                    ? { ...p, executed: false, executedYear: undefined, executedContractor: undefined, executedOutput: undefined }
                    : p
                )
              );
              setExecutedModalVisible(false);
              setExecutedTarget(null);
            } catch (err: any) {
              Alert.alert('Gagal', err?.message || 'Terjadi kesalahan saat mengubah status pelaksanaan.');
            } finally {
              setSavingExecuted(false);
            }
          },
        },
      ]
    );
  };

  const addExecutedOutputRow = () => {
    setExecutedOutputRows((prev) => [...prev, { infraType: INFRASTRUCTURE_TYPES[0] || '', panjang: '', tinggi: '', catatan: '' }]);
  };

  const removeExecutedOutputRow = (index: number) => {
    setExecutedOutputRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateExecutedOutputRow = (index: number, fields: Partial<ExecutedOutputEntry>) => {
    setExecutedOutputRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...fields } : row)));
  };

  const openInfraPickerForRow = (index: number) => {
    setInfraPickerRowIndex(index);
    setInfraPickerVisible(true);
  };

  const handleSelectInfraForRow = (value: string) => {
    if (infraPickerRowIndex !== null) {
      updateExecutedOutputRow(infraPickerRowIndex, { infraType: value });
    }
    setInfraPickerVisible(false);
    setInfraPickerRowIndex(null);
  };

  const confirmExecutedInfo = async () => {
    if (!executedTarget) return;
    const yearNum = parseInt(executedYear.trim(), 10);
    if (!executedYear.trim() || !Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100) {
      Alert.alert('Data Belum Lengkap', 'Isi Tahun Pelaksanaan dengan tahun yang valid (mis. 2025).');
      return;
    }
    if (!executedContractor.trim()) {
      Alert.alert('Data Belum Lengkap', 'Isi Nama Penyedia Jasa/Kontraktor.');
      return;
    }
    const cleanedRows = executedOutputRows
      .filter((row) => row.infraType && (row.panjang?.trim() || row.tinggi?.trim() || row.catatan?.trim()))
      .map((row) => ({
        infraType: row.infraType,
        panjang: row.panjang?.trim() || undefined,
        tinggi: row.tinggi?.trim() || undefined,
        catatan: row.catatan?.trim() || undefined,
      }));

    setSavingExecuted(true);
    try {
      await setPackageExecutedEverywhere(executedTarget.packageId, true, user?.username, {
        executedYear: yearNum,
        executedContractor: executedContractor.trim(),
        executedOutput: cleanedRows,
      });
      setPackages((prev) =>
        prev.map((p) =>
          p.packageId === executedTarget.packageId
            ? { ...p, executed: true, executedYear: yearNum, executedContractor: executedContractor.trim(), executedOutput: cleanedRows }
            : p
        )
      );
      setExecutedModalVisible(false);
      setExecutedTarget(null);
    } catch (err: any) {
      Alert.alert('Gagal', err?.message || 'Terjadi kesalahan saat menyimpan info pelaksanaan.');
    } finally {
      setSavingExecuted(false);
    }
  };

  const handleViewReport = useCallback(
    (item: PackageSummary) => {
      const pkgRows = allRows.filter((row) => row['ID Paket'] === item.packageId);
      if (pkgRows.length === 0) {
        Alert.alert('Tidak Ada Data', 'Belum ada data survei untuk ditampilkan di paket ini.');
        return;
      }
      navigation.navigate('PackageReport', { packageId: item.packageId, packageName: item.packageName, rows: pkgRows });
    },
    [allRows, navigation]
  );

  const handlePrintExecutionReport = useCallback(
    async (item: PackageSummary) => {
      setPrintingExecutionId(item.packageId);
      try {
        await printPackageExecutionReport(item);
      } catch (err: any) {
        Alert.alert('Gagal Cetak', err?.message || 'Terjadi kesalahan saat membuat PDF.');
      } finally {
        setPrintingExecutionId(null);
      }
    },
    []
  );

  const handlePrintExecutionRecap = useCallback(async () => {
    setPrintingRecap(true);
    try {
      await printExecutionRecapReport(packages);
    } catch (err: any) {
      Alert.alert('Gagal Cetak', err?.message || 'Terjadi kesalahan saat membuat PDF.');
    } finally {
      setPrintingRecap(false);
    }
  }, [packages]);

  const openReportMenu = useCallback((item: PackageSummary) => {
    setReportMenuTarget(item);
    setReportMenuVisible(true);
  }, []);

  const closeReportMenu = useCallback(() => {
    setReportMenuVisible(false);
    setReportMenuTarget(null);
  }, []);

  const handleSelectTableReport = useCallback(() => {
    if (reportMenuTarget) handleViewReport(reportMenuTarget);
    closeReportMenu();
  }, [reportMenuTarget, handleViewReport, closeReportMenu]);

  const handleSelectExecutionReport = useCallback(() => {
    if (reportMenuTarget) handlePrintExecutionReport(reportMenuTarget);
    closeReportMenu();
  }, [reportMenuTarget, handlePrintExecutionReport, closeReportMenu]);

  const handleDeletePackage = useCallback(
    (item: PackageSummary) => {
      Alert.alert(
        'Hapus Paket Pekerjaan',
        `Yakin ingin menghapus paket "${item.packageName}"? SELURUH data survei dan foto di dalam paket ini akan ikut terhapus permanen dan tidak dapat dikembalikan.`,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Hapus',
            style: 'destructive',
            onPress: () => {
              // Konfirmasi kedua: aksi ini destruktif & permanen (menghapus
              // seluruh data survei + foto milik paket), jadi admin harus
              // menegaskan sekali lagi sebelum benar-benar terkirim ke server.
              Alert.alert(
                'Konfirmasi Sekali Lagi',
                `Tindakan ini TIDAK BISA DIBATALKAN. Paket "${item.packageName}" beserta seluruh data survei dan foto di dalamnya akan dihapus permanen dari server. Lanjutkan?`,
                [
                  { text: 'Batal', style: 'cancel' },
                  {
                    text: 'Ya, Hapus Permanen',
                    style: 'destructive',
                    onPress: async () => {
                      setDeletingId(item.packageId);
                      try {
                        await deletePackageEverywhere(item.packageId, user?.username);
                        setPackages((prev) => prev.filter((p) => p.packageId !== item.packageId));
                      } catch (err: any) {
                        Alert.alert('Gagal Menghapus', err?.message || 'Terjadi kesalahan saat menghapus paket.');
                      } finally {
                        setDeletingId(null);
                      }
                    },
                  },
                ]
              );
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
            onPress={() => navigation.navigate('CreatePackage', { surveyorName: user?.name || 'Admin' })}
          >
            <Text style={styles.manageUsersLink}>+ Buat Paket</Text>
          </TouchableOpacity>
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

      <DashboardStatChips
        items={[
          { key: 'packages', value: packages.length, label: 'Total Paket' },
          { key: 'items', value: totalItems, label: 'Total Data Survei' },
          ...(queuePendingCount > 0
            ? [
                {
                  key: 'queue',
                  value: queuePendingCount,
                  label: 'Belum Terkirim',
                  variant: 'warning' as const,
                  onPress: () => navigation.navigate('Queue'),
                },
              ]
            : []),
        ]}
      />

      <TouchableOpacity
        style={[styles.allReportBtn, (loading || packages.length === 0) && styles.buttonDisabled]}
        disabled={loading || packages.length === 0}
        onPress={() => navigation.navigate('AllPackagesReport', { allRows })}
      >
        <Text style={styles.allReportBtnText}>Laporan Semua Paket (PDF)</Text>
      </TouchableOpacity>

      {user?.role === 'admin' && (
        <TouchableOpacity
          style={[styles.allReportBtn, (loading || packages.length === 0 || printingRecap) && styles.buttonDisabled]}
          disabled={loading || packages.length === 0 || printingRecap}
          onPress={handlePrintExecutionRecap}
        >
          <Text style={styles.allReportBtnText}>
            {printingRecap ? 'Membuat PDF...' : 'Rekap Pelaksanaan Fisik (PDF)'}
          </Text>
        </TouchableOpacity>
      )}

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
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 24 }} />
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
              onToggleExecuted={openExecutedModal}
              onDeletePackage={handleDeletePackage}
              deletingId={deletingId}
              onViewReport={handleViewReport}
              onOpenReportMenu={openReportMenu}
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

      <Modal
        visible={executedModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeExecutedModal}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, styles.executedModalCard]}>
            <Text style={styles.modalTitle}>Info Pelaksanaan</Text>
            <Text style={styles.modalMessage}>
              Paket "{executedTarget?.packageName}". Isi informasi pelaksanaan fisik di lapangan.
            </Text>
            <ScrollView style={styles.executedFormScroll} keyboardShouldPersistTaps="handled">
              <Text style={styles.formLabel}>Tahun Pelaksanaan</Text>
              <TextInput
                style={styles.modalInput}
                value={executedYear}
                onChangeText={setExecutedYear}
                placeholder="mis. 2025"
                keyboardType="number-pad"
                maxLength={4}
                editable={!savingExecuted}
              />
              <Text style={styles.formLabel}>Penyedia Jasa / Kontraktor</Text>
              <TextInput
                style={styles.modalInput}
                value={executedContractor}
                onChangeText={setExecutedContractor}
                placeholder="Nama perusahaan pelaksana"
                editable={!savingExecuted}
              />

              <Text style={styles.formLabel}>Rincian Output per Jenis Infrastruktur</Text>
              {executedOutputRows.map((row, index) => (
                <View key={index} style={styles.outputRowCard}>
                  <View style={styles.outputRowHeader}>
                    <TouchableOpacity
                      style={styles.outputTypeSelector}
                      onPress={() => openInfraPickerForRow(index)}
                      disabled={savingExecuted}
                    >
                      <Text style={styles.outputTypeSelectorText}>{row.infraType || 'Pilih jenis...'}</Text>
                    </TouchableOpacity>
                    {executedOutputRows.length > 1 && (
                      <TouchableOpacity
                        style={styles.outputRemoveBtn}
                        onPress={() => removeExecutedOutputRow(index)}
                        disabled={savingExecuted}
                      >
                        <Text style={styles.outputRemoveBtnText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={styles.outputDimensionRow}>
                    <TextInput
                      style={[styles.modalInput, styles.outputDimensionInput]}
                      value={row.panjang}
                      onChangeText={(v) => updateExecutedOutputRow(index, { panjang: v })}
                      placeholder="Panjang (m)"
                      keyboardType="decimal-pad"
                      editable={!savingExecuted}
                    />
                    <TextInput
                      style={[styles.modalInput, styles.outputDimensionInput]}
                      value={row.tinggi}
                      onChangeText={(v) => updateExecutedOutputRow(index, { tinggi: v })}
                      placeholder="Tinggi/Lebar (m)"
                      keyboardType="decimal-pad"
                      editable={!savingExecuted}
                    />
                  </View>
                  <TextInput
                    style={styles.modalInput}
                    value={row.catatan}
                    onChangeText={(v) => updateExecutedOutputRow(index, { catatan: v })}
                    placeholder="Catatan (opsional)"
                    editable={!savingExecuted}
                  />
                </View>
              ))}
              <TouchableOpacity style={styles.addOutputRowBtn} onPress={addExecutedOutputRow} disabled={savingExecuted}>
                <Text style={styles.addOutputRowBtnText}>+ Tambah Jenis Infrastruktur</Text>
              </TouchableOpacity>
            </ScrollView>

            {!!executedTarget?.executed && (
              <TouchableOpacity style={styles.cancelExecutedLink} onPress={handleCancelExecuted} disabled={savingExecuted}>
                <Text style={styles.cancelExecutedLinkText}>Batalkan Tanda Sudah Dilaksanakan</Text>
              </TouchableOpacity>
            )}

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={closeExecutedModal}
                disabled={savingExecuted}
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton, savingExecuted && styles.buttonDisabled]}
                onPress={confirmExecutedInfo}
                disabled={savingExecuted}
              >
                {savingExecuted ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>Simpan</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={reportMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeReportMenu}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeReportMenu}>
          <TouchableOpacity activeOpacity={1} style={styles.reportMenuCard} onPress={() => {}}>
            <Text style={styles.reportMenuTitle}>Pilih Laporan</Text>
            {!!reportMenuTarget?.packageName && (
              <Text style={styles.reportMenuSubtitle}>{reportMenuTarget.packageName}</Text>
            )}
            <TouchableOpacity style={styles.reportMenuOption} onPress={handleSelectTableReport}>
              <Text style={styles.reportMenuOptionText}>Laporan Tabel</Text>
            </TouchableOpacity>
            {user?.role === 'admin' && (
              <TouchableOpacity
                style={styles.reportMenuOption}
                onPress={handleSelectExecutionReport}
                disabled={printingExecutionId === reportMenuTarget?.packageId}
              >
                <Text style={styles.reportMenuOptionText}>
                  {printingExecutionId === reportMenuTarget?.packageId
                    ? 'Membuat PDF...'
                    : 'Laporan Pelaksanaan (PDF)'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.reportMenuCancel} onPress={closeReportMenu}>
              <Text style={styles.reportMenuCancelText}>Batal</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <SearchableSelectModal
        visible={infraPickerVisible}
        title="Pilih Jenis Infrastruktur"
        options={INFRASTRUCTURE_TYPES}
        onSelect={handleSelectInfraForRow}
        onClose={() => {
          setInfraPickerVisible(false);
          setInfraPickerRowIndex(null);
        }}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg },
  header: {
    marginBottom: 6,
  },
  headerTitle: {
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  headerAction: {
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
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
  allReportBtn: {
    backgroundColor: theme.colors.textPrimary,
    borderRadius: theme.radius.sm,
    paddingVertical: 6,
    alignItems: 'center',
    marginBottom: 6,
  },
  allReportBtnText: { color: '#fff', fontWeight: theme.font.semiBold, fontSize: 13 },
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
  sectionLabel: { fontSize: 14, fontWeight: theme.font.medium, color: theme.colors.textPrimary, marginBottom: 6, marginTop: 6 },
  searchInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: theme.colors.surface,
    marginBottom: 8,
  },
  emptyText: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 24 },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
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
  executedDetailText: { color: theme.colors.success, fontSize: 11, marginTop: 2 },
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

  cardActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  cardActionRowSecondary: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  cardActionButton: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: 'center',
  },
  cardActionButtonDanger: {
    borderColor: theme.colors.danger,
  },
  cardActionButtonText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: theme.font.medium,
    textAlign: 'center',
  },
  cardActionButtonTextDanger: {
    color: theme.colors.danger,
  },
  reportMenuCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 16,
  },
  reportMenuTitle: {
    fontSize: 16,
    fontWeight: theme.font.semiBold,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  reportMenuSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  reportMenuOption: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  reportMenuOptionText: {
    fontSize: 14,
    fontWeight: theme.font.medium,
    color: theme.colors.primary,
    textAlign: 'center',
  },
  reportMenuCancel: {
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 2,
  },
  reportMenuCancelText: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontWeight: theme.font.medium,
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
  executedModalCard: {
    maxHeight: '88%',
  },
  executedFormScroll: {
    maxHeight: 420,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: theme.font.medium,
    color: theme.colors.textPrimary,
    marginBottom: 6,
    marginTop: 4,
  },
  outputRowCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    padding: 10,
    marginBottom: 10,
    backgroundColor: theme.colors.background,
  },
  outputRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  outputTypeSelector: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
  },
  outputTypeSelectorText: {
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  outputRemoveBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outputRemoveBtnText: {
    color: theme.colors.danger,
    fontWeight: theme.font.semiBold,
  },
  outputDimensionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  outputDimensionInput: {
    flex: 1,
  },
  addOutputRowBtn: {
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: theme.colors.primarySoftBg,
    marginBottom: 8,
  },
  addOutputRowBtnText: {
    color: theme.colors.primary,
    fontWeight: theme.font.medium,
    fontSize: 13,
  },
  cancelExecutedLink: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 4,
  },
  cancelExecutedLinkText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: theme.font.medium,
  },
});

