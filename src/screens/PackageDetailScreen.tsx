import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { fetchSurveyList, listInfraTypes } from '../services/apiService';
import { INFRASTRUCTURE_TYPES } from '../config';
import { getPackageById, updatePackageAllowedTypes } from '../services/packageService';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PackageDetail'>;

export default function PackageDetailScreen({ route, navigation }: Props) {

  const { packageId, packageName, surveyorName } = route.params;
  const [loading, setLoading] = useState(true);
  const [isPackagePosted, setIsPackagePosted] = useState(false);
  // Selalu mulai dengan daftar jenis bawaan sebagai fallback, supaya layar
  // ini tidak pernah tampil kosong meskipun listInfraTypes() ke server gagal
  // (mis. backend belum di-deploy ulang, sesi kedaluwarsa, atau offline).
  const [infraTypes, setInfraTypes] = useState<string[]>(INFRASTRUCTURE_TYPES);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Jenis pekerjaan yang dipilih surveyor saat membuat paket ini (jika ada).
  // Dipakai untuk menyaring daftar jenis di bawah, supaya hanya jenis yang
  // relevan untuk paket ini yang ditampilkan (bukan semua jenis sekaligus).
  const [allowedTypes, setAllowedTypes] = useState<string[] | null>(null);
  // Mode edit: menampilkan checklist jenis pekerjaan supaya surveyor bisa
  // menambah/mengurangi jenis pekerjaan yang relevan untuk paket ini.
  const [editingTypes, setEditingTypes] = useState(false);
  const [draftTypes, setDraftTypes] = useState<string[]>([]);
  const [savingTypes, setSavingTypes] = useState(false);
  const loadInFlightRef = useRef(false);

  const loadStatus = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    setLoadError(null);
    // Ambil dulu pengaturan jenis pekerjaan yang dipilih untuk paket ini
    // (tersimpan lokal saat paket dibuat). Jika tidak ada (paket lama atau
    // dibuat dari perangkat lain), allowedTypes tetap null sehingga semua
    // jenis tetap ditampilkan sebagai fallback.
    try {
      const pkg = await getPackageById(packageId);
      setAllowedTypes(pkg?.allowedInfraTypes && pkg.allowedInfraTypes.length > 0 ? pkg.allowedInfraTypes : null);
    } catch {
      setAllowedTypes(null);
    }

    // Ambil status posting paket dan daftar jenis infrastruktur secara
    // terpisah (bukan Promise.all) supaya kegagalan salah satu tidak ikut
    // menggagalkan yang lain (mis. daftar jenis tetap muncul walau status
    // posting gagal diperiksa, atau sebaliknya).
    try {
      const allRows = await fetchSurveyList(undefined, packageId);
      setIsPackagePosted(allRows.length > 0 && allRows.every((row) => row['Status'] === 'Diposting'));
    } catch (err: any) {
      // Jika gagal memeriksa status, biarkan tetap bisa menambah data (fail-open)
      // supaya surveyor tidak terhambat karena masalah koneksi sesaat.
      setIsPackagePosted(false);
    }
    try {
      const typeResult = await listInfraTypes();
      const allTypes = [...typeResult.staticTypes, ...typeResult.dynamicTypes.map((item) => item.name)];
      // Jika server mengembalikan daftar kosong (mis. tersesi tapi belum ada
      // data), tetap gunakan jenis bawaan supaya surveyor tidak buntu.
      setInfraTypes(allTypes.length > 0 ? allTypes : INFRASTRUCTURE_TYPES);
    } catch (err: any) {
      // Gagal mengambil daftar jenis dari server (mis. backend belum
      // di-deploy ulang setelah update, sesi kedaluwarsa, atau offline).
      // Tampilkan jenis bawaan sebagai fallback dan beri tahu penggunanya,
      // daripada membiarkan layar tampil kosong tanpa penjelasan.
      setInfraTypes(INFRASTRUCTURE_TYPES);
      setLoadError(
        err?.message ||
          'Gagal mengambil daftar jenis infrastruktur tambahan dari server. Menampilkan jenis bawaan saja.'
      );
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }, [packageId]);

  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, [loadStatus])
  );

  const handleAddItem = (type: string) => {
    if (isPackagePosted) {
      Alert.alert(
        'Paket Sudah Berstatus Survei Selesai',
        'Paket pekerjaan ini sudah berstatus "Survei Selesai" (dikunci) sehingga tidak dapat ditambahkan data survei baru. Hubungi admin untuk membuka kunci terlebih dahulu.'
      );
      return;
    }
    navigation.navigate('WorkItemForm', {
      packageId,
      packageName,
      surveyorName,
      infrastructureType: type,
    });
  };

  // Hanya tampilkan jenis pekerjaan yang dipilih surveyor saat membuat
  // paket ini (allowedTypes). Jika tidak diset (paket lama / null), tampilkan
  // semua jenis yang tersedia dari server sebagai fallback agar tidak
  // pernah kosong. Jenis dinamis (dibuat admin, bukan bawaan) tetap selalu
  // ditampilkan apa adanya karena tidak termasuk dalam pilihan checklist.
  const visibleInfraTypes = allowedTypes
    ? infraTypes.filter((type) => allowedTypes.includes(type) || !INFRASTRUCTURE_TYPES.includes(type))
    : infraTypes;

  const startEditTypes = () => {
    // Mulai dari jenis yang sedang berlaku (allowedTypes), atau daftar
    // bawaan lengkap jika paket ini belum pernah membatasi jenis (null).
    setDraftTypes(allowedTypes ? [...allowedTypes] : [...INFRASTRUCTURE_TYPES]);
    setEditingTypes(true);
  };

  const cancelEditTypes = () => {
    setEditingTypes(false);
    setDraftTypes([]);
  };

  const toggleDraftType = (type: string) => {
    setDraftTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSaveTypes = async () => {
    if (draftTypes.length === 0) {
      Alert.alert(
        'Pilih Jenis Pekerjaan',
        'Pilih minimal satu jenis pekerjaan (Jalan, Drainase, TPT, dll.) yang relevan untuk paket ini.'
      );
      return;
    }
    setSavingTypes(true);
    try {
      await updatePackageAllowedTypes(packageId, draftTypes);
      setAllowedTypes(draftTypes);
      setEditingTypes(false);
    } catch (err: any) {
      Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan saat menyimpan jenis pekerjaan.');
    } finally {
      setSavingTypes(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <Text style={styles.title}>{packageName}</Text>
      <Text style={styles.subtitle}>
        {allowedTypes
          ? 'Jenis pekerjaan berikut dipilih saat paket ini dibuat. Tambahkan data survei untuk jenis yang sesuai.'
          : 'Pilih jenis pekerjaan yang ingin disurvei di dalam paket ini. Anda bisa menambahkan beberapa jenis pekerjaan berbeda ke dalam paket yang sama.'}
      </Text>

      {loadError && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningBannerText}>{loadError}</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="small" color="#2563eb" style={{ marginBottom: 12 }} />
      ) : (
        isPackagePosted && (
          <View style={styles.postedBanner}>
            <Text style={styles.postedBannerText}>
              Paket ini sudah berstatus "Survei Selesai" (dikunci). Tidak dapat menambah data survei baru sampai
              kunci dibuka oleh admin.
            </Text>
          </View>
        )
      )}

      <View style={styles.mapBox}>
        <Text style={styles.mapTitle}>Peta Lokasi Paket</Text>
        <TouchableOpacity
          style={styles.mapOpenButton}
          onPress={() => navigation.navigate('Map', { packageId, packageName, surveyorName })}
        >
          <Text style={styles.mapOpenButtonText}>🗺️ Lihat Peta & Anotasi</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Jenis Infrastruktur</Text>
      <View style={styles.grid}>
        {visibleInfraTypes.map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.typeButton, isPackagePosted && styles.typeButtonDisabled]}
            onPress={() => handleAddItem(type)}
          >
            <Text style={styles.typeButtonText}>{type}</Text>
            <Text style={styles.typeButtonHint}>
              {isPackagePosted ? 'Survei sudah selesai (terkunci)' : '+ Tambah item'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!isPackagePosted && (
        editingTypes ? (
          <View style={styles.editTypesBox}>
            <Text style={styles.editTypesTitle}>Pilih Jenis Pekerjaan untuk Paket Ini</Text>
            <View style={styles.typeChipRow}>
              {infraTypes.map((type) => {
                const active = draftTypes.includes(type);
                return (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    onPress={() => toggleDraftType(type)}
                  >
                    <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                      {active ? '✓ ' : ''}{type}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.editTypesActionRow}>
              <TouchableOpacity
                style={[styles.saveTypesButton, savingTypes && styles.typeButtonDisabled]}
                onPress={handleSaveTypes}
                disabled={savingTypes}
              >
                <Text style={styles.saveTypesButtonText}>{savingTypes ? 'Menyimpan...' : 'Simpan'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelTypesButton} onPress={cancelEditTypes} disabled={savingTypes}>
                <Text style={styles.cancelTypesButtonText}>Batal</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.editTypesLink} onPress={startEditTypes}>
            <Text style={styles.editTypesLinkText}>+ / − Ubah Jenis Pekerjaan Paket Ini</Text>
          </TouchableOpacity>
        )
      )}


      <TouchableOpacity style={styles.queueButton} onPress={() => navigation.navigate('Queue')}>
        <Text style={styles.queueButtonText}>Lihat Antrian Pengiriman</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 20,
    fontWeight: theme.font.semiBold,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 20,
    lineHeight: 18,
  },
  grid: {
    gap: 12,
  },
  sectionLabel: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: theme.font.semiBold,
    marginTop: 20,
    marginBottom: 10,
  },
  postedBanner: {
    backgroundColor: theme.colors.warningBg,
    borderRadius: theme.radius.sm,
    padding: 12,
    marginBottom: 16,
  },
  postedBannerText: {
    color: '#8a6116',
    fontSize: 13,
    lineHeight: 18,
  },
  warningBanner: {
    backgroundColor: '#fdf7dc',
    borderRadius: theme.radius.sm,
    padding: 12,
    marginBottom: 16,
  },
  warningBannerText: {
    color: '#77600f',
    fontSize: 13,
    lineHeight: 18,
  },
  typeButtonDisabled: {
    opacity: 0.5,
  },
  typeButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: theme.font.medium,
    color: theme.colors.textPrimary,
  },
  typeButtonHint: {
    fontSize: 12,
    color: theme.colors.primary,
    marginTop: 4,
  },
  mapBox: {
    marginTop: 16,
    backgroundColor: theme.colors.primarySoftBg,
    borderColor: theme.colors.primaryBorder,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: 14,
  },
  mapTitle: {
    color: theme.colors.primaryDark,
    fontWeight: theme.font.semiBold,
    fontSize: 15,
    marginBottom: 6,
  },
  mapMetaText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    marginBottom: 6,
  },
  mapButton: {
    marginTop: 10,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  mapButtonText: {
    color: '#fff',
    fontWeight: theme.font.semiBold,
  },
  mapOpenButton: {
    marginTop: 10,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  mapOpenButtonText: {
    color: theme.colors.primaryDark,
    fontWeight: theme.font.semiBold,
  },
  queueButton: {
    marginTop: 24,
    backgroundColor: theme.colors.borderSoft,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  queueButtonText: {
    color: theme.colors.textPrimary,
    fontWeight: theme.font.medium,
  },
  editTypesLink: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 10,
  },
  editTypesLinkText: {
    color: theme.colors.primary,
    fontWeight: theme.font.medium,
    fontSize: 13,
  },
  editTypesBox: {
    marginTop: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  editTypesTitle: {
    fontSize: 14,
    fontWeight: theme.font.medium,
    marginBottom: 10,
    color: theme.colors.textPrimary,
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
  editTypesActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  saveTypesButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  saveTypesButtonText: {
    color: '#fff',
    fontWeight: theme.font.medium,
    fontSize: 13,
  },
  cancelTypesButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  cancelTypesButtonText: {
    color: theme.colors.textSecondary,
    fontWeight: theme.font.medium,
    fontSize: 13,
  },
});
