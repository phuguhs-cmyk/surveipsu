import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Alert } from '../utils/alert';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import {
  EDIT_FIELDS,
  INFRASTRUCTURE_DETAIL_KEY,
  CONFIG,
  NUMERIC_MODE_DATA_KEYS,
  CONDITION_OPTIONS,
  PAVEMENT_TYPES,
  CHANNEL_TYPES,
  DRAINAGE_MATERIALS,
  SEDIMENT_CONDITIONS,
  RETAINING_WALL_TYPES,
  TILT_CONDITIONS,
  CULVERT_TYPES,
  BRIDGE_CONSTRUCTION_TYPES,
} from '../config';
import { fetchSurveyList, listUsers, updateSurvey, updateSurveySegments } from '../services/apiService';
import { getQueue, updateQueuedSurvey } from '../services/queueService';
import { extractRowPhotoUrls } from '../services/reportService';
import { parseStaToMeters, sortSegmentsBySta, validateStaRanges, isValidSta, addStaDistance } from '../utils/sta';
import { computeRoadSegmentPlanned, computeRetainingWallSegmentPlanned, computeDrainageSegmentPlanned } from '../utils/plannedDimensions';
import { validateRepairDamageDimensions } from '../utils/repairValidation';
import { deriveOverallCondition, classifyRoadSegmentCondition, classifyDrainageCondition } from '../utils/conditionRating';

import { getWilayahList, getKecamatanNames, getDesaByKecamatan, findKodeDesa } from '../services/wilayahService';
import SearchableSelectModal from '../components/SearchableSelectModal';
import SchemaPreviewModal from '../components/SchemaPreviewModal';
import LongitudinalProfileModal, { LongitudinalProfilePreview } from '../components/LongitudinalProfileModal';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

import { getCurrentUser } from '../services/authService';
import { getCurrentLocation } from '../services/locationService';
import { takePhoto, pickPhotoFromGallery } from '../services/photoService';
import SketchPad from '../components/SketchPad';
import CoordinatePickerModal from '../components/CoordinatePickerModal';
import SlopeHeightHelper from '../components/SlopeHeightHelper';
import { SurveyMode, SurveyModeData, SurveyPhoto, WilayahItem } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'EditItem'>;
const EDIT_MODES: SurveyMode[] = ['Pembangunan Baru', 'Perbaikan', 'Pengembangan'];
const EMPTY_MODE_DATA: SurveyModeData = {
  existingCondition: '', problem: '', proposedAction: '', treatmentVolume: '', treatmentUnit: '', priority: '',
  plannedLength: '', plannedWidth: '', plannedHeight: '', currentCapacity: '', targetCapacity: '',
  additionalLength: '', additionalWidth: '',
};
const DYNAMIC_EDIT_FIELDS = [
  { key: 'dimension', header: 'Dimensi/Ukuran', label: 'Dimensi' },
  { key: 'material', header: 'Material/Konstruksi', label: 'Material' },
  { key: 'technicalNotes', header: 'Catatan Teknis', label: 'Catatan Teknis' },
  { key: 'condition', header: 'Kondisi', label: 'Kondisi' },
];
const ELEVATION_KEYS = new Set([
  'roadElevationStart', 'roadElevationEnd',
  'invertElevationStart', 'invertElevationEnd',
  'baseElevationStart', 'baseElevationEnd',
]);

// Jenis infrastruktur yang bersegmen (satu item pekerjaan = banyak baris STA
// di server). Untuk jenis ini, layar edit menampilkan SEMUA segmen milik
// item pekerjaan yang sama sekaligus (bisa tambah/hapus/urutkan), sama
// seperti pengalaman input di WorkItemFormScreen — bukan cuma satu baris.
const SEGMENTED_TYPES = new Set(['Jalan', 'Drainase/Saluran Air', 'Dinding Penahan Tanah (DPT)']);

