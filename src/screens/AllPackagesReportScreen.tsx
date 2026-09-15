import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Alert } from '../utils/alert';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { printAllPackagesReport } from '../services/reportService';

type Props = NativeStackScreenProps<RootStackParamList, 'AllPackagesReport'>;

interface PackageSummary {
  packageId: string;
  packageName: string;
  totalItems: number;
  postedItems: number;
  lastUpdate: string;
  byType: Record<string, number>;
}

export default function AllPackagesReportScreen({ route, navigation }: Props) {
  const { allRows } = route.params;
  const [printing, setPrinting] = useState(false);

  const packages = useMemo<PackageSummary[]>(() => {
    // Total/Jalan/Drainase/DPT dst. HARUS dihitung berdasarkan jumlah LOKASI
    // (ID Item Pekerjaan unik), BUKAN jumlah baris — karena Jalan/Drainase/
    // DPT yang bersegmen menyimpan satu baris per segmen STA, sehingga satu
    // lokasi/item pekerjaan bisa punya banyak baris. Menghitung baris apa
    // adanya akan melebih-lebihkan jumlah infrastruktur (mis. 1 lokasi Jalan
    // dengan 5 segmen akan dihitung sebagai 5, padahal seharusnya 1).
    const itemMap = new Map<
      string,
      { packageId: string; packageName: string; type: string; timestamp: string; posted: boolean }
    >();
    allRows.forEach((row, index) => {
      const packageId = row['ID Paket'];
      if (!packageId) return;
      const type = row['_infrastructureType'] || 'Lainnya';
      const timestamp = row['Timestamp'] ? String(row['Timestamp']) : '';
      const isRowPosted = row['Status'] === 'Diposting';
      // Fallback jika "ID Item Pekerjaan" kosong (data lama/tak bersegmen):
      // pakai index baris supaya tetap dihitung sebagai satu lokasi tersendiri.
      const itemKey = `${packageId}::${row['ID Item Pekerjaan'] || `__row_${index}`}`;
      const existing = itemMap.get(itemKey);
      if (existing) {
        // Semua segmen milik lokasi/item yang sama: satu lokasi dianggap
        // "diposting" hanya jika SEMUA baris/segmennya sudah diposting.
        existing.posted = existing.posted && isRowPosted;
        if (timestamp > existing.timestamp) existing.timestamp = timestamp;
      } else {
        itemMap.set(itemKey, {
          packageId,
          packageName: row['Nama Paket'] || '(Tanpa nama)',
          type,
          timestamp,
          posted: isRowPosted,
        });
      }
    });

    const map = new Map<string, PackageSummary>();
    itemMap.forEach((item) => {
      const existing = map.get(item.packageId);
      if (existing) {
        existing.totalItems += 1;
        if (item.posted) existing.postedItems += 1;
        if (item.timestamp > existing.lastUpdate) existing.lastUpdate = item.timestamp;
        existing.byType[item.type] = (existing.byType[item.type] || 0) + 1;
      } else {
        map.set(item.packageId, {
          packageId: item.packageId,
          packageName: item.packageName,
          totalItems: 1,
          postedItems: item.posted ? 1 : 0,
          lastUpdate: item.timestamp,
          byType: { [item.type]: 1 },
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => (a.lastUpdate < b.lastUpdate ? 1 : -1));
  }, [allRows]);


  const infrastructureTypes = useMemo(
    () => Array.from(new Set(allRows.map((row) => row['_infrastructureType']).filter(Boolean))),
    [allRows]
  );

  const totalItems = packages.reduce((s, p) => s + p.totalItems, 0);
  const totalPosted = packages.reduce((s, p) => s + p.postedItems, 0);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printAllPackagesReport(packages, allRows);
    } catch (err: any) {
      Alert.alert('Gagal Cetak', err?.message || 'Terjadi kesalahan saat membuat PDF.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Laporan Semua Paket Pekerjaan</Text>
          <Text style={styles.subtitle}>
            {packages.length} paket &bull; {totalItems} data survei &bull; {totalPosted} survei selesai
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.printBtn, printing && styles.printBtnDisabled]}
          onPress={handlePrint}
          disabled={printing}
        >
          {printing ? (
            <View style={{ alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={[styles.printBtnText, { fontSize: 10, marginTop: 2 }]}>Memuat foto...</Text>
            </View>
          ) : (
            <Text style={styles.printBtnText}>Cetak PDF</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header tabel */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ minWidth: 700 }}>
            <View style={[styles.row, styles.headerRow2]}>
              <Text style={[styles.hCell, { width: 36 }]}>No</Text>
              <Text style={[styles.hCell, { flex: 1, minWidth: 180 }]}>Nama Paket</Text>
              <Text style={[styles.hCell, { width: 60 }]}>Total</Text>
              {infrastructureTypes.map((t) => (
                <Text key={t} style={[styles.hCell, { width: 80 }]} numberOfLines={2}>
                  {t.replace('Drainase/Saluran Air', 'Drainase').replace('Dinding Penahan Tanah (DPT)', 'DPT').replace('Gorong-gorong', 'Gorong²')}
                </Text>
              ))}
              <Text style={[styles.hCell, { width: 72 }]}>Survei Selesai</Text>
              <Text style={[styles.hCell, { width: 100 }]}>Update Terakhir</Text>
            </View>

            {packages.length === 0 ? (
              <Text style={styles.emptyText}>Belum ada data paket pekerjaan.</Text>
            ) : (
              packages.map((pkg, idx) => (
                <TouchableOpacity
                  key={pkg.packageId}
                  style={[styles.row, idx % 2 === 1 && styles.rowAlt]}
                  onPress={() =>
                    navigation.navigate('PackageData', {
                      packageId: pkg.packageId,
                      packageName: pkg.packageName,
                    })
                  }
                >
                  <Text style={[styles.cell, { width: 36 }]}>{idx + 1}</Text>
                  <Text style={[styles.cell, styles.cellName, { flex: 1, minWidth: 180 }]} numberOfLines={2}>
                    {pkg.packageName}
                  </Text>
                  <Text style={[styles.cell, styles.cellNum, { width: 60 }]}>{pkg.totalItems}</Text>
                  {infrastructureTypes.map((t) => (
                    <Text key={t} style={[styles.cell, styles.cellNum, { width: 80 }]}>
                      {pkg.byType[t] || '-'}
                    </Text>
                  ))}
                  <Text
                    style={[
                      styles.cell,
                      styles.cellNum,
                      { width: 72 },
                      pkg.postedItems === pkg.totalItems && pkg.totalItems > 0 && styles.cellPosted,
                    ]}
                  >
                    {pkg.postedItems}/{pkg.totalItems}
                  </Text>
                  <Text style={[styles.cell, { width: 100, fontSize: 10 }]}>
                    {pkg.lastUpdate ? new Date(pkg.lastUpdate).toLocaleDateString('id-ID') : '-'}
                  </Text>
                </TouchableOpacity>
              ))
            )}

            {/* Baris total */}
            {packages.length > 0 && (
              <View style={[styles.row, styles.totalRow]}>
                <Text style={[styles.cell, styles.totalCell, { width: 36 }]}></Text>
                <Text style={[styles.cell, styles.totalCell, { flex: 1, minWidth: 180 }]}>TOTAL</Text>
                <Text style={[styles.cell, styles.totalCell, { width: 60 }]}>{totalItems}</Text>
                {infrastructureTypes.map((t) => {
                  const sum = packages.reduce((s, p) => s + (p.byType[t] || 0), 0);
                  return (
                    <Text key={t} style={[styles.cell, styles.totalCell, { width: 80 }]}>
                      {sum || '-'}
                    </Text>
                  );
                })}
                <Text style={[styles.cell, styles.totalCell, { width: 72 }]}>{totalPosted}/{totalItems}</Text>
                <Text style={[styles.cell, styles.totalCell, { width: 100 }]}></Text>
              </View>
            )}
          </View>
        </ScrollView>

        <Text style={styles.hint}>* Ketuk baris paket untuk melihat detail data survei</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  title: { fontSize: 17, fontWeight: 'bold', color: '#1e293b' },
  subtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  printBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  printBtnDisabled: { backgroundColor: '#93c5fd' },
  printBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  headerRow2: { backgroundColor: '#1e40af' },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  rowAlt: { backgroundColor: '#f1f5f9' },
  totalRow: { backgroundColor: '#dbeafe' },
  hCell: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 11,
    paddingVertical: 8,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
  cell: {
    fontSize: 12,
    color: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 4,
    textAlign: 'center',
  },
  cellName: { textAlign: 'left', color: '#1e40af', fontWeight: '600' },
  cellNum: { fontWeight: '600' },
  cellPosted: { color: '#16a34a' },
  totalCell: { fontWeight: '700', color: '#1e40af' },
  emptyText: { textAlign: 'center', color: '#94a3b8', padding: 24 },
  hint: { fontSize: 11, color: '#94a3b8', marginTop: 8, textAlign: 'center' },
});
