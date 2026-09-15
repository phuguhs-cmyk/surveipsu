import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Alert } from '../utils/alert';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { EDIT_FIELDS, MODE_REPORT_COLUMNS } from '../config';
import { printPackageReport } from '../services/reportService';
import { sortReportRowsBySegment } from '../utils/sta';
import { buildLongitudinalProfile, PROFILE_SERIES_CONFIG } from '../utils/longitudinalProfile';
import { summarizeItemsByType, formatDimensionSummary } from '../utils/itemSummary';
import LongitudinalProfileSchema from '../components/schemas/LongitudinalProfileSchema';


type Props = NativeStackScreenProps<RootStackParamList, 'PackageReport'>;

// Kolom internal/teknis yang tidak perlu ditampilkan di laporan (baik PDF
// maupun tabel di layar). Selaras dengan EXCLUDED_KEYS di reportService.ts.
const HIDDEN_KEYS = new Set([
  '_infrastructureType', 'ID Survei', 'ID Paket', 'Nama Paket',
  'ID Item Pekerjaan', 'Nama Surveyor', 'Tipe Infrastruktur',
  'Latitude', 'Longitude', 'Akurasi GPS (m)', 'Alamat/Keterangan Lokasi',
  'Timestamp', 'Foto URLs', 'URL Foto 1', 'URL Foto 2', 'URL Foto 3', 'Status', 'ID Lokal', 'Mode Detail JSON',
  // Sudah diwakili oleh kolom mode-spesifik (MODE_REPORT_COLUMNS) di bawah,
  // jadi tidak perlu ditampilkan lagi sebagai kolom umum terpisah.
  'Kondisi Eksisting', 'Permasalahan', 'Tindakan Diusulkan', 'Volume Penanganan', 'Satuan',
]);


const BASE_COLUMNS: { key: string; label: string; width: number }[] = [
  { key: '_no', label: 'No', width: 40 },
  { key: 'Alamat/Keterangan Lokasi', label: 'Lokasi', width: 160 },
];

const PRIORITY_COLUMN = { key: 'Prioritas', label: 'Prioritas', width: 80 };

/**
 * Mengambil nilai field SurveyModeData untuk satu baris. Diutamakan dari
 * kolom sheet langsung jika field itu punya `sheetHeader` (mis. "Tindakan
 * Diusulkan"); jika tidak ada, di-parse dari kolom "Mode Detail JSON"
 * karena field seperti plannedLength/currentCapacity hanya tersimpan di
 * situ, tidak disalin ke kolom sheet tersendiri.
 */
function getModeFieldValue(row: any, key: string, sheetHeader?: string): string {
  if (sheetHeader && row[sheetHeader] !== undefined && row[sheetHeader] !== '') {
    return row[sheetHeader];
  }
  try {
    const parsed = JSON.parse(row['Mode Detail JSON'] || '{}');
    return parsed[key] ?? '';
  } catch {
    return '';
  }
}

/**
 * Mengelompokkan baris (untuk satu jenis infrastruktur bersegmen) berdasarkan
 * "ID Item Pekerjaan" lalu membangun profil memanjang untuk tiap item yang
 * punya lebih dari satu segmen (item dengan 1 segmen tidak perlu grafik
 * memanjang, cukup skema penampang melintang biasa).
 */
function buildItemProfiles(type: string, typeRowsSorted: any[]) {
  const seriesDefs = PROFILE_SERIES_CONFIG[type];
  if (!seriesDefs || seriesDefs.length === 0) return [];

  const byItem = new Map<string, any[]>();
  typeRowsSorted.forEach((row) => {
    const itemId = row['ID Item Pekerjaan'] || row['Alamat/Keterangan Lokasi'] || 'default';
    if (!byItem.has(itemId)) byItem.set(itemId, []);
    byItem.get(itemId)!.push(row);
  });

  const result: { itemId: string; label: string; profile: ReturnType<typeof buildLongitudinalProfile> }[] = [];
  byItem.forEach((itemRows, itemId) => {
    if (itemRows.length < 2) return;
    const inputs = itemRows.map((row) => ({
      staStart: row['STA Awal'] || '',
      staEnd: row['STA Akhir'] || '',
      get: (key: string) => {
        const field = (EDIT_FIELDS[type] || []).find((f) => f.key === key);
        return field ? row[field.header] : undefined;
      },
    }));
    const profile = buildLongitudinalProfile(inputs, seriesDefs);
    if (profile.totalLength > 0) {
      result.push({
        itemId,
        label: itemRows[0]['Alamat/Keterangan Lokasi'] || itemId,
        profile,
      });
    }
  });
  return result;
}