function makeId() {
  const globalCrypto = globalThis as any;
  if (globalCrypto?.crypto && typeof globalCrypto.crypto.randomUUID === 'function') {
    return globalCrypto.crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

// computeRoadSegmentPlanned/computeRetainingWallSegmentPlanned dipindah ke
// utils/plannedDimensions.ts agar dipakai bersama dengan WorkItemFormScreen.tsx
// (satu sumber logika, tidak lagi terduplikasi/bisa saling berbeda seperti
// sebelumnya — bug yang menyebabkan EditItemScreen tidak menghitung ulang
// Panjang/Lebar/Tinggi Rencana per segmen saat disimpan).

/** Satu segmen di layar edit: field STA sesuai EDIT_FIELDS + surveyId asli (kosong = segmen baru). */
interface EditSegment {
  localKey: string;
  surveyId?: string;
  values: Record<string, string>;
  expanded: boolean;
}

function segmentStaSummary(values: Record<string, string>) {
  const start = values.staStart || '-';
  const end = values.staEnd || '-';
  return `STA ${start} - ${end}`;
}

function computeSegmentLength(staStart: string, staEnd: string): string {
  const staLength = parseStaToMeters(staEnd) - parseStaToMeters(staStart);
  return !isNaN(staLength) && staLength > 0 ? staLength.toFixed(2) : '';
}

function queuedSurveyToRow(item: any, fields: { key: string; header: string }[]): any {
  const data = item.data || {};
  const detail = data.roadSegment || data.drainageSegment || data.retainingWall || data.culvert || data.bridge || data.dynamicDetail || {};
  const row: Record<string, any> = {
    'ID Survei': data.localId || item.localId,
    'ID Item Pekerjaan': data.itemId,
    'Nama Paket': data.packageName || '',
    'Nama Surveyor': data.surveyorName || '',
    'Alamat/Keterangan Lokasi': data.locationNote || '',
    'Kecamatan': data.kecamatan || '',
    'Desa/Kelurahan': data.desaKelurahan || '',
    'Latitude': data.latitude,
    'Longitude': data.longitude,
    'Akurasi GPS (m)': data.accuracy,
    'No. Segmen': data.segmentIndex,
    'Total Segmen': data.segmentTotal,
    'Mode Survei': data.surveyMode || '',
    'Mode Detail JSON': data.modeData ? JSON.stringify(data.modeData) : '',
    'Timestamp': item.createdAt,
    'Status': 'Belum Dikirim',
    __offlineQueueItem: item,
  };
  fields.forEach((field) => {
    row[field.header] = detail[field.key] ?? '';
  });
  return row;
}

export default function EditItemScreen({ route, navigation }: Props) {
  const { infrastructureType, surveyId } = route.params;
  const fields = EDIT_FIELDS[infrastructureType] || DYNAMIC_EDIT_FIELDS;
  const detailKey = INFRASTRUCTURE_DETAIL_KEY[infrastructureType] || 'dynamicDetail';
  const isSegmented = SEGMENTED_TYPES.has(infrastructureType);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [pickingFromGallery, setPickingFromGallery] = useState(false);
  const [sketchVisible, setSketchVisible] = useState(false);
  const [surveyorOptions, setSurveyorOptions] = useState<string[]>([]);
  const [surveyorModalVisible, setSurveyorModalVisible] = useState(false);

  const [values, setValues] = useState<Record<string, string>>({});
  const [segments, setSegments] = useState<EditSegment[]>([]);
  const [itemId, setItemId] = useState<string | undefined>(undefined);
  const [packageName, setPackageName] = useState('');
  const [surveyorName, setSurveyorName] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [wilayahList, setWilayahList] = useState<WilayahItem[]>([]);
  const [kecamatan, setKecamatan] = useState('');
  const [desaKelurahan, setDesaKelurahan] = useState('');
  const [kecamatanModalVisible, setKecamatanModalVisible] = useState(false);
  const [desaModalVisible, setDesaModalVisible] = useState(false);
  const [username, setUsername] = useState<string | undefined>(undefined);
  const [readOnly, setReadOnly] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<SurveyPhoto[]>([]);
  const [schemaModal, setSchemaModal] = useState<{ kind: 'road' | 'drainage' | 'retainingWall'; data: Record<string, string | undefined> } | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profilePreviewVisible, setProfilePreviewVisible] = useState(false);
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  const [packageId, setPackageId] = useState<string>('');
  const [mapPickerVisible, setMapPickerVisible] = useState(false);
  const [accuracy, setAccuracy] = useState<string>('');
  const [segmentIndex, setSegmentIndex] = useState<string>('');
  const [segmentTotal, setSegmentTotal] = useState<string>('');
  const [surveyMode, setSurveyMode] = useState<SurveyMode>('Perbaikan');
  const [modeData, setModeData] = useState<SurveyModeData>(EMPTY_MODE_DATA);
  const offlineQueueItemsRef = useRef<any[]>([]);

  // "Kondisi Eksisting" dihitung OTOMATIS dari kondisi tiap segmen/komponen
  // (worst-case), sama seperti di WorkItemFormScreen, agar konsisten saat
  // data lama dibuka & disimpan ulang di layar ini.
  const derivedExistingCondition = useMemo(() => {
    if (surveyMode === 'Pembangunan Baru') return '';
    if (isSegmented) return deriveOverallCondition(segments.map((s) => s.values.condition));
    if (infrastructureType === 'Gorong-gorong') {
      return deriveOverallCondition([values.inletCondition, values.outletCondition, values.condition]);
    }
    if (infrastructureType === 'Jembatan') {
      return deriveOverallCondition([values.upperStructureCondition, values.lowerStructureCondition, values.condition]);
    }
    return deriveOverallCondition([values.condition]);
  }, [surveyMode, isSegmented, segments, infrastructureType, values]);

  useEffect(() => {
    if (surveyMode === 'Pembangunan Baru') return;
    setModeData((previous) =>
      previous.existingCondition === derivedExistingCondition ? previous : { ...previous, existingCondition: derivedExistingCondition }
    );
  }, [derivedExistingCondition, surveyMode]);


  const emptySegmentValues = useCallback((): Record<string, string> => {
    const initial: Record<string, string> = {};
    fields.forEach((f) => { initial[f.key] = ''; });
    return initial;
  }, [fields]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const currentUser = await getCurrentUser();
      setUsername(currentUser?.username);

      let rows: any[] = [];
      try {
        rows = await fetchSurveyList(infrastructureType);
      } catch {
        // Saat offline, data yang belum terkirim dibaca dari queue lokal.
        const queueItems = (await getQueue()).filter(
          (item) => item.data?.infrastructureType === infrastructureType
        );
        offlineQueueItemsRef.current = queueItems;
        rows = queueItems.map((item) => queuedSurveyToRow(item, fields));
      }
      let primaryRow = rows.find((r) => r['ID Survei'] === surveyId);
      if (!primaryRow) {
        const queueItems = (await getQueue()).filter(
          (item) => item.data?.infrastructureType === infrastructureType
        );
        const localRow = queueItems
          .map((item) => queuedSurveyToRow(item, fields))
          .find((row) => row['ID Survei'] === surveyId);
        if (localRow) {
          offlineQueueItemsRef.current = queueItems;
          rows = [...rows, ...queueItems.map((item) => queuedSurveyToRow(item, fields))];
          primaryRow = localRow;
        }
      }
      if (!primaryRow) {
        Alert.alert('Tidak Ditemukan', 'Data tidak ditemukan di server atau antrian offline.');
        navigation.goBack();
        return;
      }

      const rowItemId = primaryRow['ID Item Pekerjaan'] || undefined;
      setItemId(rowItemId);

      const relatedRows = isSegmented && rowItemId
        ? rows.filter((r) => r['ID Item Pekerjaan'] === rowItemId)
        : [primaryRow];
      relatedRows.sort((a, b) => {
        const segA = parseInt(a['No. Segmen'], 10);
        const segB = parseInt(b['No. Segmen'], 10);
        if (!isNaN(segA) && !isNaN(segB)) return segA - segB;
        return 0;
      });

      const anyPosted = relatedRows.some((r) => r['Status'] === 'Diposting');
      if (anyPosted && currentUser?.role !== 'admin') {
        setReadOnly(true);
      }

      if (isSegmented) {
        setSegments(
          relatedRows.map((row, index) => {
            const rowValues: Record<string, string> = {};
            fields.forEach((f) => {
              rowValues[f.key] = row[f.header] !== undefined ? String(row[f.header]) : '';
            });
            return {
              localKey: makeId(),
              surveyId: row['ID Survei'],
              values: rowValues,
              expanded: index === 0,
            };
          })
        );
      } else {
        const initialValues: Record<string, string> = {};
        fields.forEach((f) => {
          initialValues[f.key] = primaryRow[f.header] !== undefined ? String(primaryRow[f.header]) : '';
        });
        setValues(initialValues);
      }

      setPackageName(primaryRow['Nama Paket'] || '');
      setSurveyorName(primaryRow['Nama Surveyor'] || '');
      setLocationNote(primaryRow['Alamat/Keterangan Lokasi'] || '');
      setKecamatan(primaryRow['Kecamatan'] || '');
      setDesaKelurahan(primaryRow['Desa/Kelurahan'] || '');
      if (EDIT_MODES.includes(primaryRow['Mode Survei'] as SurveyMode)) setSurveyMode(primaryRow['Mode Survei'] as SurveyMode);
      try {
        setModeData({ ...EMPTY_MODE_DATA, ...(primaryRow['Mode Detail JSON'] ? JSON.parse(primaryRow['Mode Detail JSON']) : {}) });
      } catch {
        setModeData(EMPTY_MODE_DATA);
      }
      setLatitude(primaryRow['Latitude'] !== undefined ? String(primaryRow['Latitude']) : '');
      setLongitude(primaryRow['Longitude'] !== undefined ? String(primaryRow['Longitude']) : '');
      setPackageId(primaryRow['ID Paket'] || '');
      setAccuracy(primaryRow['Akurasi GPS (m)'] !== undefined ? String(primaryRow['Akurasi GPS (m)']) : '');
      setSegmentIndex(primaryRow['No. Segmen'] !== undefined ? String(primaryRow['No. Segmen']) : '');
      setSegmentTotal(primaryRow['Total Segmen'] !== undefined ? String(primaryRow['Total Segmen']) : '');
      const photos = extractRowPhotoUrls(primaryRow).filter(
        (url) => url && !String(url).startsWith('ERROR_UPLOAD')
      );

      setPhotoUrls(photos);
      const offlineItem = primaryRow.__offlineQueueItem;
      setNewPhotos((offlineItem?.data?.photos || []).map((photo: any) => ({
        ...photo,
        uri: photo.uri || `data:${photo.mimeType || 'image/jpeg'};base64,${photo.base64}`,
      })));
    } catch (err: any) {
      Alert.alert('Gagal Memuat', err?.message || 'Tidak dapat mengambil data dari server.');
    } finally {
      setLoading(false);
    }
  }, [infrastructureType, surveyId, navigation, fields, isSegmented]);


  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    getWilayahList()
      .then(setWilayahList)
      .catch(() => {
        Alert.alert(
          'Gagal Memuat Data Wilayah',
          'Tidak dapat mengambil daftar Kecamatan/Desa dari server. Periksa koneksi internet Anda, lalu coba lagi.'
        );
      });
  }, []);

  const kecamatanOptions = useMemo(() => getKecamatanNames(wilayahList), [wilayahList]);
  const desaOptions = useMemo(
    () => getDesaByKecamatan(wilayahList, kecamatan).map((item) => item.desa),
    [wilayahList, kecamatan]
  );

  const handleSelectKecamatan = (value: string) => {
    setKecamatan((prev) => (prev === value ? prev : value));
    setDesaKelurahan('');
    setKecamatanModalVisible(false);
  };

  const handleSelectDesa = (value: string) => {
    setDesaKelurahan((prev) => (prev === value ? prev : value));
    setDesaModalVisible(false);
  };

  const handleChange = (key: string, value: string) => {
    setValues((prev) => {
      const updated = { ...prev, [key]: value };
      if (infrastructureType === 'Dinding Penahan Tanah (DPT)' && (key === 'staStart' || key === 'staEnd')) {
        updated.length = computeSegmentLength(updated.staStart || '', updated.staEnd || '');
      }
      return updated;
    });
  };

  // ------- Manipulasi segmen (khusus Jalan/Drainase/TPT) -------
  const toggleSegmentExpanded = (localKey: string) => {
    setSegments((prev) => prev.map((s) => (s.localKey === localKey ? { ...s, expanded: !s.expanded } : { ...s, expanded: false })));
  };

  const updateSegmentValue = (localKey: string, key: string, value: string) => {
    setSegments((prev) => {
      const changedIndex = prev.findIndex((segment) => segment.localKey === localKey);
      if (changedIndex < 0) return prev;
      const next = prev.map((s) => ({ ...s, values: { ...s.values } }));
      const changed = next[changedIndex];
      {
        const s = changed;
        const updatedValues = { ...s.values, [key]: value };
        if (key === 'length') {
          updatedValues.staEnd = addStaDistance(updatedValues.staStart || '', value);
        } else if (key === 'staStart') {
          if (updatedValues.length) updatedValues.staEnd = addStaDistance(value, updatedValues.length);
          else updatedValues.length = computeSegmentLength(value, updatedValues.staEnd || '');
        } else if (key === 'staEnd' && !updatedValues.length) {
          updatedValues.length = computeSegmentLength(updatedValues.staStart || '', value);
        }
        changed.values = updatedValues;
      }
      for (let index = changedIndex + 1; index < next.length; index++) {
        const previous = next[index - 1];
        next[index].values.staStart = previous.values.staEnd || '';
        next[index].values.staEnd = addStaDistance(next[index].values.staStart, next[index].values.length || '');
      }
      return next;
    });
  };

  const handleAddSegment = () => {
    setSegments((prev) => {
      const last = prev[prev.length - 1];
      const nextValues = emptySegmentValues();
      if (last?.values.staEnd?.trim()) {
        nextValues.staStart = last.values.staEnd.trim();
      }
      if (infrastructureType === 'Jalan' && last?.values.widthEnd?.trim()) {
        nextValues.widthStart = last.values.widthEnd.trim();
      }
      if (infrastructureType === 'Jalan' && last?.values.roadElevationEnd?.trim()) {
        nextValues.roadElevationStart = last.values.roadElevationEnd.trim();
      }
      if (infrastructureType === 'Dinding Penahan Tanah (DPT)' && last?.values.heightEnd?.trim()) {
        nextValues.heightStart = last.values.heightEnd.trim();
      }
      if (infrastructureType === 'Dinding Penahan Tanah (DPT)' && last?.values.baseElevationEnd?.trim()) {
        nextValues.baseElevationStart = last.values.baseElevationEnd.trim();
      }
      if (infrastructureType === 'Drainase/Saluran Air' && last?.values.invertElevationEnd?.trim()) {
        nextValues.invertElevationStart = last.values.invertElevationEnd.trim();
      }
      return [
        ...prev.map((s) => ({ ...s, expanded: false })),
        { localKey: makeId(), values: nextValues, expanded: true },
      ];
    });
  };

  const handleRemoveSegment = (localKey: string) => {
    setSegments((prev) => (prev.length > 1 ? prev.filter((s) => s.localKey !== localKey) : prev));
  };

  const handleGetLocation = async () => {
    setGettingLocation(true);
    try {
      const loc = await getCurrentLocation();
      setLatitude(String(loc.latitude));
      setLongitude(String(loc.longitude));
      setAccuracy(loc.accuracy !== null ? String(loc.accuracy) : '');
      if (loc.accuracy !== null && loc.accuracy > CONFIG.LOCATION_LOW_ACCURACY_THRESHOLD_M) {
        Alert.alert(
          'Akurasi GPS Rendah',
          `Akurasi lokasi saat ini sekitar ± ${loc.accuracy.toFixed(0)} m, kurang presisi. Sebaiknya coba lagi di tempat terbuka (bukan dalam ruangan/gedung) untuk hasil yang lebih akurat.`
        );
      }
    } catch (err: any) {
      Alert.alert('Gagal Ambil Lokasi', err?.message || 'Terjadi kesalahan.');
    } finally {
      setGettingLocation(false);
    }
  };

  const handleTakePhoto = async () => {
    if (photoUrls.length + newPhotos.length >= CONFIG.MAX_PHOTOS) {
      Alert.alert('Batas Foto', `Maksimal ${CONFIG.MAX_PHOTOS} foto per item.`);
      return;
    }
    setTakingPhoto(true);
    try {
      const photo = await takePhoto();
      if (photo) {
        setNewPhotos((prev) => [...prev, photo]);
      }
    } catch (err: any) {
      Alert.alert('Gagal Ambil Foto', err?.message || 'Terjadi kesalahan.');
    } finally {
      setTakingPhoto(false);
    }
  };

  const handleRemoveExistingPhoto = (index: number) => {
    setPhotoUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveNewPhoto = (index: number) => {
    setNewPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePickFromGallery = async () => {
    if (photoUrls.length + newPhotos.length >= CONFIG.MAX_PHOTOS) {
      Alert.alert('Batas Foto', `Maksimal ${CONFIG.MAX_PHOTOS} foto per item.`);
      return;
    }
    setPickingFromGallery(true);
    try {
      const photo = await pickPhotoFromGallery();
      if (photo) {
        setNewPhotos((prev) => [...prev, photo]);
      }
    } catch (err: any) {
      Alert.alert('Gagal Memilih Foto', err?.message || 'Terjadi kesalahan.');
    } finally {
      setPickingFromGallery(false);
    }
  };

  const handleOpenSketch = () => {
    if (photoUrls.length + newPhotos.length >= CONFIG.MAX_PHOTOS) {
      Alert.alert('Batas Foto', `Maksimal ${CONFIG.MAX_PHOTOS} foto per item.`);
      return;
    }
    setSketchVisible(true);
  };

  const handleSaveSketch = (base64: string) => {
    // Sketsa native disimpan sebagai jpg (lebih cepat), sedangkan versi web
    // (Canvas HTML) tetap png. Deteksi mime dari data URI, jangan asumsikan
    // png agar file tidak korup ketika dibuka.
    const mimeMatch = base64.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    const ext = mimeType === 'image/jpeg' ? 'jpg' : 'png';
    const normalized = base64.includes('base64,') ? base64.split('base64,')[1] : base64;
    const photo: SurveyPhoto = {
      uri: `data:${mimeType};base64,${normalized}`,
      base64: normalized,
      mimeType,
      fileName: `sketsa_${Date.now()}.${ext}`,
    };
    setNewPhotos((prev) => [...prev, photo]);
  };

  const handleSaveSchemaPhoto = (photo: SurveyPhoto) => {
    if (photoUrls.length + newPhotos.length >= CONFIG.MAX_PHOTOS) {
      Alert.alert('Batas Foto', `Maksimal ${CONFIG.MAX_PHOTOS} foto per item.`);
      return;
    }
    setNewPhotos((prev) => [...prev, photo]);
  };


  const handleSave = async () => {
    if (readOnly) {
      Alert.alert('Tidak Bisa Mengubah', 'Data survei ini sudah berstatus "Survei Selesai" (dikunci) dan tidak dapat diubah. Hubungi admin untuk membuka kunci terlebih dahulu.');
      return;
    }
    if (!locationNote.trim()) {
      Alert.alert('Alamat/Keterangan Lokasi Wajib Diisi', 'Mohon isi Alamat/Keterangan Lokasi sebelum menyimpan data survei.');
      return;
    }
    if (isSegmented) {
      if (segments.some((s) => !s.values.staStart?.trim() || !s.values.staEnd?.trim())) {
        Alert.alert('STA Belum Lengkap', 'Isi STA awal & akhir untuk setiap segmen.');
        return;
      }
      if (segments.some((s) => !isValidSta(s.values.staStart) || !isValidSta(s.values.staEnd))) {
        Alert.alert('Format STA Tidak Valid', 'Gunakan format STA seperti "0+000" atau angka meter biasa untuk setiap segmen.');
        return;
      }

      const sortedSegments = sortSegmentsBySta(
        segments.map((s) => ({ ...s, staStart: s.values.staStart, staEnd: s.values.staEnd }))
      );
      const rangeErrors = validateStaRanges(sortedSegments);
      if (rangeErrors.length > 0) {
        Alert.alert('STA Tidak Valid', rangeErrors.join('\n'));
        return;
      }

      const repairValidationErrors = sortedSegments
        .filter((segment) => infrastructureType === 'Jalan')
        .map((segment) => validateRepairDamageDimensions({
          length: segment.values.length,
          staStart: segment.values.staStart,
          staEnd: segment.values.staEnd,
          widthStart: segment.values.widthStart,
          widthEnd: segment.values.widthEnd,
          damageLength: segment.values.damageLength,
          damageWidth: segment.values.damageWidth,
          damageDepth: segment.values.damageDepth,
        }))
        .find((result) => !result.valid);
      if (repairValidationErrors) {
        Alert.alert('Ukuran Kerusakan Tidak Valid', 'Panjang, lebar, dan tinggi/kedalaman kerusakan tidak boleh melebihi panjang, lebar, dan tinggi segmen yang disurvei.');
        return;
      }

      setSaving(true);
      try {
        // Untuk mode "Pembangunan Baru" (Jalan & DPT), Panjang/Lebar/Tinggi
        // Rencana dihitung ulang OTOMATIS PER SEGMEN (bukan disamakan untuk
        // seluruh item) menggunakan STA & lebar/tinggi milik segmen itu
        // sendiri, sama seperti alur input data baru — sehingga data lama
        // yang dibuka & disimpan ulang di sini juga ikut terisi otomatis.
        const segmentModeData: Record<string, any>[] | undefined =
          surveyMode === 'Pembangunan Baru'
            ? sortedSegments.map((s) => {
                if (infrastructureType === 'Jalan') {
                  return { ...modeData, ...computeRoadSegmentPlanned(s.values) };
                }
                if (infrastructureType === 'Dinding Penahan Tanah (DPT)') {
                  return { ...modeData, ...computeRetainingWallSegmentPlanned(s.values) };
                }
                if (infrastructureType === 'Drainase/Saluran Air') {
                  return { ...modeData, ...computeDrainageSegmentPlanned(s.values) };
                }
                return modeData;
              })
            : undefined;

        if (offlineQueueItemsRef.current.length > 0) {
          const queueById = new Map(offlineQueueItemsRef.current.map((item) => [item.localId, item]));
          for (let index = 0; index < sortedSegments.length; index += 1) {
            const segment = sortedSegments[index];
            const queueItem = segment.surveyId ? queueById.get(segment.surveyId) : undefined;
            if (!queueItem) continue;
            const data = queueItem.data;
            const detailKeyForQueue = INFRASTRUCTURE_DETAIL_KEY[infrastructureType] || 'dynamicDetail';
            const updatedData = {
              ...data,
              packageName,
              surveyorName,
              username,
              surveyMode,
              modeData: segmentModeData ? segmentModeData[index] : modeData,
              locationNote,
              kecamatan,
              desaKelurahan,
              latitude: latitude.trim() ? Number(latitude) : null,
              longitude: longitude.trim() ? Number(longitude) : null,
              accuracy: accuracy.trim() ? Number(accuracy) : null,
              photos: newPhotos.map((photo) => ({
                base64: photo.base64,
                mimeType: photo.mimeType,
                fileName: photo.fileName,
              })),
              [detailKeyForQueue]: segment.values,
            };
            await updateQueuedSurvey(queueItem.localId, updatedData);
          }
          Alert.alert('Berhasil', 'Perubahan disimpan di perangkat dan akan dikirim saat online.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          return;
        }

        await updateSurveySegments({
          infrastructureType,
          itemId,
          username,
          packageName,
          surveyorName,
          surveyMode,
          modeData,
          locationNote,
          kecamatan,
          desaKelurahan,
          kodeDesaKelurahan: findKodeDesa(wilayahList, kecamatan, desaKelurahan),
          latitude: latitude.trim() ? Number(latitude) : null,
          longitude: longitude.trim() ? Number(longitude) : null,
          accuracy: accuracy.trim() ? Number(accuracy) : null,
          existingPhotos: photoUrls,
          newPhotos: newPhotos.map((p) => ({ base64: p.base64, mimeType: p.mimeType, fileName: p.fileName })),
          segments: sortedSegments.map((s, index) => ({
            surveyId: s.surveyId,
            detail: s.values,
            modeData: segmentModeData ? segmentModeData[index] : undefined,
          })),
        });
        setSegments(sortedSegments);
        Alert.alert('Berhasil', 'Data berhasil diperbarui.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } catch (err: any) {
        Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan saat menyimpan data.');
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    try {
      const offlineItem = offlineQueueItemsRef.current.find((item) => item.localId === surveyId);
      if (offlineItem) {
        const data = offlineItem.data;
        const detailKeyForQueue = INFRASTRUCTURE_DETAIL_KEY[infrastructureType] || 'dynamicDetail';
        await updateQueuedSurvey(offlineItem.localId, {
          ...data,
          packageName,
          surveyorName,
          username,
          surveyMode,
          modeData,
          locationNote,
          kecamatan,
          desaKelurahan,
          latitude: latitude.trim() ? Number(latitude) : null,
          longitude: longitude.trim() ? Number(longitude) : null,
          accuracy: accuracy.trim() ? Number(accuracy) : null,
          photos: newPhotos.map((photo) => ({
            base64: photo.base64,
            mimeType: photo.mimeType,
            fileName: photo.fileName,
          })),
          [detailKeyForQueue]: values,
        });
        Alert.alert('Berhasil', 'Perubahan disimpan di perangkat dan akan dikirim saat online.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
        return;
      }

      await updateSurvey({
        infrastructureType,
        surveyId,
        username,
        packageName,
        surveyorName,
        surveyMode,
        modeData,
        locationNote,
        kecamatan,
        desaKelurahan,
        kodeDesaKelurahan: findKodeDesa(wilayahList, kecamatan, desaKelurahan),
        latitude: latitude.trim() ? Number(latitude) : null,
        longitude: longitude.trim() ? Number(longitude) : null,
        accuracy: accuracy.trim() ? Number(accuracy) : null,
        existingPhotos: photoUrls,
        newPhotos: newPhotos.map((p) => ({ base64: p.base64, mimeType: p.mimeType, fileName: p.fileName })),
        detailKey,
        detail: values,
      });
      Alert.alert('Berhasil', 'Data berhasil diperbarui.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan saat menyimpan data.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
    {isSegmented && profilePreviewVisible && (
      <View style={styles.stickyProfilePreview}>
        <View style={styles.stickyProfileHeader}>
          <Text style={styles.stickyProfileTitle}>Preview Profil Memanjang</Text>
          <View style={styles.stickyProfileActions}>
            <TouchableOpacity onPress={() => setProfileModalVisible(true)}>
              <Text style={styles.stickyProfileSave}>Ukuran penuh & Simpan Foto</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setProfilePreviewVisible(false)}>
              <Text style={styles.stickyProfileClose}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
        <LongitudinalProfilePreview
          infrastructureType={infrastructureType}
          segments={segments.map((segment) => ({
            staStart: segment.values.staStart || '',
            staEnd: segment.values.staEnd || '',
            values: segment.values,
          }))}
        />
      </View>
    )}
    <KeyboardAwareScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid
      enableAutomaticScroll
      extraScrollHeight={Platform.OS === 'android' ? 60 : 24}
      extraHeight={Platform.OS === 'android' ? 140 : 120}
    >
      <Text style={styles.title}>Edit Data {infrastructureType}</Text>

      {!isSegmented && segmentIndex !== '' && segmentTotal !== '' && (
        <View style={styles.segmentBadgeBox}>
          <Text style={styles.segmentBadgeText}>
            Segmen {segmentIndex} dari {segmentTotal}
          </Text>
        </View>
      )}

      {readOnly && (
        <View style={styles.readOnlyBanner}>
          <Text style={styles.readOnlyBannerText}>
            Data survei ini sudah berstatus "Survei Selesai" (dikunci) dan tidak dapat diubah. Hubungi admin untuk membuka kunci terlebih dahulu.
          </Text>
        </View>
      )}

      <Text style={styles.label}>Koordinat Lokasi (Latitude, Longitude)</Text>
      <View style={styles.coordinateBox}>
        <Text style={styles.coordinateText}>
          {latitude && longitude ? `${latitude}, ${longitude}` : 'Tidak tersedia'}
        </Text>
        {!!accuracy && <Text style={styles.coordinateHint}>Akurasi GPS: ± {accuracy} m</Text>}
      </View>
      {!readOnly && (
        <TouchableOpacity
          style={[styles.secondaryButton, gettingLocation && styles.buttonDisabled]}
          onPress={handleGetLocation}
          disabled={gettingLocation}
        >
          {gettingLocation ? (
            <ActivityIndicator color="#2563eb" />
          ) : (
            <Text style={styles.secondaryButtonText}>Perbarui Koordinat GPS</Text>
          )}
        </TouchableOpacity>
      )}
      {!readOnly && (
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setMapPickerVisible(true)}>
          <Text style={styles.secondaryButtonText}>🗺️ Pilih di Peta</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.label}>Foto Survei</Text>
      <View style={styles.photoRow}>
        {photoUrls.map((url, i) => (
          <View key={`existing-${i}`} style={styles.photoWrapper}>
            <Image source={{ uri: url }} style={styles.photoThumb} resizeMode="cover" />
            {!readOnly && (
              <TouchableOpacity style={styles.photoRemove} onPress={() => handleRemoveExistingPhoto(i)}>
                <Text style={styles.photoRemoveText}>X</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {newPhotos.map((p, i) => (
          <View key={`new-${i}`} style={styles.photoWrapper}>
            <Image source={{ uri: p.uri }} style={styles.photoThumb} resizeMode="cover" />
            {!readOnly && (
              <TouchableOpacity style={styles.photoRemove} onPress={() => handleRemoveNewPhoto(i)}>
                <Text style={styles.photoRemoveText}>X</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {!readOnly && photoUrls.length + newPhotos.length < CONFIG.MAX_PHOTOS && (
          <TouchableOpacity style={styles.photoAdd} onPress={handleTakePhoto} disabled={takingPhoto}>
            {takingPhoto ? <ActivityIndicator color="#2563eb" /> : <Text style={styles.photoAddText}>+ Foto</Text>}
          </TouchableOpacity>
        )}
        {!readOnly && photoUrls.length + newPhotos.length < CONFIG.MAX_PHOTOS && (
          <TouchableOpacity style={styles.photoAdd} onPress={handlePickFromGallery} disabled={pickingFromGallery}>
            {pickingFromGallery ? <ActivityIndicator color="#2563eb" /> : <Text style={styles.photoAddText}>+ Galeri</Text>}
          </TouchableOpacity>
        )}
        {!readOnly && photoUrls.length + newPhotos.length < CONFIG.MAX_PHOTOS && (
          <TouchableOpacity style={styles.photoAdd} onPress={handleOpenSketch}>
            <Text style={styles.photoAddText}>+ Sketsa</Text>
          </TouchableOpacity>
        )}
      </View>
      {photoUrls.length === 0 && newPhotos.length === 0 && (
        <Text style={styles.noPhotoText}>Belum ada foto untuk data ini.</Text>
      )}
      {!readOnly && (
        <Text style={styles.locationHint}>
          Gunakan "+ Sketsa" untuk menggambar sketsa lokasi/kerusakan lengkap dengan label ukuran
          langsung di atas gambar (tanpa perlu mencatat ukuran terpisah).
        </Text>
      )}

      <SketchPad
        visible={sketchVisible}
        onClose={() => setSketchVisible(false)}
        onSave={handleSaveSketch}
      />

      {schemaModal && (
        <SchemaPreviewModal
          visible={!!schemaModal}
          kind={schemaModal.kind}
          data={schemaModal.data}
          onClose={() => setSchemaModal(null)}
          onSave={handleSaveSchemaPhoto}
        />
      )}

      {isSegmented && (
        <LongitudinalProfileModal
          visible={profileModalVisible}
          infrastructureType={infrastructureType}
          segments={segments.map((s) => ({
            staStart: s.values.staStart || '',
            staEnd: s.values.staEnd || '',
            values: s.values,
          }))}
          onClose={() => setProfileModalVisible(false)}
          onSave={handleSaveSchemaPhoto}
        />
      )}

      <Text style={styles.label}>Nama Paket</Text>
      <TextInput style={styles.input} value={packageName} onChangeText={setPackageName} editable={!readOnly} />

      <Text style={styles.label}>Nama Surveyor</Text>
      <View style={styles.inlineSearchRow}>
        <TextInput
          style={[styles.input, styles.flexInput]}
          value={surveyorName}
          onChangeText={setSurveyorName}
          editable={!readOnly}
          placeholder="Ketik / cari nama surveyor"
          autoCapitalize="words"
        />
        <TouchableOpacity style={styles.searchButton} onPress={() => setSurveyorModalVisible(true)} disabled={readOnly}>
          <Text style={styles.searchButtonText}>Cari</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Mode Survei</Text>
      <View style={styles.modeRow}>
        {EDIT_MODES.map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[styles.modeButton, surveyMode === mode && styles.modeButtonActive]}
            onPress={() => setSurveyMode(mode)}
            disabled={readOnly}
          >
            <Text style={[styles.modeButtonText, surveyMode === mode && styles.modeButtonTextActive]}>{mode}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {(surveyMode === 'Pembangunan Baru' || surveyMode === 'Perbaikan' || surveyMode === 'Pengembangan') && (
        <>
          <Text style={styles.label}>Ringkasan Pendataan</Text>
          {(surveyMode === 'Pembangunan Baru'
            ? [
                ['plannedLength', 'Panjang Rencana'],
                ['plannedWidth', 'Lebar Rencana'],
                ['plannedHeight', 'Tinggi/Kedalaman Rencana'],
                ['proposedAction', 'Rencana Tindakan'],
              ]
            : surveyMode === 'Perbaikan'
              ? [
                  ['existingCondition', 'Kondisi Eksisting'],
                  ['problem', 'Permasalahan/Kerusakan'],
                  ['proposedAction', 'Tindakan Perbaikan'],
                  ['treatmentVolume', 'Volume Penanganan'],
                  ['treatmentUnit', 'Satuan'],
                  ['priority', 'Prioritas'],
                ]
              : [
                  ['existingCondition', 'Kondisi Eksisting'],
                  ['currentCapacity', 'Kapasitas Eksisting'],
                  ['targetCapacity', 'Target Kapasitas'],
                  ['additionalLength', 'Panjang Tambahan'],
                  ['additionalWidth', 'Lebar Tambahan'],
                  ['proposedAction', 'Tindakan Pengembangan'],
                  ['priority', 'Prioritas'],
                ]
          ).map(([key, label]) => (
            <View key={key}>
              <Text style={styles.subLabel}>{key === 'existingCondition' ? `${label} (otomatis)` : label}</Text>
              {key === 'existingCondition' ? (
                <Text style={styles.computedValue}>{modeData.existingCondition || 'Isi kondisi tiap segmen/komponen dahulu'}</Text>
              ) : (
                <TextInput
                  style={styles.input}
                  value={modeData[key as keyof SurveyModeData]}
                  onChangeText={(value) => setModeData((previous) => ({ ...previous, [key]: value }))}
                  editable={!readOnly}
                  keyboardType={NUMERIC_MODE_DATA_KEYS.includes(key) ? 'numeric' : 'default'}
                />
              )}
            </View>
          ))}
        </>
      )}

      {isSegmented ? (
        <>
          <Text style={styles.label}>Segmen STA</Text>
          {segments.length > 1 && (
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setProfilePreviewVisible((value) => !value)}>
              <Text style={styles.secondaryButtonText}>{profilePreviewVisible ? 'Sembunyikan' : '📈 Tampilkan'} Preview Profil Memanjang</Text>
            </TouchableOpacity>
          )}
          {segments.map((seg, index) => (
            <View key={seg.localKey} style={styles.segmentBox}>
              <TouchableOpacity style={styles.segmentHeader} onPress={() => toggleSegmentExpanded(seg.localKey)}>
                <Text style={styles.segmentTitle}>
                  Segmen {index + 1} dari {segments.length} — {segmentStaSummary(seg.values)}
                </Text>
                <View style={styles.segmentHeaderActions}>
                  {!readOnly && segments.length > 1 && (
                    <TouchableOpacity onPress={() => handleRemoveSegment(seg.localKey)}>
                      <Text style={styles.removeText}>Hapus</Text>
                    </TouchableOpacity>
                  )}
                  <Text style={styles.expandIcon}>{seg.expanded ? '▲' : '▼'}</Text>
                </View>
              </TouchableOpacity>

              {seg.expanded && (
                <View style={styles.segmentBody}>
                  {fields.map((f) => {
                    const isComputedStaEnd = f.key === 'staEnd';
                    const isChipField = [
                      'pavementType', 'condition', 'channelType', 'material',
                      'sedimentCondition', 'constructionType', 'tiltCondition',
                    ].includes(f.key);
                    const chipOptions =
                      f.key === 'pavementType' ? PAVEMENT_TYPES :
                      f.key === 'condition' ? CONDITION_OPTIONS :
                      f.key === 'channelType' ? CHANNEL_TYPES :
                      f.key === 'material' ? DRAINAGE_MATERIALS :
                      f.key === 'sedimentCondition' ? SEDIMENT_CONDITIONS :
                      f.key === 'constructionType' ? RETAINING_WALL_TYPES :
                      f.key === 'tiltCondition' ? TILT_CONDITIONS : [];
                    return (
                      <View key={f.key}>
                        <Text style={styles.subLabel}>{f.label}</Text>
                        {isComputedStaEnd ? (
                          <Text style={styles.computedValue}>
                            {seg.values[f.key] || 'Isi STA Awal & Panjang'}
                          </Text>
                        ) : isChipField ? (
                          <View style={styles.chipRow}>
                            {chipOptions.map((opt) => (
                              <TouchableOpacity
                                key={opt}
                                style={[styles.chip, seg.values[f.key] === opt && styles.chipActive]}
                                onPress={() => !readOnly && updateSegmentValue(seg.localKey, f.key, opt)}
                              >
                                <Text style={[styles.chipText, seg.values[f.key] === opt && styles.chipTextActive]}>{opt}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        ) : (
                          <TextInput
                            style={styles.input}
                            value={seg.values[f.key] ?? ''}
                            onChangeText={(v) => updateSegmentValue(seg.localKey, f.key, v)}
                            editable={!readOnly}
                            keyboardType={ELEVATION_KEYS.has(f.key) ? 'numbers-and-punctuation' : f.numeric ? 'numeric' : 'default'}
                          />
                        )}
                        {!readOnly && (f.key === 'heightStart' || f.key === 'heightEnd') && infrastructureType === 'Dinding Penahan Tanah (DPT)' && (
                          <SlopeHeightHelper onApply={(v) => updateSegmentValue(seg.localKey, f.key, v)} />
                        )}
                        {!readOnly && f.key === 'damageDepth' && infrastructureType === 'Jalan' && (() => {
                          const suggestion = classifyRoadSegmentCondition(seg.values);
                          if (!suggestion) return null;
                          return (
                            <View style={styles.suggestionBox}>
                              <Text style={styles.suggestionText}>
                                💡 Saran kondisi berdasarkan luas & kedalaman kerusakan: <Text style={styles.suggestionValue}>{suggestion}</Text>
                              </Text>
                              {seg.values.condition !== suggestion && (
                                <TouchableOpacity onPress={() => updateSegmentValue(seg.localKey, 'condition', suggestion)}>
                                  <Text style={styles.suggestionApply}>Terapkan ke Kondisi</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          );
                        })()}
                        {!readOnly && f.key === 'sedimentCondition' && infrastructureType === 'Drainase/Saluran Air' && (() => {
                          const suggestion = classifyDrainageCondition(seg.values.sedimentCondition);
                          if (!suggestion) return null;
                          return (
                            <View style={styles.suggestionBox}>
                              <Text style={styles.suggestionText}>
                                💡 Saran kondisi berdasarkan Kondisi Sedimentasi: <Text style={styles.suggestionValue}>{suggestion}</Text>
                              </Text>
                              {seg.values.condition !== suggestion && (
                                <TouchableOpacity onPress={() => updateSegmentValue(seg.localKey, 'condition', suggestion)}>
                                  <Text style={styles.suggestionApply}>Terapkan ke Kondisi</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          );
                        })()}
                      </View>
                    );
                  })}
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => {
                      const kind: 'road' | 'drainage' | 'retainingWall' =
                        infrastructureType === 'Jalan'
                          ? 'road'
                          : infrastructureType === 'Drainase/Saluran Air'
                          ? 'drainage'
                          : 'retainingWall';
                      setSchemaModal({ kind, data: seg.values });
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>📐 Lihat Skema Segmen Ini</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
          {!readOnly && (
            <TouchableOpacity style={styles.secondaryButton} onPress={handleAddSegment}>
              <Text style={styles.secondaryButtonText}>+ Tambah Segmen STA</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        fields.map((f) => {
          const isChipField = [
            'culvertType', 'constructionType', 'condition',
            'inletCondition', 'outletCondition',
            'upperStructureCondition', 'lowerStructureCondition',
          ].includes(f.key);
          const chipOptions =
            f.key === 'culvertType' ? CULVERT_TYPES :
            f.key === 'constructionType' ? BRIDGE_CONSTRUCTION_TYPES :
            ['condition', 'inletCondition', 'outletCondition', 'upperStructureCondition', 'lowerStructureCondition'].includes(f.key)
              ? CONDITION_OPTIONS : [];
          // Field kondisi disembunyikan untuk mode Pembangunan Baru, sama
          // seperti di WorkItemFormScreen, karena belum ada kondisi eksisting
          // untuk item yang benar-benar baru.
          const isConditionKey = ['condition', 'inletCondition', 'outletCondition', 'upperStructureCondition', 'lowerStructureCondition'].includes(f.key);
          if (isConditionKey && surveyMode === 'Pembangunan Baru') return null;
          return (
            <View key={f.key}>
              <Text style={styles.label}>{f.label}</Text>
              {isChipField ? (
                <View style={styles.chipRow}>
                  {chipOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.chip, values[f.key] === opt && styles.chipActive]}
                      onPress={() => !readOnly && handleChange(f.key, opt)}
                    >
                      <Text style={[styles.chipText, values[f.key] === opt && styles.chipTextActive]}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  value={values[f.key] ?? ''}
                  onChangeText={(v) => handleChange(f.key, v)}
                  editable={!readOnly}
                  keyboardType={ELEVATION_KEYS.has(f.key) ? 'numbers-and-punctuation' : f.numeric ? 'numeric' : 'default'}
                />
              )}
            </View>
          );
        })
      )}

      <Text style={styles.label}>Alamat/Keterangan Lokasi *</Text>
      <TextInput style={styles.input} value={locationNote} onChangeText={setLocationNote} editable={!readOnly} placeholder="Wajib diisi" />

      <SearchableSelectModal
        visible={surveyorModalVisible}
        title="Pilih Nama Surveyor"
        options={surveyorOptions}
        onSelect={(value) => {
          setSurveyorName(value);
          setSurveyorModalVisible(false);
        }}
        onClose={() => setSurveyorModalVisible(false)}
        emptyText="Belum ada nama surveyor yang bisa dipilih. Ketik nama manual."
      />

      <TouchableOpacity
        style={[styles.saveButton, (saving || readOnly) && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving || readOnly}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Simpan Perubahan</Text>}
      </TouchableOpacity>
    </KeyboardAwareScrollView>
    <CoordinatePickerModal
      visible={mapPickerVisible}
      initialLatitude={latitude.trim() ? Number(latitude) : undefined}
      initialLongitude={longitude.trim() ? Number(longitude) : undefined}
      packageId={packageId}
      onClose={() => setMapPickerVisible(false)}
      onConfirm={(lat, lng) => {
        setLatitude(String(lat));
        setLongitude(String(lng));
        setMapPickerVisible(false);
      }}
    />
    </KeyboardAvoidingView>
  );
}


const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  stickyProfilePreview: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#bfdbfe',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    zIndex: 10,
    elevation: 4,
  },
  stickyProfileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  stickyProfileActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stickyProfileTitle: { fontSize: 12, fontWeight: '700', color: '#1e40af' },
  stickyProfileSave: { fontSize: 11, fontWeight: '700', color: '#2563eb', padding: 4 },
  stickyProfileClose: { fontSize: 12, fontWeight: '700', color: '#dc2626', padding: 4 },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  segmentBadgeBox: {
    alignSelf: 'flex-start',
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  segmentBadgeText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 13,
  },
  suggestionBox: {
    marginTop: 8,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  suggestionText: {
    fontSize: 12,
    color: '#92400e',
  },
  suggestionValue: {
    fontWeight: '700',
  },
  suggestionApply: {
    marginTop: 6,
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 13,
  },

  readOnlyBanner: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  readOnlyBannerText: {
    color: '#92400e',
    fontSize: 13,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginTop: 6,
    marginBottom: 4,
  },
  computedValue: {
    fontSize: 14,
    color: '#0f172a',

    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inlineSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flexInput: {
    flex: 1,
  },
  searchButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  coordinateBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  coordinateText: {
    fontSize: 14,
    color: '#0f172a',
  },
  coordinateHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoWrapper: {
    position: 'relative',
    marginRight: 10,
    marginBottom: 10,
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 12,
  },
  photoAdd: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '600',
  },
  noPhotoText: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 8,
  },
  locationHint: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 8,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  modeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modeButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  modeButtonText: {
    color: '#334155',
    fontSize: 13,
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  dropdownInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  dropdownDisabled: {
    backgroundColor: '#f1f5f9',
  },
  dropdownValueText: {
    fontSize: 15,
    color: '#0f172a',
  },
  dropdownPlaceholderText: {
    fontSize: 15,
    color: '#94a3b8',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  chipText: {
    color: '#334155',
    fontSize: 13,
  },
  chipTextActive: {
    color: '#fff',
  },
  segmentBox: {
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    overflow: 'hidden',
  },
  segmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  segmentHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  segmentTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1d4ed8',
    flex: 1,
    marginRight: 8,
  },
  expandIcon: {
    color: '#1d4ed8',
    fontSize: 13,
  },
  removeText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 13,
  },
  segmentBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 4,
  },
  saveButton: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});



