import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { fetchSurveyList, listInfraTypes, uploadProposalToServer, deleteProposalFromServer, listProposalsFromServer, postPackage, unpostPackage } from '../services/apiService';
import { pickProposalDocument } from '../services/documentService';
import { INFRASTRUCTURE_TYPES } from '../config';
import { getPackageById, updatePackageAllowedTypes, renamePackageEverywhere } from '../services/packageService';
import { getCurrentUser } from '../services/authService';
import { getCurrentLocation } from '../services/locationService';
import { parseCoordinate } from '../services/commonUtils';
import { getDesaByKecamatan, getKecamatanNames, getWilayahList } from '../services/wilayahService';
import SearchableSelectModal from '../components/SearchableSelectModal';
import CoordinatePickerModal from '../components/CoordinatePickerModal';
import { ProposalDocument, WilayahItem } from '../types';
import { theme } from '../theme';


type Props = NativeStackScreenProps<RootStackParamList, 'PackageDetail'>;

export default function PackageDetailScreen({ route, navigation }: Props) {

  const { packageId, packageName, surveyorName } = route.params;
  const [loading, setLoading] = useState(true);
  const [isPackagePosted, setIsPackagePosted] = useState(false);
  const [packageRows, setPackageRows] = useState<any[]>([]);
  const [canPost, setCanPost] = useState(true);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [currentUsername, setCurrentUsername] = useState<string | undefined>(undefined);
  const [posting, setPosting] = useState(false);
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

  // Ubah Info Paket (nama, wilayah, koordinat) - digabung ke layar Detail
  // Paket ini (sebelumnya terpisah di CreatePackageScreen mode edit) supaya
  // pengguna tidak perlu berpindah layar hanya untuk mengubah info dasar paket.
  const [currentPackageName, setCurrentPackageName] = useState(packageName);
  const [editingInfo, setEditingInfo] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftKecamatan, setDraftKecamatan] = useState('');
  const [draftDesaKelurahan, setDraftDesaKelurahan] = useState('');
  const [draftLatitude, setDraftLatitude] = useState('');
  const [draftLongitude, setDraftLongitude] = useState('');
  const [wilayahList, setWilayahList] = useState<WilayahItem[]>([]);
  const [kecamatanModalVisible, setKecamatanModalVisible] = useState(false);
  const [desaModalVisible, setDesaModalVisible] = useState(false);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);

  const kecamatanOptions = useMemo(() => getKecamatanNames(wilayahList), [wilayahList]);
  const desaOptions = useMemo(
    () => getDesaByKecamatan(wilayahList, draftKecamatan).map((item) => item.desa),
    [wilayahList, draftKecamatan]
  );

  // Ringkasan "Dikerjakan oleh" per surveyor, dihitung dari data item yang
  // sudah ada di paket ini (packageRows), tanpa perlu field baru di level
  // paket. Ini menjaga akuntabilitas tetap terlihat meski beberapa
  // surveyor mengerjakan paket yang sama.
  const surveyorSummary = useMemo(() => {
    const counts = new Map<string, number>();
    packageRows.forEach((row) => {
      const name = (row['Nama Surveyor'] || '').toString().trim();
      if (!name) return;
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [packageRows]);

  const loadInFlightRef = useRef(false);
  const loadedPackageInfoRef = useRef<{
    name: string;
    kecamatan: string;
    desaKelurahan: string;
    latitude?: number;
    longitude?: number;
  }>({ name: packageName, kecamatan: '', desaKelurahan: '' });

  // ─── Proposal Pekerjaan (RAB/dokumen) ──────────────────────────────────
  const [proposals, setProposals] = useState<ProposalDocument[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [uploadingProposal, setUploadingProposal] = useState(false);
  const [deletingProposalId, setDeletingProposalId] = useState<string | null>(null);
  const [canManageProposals, setCanManageProposals] = useState(true);

  const loadProposals = useCallback(async () => {
    setLoadingProposals(true);
    try {
      const list = await listProposalsFromServer(packageId);
      setProposals(list);
    } catch {
      // Gagal memuat proposal (mis. offline): biarkan daftar kosong/lama,
      // tidak perlu memblokir layar hanya karena bagian ini gagal.
    } finally {
      setLoadingProposals(false);
    }
  }, [packageId]);

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
      if (pkg) {
        setCurrentPackageName(pkg.name || packageName);
        loadedPackageInfoRef.current = {
          name: pkg.name || packageName,
          kecamatan: pkg.kecamatan || '',
          desaKelurahan: pkg.desaKelurahan || '',
          latitude: pkg.latitude,
          longitude: pkg.longitude,
        };
      }
    } catch {
      setAllowedTypes(null);
    }

    // Ambil status posting paket dan daftar jenis infrastruktur secara
    // terpisah (bukan Promise.all) supaya kegagalan salah satu tidak ikut
    // menggagalkan yang lain (mis. daftar jenis tetap muncul walau status
    // posting gagal diperiksa, atau sebaliknya).
    try {
      const allRows = await fetchSurveyList(undefined, packageId);
      setPackageRows(allRows);
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
      loadProposals();
      getWilayahList().then(setWilayahList).catch(() => {});
      getCurrentUser().then((user) => {
        const canEdit = user?.role === 'admin' || !!user?.permissions?.canEdit;
        setCanManageProposals(canEdit);
        setIsAdminUser(user?.role === 'admin');
        setCanPost(user?.role === 'admin' || user?.permissions?.canPost !== false);
        setCurrentUsername(user?.username);
      });
    }, [loadStatus, loadProposals])
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

  const handlePostPackage = () => {
    Alert.alert(
      'Posting Paket Pekerjaan',
      `Semua data survei (${packageRows.length} item) di paket "${currentPackageName}" akan ditandai "Survei Selesai" (dikunci) sekaligus. Setelah itu, data tidak dapat diubah/dihapus lagi kecuali oleh admin. Lanjutkan?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Posting',
          onPress: async () => {
            setPosting(true);
            try {
              await postPackage(packageId, currentUsername);
              setPackageRows((prev) => prev.map((row) => ({ ...row, Status: 'Diposting' })));
              setIsPackagePosted(true);
            } catch (err: any) {
              Alert.alert('Gagal Posting', err?.message || 'Terjadi kesalahan saat memposting paket.');
            } finally {
              setPosting(false);
            }
          },
        },
      ]
    );
  };

  const handleUnpostPackage = () => {
    Alert.alert(
      'Batalkan Status Survei Selesai',
      `Yakin ingin membuka kunci seluruh data di paket "${currentPackageName}" (batal "Survei Selesai") agar bisa diedit kembali?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Batalkan Posting',
          onPress: async () => {
            setPosting(true);
            try {
              await unpostPackage(packageId, currentUsername);
              setPackageRows((prev) => prev.map((row) => ({ ...row, Status: 'Belum Diposting' })));
              setIsPackagePosted(false);
            } catch (err: any) {
              Alert.alert('Gagal', err?.message || 'Terjadi kesalahan saat membatalkan posting paket.');
            } finally {
              setPosting(false);
            }
          },
        },
      ]
    );
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
  const startEditInfo = () => {
    const info = loadedPackageInfoRef.current;
    setDraftName(currentPackageName);
    setDraftKecamatan(info.kecamatan);
    setDraftDesaKelurahan(info.desaKelurahan);
    setDraftLatitude(info.latitude != null ? String(info.latitude) : '');
    setDraftLongitude(info.longitude != null ? String(info.longitude) : '');
    setEditingInfo(true);
  };

  const cancelEditInfo = () => {
    setEditingInfo(false);
  };

  const handleUseCurrentLocationForInfo = async () => {
    try {
      const location = await getCurrentLocation();
      setDraftLatitude(String(location.latitude));
      setDraftLongitude(String(location.longitude));
    } catch (error: any) {
      Alert.alert('Lokasi Saat Ini Tidak Tersedia', error?.message || 'Tidak dapat mengambil koordinat GPS saat ini.');
    }
  };

  const handleSaveInfo = async () => {
    const trimmedName = draftName.trim();
    if (!trimmedName) {
      Alert.alert('Nama Paket Wajib Diisi', 'Masukkan nama paket pekerjaan terlebih dahulu.');
      return;
    }
    setSavingInfo(true);
    try {
      const lat = draftLatitude.trim() ? parseCoordinate(draftLatitude) : undefined;
      const lng = draftLongitude.trim() ? parseCoordinate(draftLongitude) : undefined;
      await renamePackageEverywhere(packageId, trimmedName, undefined, draftKecamatan, draftDesaKelurahan, lat, lng);
      setCurrentPackageName(trimmedName);
      loadedPackageInfoRef.current = {
        name: trimmedName,
        kecamatan: draftKecamatan,
        desaKelurahan: draftDesaKelurahan,
        latitude: lat,
        longitude: lng,
      };
      setEditingInfo(false);
    } catch (err: any) {
      Alert.alert('Gagal Mengubah Paket', err?.message || 'Terjadi kesalahan saat menyimpan perubahan paket.');
    } finally {
      setSavingInfo(false);
    }
  };



  const handleUploadProposal = async () => {

    try {
      const doc = await pickProposalDocument();
      if (!doc) return;
      setUploadingProposal(true);
      const response = await uploadProposalToServer({
        packageId,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        base64: doc.base64,
      });
      if (response.proposal) {
        setProposals((prev) => [...prev, response.proposal as ProposalDocument]);
      } else {
        await loadProposals();
      }
      Alert.alert('Berhasil', 'Proposal berhasil diunggah.');
    } catch (err: any) {
      Alert.alert('Gagal Mengunggah', err?.message || 'Terjadi kesalahan saat mengunggah proposal.');
    } finally {
      setUploadingProposal(false);
    }
  };

  const handleOpenProposal = (proposal: ProposalDocument) => {
    Linking.openURL(proposal.fileUrl).catch(() => {
      Alert.alert('Gagal Membuka', 'Tidak dapat membuka file proposal ini.');
    });
  };

  const handleDeleteProposal = (proposal: ProposalDocument) => {
    Alert.alert(
      'Hapus Proposal',
      `Yakin ingin menghapus proposal "${proposal.fileName}"? Tindakan ini tidak dapat dibatalkan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            setDeletingProposalId(proposal.proposalId);
            try {
              await deleteProposalFromServer(proposal.proposalId);
              setProposals((prev) => prev.filter((p) => p.proposalId !== proposal.proposalId));
            } catch (err: any) {
              Alert.alert('Gagal Menghapus', err?.message || 'Terjadi kesalahan saat menghapus proposal.');
            } finally {
              setDeletingProposalId(null);
            }
          },
        },
      ]
    );
  };


  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <Text style={styles.title}>{currentPackageName}</Text>
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

      {!isPackagePosted && (
        editingInfo ? (
          <View style={styles.editInfoBox}>
            <Text style={styles.editTypesTitle}>Ubah Info Paket</Text>
            <Text style={styles.editInfoLabel}>Nama Paket</Text>
            <TextInput
              style={styles.editInfoInput}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="Nama paket pekerjaan"
            />
            <Text style={styles.editInfoLabel}>Kecamatan & Desa/Kelurahan</Text>
            <View style={styles.editInfoRow}>
              <TouchableOpacity style={styles.editInfoDropdown} onPress={() => setKecamatanModalVisible(true)}>
                <Text style={draftKecamatan ? styles.dropdownValueText : styles.dropdownPlaceholderText}>
                  {draftKecamatan || 'Pilih Kecamatan'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editInfoDropdown, !draftKecamatan && styles.typeButtonDisabled]}
                disabled={!draftKecamatan}
                onPress={() => draftKecamatan && setDesaModalVisible(true)}
              >
                <Text style={draftDesaKelurahan ? styles.dropdownValueText : styles.dropdownPlaceholderText}>
                  {draftDesaKelurahan || (draftKecamatan ? 'Pilih Desa/Kelurahan' : 'Pilih Kecamatan dulu')}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.editInfoLabel}>Koordinat Utama Paket (Opsional)</Text>
            <View style={styles.editInfoRow}>
              <TextInput
                style={[styles.editInfoInput, { flex: 1 }]}
                placeholder="Latitude"
                value={draftLatitude}
                onChangeText={setDraftLatitude}
                keyboardType="numeric"
              />
              <TextInput
                style={[styles.editInfoInput, { flex: 1 }]}
                placeholder="Longitude"
                value={draftLongitude}
                onChangeText={setDraftLongitude}
                keyboardType="numeric"
              />
            </View>
            <TouchableOpacity style={styles.gpsButton} onPress={handleUseCurrentLocationForInfo}>
              <Text style={styles.gpsButtonText}>Ambil GPS Saat Ini</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.gpsButton} onPress={() => setMapPickerVisible(true)}>
              <Text style={styles.gpsButtonText}>Pilih di Peta</Text>
            </TouchableOpacity>
            <View style={styles.editTypesActionRow}>
              <TouchableOpacity
                style={[styles.saveTypesButton, savingInfo && styles.typeButtonDisabled]}
                onPress={handleSaveInfo}
                disabled={savingInfo}
              >
                <Text style={styles.saveTypesButtonText}>{savingInfo ? 'Menyimpan...' : 'Simpan'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelTypesButton} onPress={cancelEditInfo} disabled={savingInfo}>
                <Text style={styles.cancelTypesButtonText}>Batal</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.editTypesLink} onPress={startEditInfo}>
            <Text style={styles.editTypesLinkText}>Ubah Paket (Nama, Wilayah, Koordinat)</Text>
          </TouchableOpacity>
        )
      )}

      {isPackagePosted ? (
        isAdminUser && (
          <TouchableOpacity
            style={[styles.unpostButton, posting && styles.typeButtonDisabled]}
            disabled={posting}
            onPress={handleUnpostPackage}
          >
            <Text style={styles.unpostButtonText}>Batalkan Posting Paket</Text>
          </TouchableOpacity>
        )
      ) : (
        canPost && (
          <TouchableOpacity
            style={[styles.postButton, (posting || packageRows.length === 0) && styles.typeButtonDisabled]}
            disabled={posting || packageRows.length === 0}
            onPress={handlePostPackage}
          >
            <Text style={styles.postButtonText}>Posting Paket Pekerjaan</Text>
          </TouchableOpacity>
        )
      )}

      <Text style={styles.sectionLabel}>Proposal Pekerjaan</Text>
      <View style={styles.proposalBox}>
        {loadingProposals ? (
          <ActivityIndicator size="small" color="#2563eb" style={{ marginBottom: 8 }} />
        ) : proposals.length === 0 ? (
          <Text style={styles.proposalEmptyText}>Belum ada proposal/dokumen yang diunggah untuk paket ini.</Text>
        ) : (
          proposals.map((proposal) => (
            <View key={proposal.proposalId} style={styles.proposalItem}>
              <TouchableOpacity style={styles.proposalItemInfo} onPress={() => handleOpenProposal(proposal)}>
                <Text style={styles.proposalFileName} numberOfLines={1}>📄 {proposal.fileName}</Text>
                <Text style={styles.proposalMetaText}>
                  Diunggah oleh {proposal.uploadedBy || '-'}
                </Text>
              </TouchableOpacity>
              {canManageProposals && (
                <TouchableOpacity
                  style={styles.proposalDeleteButton}
                  onPress={() => handleDeleteProposal(proposal)}
                  disabled={deletingProposalId === proposal.proposalId}
                >
                  <Text style={styles.proposalDeleteButtonText}>
                    {deletingProposalId === proposal.proposalId ? '...' : 'Hapus'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
        {canManageProposals && (
          <TouchableOpacity
            style={[styles.proposalUploadButton, uploadingProposal && styles.typeButtonDisabled]}
            onPress={handleUploadProposal}
            disabled={uploadingProposal}
          >
            <Text style={styles.proposalUploadButtonText}>
              {uploadingProposal ? 'Mengunggah...' : '+ Unggah Proposal (PDF/DOC)'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {surveyorSummary.length > 0 && (
        <View style={styles.summaryBox}>
          <Text style={styles.sectionLabel}>Dikerjakan oleh</Text>
          {surveyorSummary.map(([name, count]) => (
            <View key={name} style={styles.summaryRow}>
              <Text style={styles.summaryName} numberOfLines={1}>{name}</Text>
              <Text style={styles.summaryCount}>{count} item</Text>
            </View>
          ))}
        </View>
      )}

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

      <SearchableSelectModal
        visible={kecamatanModalVisible}
        title="Pilih Kecamatan"
        options={kecamatanOptions}
        onSelect={(value) => {
          setDraftKecamatan(value);
          setDraftDesaKelurahan('');
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
          setDraftDesaKelurahan(value);
          setDesaModalVisible(false);
        }}
        onClose={() => setDesaModalVisible(false)}
        emptyText="Belum ada Desa/Kelurahan untuk Kecamatan ini."
      />
      <CoordinatePickerModal
        visible={mapPickerVisible}
        initialLatitude={draftLatitude.trim() ? parseCoordinate(draftLatitude) : undefined}
        initialLongitude={draftLongitude.trim() ? parseCoordinate(draftLongitude) : undefined}
        onClose={() => setMapPickerVisible(false)}
        onConfirm={(lat, lng) => {
          setDraftLatitude(String(lat));
          setDraftLongitude(String(lng));
          setMapPickerVisible(false);
        }}
      />
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
  postButton: {
    marginTop: 16,
    backgroundColor: theme.colors.success,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  postButtonText: {
    color: '#fff',
    fontWeight: theme.font.semiBold,
    fontSize: 14,
  },
  unpostButton: {
    marginTop: 16,
    backgroundColor: theme.colors.warningBg,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  unpostButtonText: {
    color: theme.colors.warning,
    fontWeight: theme.font.semiBold,
    fontSize: 14,
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
  mapLink: {
    marginTop: 16,
    backgroundColor: theme.colors.primarySoftBg,
    borderColor: theme.colors.primaryBorder,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: 14,
    alignItems: 'center',
  },
  mapLinkText: {
    color: theme.colors.primaryDark,
    fontWeight: theme.font.semiBold,
    fontSize: 15,
  },
  editInfoBox: {
    marginTop: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  editInfoLabel: {
    fontSize: 13,
    fontWeight: theme.font.medium,
    color: theme.colors.textSecondary,
    marginTop: 10,
    marginBottom: 6,
  },
  editInfoInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: theme.colors.background,
  },
  editInfoRow: {
    flexDirection: 'row',
    gap: 8,
  },
  editInfoDropdown: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: theme.colors.background,
  },
  dropdownValueText: {
    color: theme.colors.textPrimary,
    fontSize: 13,
  },
  dropdownPlaceholderText: {
    color: theme.colors.textMuted,
    fontSize: 13,
  },
  gpsButton: {
    marginTop: 10,
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  gpsButtonText: {
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
  proposalBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  proposalEmptyText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginBottom: 10,
  },
  proposalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSoft,
  },
  proposalItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  proposalFileName: {
    fontSize: 14,
    fontWeight: theme.font.medium,
    color: theme.colors.primary,
  },
  proposalMetaText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  proposalDeleteButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.dangerBg,
  },
  proposalDeleteButtonText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: theme.font.medium,
  },
  proposalUploadButton: {
    marginTop: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  proposalUploadButtonText: {
    color: '#fff',
    fontWeight: theme.font.semiBold,
    fontSize: 13,
  },
  summaryBox: {
    marginTop: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSoft,
  },
  summaryName: {
    flex: 1,
    marginRight: 8,
    fontSize: 13,
    color: theme.colors.textPrimary,
  },
  summaryCount: {
    fontSize: 13,
    fontWeight: theme.font.medium,
    color: theme.colors.textSecondary,
  },
});

