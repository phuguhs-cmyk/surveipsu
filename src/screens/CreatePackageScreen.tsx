import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert } from '../utils/alert';
import { RootStackParamList } from '../navigation/types';
import { createPackage, getPackageById, renamePackageEverywhere } from '../services/packageService';
import { INFRASTRUCTURE_TYPES } from '../config';
import { WilayahItem } from '../types';
import { getDesaByKecamatan, getKecamatanNames, getWilayahList } from '../services/wilayahService';
import { getCurrentLocation } from '../services/locationService';
import { parseCoordinate } from '../services/commonUtils';
import SearchableSelectModal from '../components/SearchableSelectModal';
import CoordinatePickerModal from '../components/CoordinatePickerModal';

type Props = NativeStackScreenProps<RootStackParamList, 'CreatePackage'>;

export default function CreatePackageScreen({ route, navigation }: Props) {
  const { surveyorName, editPackageId, packageName, kecamatan: initialKecamatan, desaKelurahan: initialDesa } = route.params;
  const isEditing = Boolean(editPackageId);
  const [newPackageName, setNewPackageName] = useState(packageName || '');
  const [wilayahList, setWilayahList] = useState<WilayahItem[]>([]);
  const [kecamatan, setKecamatan] = useState(initialKecamatan || '');
  const [desaKelurahan, setDesaKelurahan] = useState(initialDesa || '');
  const [packageLatitude, setPackageLatitude] = useState<string>('');
  const [packageLongitude, setPackageLongitude] = useState<string>('');
  const [kecamatanModalVisible, setKecamatanModalVisible] = useState(false);
  const [desaModalVisible, setDesaModalVisible] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);

  const kecamatanOptions = useMemo(() => getKecamatanNames(wilayahList), [wilayahList]);
  const desaOptions = useMemo(
    () => getDesaByKecamatan(wilayahList, kecamatan).map((item) => item.desa),
    [wilayahList, kecamatan]
  );

  useEffect(() => {
    getWilayahList().then(setWilayahList).catch(() => {});
    if (!isEditing || !editPackageId) return;

    let mounted = true;
    getPackageById(editPackageId)
      .then((pkg) => {
        if (!mounted || !pkg) return;
        if (pkg.latitude != null) setPackageLatitude(String(pkg.latitude));
        if (pkg.longitude != null) setPackageLongitude(String(pkg.longitude));
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [isEditing, editPackageId]);

  const handleUseCurrentLocation = async () => {
    try {
      const location = await getCurrentLocation();
      setPackageLatitude(String(location.latitude));
      setPackageLongitude(String(location.longitude));
    } catch (error: any) {
      Alert.alert('Lokasi Saat Ini Tidak Tersedia', error?.message || 'Tidak dapat mengambil koordinat GPS saat ini.');
    }
  };

  const toggleType = (type: string) => {
    setSelectedTypes((previous) =>
      previous.includes(type) ? previous.filter((item) => item !== type) : [...previous, type]
    );
  };

  const handleCreatePackage = async () => {
    const trimmed = newPackageName.trim();
    if (!trimmed) {
      Alert.alert('Nama Paket Wajib Diisi', 'Masukkan nama paket pekerjaan terlebih dahulu.');
      return;
    }
    if (!isEditing && (!kecamatan.trim() || !desaKelurahan.trim())) {
      Alert.alert('Wilayah Wajib Dipilih', 'Pilih kecamatan dan desa/kelurahan paket terlebih dahulu.');
      return;
    }
    if (!isEditing && selectedTypes.length === 0) {
      Alert.alert('Pilih Jenis Pekerjaan', 'Pilih minimal satu jenis pekerjaan untuk paket ini.');
      return;
    }

    setCreating(true);
    try {
      if (isEditing && editPackageId) {
        const lat = packageLatitude.trim() ? parseCoordinate(packageLatitude) : undefined;
        const lng = packageLongitude.trim() ? parseCoordinate(packageLongitude) : undefined;
        await renamePackageEverywhere(editPackageId, trimmed, undefined, kecamatan, desaKelurahan, lat, lng);
        navigation.goBack();
      } else {
        const lat = packageLatitude.trim() ? parseCoordinate(packageLatitude) : undefined;
        const lng = packageLongitude.trim() ? parseCoordinate(packageLongitude) : undefined;
        const pkg = await createPackage(trimmed, surveyorName, selectedTypes, kecamatan, desaKelurahan, lat, lng);
        navigation.replace('PackageDetail', {
          packageId: pkg.id,
          packageName: pkg.name,
          surveyorName,
        });
      }
    } catch (error: any) {
      Alert.alert(isEditing ? 'Gagal Mengubah Nama' : 'Gagal Membuat Paket', error?.message || 'Terjadi kesalahan.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        enableAutomaticScroll
        extraScrollHeight={Platform.OS === 'android' ? 56 : 24}
        extraHeight={Platform.OS === 'android' ? 80 : 0}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{isEditing ? 'Ubah Paket' : 'Buat Paket Pekerjaan'}</Text>
            <Text style={styles.subtitle}>Surveyor: {surveyorName}</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Queue')}>
            <Text style={styles.queueLink}>Antrian</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formPanel}>
          <Text style={styles.panelTitle}>{isEditing ? 'Ubah Paket Pekerjaan' : 'Paket Pekerjaan Baru'}</Text>
          <Text style={styles.subLabel}>Nama Paket Pekerjaan</Text>
          <TextInput
            style={styles.input}
            placeholder={isEditing ? 'Masukkan nama paket pekerjaan' : 'Contoh: Peningkatan Jalan Desa Sukamaju 2026'}
            value={newPackageName}
            onChangeText={setNewPackageName}
          />

          <Text style={styles.subLabel}>Kecamatan & Desa/Kelurahan Paket</Text>
          <View style={styles.regionRow}>
            <TouchableOpacity style={styles.dropdownInput} onPress={() => setKecamatanModalVisible(true)}>
              <Text style={kecamatan ? styles.dropdownValue : styles.dropdownPlaceholder}>
                {kecamatan || 'Pilih Kecamatan'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dropdownInput, !kecamatan && styles.dropdownDisabled]}
              disabled={!kecamatan}
              onPress={() => kecamatan && setDesaModalVisible(true)}
            >
              <Text style={desaKelurahan ? styles.dropdownValue : styles.dropdownPlaceholder}>
                {desaKelurahan || (kecamatan ? 'Pilih Desa/Kelurahan' : 'Pilih Kecamatan terlebih dahulu')}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.subLabel}>Koordinat Utama Paket (Opsional)</Text>
          <View style={styles.coordinateRow}>
            <TextInput
              style={[styles.input, styles.coordinateInput]}
              placeholder="Latitude"
              value={packageLatitude}
              onChangeText={setPackageLatitude}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.input, styles.coordinateInput]}
              placeholder="Longitude"
              value={packageLongitude}
              onChangeText={setPackageLongitude}
              keyboardType="numeric"
            />
          </View>
          <TouchableOpacity style={styles.gpsButton} onPress={handleUseCurrentLocation}>
            <Text style={styles.gpsButtonText}>Ambil GPS Saat Ini</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mapButton} onPress={() => setMapPickerVisible(true)}>
            <Text style={styles.mapButtonText}>🗺️ Pilih di Peta</Text>
          </TouchableOpacity>

          {!isEditing && <Text style={styles.subLabel}>Jenis Pekerjaan dalam Paket</Text>}
          {!isEditing && <View style={styles.typeChipRow}>
            {INFRASTRUCTURE_TYPES.map((type) => {
              const active = selectedTypes.includes(type);
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeChip, active && styles.typeChipActive]}
                  onPress={() => toggleType(type)}
                >
                  <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>
                    {active ? '✓ ' : ''}{type}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>}

          <TouchableOpacity
            style={[styles.createButton, (!newPackageName.trim() || creating) && styles.buttonDisabled]}
            onPress={handleCreatePackage}
            disabled={!newPackageName.trim() || creating}
          >
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>{isEditing ? 'Simpan Perubahan' : '+ Buat Paket'}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>

      <SearchableSelectModal
        visible={kecamatanModalVisible}
        title="Pilih Kecamatan"
        options={kecamatanOptions}
        onSelect={(value) => {
          setKecamatan(value);
          setDesaKelurahan('');
          setKecamatanModalVisible(false);
        }}
        onClose={() => setKecamatanModalVisible(false)}
        emptyText="Data Kecamatan belum tersedia. Periksa koneksi internet Anda."
      />
      <SearchableSelectModal
        visible={desaModalVisible}
        title="Pilih Desa/Kelurahan"
        options={desaOptions}
        onSelect={(value) => {
          setDesaKelurahan(value);
          setDesaModalVisible(false);
        }}
        onClose={() => setDesaModalVisible(false)}
        emptyText="Belum ada Desa/Kelurahan untuk Kecamatan ini."
      />

      <CoordinatePickerModal
        visible={mapPickerVisible}
        initialLatitude={packageLatitude.trim() ? parseCoordinate(packageLatitude) : undefined}
        initialLongitude={packageLongitude.trim() ? parseCoordinate(packageLongitude) : undefined}
        onClose={() => setMapPickerVisible(false)}
        onConfirm={(lat, lng) => {
          setPackageLatitude(String(lat));
          setPackageLongitude(String(lng));
          setMapPickerVisible(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
  subtitle: { color: '#64748b', marginTop: 4 },
  queueLink: { color: '#2563eb', fontWeight: '700', fontSize: 15 },
  formPanel: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dbe3ef',
    borderRadius: 12,
    padding: 16,
  },
  panelTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  subLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 7, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  regionRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  coordinateRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  coordinateInput: { flex: 1 },
  gpsButton: {
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#67e8f9',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  gpsButtonText: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  mapButton: {
    backgroundColor: '#eef3fc',
    borderWidth: 1,
    borderColor: '#c9dcf7',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  mapButtonText: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  dropdownInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 15,
    backgroundColor: '#fff',
  },
  dropdownDisabled: { backgroundColor: '#f1f5f9' },
  dropdownValue: { color: '#334155', fontSize: 14 },
  dropdownPlaceholder: { color: '#94a3b8', fontSize: 14 },
  typeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  typeChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#fff',
  },
  typeChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  typeChipText: { color: '#334155', fontSize: 12, fontWeight: '600' },
  typeChipTextActive: { color: '#fff' },
  createButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { backgroundColor: '#93c5fd' },
  createButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
