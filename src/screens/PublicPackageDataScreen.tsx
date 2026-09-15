import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { publicFetchSurveyList } from '../services/apiService';
import { summarizeItemsByType, formatDimensionSummary, ItemSummary } from '../utils/itemSummary';

type Props = NativeStackScreenProps<RootStackParamList, 'PublicPackageData'>;

const COLUMNS = [
  { key: 'no', label: 'No', width: 40 },
  { key: 'packageName', label: 'Nama Paket', width: 180 },
  { key: 'location', label: 'Lokasi', width: 200 },
  { key: 'dimension', label: 'Ukuran (Panjang, Lebar, Tinggi/Dalam)', width: 240 },
  { key: 'notes', label: 'Catatan', width: 260 },
];

/**
 * Detail data survei di satu paket, untuk akun Viewer (hanya bisa melihat
 * laporan). Menampilkan ringkasan per Item Pekerjaan (bukan per segmen/STA):
 * Nama Paket, Ukuran (Total Panjang, Lebar & Tinggi/Dalam rata-rata), dan
 * Catatan (digabung — jika semua segmen sama, hanya tampil satu kali).
 * Read-only murni: tidak ada tombol edit/hapus/posting di layar ini, dan
 * hanya memanggil publicFetchSurveyList.
 */
export default function PublicPackageDataScreen({ route }: Props) {
  const { packageId, packageName } = route.params;
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const loadInFlightRef = useRef(false);

  const loadData = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    try {
      const filtered = await publicFetchSurveyList(undefined, packageId);
      const sorted = [...filtered].sort((a, b) => (a['Timestamp'] < b['Timestamp'] ? 1 : -1));
      setRows(sorted);
    } catch (err: any) {
      Alert.alert('Gagal Memuat', err?.message || 'Tidak dapat mengambil data dari server.');
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }, [packageId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Merangkum SEMUA baris (lintas jenis infrastruktur) menjadi satu ringkasan
  // per Item Pekerjaan, supaya Viewer tidak melihat detail per segmen/STA.
  const itemSummaries: ItemSummary[] = useMemo(() => {
    const byType = new Map<string, any[]>();
    rows.forEach((row) => {
      const type = row['_infrastructureType'] || 'Lainnya';
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)!.push(row);
    });
    const summaries: ItemSummary[] = [];
    byType.forEach((typeRows, type) => {
      summaries.push(...summarizeItemsByType(type, typeRows));
    });
    return summaries;
  }, [rows]);

  const filteredItems = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return itemSummaries;
    return itemSummaries.filter((item) => item.label.toLowerCase().includes(query));
  }, [itemSummaries, searchText]);


  return (
    <View style={styles.container}>
      <Text style={styles.title}>{packageName}</Text>
      <Text style={styles.subtitle}>
        {searchText.trim()
          ? `${filteredItems.length} dari ${itemSummaries.length} item pekerjaan ditemukan`
          : `${itemSummaries.length} item pekerjaan ditemukan`}
      </Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Cari lokasi atau jenis pekerjaan..."
        value={searchText}
        onChangeText={setSearchText}
        autoCapitalize="none"
      />

      {loading ? (
        <ActivityIndicator size="large" color="#2563eb" style={{ marginTop: 24 }} />
      ) : filteredItems.length === 0 ? (
        <Text style={styles.emptyText}>
          {searchText.trim()
            ? 'Tidak ada data yang cocok dengan pencarian.'
            : 'Belum ada data survei di paket ini.'}
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={[styles.row, styles.headerRowTable]}>
              {COLUMNS.map((col) => (
                <Text key={col.key} style={[styles.headerCell, { width: col.width }]}>
                  {col.label}
                </Text>
              ))}
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {filteredItems.map((item, index) => (
                <View
                  key={item.itemId}
                  style={[styles.row, index % 2 === 1 && styles.rowAlt]}
                >
                  <Text style={[styles.cell, { width: COLUMNS[0].width }]}>{index + 1}</Text>
                  <Text style={[styles.cell, { width: COLUMNS[1].width }]}>{packageName}</Text>
                  <Text style={[styles.cell, { width: COLUMNS[2].width }]}>
                    {item.label}
                  </Text>
                  <Text style={[styles.cell, { width: COLUMNS[3].width }]}>
                    {formatDimensionSummary(item)}
                  </Text>
                  <Text style={[styles.cell, { width: COLUMNS[4].width }]}>
                    {item.notes}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
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
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    alignItems: 'center',
  },
  headerRowTable: {
    backgroundColor: '#2563eb',
  },
  rowAlt: {
    backgroundColor: '#f1f5f9',
  },
  headerCell: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  cell: {
    fontSize: 13,
    color: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  cellText: {
    fontSize: 13,
    color: '#334155',
  },
  photoCell: {
    flexDirection: 'row',
  },
  photoThumb: {
    width: 64,
    height: 64,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
    marginRight: 6,
  },
});

