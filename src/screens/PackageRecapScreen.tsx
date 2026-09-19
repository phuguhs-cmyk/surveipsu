import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { fetchSurveyList, listProposalsFromServer } from '../services/apiService';
import { syncPackagesFromServer, setPackageExecutedEverywhere, getPackages, derivePackageStatus } from '../services/packageService';
import { getCurrentUser } from '../services/authService';
import { AuthUser } from '../types';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PackageRecap'>;

interface RecapRow {
  packageId: string;
  packageName: string;
  surveyorName: string;
  kecamatan?: string;
  desaKelurahan?: string;
  itemCount: number;
  posted: boolean;
  proposalCount: number;
  executed: boolean;
}

/**
 * Layar rekap seluruh Paket Pekerjaan: menampilkan status survei (Diposting/
 * Proses/Draft), jumlah proposal/dokumen yang sudah diunggah, dan badge
 * "Sudah Dilaksanakan" (ditandai manual oleh admin, terpisah dari status
 * survei). Dipakai admin untuk memantau progres seluruh paket sekaligus,
 * termasuk paket yang proposalnya diunggah setelah survei diposting.
 */
export default function PackageRecapScreen({ navigation }: Props) {
  const [rows, setRows] = useState<RecapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const currentUser = await getCurrentUser().catch(() => null);
      setUser(currentUser);

      await syncPackagesFromServer().catch(() => undefined);
      const [localPackages, allSurveyRows, allProposals] = await Promise.all([
        getPackages(),
        fetchSurveyList().catch(() => []),
        listProposalsFromServer().catch(() => []),
      ]);

      const byPackage = new Map<string, { itemCount: number; posted: boolean; surveyorName: string }>();
      const seenItemKeys = new Set<string>();
      allSurveyRows.forEach((row: any, index: number) => {
        const packageId = row['ID Paket'];
        if (!packageId) return;
        const isRowPosted = row['Status'] === 'Diposting';
        const itemKey = `${packageId}::${row['ID Item Pekerjaan'] || `__row_${index}`}`;
        const isNewItem = !seenItemKeys.has(itemKey);
        if (isNewItem) seenItemKeys.add(itemKey);
        const existing = byPackage.get(packageId);
        if (existing) {
          if (isNewItem) existing.itemCount += 1;
          existing.posted = existing.posted && isRowPosted;
        } else {
          byPackage.set(packageId, {
            itemCount: 1,
            posted: isRowPosted,
            surveyorName: row['Nama Surveyor'] || '',
          });
        }
      });

      const proposalCountByPackage = new Map<string, number>();
      allProposals.forEach((p) => {
        proposalCountByPackage.set(p.packageId, (proposalCountByPackage.get(p.packageId) || 0) + 1);
      });

      const result: RecapRow[] = localPackages.map((pkg) => {
        const info = byPackage.get(pkg.id);
        return {
          packageId: pkg.id,
          packageName: pkg.name,
          surveyorName: pkg.surveyorName || info?.surveyorName || '',
          kecamatan: pkg.kecamatan,
          desaKelurahan: pkg.desaKelurahan,
          itemCount: info?.itemCount ?? pkg.itemCount ?? 0,
          posted: info?.posted ?? !!pkg.posted,
          proposalCount: proposalCountByPackage.get(pkg.id) || 0,
          executed: !!pkg.executed,
        };
      });

      // Tambahkan paket yang muncul di data survei/proposal tapi belum
      // tercatat di daftar paket lokal (mis. dibuat dari perangkat lain).
      byPackage.forEach((info, packageId) => {
        if (result.some((r) => r.packageId === packageId)) return;
        result.push({
          packageId,
          packageName: '(Tanpa nama)',
          surveyorName: info.surveyorName,
          itemCount: info.itemCount,
          posted: info.posted,
          proposalCount: proposalCountByPackage.get(packageId) || 0,
          executed: false,
        });
      });

      result.sort((a, b) => a.packageName.localeCompare(b.packageName));
      setRows(result);
    } catch (err: any) {
      Alert.alert('Gagal Memuat', err?.message || 'Terjadi kesalahan saat memuat rekap paket.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );



  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((r) => r.packageName.toLowerCase().includes(query) || r.surveyorName.toLowerCase().includes(query));
  }, [rows, searchText]);

  const handleToggleExecuted = (row: RecapRow) => {
    const nextExecuted = !row.executed;
    Alert.alert(
      nextExecuted ? 'Tandai Sudah Dilaksanakan' : 'Batalkan Tanda Dilaksanakan',
      nextExecuted
        ? `Tandai paket "${row.packageName}" sebagai sudah dilaksanakan di lapangan?`
        : `Batalkan tanda "Sudah Dilaksanakan" untuk paket "${row.packageName}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ya',
          onPress: async () => {
            setTogglingId(row.packageId);
            try {
              await setPackageExecutedEverywhere(row.packageId, nextExecuted, user?.username);
              setRows((prev) => prev.map((r) => (r.packageId === row.packageId ? { ...r, executed: nextExecuted } : r)));
            } catch (err: any) {
              Alert.alert('Gagal', err?.message || 'Terjadi kesalahan saat mengubah status pelaksanaan.');
            } finally {
              setTogglingId(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Rekap Paket Pekerjaan</Text>
      <Text style={styles.subtitle}>
        Ringkasan status survei, jumlah proposal terunggah, dan status pelaksanaan seluruh paket.
      </Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Cari nama paket atau surveyor..."
        value={searchText}
        onChangeText={setSearchText}
        autoCapitalize="none"
      />

      {loading ? (
        <ActivityIndicator size="small" color="#2563eb" style={{ marginTop: 12 }} />
      ) : (
        <FlatList
          data={filteredRows}
          keyExtractor={(item) => item.packageId}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} />}
          ListEmptyComponent={<Text style={styles.emptyText}>Belum ada paket pekerjaan.</Text>}
          renderItem={({ item }) => {
            const status = derivePackageStatus({ itemCount: item.itemCount, isPosted: item.posted });
            const statusLabel = status === 'posted' ? 'Survei Selesai' : status === 'in_progress' ? 'Dalam Proses' : 'Belum Ada Data';
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() =>
                  navigation.navigate('PackageDetail', {
                    packageId: item.packageId,
                    packageName: item.packageName,
                    surveyorName: item.surveyorName,
                  })
                }
              >
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.packageName}</Text>
                  {item.executed && (
                    <View style={styles.executedBadge}>
                      <Text style={styles.executedBadgeText}>✓ Sudah Dilaksanakan</Text>
                    </View>
                  )}
                </View>
                {item.surveyorName ? <Text style={styles.cardText}>Surveyor: {item.surveyorName}</Text> : null}
                {(item.kecamatan || item.desaKelurahan) && (
                  <Text style={styles.cardText}>
                    {[item.kecamatan, item.desaKelurahan].filter(Boolean).join(', ')}
                  </Text>
                )}
                <View style={styles.metaRow}>
                  <Text style={status === 'posted' ? styles.postedBadge : status === 'in_progress' ? styles.inProgressBadge : styles.draftBadge}>
                    {statusLabel}
                  </Text>
                  <Text style={styles.proposalBadge}>📄 {item.proposalCount} Proposal</Text>
                </View>
                {isAdmin && (
                  <TouchableOpacity
                    style={[styles.toggleButton, item.executed && styles.toggleButtonActive]}
                    onPress={() => handleToggleExecuted(item)}
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
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 },
  title: { fontSize: 18, fontWeight: theme.font.semiBold, color: theme.colors.textPrimary },
  subtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4, marginBottom: 12 },
  searchInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 13,
  },
  emptyText: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 24 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: theme.font.medium, color: theme.colors.textPrimary, flex: 1 },
  cardText: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 6, alignItems: 'center' },
  postedBadge: { color: theme.colors.success, fontSize: 11, fontWeight: theme.font.semiBold },
  inProgressBadge: { color: '#2563eb', fontSize: 11, fontWeight: theme.font.semiBold },
  draftBadge: { color: '#475569', fontSize: 11, fontWeight: theme.font.semiBold },
  proposalBadge: { color: theme.colors.textSecondary, fontSize: 11, fontWeight: theme.font.medium },
  executedBadge: {
    backgroundColor: theme.colors.successBg,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
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
});