export default function PackageReportScreen({ route }: Props) {
  const { packageName, rows } = route.params;
  const [printing, setPrinting] = useState(false);

  const groups = useMemo(() => {
    const types = Array.from(new Set(rows.map((row) => row['_infrastructureType']).filter(Boolean)));
    return types.map((type) => {
      const typeRowsSorted = sortReportRowsBySegment(
        rows.filter((row) => row['_infrastructureType'] === type)
      );

      const knownFields = (EDIT_FIELDS[type] || []).map((field) => ({
        key: field.header,
        label: field.label,
        width: Math.max(90, field.label.length * 9),
      }));

      // Dikelompokkan lagi per Mode Survei: setiap mode hanya menampilkan
      // kolom yang relevan dengannya (lihat MODE_REPORT_COLUMNS di config.ts),
      // bukan seluruh kolom mode data sekaligus untuk semua baris.
      const modes = Array.from(new Set(typeRowsSorted.map((row) => row['Mode Survei']).filter(Boolean)));
      const modeSections = modes.map((mode) => {
        const modeRows = typeRowsSorted
          .filter((row) => row['Mode Survei'] === mode)
          .map((row, index) => ({ ...row, _no: index + 1 }));

        const modeColumnDefs = MODE_REPORT_COLUMNS[mode as keyof typeof MODE_REPORT_COLUMNS] || [];
        const modeColumns = modeColumnDefs.map((col) => ({
          key: col.key,
          label: col.label,
          width: Math.max(90, col.label.length * 9),
        }));

        const knownKeys = new Set([
          ...BASE_COLUMNS.map((c) => c.key),
          ...modeColumns.map((c) => c.key),
          ...knownFields.map((c) => c.key),
          PRIORITY_COLUMN.key,
        ]);
        const dynamicFields = modeRows.length > 0
          ? Object.keys(modeRows[0])
            .filter((key) => !knownKeys.has(key) && !HIDDEN_KEYS.has(key) && !key.startsWith('_') && !key.startsWith('URL Foto') && key !== 'Mode Survei')
            .map((key) => ({ key, label: key, width: Math.max(100, key.length * 8) }))
          : [];

        const columns = [...BASE_COLUMNS, ...knownFields, ...modeColumns, ...dynamicFields, PRIORITY_COLUMN];
        const displayRows = modeRows.map((row) => {
          const patched: Record<string, any> = { ...row };
          modeColumnDefs.forEach((col) => {
            patched[col.key] = getModeFieldValue(row, col.key, col.sheetHeader);
          });
          return patched;
        });

        return { mode, rows: displayRows, columns };
      }).filter((section) => section.rows.length > 0);

      return { type, modeSections, totalRows: typeRowsSorted.length, itemProfiles: buildItemProfiles(type, typeRowsSorted), itemSummaries: summarizeItemsByType(type, typeRowsSorted) };
    }).filter((group) => group.totalRows > 0);
  }, [rows]);


  const handlePrint = async () => {
    if (rows.length === 0) {
      Alert.alert('Tidak Ada Data', 'Belum ada data survei untuk dicetak.');
      return;
    }
    setPrinting(true);
    try {
      await printPackageReport(packageName, rows);
    } catch (err: any) {
      Alert.alert('Gagal Cetak', err?.message || 'Terjadi kesalahan saat membuat PDF.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header + tombol cetak */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{packageName}</Text>
          <Text style={styles.subtitle}>
            {rows.length} data &bull; {groups.length} jenis infrastruktur
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
        {groups.length === 0 ? (
          <Text style={styles.emptyText}>Belum ada data survei di paket ini.</Text>
        ) : (
          groups.map((group) => (
            <View key={group.type} style={styles.groupBlock}>
              <Text style={styles.groupTitle}>
                {group.type} ({group.totalRows} data)
              </Text>
              {group.itemSummaries.length > 0 && (
                <View style={styles.profileSection}>
                  <Text style={styles.profileSectionTitle}>Ringkasan Ukuran per Item Pekerjaan</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <View style={{ width: 620 }}>
                      <View style={[styles.row, styles.headerRow2]}>
                        <Text style={[styles.headerCell, { width: 220 }]}>Lokasi</Text>
                        <Text style={[styles.headerCell, { width: 240 }]}>Ukuran (Panjang, Lebar, Tinggi/Dalam)</Text>
                        <Text style={[styles.headerCell, { width: 160 }]}>Catatan</Text>
                      </View>
                      {group.itemSummaries.map((item, index) => (
                        <View
                          key={item.itemId}
                          style={[styles.row, index % 2 === 1 && styles.rowAlt]}
                        >
                          <Text style={[styles.cell, { width: 220 }]} numberOfLines={3}>{item.label}</Text>
                          <Text style={[styles.cell, { width: 240 }]} numberOfLines={3}>{formatDimensionSummary(item)}</Text>
                          <Text style={[styles.cell, { width: 160 }]} numberOfLines={3}>{item.notes}</Text>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}
              {group.itemProfiles.length > 0 && (
                <View style={styles.profileSection}>
                  <Text style={styles.profileSectionTitle}>Profil Memanjang per Item Pekerjaan</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      {group.itemProfiles.map((item) => (
                        <View key={item.itemId} style={styles.profileCard}>
                          <LongitudinalProfileSchema title={item.label} profile={item.profile} />
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}
              {group.modeSections.map((section) => {
                const totalWidth = section.columns.reduce((sum, col) => sum + col.width, 0);
                return (
                  <View key={section.mode} style={styles.modeBlock}>
                    <Text style={styles.modeTitle}>
                      {section.mode} ({section.rows.length} data)
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator>
                      <View style={{ width: totalWidth }}>
                        <View style={[styles.row, styles.headerRow2]}>
                          {section.columns.map((col) => (
                            <Text key={col.key} style={[styles.headerCell, { width: col.width }]}>
                              {col.label}
                            </Text>
                          ))}
                        </View>
                        {section.rows.map((row, index) => (
                          <View
                            key={row['ID Survei'] || String(index)}
                            style={[styles.row, index % 2 === 1 && styles.rowAlt]}
                          >
                            {section.columns.map((col) => (
                              <Text key={col.key} style={[styles.cell, { width: col.width }]} numberOfLines={3}>
                                {row[col.key] != null && row[col.key] !== '' ? String(row[col.key]) : '-'}
                              </Text>
                            ))}
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                );
              })}
            </View>
          ))

        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, gap: 8 },
  title: { fontSize: 18, fontWeight: 'bold' },
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
  groupBlock: { marginBottom: 24 },
  groupTitle: { fontSize: 15, fontWeight: '700', color: '#1e40af', marginBottom: 8 },
  profileSection: { marginBottom: 16, marginLeft: 4 },
  profileSectionTitle: { fontSize: 12.5, fontWeight: '600', color: '#475569', marginBottom: 8, letterSpacing: 0.2 },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e9f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  modeBlock: { marginBottom: 14, marginLeft: 4 },
  modeTitle: { fontSize: 13, fontWeight: '600', color: '#0f766e', marginBottom: 6 },
  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerRow2: { backgroundColor: '#2563eb' },
  rowAlt: { backgroundColor: '#f1f5f9' },
  headerCell: { color: '#fff', fontWeight: '700', fontSize: 12, paddingVertical: 10, paddingHorizontal: 6 },
  cell: { fontSize: 12, color: '#334155', paddingVertical: 8, paddingHorizontal: 6 },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 24 },
});
