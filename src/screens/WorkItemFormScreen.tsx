import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Alert } from '../utils/alert';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import {
  CONFIG,
  CONDITION_OPTIONS,
  PAVEMENT_TYPES,
  CHANNEL_TYPES,
  DRAINAGE_MATERIALS,
  SEDIMENT_CONDITIONS,
  RETAINING_WALL_TYPES,
  TILT_CONDITIONS,
  CULVERT_TYPES,
  BRIDGE_CONSTRUCTION_TYPES,
  NUMERIC_MODE_DATA_KEYS,
} from '../config';
import { getCurrentLocation, CurrentLocation } from '../services/locationService';
import { takePhoto, pickPhotoFromGallery } from '../services/photoService';
import { addToQueue, processQueue } from '../services/queueService';
import { getPackageById, incrementPackageItemCount, updatePackageCenterLocation } from '../services/packageService';
import { getCurrentUser } from '../services/authService';
import { listUsers } from '../services/apiService';
import { getWilayahList, getKecamatanNames, getDesaByKecamatan, findKodeDesa } from '../services/wilayahService';
import { isValidSta, sortSegmentsBySta, validateStaRanges, parseStaToMeters, addStaDistance } from '../utils/sta';
import { computeRoadSegmentPlanned, computeRetainingWallSegmentPlanned, computeDrainageSegmentPlanned } from '../utils/plannedDimensions';
import { validateRepairDamageDimensions } from '../utils/repairValidation';
import { deriveOverallCondition, classifyRoadSegmentCondition, classifyDrainageCondition } from '../utils/conditionRating';

import SketchPad from '../components/SketchPad';
import SchemaPreviewModal from '../components/SchemaPreviewModal';
import LongitudinalProfileModal, { LongitudinalProfilePreview } from '../components/LongitudinalProfileModal';
import SearchableSelectModal from '../components/SearchableSelectModal';
import CoordinatePickerModal from '../components/CoordinatePickerModal';
import SlopeHeightHelper from '../components/SlopeHeightHelper';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';


import {
  SurveyPhoto,
  RoadSegment,
  DrainageSegment,
  RetainingWallSegment,
  CulvertDetail,
  BridgeDetail,
  DynamicDetail,
  SurveyMode,
  SurveyModeData,
  WilayahItem,
} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkItemForm'>;
const SURVEY_MODES: SurveyMode[] = ['Pembangunan Baru', 'Perbaikan', 'Pengembangan'];

function makeId() {
  const globalCrypto = globalThis as any;
  if (globalCrypto?.crypto && typeof globalCrypto.crypto.randomUUID === 'function') {
    return globalCrypto.crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyRoadSegment(): RoadSegment {
  return {
    id: makeId(),
    staStart: '',
    staEnd: '',
    length: '',
    roadElevationStart: '',
    roadElevationEnd: '',
    widthStart: '',
    widthEnd: '',
    pavementType: PAVEMENT_TYPES[0],
    condition: CONDITION_OPTIONS[0],
    damageLength: '',
    damageWidth: '',
    damageDepth: '',
    notes: '',
  };
}

function emptyDrainageSegment(): DrainageSegment {
  return {
    id: makeId(),
    staStart: '',
    staEnd: '',
    length: '',
    invertElevationStart: '',
    invertElevationEnd: '',
    channelType: CHANNEL_TYPES[0],
    width: '',
    depth: '',
    material: DRAINAGE_MATERIALS[0],
    sedimentCondition: SEDIMENT_CONDITIONS[0],
    condition: CONDITION_OPTIONS[0],
    notes: '',
  };
}

function emptyRetainingWallSegment(): RetainingWallSegment {
  return {
    id: makeId(),
    staStart: '',
    staEnd: '',
    length: '',
    baseElevationStart: '',
    baseElevationEnd: '',
    heightStart: '',
    heightEnd: '',
    topWidth: '',
    bottomWidth: '',
    constructionType: RETAINING_WALL_TYPES[0],
    tiltCondition: TILT_CONDITIONS[0],
    condition: CONDITION_OPTIONS[0],
    notes: '',
  };
}

function emptyCulvert(): CulvertDetail {
  return {
    culvertType: CULVERT_TYPES[0],
    dimension: '',
    length: '',
    inletCondition: CONDITION_OPTIONS[0],
    outletCondition: CONDITION_OPTIONS[0],
    condition: CONDITION_OPTIONS[0],
    notes: '',
  };
}

function emptyBridge(): BridgeDetail {
  return {
    spanLength: '',
    width: '',
    constructionType: BRIDGE_CONSTRUCTION_TYPES[0],
    upperStructureCondition: CONDITION_OPTIONS[0],
    lowerStructureCondition: CONDITION_OPTIONS[0],
    condition: CONDITION_OPTIONS[0],
    notes: '',
  };
}

function computeSegmentLength(staStart: string, staEnd: string): string {
  const staDiff = parseStaToMeters(staEnd) - parseStaToMeters(staStart);
  return !isNaN(staDiff) && staDiff >= 0 ? staDiff.toFixed(2) : '';
}

// computeRoadSegmentPlanned/computeRetainingWallSegmentPlanned dipindah ke
// utils/plannedDimensions.ts (dipakai bersama dengan EditItemScreen.tsx agar
// logikanya satu sumber, tidak lagi terduplikasi/bisa saling berbeda).

function computeStaEnd(staStart: string, length: string): string {
  return addStaDistance(staStart, length);
}

function computeTopElevation(base: string, height: string): string {
  const baseValue = parseFloat((base || '').replace(',', '.'));
  const heightValue = parseFloat((height || '').replace(',', '.'));
  if (isNaN(baseValue) || isNaN(heightValue)) return '';
  return (baseValue + heightValue).toFixed(2);
}

function normalizeRoadSegment(segment: Omit<RoadSegment, 'id'>, mode: SurveyMode): Omit<RoadSegment, 'id'> {
  const length = segment.length || computeSegmentLength(segment.staStart, segment.staEnd);
  if (mode === 'Pembangunan Baru') {
    return { ...segment, length, condition: '', damageLength: '', damageWidth: '', damageDepth: '' };
  }
  if (mode === 'Pengembangan') {
    return { ...segment, length, damageLength: '', damageWidth: '', damageDepth: '' };
  }
  return { ...segment, length };
}

function normalizeDrainageSegment(segment: Omit<DrainageSegment, 'id'>, mode: SurveyMode): Omit<DrainageSegment, 'id'> {
  const length = segment.length || computeSegmentLength(segment.staStart, segment.staEnd);
  if (mode === 'Pembangunan Baru') return { ...segment, length, condition: '', sedimentCondition: '' };
  if (mode === 'Pengembangan') return { ...segment, length, sedimentCondition: '' };
  return { ...segment, length };
}

function normalizeRetainingWallSegment(segment: Omit<RetainingWallSegment, 'id'>, mode: SurveyMode): Omit<RetainingWallSegment, 'id'> {
  const normalized = { ...segment, length: segment.length || computeSegmentLength(segment.staStart, segment.staEnd) };
  return mode === 'Pembangunan Baru'
    ? { ...normalized, condition: '', tiltCondition: '', topWidth: '', bottomWidth: '' }
    : normalized;
}

function normalizeCulvert(detail: CulvertDetail, mode: SurveyMode): CulvertDetail {
  return mode === 'Pembangunan Baru'
    ? { ...detail, inletCondition: '', outletCondition: '', condition: '' }
    : detail;
}

function normalizeBridge(detail: BridgeDetail, mode: SurveyMode): BridgeDetail {
  return mode === 'Pembangunan Baru'
    ? { ...detail, upperStructureCondition: '', lowerStructureCondition: '', condition: '' }
    : detail;
}

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt}
          style={[styles.chip, value === opt && styles.chipActive]}
          onPress={() => onChange(opt)}
        >
          <Text style={[styles.chipText, value === opt && styles.chipTextActive]}>{opt}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ModeSummaryFields({
  mode,
  value,
  onChange,
  readOnlyKeys,
}: {
  mode: SurveyMode;
  value: SurveyModeData;
  onChange: (patch: Partial<SurveyModeData>) => void;
  readOnlyKeys?: Partial<Record<keyof SurveyModeData, string>>;
}) {
  const field = (key: keyof SurveyModeData, label: string, placeholder: string, multiline = false) => {
    const readOnlyHint = readOnlyKeys?.[key];
    if (readOnlyHint !== undefined) {
      return (
        <View key={key}>
          <Text style={styles.subLabel}>{label} (otomatis)</Text>
          <Text style={styles.computedValue}>{readOnlyHint || 'Isi data segmen dahulu'}</Text>
        </View>
      );
    }
    return (
      <View key={key}>
        <Text style={styles.subLabel}>{label}</Text>
        <TextInput
          style={[styles.input, multiline && styles.textArea]}
          placeholder={placeholder}
          value={value[key]}
          onChangeText={(text) => onChange({ [key]: text })}
          multiline={multiline}
          keyboardType={NUMERIC_MODE_DATA_KEYS.includes(key) ? 'numeric' : 'default'}
        />
      </View>
    );
  };

  if (mode === 'Pembangunan Baru') {
    return (
      <View style={styles.segmentBox}>
        <Text style={styles.label}>Data Rencana Pembangunan</Text>
        {field('plannedLength', 'Panjang Rencana (m)', 'Contoh: 100 m')}
        {field('plannedWidth', 'Lebar Rencana (m)', 'Contoh: 4 m')}
        {field('plannedHeight', 'Tinggi/Kedalaman Rencana (m)', 'Opsional')}
        {field('proposedAction', 'Rencana Tindakan', 'Contoh: pembangunan baru', true)}
      </View>
    );
  }

  if (mode === 'Perbaikan') {
    return (
      <View style={styles.segmentBox}>
        <Text style={styles.label}>Data Kondisi dan Perbaikan</Text>
        {readOnlyKeys?.existingCondition !== undefined ? (
          <View>
            <Text style={styles.subLabel}>Kondisi Eksisting (otomatis dari kondisi segmen)</Text>
            <Text style={styles.computedValue}>{readOnlyKeys.existingCondition || 'Isi kondisi tiap segmen dahulu'}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.subLabel}>Kondisi Eksisting</Text>
            <ChipGroup options={CONDITION_OPTIONS} value={value.existingCondition} onChange={(text) => onChange({ existingCondition: text })} />
          </>
        )}
        {field('problem', 'Permasalahan/Kerusakan', 'Jelaskan kerusakan atau masalah', true)}
        {field('proposedAction', 'Tindakan Perbaikan', 'Contoh: rehabilitasi lapis permukaan', true)}
        {field('treatmentVolume', 'Volume Penanganan', 'Contoh: 250')}
        {field('treatmentUnit', 'Satuan', 'm, m2, m3, unit')}
        <Text style={styles.subLabel}>Prioritas</Text>
        <ChipGroup options={['Rendah', 'Sedang', 'Tinggi']} value={value.priority} onChange={(text) => onChange({ priority: text })} />
      </View>
    );
  }

  return (
    <View style={styles.segmentBox}>
      <Text style={styles.label}>Data Pengembangan</Text>
      {readOnlyKeys?.existingCondition !== undefined ? (
        <View>
          <Text style={styles.subLabel}>Kondisi Eksisting (otomatis dari kondisi segmen)</Text>
          <Text style={styles.computedValue}>{readOnlyKeys.existingCondition || 'Isi kondisi tiap segmen dahulu'}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.subLabel}>Kondisi Eksisting</Text>
          <ChipGroup options={CONDITION_OPTIONS} value={value.existingCondition} onChange={(text) => onChange({ existingCondition: text })} />
        </>
      )}
      {field('currentCapacity', 'Kapasitas Eksisting', 'Contoh: 100 unit/hari')}

      {field('targetCapacity', 'Target Kapasitas', 'Contoh: 200 unit/hari')}
      {field('additionalLength', 'Panjang Tambahan', 'Opsional')}
      {field('additionalWidth', 'Lebar Tambahan', 'Opsional')}
      {field('proposedAction', 'Tindakan Pengembangan', 'Jelaskan peningkatan yang direncanakan', true)}
      <Text style={styles.subLabel}>Prioritas</Text>
      <ChipGroup options={['Rendah', 'Sedang', 'Tinggi']} value={value.priority} onChange={(text) => onChange({ priority: text })} />
    </View>
  );
}

export default function WorkItemFormScreen({ route, navigation }: Props) {
  const { packageId, packageName, surveyorName, infrastructureType } = route.params;
  const [surveyorNameValue, setSurveyorNameValue] = useState(surveyorName);
  const surveyorNameValueRef = useRef(surveyorNameValue);
  surveyorNameValueRef.current = surveyorNameValue;
  const [surveyorOptions, setSurveyorOptions] = useState<string[]>([]);
  const [surveyorModalVisible, setSurveyorModalVisible] = useState(false);
  // Nama Surveyor dikunci ke nama akun yang sedang login (bukan bebas
  // diketik) supaya setiap item pekerjaan punya jejak akuntabilitas yang
  // jelas: siapa pun yang login dan membuat data, namanya otomatis tercatat.
  // Admin tetap boleh mengubahnya secara manual (mis. menginput atas nama
  // surveyor lapangan yang belum punya akun sendiri).
  const [isAdminUser, setIsAdminUser] = useState(false);

  const isRoad = infrastructureType === 'Jalan';
  const isDrainage = infrastructureType === 'Drainase/Saluran Air';
  const isRetainingWall = infrastructureType === 'Dinding Penahan Tanah (DPT)';
  const isCulvert = infrastructureType === 'Gorong-gorong';
  const isBridge = infrastructureType === 'Jembatan';

  const [locationNote, setLocationNote] = useState('');
  const [wilayahList, setWilayahList] = useState<WilayahItem[]>([]);
  const [kecamatan, setKecamatan] = useState('');
  const [desaKelurahan, setDesaKelurahan] = useState('');
  const [kecamatanModalVisible, setKecamatanModalVisible] = useState(false);
  const [desaModalVisible, setDesaModalVisible] = useState(false);
  const [photos, setPhotos] = useState<SurveyPhoto[]>([]);
  const [sketchVisible, setSketchVisible] = useState(false);
  const [schemaModal, setSchemaModal] = useState<{ kind: 'road' | 'drainage' | 'retainingWall'; data: Record<string, string | undefined> } | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profilePreviewVisible, setProfilePreviewVisible] = useState(false);
  const [location, setLocation] = useState<CurrentLocation | null>(null);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);


  const [gettingLocation, setGettingLocation] = useState(false);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [pickingFromGallery, setPickingFromGallery] = useState(false);
  const [submitting, setSubmitting] = useState(false);


  const [roadSegments, setRoadSegments] = useState<RoadSegment[]>([emptyRoadSegment()]);
  const [drainageSegments, setDrainageSegments] = useState<DrainageSegment[]>([emptyDrainageSegment()]);
  const [retainingWallSegments, setRetainingWallSegments] = useState<RetainingWallSegment[]>([emptyRetainingWallSegment()]);
  const [culvert, setCulvert] = useState<CulvertDetail>(emptyCulvert());
  const [bridge, setBridge] = useState<BridgeDetail>(emptyBridge());
  const [surveyMode, setSurveyMode] = useState<SurveyMode>('Perbaikan');
  const [dynamicDetail, setDynamicDetail] = useState<DynamicDetail>({
    dimension: '',
    material: '',
    technicalNotes: '',
    condition: CONDITION_OPTIONS[0],
  });
  const [modeData, setModeData] = useState<SurveyModeData>({
    existingCondition: '',
    problem: '',
    proposedAction: '',
    treatmentVolume: '',
    treatmentUnit: '',
    priority: '',
    plannedLength: '',
    plannedWidth: '',
    plannedHeight: '',
    currentCapacity: '',
    targetCapacity: '',
    additionalLength: '',
    additionalWidth: '',
  });

  useEffect(() => {
    let active = true;

    const loadSurveyorOptions = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (!currentUser) return;

        if (active) {
          setIsAdminUser(currentUser.role === 'admin');
          // Auto-isi & kunci Nama Surveyor ke nama akun yang login, supaya
          // tidak bisa diketik bebas (mencegah "menyamar" jadi surveyor
          // lain). Hanya isi otomatis jika field masih kosong, supaya tidak
          // menimpa nilai yang mungkin sudah diisi dari parameter navigasi.
          if (!surveyorNameValueRef.current && currentUser.name) {
            setSurveyorNameValue(currentUser.name);
          }
        }

        const options = new Set<string>([currentUser.name, currentUser.username].filter(Boolean));
        try {
          const users = await listUsers(currentUser.username);
          users.forEach((user) => {
            if (user.name) options.add(user.name);
            if (user.username) options.add(user.username);
          });
        } catch {
          // Untuk user biasa, daftar semua akun mungkin tidak tersedia. Tetap
          // gunakan nama akun saat ini sebagai opsi utama agar pencarian tetap
          // bisa dipakai secara manual tanpa mengganggu alur input.
        }

        if (active) {
          setSurveyorOptions([...options].filter(Boolean).sort((a, b) => a.localeCompare(b)));
        }
      } catch {
        // abaikan error, karena input manual masih tetap berfungsi
      }
    };

    loadSurveyorOptions();

    getWilayahList()
      .then(setWilayahList)
      .catch(() => {
        Alert.alert(
          'Gagal Memuat Data Wilayah',
          'Tidak dapat mengambil daftar Kecamatan/Desa dari server. Periksa koneksi internet Anda, lalu coba lagi.'
        );
      });

    getPackageById(packageId)
      .then((pkg) => {
        if (pkg?.kecamatan) setKecamatan(pkg.kecamatan);
        if (pkg?.desaKelurahan) setDesaKelurahan(pkg.desaKelurahan);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [packageId]);

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

  const updateRoadSegment = (id: string, patch: Partial<RoadSegment>) => {
    setRoadSegments((prev) => {
      const index = prev.findIndex((s) => s.id === id);
      if (index < 0) return prev;
      const next = prev.map((s) => ({ ...s }));
      const current = { ...next[index], ...patch };
      if (patch.length !== undefined) current.staEnd = computeStaEnd(current.staStart, current.length);
      if (patch.staStart !== undefined && patch.length === undefined) {
        if (current.length) current.staEnd = computeStaEnd(current.staStart, current.length);
        else current.length = computeSegmentLength(current.staStart, current.staEnd);
      }
      next[index] = { id: current.id, ...normalizeRoadSegment(current, surveyMode) };
      for (let i = index + 1; i < next.length; i++) {
        next[i].staStart = next[i - 1].staEnd;
        next[i].staEnd = computeStaEnd(next[i].staStart, next[i].length);
      }
      return next;
    });
  };
  const updateDrainageSegment = (id: string, patch: Partial<DrainageSegment>) => {
    setDrainageSegments((prev) => {
      const index = prev.findIndex((s) => s.id === id);
      if (index < 0) return prev;
      const next = prev.map((s) => ({ ...s }));
      const current = { ...next[index], ...patch };
      if (patch.length !== undefined) current.staEnd = computeStaEnd(current.staStart, current.length);
      if (patch.staStart !== undefined && patch.length === undefined) {
        if (current.length) current.staEnd = computeStaEnd(current.staStart, current.length);
        else current.length = computeSegmentLength(current.staStart, current.staEnd);
      }
      next[index] = { id: current.id, ...normalizeDrainageSegment(current, surveyMode) };
      for (let i = index + 1; i < next.length; i++) {
        next[i].staStart = next[i - 1].staEnd;
        next[i].staEnd = computeStaEnd(next[i].staStart, next[i].length);
      }
      return next;
    });
  };
  const updateRetainingWallSegment = (id: string, patch: Partial<RetainingWallSegment>) => {
    setRetainingWallSegments((prev) => {
      const index = prev.findIndex((s) => s.id === id);
      if (index < 0) return prev;
      const next = prev.map((s) => ({ ...s }));
      const current = { ...next[index], ...patch };
      if (patch.length !== undefined) current.staEnd = computeStaEnd(current.staStart, current.length);
      if (patch.staStart !== undefined && patch.length === undefined) {
        if (current.length) current.staEnd = computeStaEnd(current.staStart, current.length);
        else current.length = computeSegmentLength(current.staStart, current.staEnd);
      }
      next[index] = { id: current.id, ...normalizeRetainingWallSegment(current, surveyMode) };
      for (let i = index + 1; i < next.length; i++) {
        next[i].staStart = next[i - 1].staEnd;
        next[i].staEnd = computeStaEnd(next[i].staStart, next[i].length);
      }
      return next;
    });
  };

  // Untuk mode "Pembangunan Baru", Panjang Rencana & Lebar/Tinggi Rencana
  // Untuk mode "Pembangunan Baru", Panjang/Lebar/Tinggi Rencana TIDAK diinput
  // manual lagi: dihitung otomatis PER SEGMEN saat data dikirim (lihat
  // computeRoadSegmentPlanned/computeRetainingWallSegmentPlanned di atas),
  // menggunakan STA & lebar/tinggi milik segmen itu sendiri — sehingga tiap
  // baris/segmen di laporan bisa punya nilai Panjang/Lebar/Tinggi Rencana
  // yang berbeda sesuai data STA masing-masing (bukan disamakan untuk
  // seluruh item). Nilai di bawah ini HANYA ringkasan pratinjau di layar
  // input (Panjang Rencana = total seluruh segmen, Lebar/Tinggi Rencana =
  // rata-rata dibobot panjang segmen), bukan nilai yang tersimpan per baris.
  // "Kondisi Eksisting" (mode Perbaikan/Pengembangan) dihitung OTOMATIS dari
  // kondisi tiap segmen/komponen yang sudah diisi surveyor, memakai
  // pendekatan worst-case (lihat deriveOverallCondition): jika salah satu
  // segmen "Rusak Berat", keseluruhan item dianggap "Rusak Berat" agar
  // prioritas penanganan tidak terlewat. Surveyor tidak perlu mengisi
  // ulang kondisi keseluruhan secara manual/terpisah.
  const derivedExistingCondition = useMemo(() => {
    if (surveyMode === 'Pembangunan Baru') return '';
    if (isRoad) return deriveOverallCondition(roadSegments.map((s) => s.condition));
    if (isDrainage) return deriveOverallCondition(drainageSegments.map((s) => s.condition));
    if (isRetainingWall) return deriveOverallCondition(retainingWallSegments.map((s) => s.condition));
    if (isCulvert) return deriveOverallCondition([culvert.inletCondition, culvert.outletCondition, culvert.condition]);
    if (isBridge) return deriveOverallCondition([bridge.upperStructureCondition, bridge.lowerStructureCondition, bridge.condition]);
    return deriveOverallCondition([dynamicDetail.condition]);
  }, [surveyMode, isRoad, isDrainage, isRetainingWall, isCulvert, isBridge, roadSegments, drainageSegments, retainingWallSegments, culvert, bridge, dynamicDetail]);

  useEffect(() => {
    if (surveyMode === 'Pembangunan Baru') return;
    setModeData((previous) =>
      previous.existingCondition === derivedExistingCondition ? previous : { ...previous, existingCondition: derivedExistingCondition }
    );
  }, [derivedExistingCondition, surveyMode]);

  const plannedReadOnlyKeys = useMemo(() => {
    if (surveyMode !== 'Pembangunan Baru') {
      return { existingCondition: derivedExistingCondition };
    }

    if (isRoad) {
      // Ringkasan pratinjau: Σ panjang segmen (Total Panjang Rencana) dan
      // rata-rata dibobot panjang segmen untuk Lebar Rencana. Nilai
      // sebenarnya yang tersimpan tetap dihitung per segmen (lihat
      // computeRoadSegmentPlanned), bisa berbeda antar baris.
      let totalLength = 0;
      let hasLength = false;
      const widthPairs = roadSegments
        .map((s) => {
          const segStart = parseStaToMeters(s.staStart);
          const segEnd = parseStaToMeters(s.staEnd);
          const segLength = !isNaN(segStart) && !isNaN(segEnd) ? Math.abs(segEnd - segStart) : parseFloat((s.length || '').replace(',', '.'));
          const validSegLength = !isNaN(segLength) && segLength > 0 ? segLength : 0;
          if (validSegLength > 0) { totalLength += validSegLength; hasLength = true; }

          const wStart = parseFloat((s.widthStart || '').replace(',', '.'));
          const wEnd = parseFloat((s.widthEnd || '').replace(',', '.'));
          const validWidths = [wStart, wEnd].filter((v) => !isNaN(v) && v > 0);
          if (validWidths.length === 0) return null;
          const segWidth = validWidths.reduce((a, b) => a + b, 0) / validWidths.length;
          return { length: validSegLength, value: segWidth };
        })
        .filter((p): p is { length: number; value: number } => p !== null);
      const totalWidthLength = widthPairs.reduce((sum, p) => sum + p.length, 0);
      const avgWidth = totalWidthLength > 0
        ? widthPairs.reduce((sum, p) => sum + p.length * p.value, 0) / totalWidthLength
        : (widthPairs.length > 0 ? widthPairs.reduce((sum, p) => sum + p.value, 0) / widthPairs.length : NaN);
      return {
        plannedLength: hasLength ? `${totalLength.toFixed(2)} (total semua segmen)` : '',
        plannedWidth: !isNaN(avgWidth) ? `${avgWidth.toFixed(2)} (rata-rata semua segmen)` : '',
      };
    }

    if (isRetainingWall) {
      // Sama seperti Jalan di atas: ringkasan pratinjau total panjang &
      // rata-rata dibobot; nilai per-baris tetap dihitung per segmen.
      let totalLength = 0;
      let hasLength = false;
      const heightPairs = retainingWallSegments
        .map((s) => {
          const segStart = parseStaToMeters(s.staStart);
          const segEnd = parseStaToMeters(s.staEnd);
          const segLength = !isNaN(segStart) && !isNaN(segEnd) ? Math.abs(segEnd - segStart) : parseFloat((s.length || '').replace(',', '.'));
          const validSegLength = !isNaN(segLength) && segLength > 0 ? segLength : 0;
          if (validSegLength > 0) { totalLength += validSegLength; hasLength = true; }

          const hStart = parseFloat((s.heightStart || '').replace(',', '.'));
          const hEnd = parseFloat((s.heightEnd || '').replace(',', '.'));
          const validHeights = [hStart, hEnd].filter((v) => !isNaN(v) && v > 0);
          if (validHeights.length === 0) return null;
          const segHeight = validHeights.reduce((a, b) => a + b, 0) / validHeights.length;
          return { length: validSegLength, value: segHeight };
        })
        .filter((p): p is { length: number; value: number } => p !== null);
      const totalHeightLength = heightPairs.reduce((sum, p) => sum + p.length, 0);
      const avgHeight = totalHeightLength > 0
        ? heightPairs.reduce((sum, p) => sum + p.length * p.value, 0) / totalHeightLength
        : (heightPairs.length > 0 ? heightPairs.reduce((sum, p) => sum + p.value, 0) / heightPairs.length : NaN);
      return {
        plannedLength: hasLength ? `${totalLength.toFixed(2)} (total semua segmen)` : '',
        plannedHeight: !isNaN(avgHeight) ? `${avgHeight.toFixed(2)} (rata-rata semua segmen)` : '',
      };
    }

    if (isDrainage) {
      // Ringkasan pratinjau: Σ panjang segmen (Total Panjang Rencana) dan
      // rata-rata dibobot lebar/kedalaman segmen. Nilai sebenarnya yang
      // tersimpan tetap dihitung per segmen (lihat computeDrainageSegmentPlanned),
      // memakai width/depth milik segmen itu sendiri (bukan pasangan start/end).
      let totalLength = 0;
      let hasLength = false;
      const widthPairs: { length: number; value: number }[] = [];
      const depthPairs: { length: number; value: number }[] = [];
      drainageSegments.forEach((s) => {
        const segStart = parseStaToMeters(s.staStart);
        const segEnd = parseStaToMeters(s.staEnd);
        const segLength = !isNaN(segStart) && !isNaN(segEnd) ? Math.abs(segEnd - segStart) : parseFloat((s.length || '').replace(',', '.'));
        const validSegLength = !isNaN(segLength) && segLength > 0 ? segLength : 0;
        if (validSegLength > 0) { totalLength += validSegLength; hasLength = true; }

        const width = parseFloat((s.width || '').replace(',', '.'));
        if (!isNaN(width) && width > 0) widthPairs.push({ length: validSegLength, value: width });

        const depth = parseFloat((s.depth || '').replace(',', '.'));
        if (!isNaN(depth) && depth > 0) depthPairs.push({ length: validSegLength, value: depth });
      });
      const totalWidthLength = widthPairs.reduce((sum, p) => sum + p.length, 0);
      const avgWidth = totalWidthLength > 0
        ? widthPairs.reduce((sum, p) => sum + p.length * p.value, 0) / totalWidthLength
        : (widthPairs.length > 0 ? widthPairs.reduce((sum, p) => sum + p.value, 0) / widthPairs.length : NaN);
      const totalDepthLength = depthPairs.reduce((sum, p) => sum + p.length, 0);
      const avgDepth = totalDepthLength > 0
        ? depthPairs.reduce((sum, p) => sum + p.length * p.value, 0) / totalDepthLength
        : (depthPairs.length > 0 ? depthPairs.reduce((sum, p) => sum + p.value, 0) / depthPairs.length : NaN);
      return {
        plannedLength: hasLength ? `${totalLength.toFixed(2)} (total semua segmen)` : '',
        plannedWidth: !isNaN(avgWidth) ? `${avgWidth.toFixed(2)} (rata-rata semua segmen)` : '',
        plannedHeight: !isNaN(avgDepth) ? `${avgDepth.toFixed(2)} (rata-rata semua segmen)` : '',
      };
    }

    return undefined;
  }, [surveyMode, isRoad, isDrainage, isRetainingWall, roadSegments, drainageSegments, retainingWallSegments, derivedExistingCondition]);



  const handleGetLocation = async () => {
    setGettingLocation(true);
    try {
      const loc = await getCurrentLocation();
      setLocation(loc);
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
    if (photos.length >= CONFIG.MAX_PHOTOS) {
      Alert.alert('Batas Foto', `Maksimal ${CONFIG.MAX_PHOTOS} foto per item.`);
      return;
    }
    setTakingPhoto(true);
    try {
      const photo = await takePhoto();
      if (photo) {
        setPhotos((prev) => [...prev, photo]);
      }
    } catch (err: any) {
      Alert.alert('Gagal Ambil Foto', err?.message || 'Terjadi kesalahan.');
    } finally {
      setTakingPhoto(false);
    }
  };

  const handleRemovePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePickFromGallery = async () => {
    if (photos.length >= CONFIG.MAX_PHOTOS) {
      Alert.alert('Batas Foto', `Maksimal ${CONFIG.MAX_PHOTOS} foto per item.`);
      return;
    }
    setPickingFromGallery(true);
    try {
      const photo = await pickPhotoFromGallery();
      if (photo) {
        setPhotos((prev) => [...prev, photo]);
      }
    } catch (err: any) {
      Alert.alert('Gagal Memilih Foto', err?.message || 'Terjadi kesalahan.');
    } finally {
      setPickingFromGallery(false);
    }
  };

  const handleOpenSketch = () => {
    if (photos.length >= CONFIG.MAX_PHOTOS) {
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
    setPhotos((prev) => [...prev, photo]);
  };

  const handleSaveSchemaPhoto = (photo: SurveyPhoto) => {
    if (photos.length >= CONFIG.MAX_PHOTOS) {
      Alert.alert('Batas Foto', `Maksimal ${CONFIG.MAX_PHOTOS} foto per item.`);
      return;
    }
    setPhotos((prev) => [...prev, photo]);
  };


  const handleSubmit = async () => {
    const currentUser = await getCurrentUser();
    if (currentUser && currentUser.role !== 'admin' && currentUser.permissions?.canCreate === false) {
      Alert.alert(
        'Tidak Diizinkan',
        'Akun Anda tidak memiliki izin untuk menambahkan data survei baru. Hubungi admin.'
      );
      return;
    }

    if (!locationNote.trim()) {
      Alert.alert('Alamat/Keterangan Lokasi Wajib Diisi', 'Mohon isi Alamat/Keterangan Lokasi sebelum menyimpan data survei.');
      return;
    }

    if (isRoad && roadSegments.some((s) => !s.staStart.trim() || !s.staEnd.trim())) {
      Alert.alert('STA Belum Lengkap', 'Isi STA awal & akhir untuk setiap segmen jalan.');
      return;
    }
    if (isDrainage && drainageSegments.some((s) => !s.staStart.trim() || !s.staEnd.trim())) {
      Alert.alert('STA Belum Lengkap', 'Isi STA awal & akhir untuk setiap segmen drainase.');
      return;
    }
    if (isRetainingWall && retainingWallSegments.some((s) => !s.staStart.trim() || !s.staEnd.trim())) {
      Alert.alert('STA Belum Lengkap', 'Isi STA awal & akhir untuk setiap segmen TPT.');
      return;
    }
    if (isRoad && roadSegments.some((segment) => {
      const validation = validateRepairDamageDimensions({
        length: segment.length,
        staStart: segment.staStart,
        staEnd: segment.staEnd,
        widthStart: segment.widthStart,
        widthEnd: segment.widthEnd,
        damageLength: segment.damageLength,
        damageWidth: segment.damageWidth,
        damageDepth: segment.damageDepth,
      });
      return !validation.valid;
    })) {
      Alert.alert('Ukuran Kerusakan Tidak Valid', 'Panjang, lebar, dan tinggi/kedalaman kerusakan tidak boleh melebihi panjang, lebar, dan tinggi segmen yang disurvei.');
      return;
    }
    if (isRoad && roadSegments.some((s) => !isValidSta(s.staStart) || !isValidSta(s.staEnd))) {
      Alert.alert(
        'Format STA Tidak Valid',
        'Gunakan format STA seperti "0+000" atau angka meter biasa untuk setiap segmen jalan.'
      );
      return;
    }
    if (isDrainage && drainageSegments.some((s) => !isValidSta(s.staStart) || !isValidSta(s.staEnd))) {
      Alert.alert(
        'Format STA Tidak Valid',
        'Gunakan format STA seperti "0+000" atau angka meter biasa untuk setiap segmen drainase.'
      );
      return;
    }
    if (isRetainingWall && retainingWallSegments.some((s) => !isValidSta(s.staStart) || !isValidSta(s.staEnd))) {
      Alert.alert(
        'Format STA Tidak Valid',
        'Gunakan format STA seperti "0+000" atau angka meter biasa untuk setiap segmen TPT.'
      );
      return;
    }

    // Auto-segmentasi: urutkan segmen berdasarkan STA awal agar nomor segmen
    // konsisten dengan urutan fisik. Rentang yang bertabrakan wajib diperbaiki.
    const sortedRoadSegments = isRoad ? sortSegmentsBySta(roadSegments) : roadSegments;
    const sortedDrainageSegments = isDrainage ? sortSegmentsBySta(drainageSegments) : drainageSegments;
    const sortedRetainingWallSegments = isRetainingWall ? sortSegmentsBySta(retainingWallSegments) : retainingWallSegments;

    if (isRoad || isDrainage || isRetainingWall) {
      const rangeErrors = isRoad
        ? validateStaRanges(sortedRoadSegments)
        : isDrainage
        ? validateStaRanges(sortedDrainageSegments)
        : validateStaRanges(sortedRetainingWallSegments);
      if (rangeErrors.length > 0) {
        Alert.alert('STA Tidak Valid', rangeErrors.join('\n'));
        return;
      }
    }

    setSubmitting(true);
    try {
      const photoPayload = photos.map((p) => ({
        base64: p.base64,
        mimeType: p.mimeType,
        fileName: p.fileName,
      }));

      const itemId = makeId();

      // Untuk mode "Pembangunan Baru", Panjang/Lebar/Tinggi Rencana TIDAK
      // sama untuk semua baris/segmen: dihitung otomatis PER SEGMEN (lihat
      // computeRoadSegmentPlanned/computeRetainingWallSegmentPlanned di atas)
      // menggunakan data STA & lebar/tinggi milik segmen itu sendiri, bukan
      // nilai agregat seluruh item. modeData dasar (tanpa nilai per-segmen)
      // tetap dipakai untuk jenis infrastruktur non-segmen (gorong-gorong,
      // jembatan, dinamis) yang tidak mengalami perubahan.
      const finalModeData = modeData;

      const baseData = {
        packageId,
        packageName,
        itemId,
        surveyorName: surveyorNameValue.trim(),
        username: currentUser?.username,
        infrastructureType,
        surveyMode,
        modeData: finalModeData,
        latitude: location ? location.latitude : null,
        longitude: location ? location.longitude : null,
        accuracy: location ? location.accuracy : null,
        locationNote,
        kecamatan,
        desaKelurahan,
        kodeDesaKelurahan: findKodeDesa(wilayahList, kecamatan, desaKelurahan),
        photos: photoPayload,
      };

      let rowsToQueue = 0;

      if (isRoad) {
        const total = sortedRoadSegments.length;
        for (let i = 0; i < sortedRoadSegments.length; i++) {
          const { id, ...raw } = sortedRoadSegments[i];
          const rest = normalizeRoadSegment(raw, surveyMode);
          const localId = makeId();
          const rowModeData = surveyMode === 'Pembangunan Baru'
            ? { ...finalModeData, ...computeRoadSegmentPlanned(rest) }
            : finalModeData;
          await addToQueue({
            localId,
            createdAt: new Date().toISOString(),
            status: 'pending',
            data: { ...baseData, modeData: rowModeData, localId, segmentIndex: i + 1, segmentTotal: total, roadSegment: rest },
          });
          rowsToQueue += 1;
        }
      } else if (isDrainage) {

        const total = sortedDrainageSegments.length;
        for (let i = 0; i < sortedDrainageSegments.length; i++) {
          const { id, ...raw } = sortedDrainageSegments[i];
          const rest = normalizeDrainageSegment(raw, surveyMode);
          const localId = makeId();
          const rowModeData = surveyMode === 'Pembangunan Baru'
            ? { ...finalModeData, ...computeDrainageSegmentPlanned(rest) }
            : finalModeData;
          await addToQueue({
            localId,
            createdAt: new Date().toISOString(),
            status: 'pending',
            data: { ...baseData, modeData: rowModeData, localId, segmentIndex: i + 1, segmentTotal: total, drainageSegment: rest },
          });
          rowsToQueue += 1;
        }
      } else if (isRetainingWall) {
        const total = sortedRetainingWallSegments.length;
        for (let i = 0; i < sortedRetainingWallSegments.length; i++) {
          const { id, ...raw } = sortedRetainingWallSegments[i];
          const rest = normalizeRetainingWallSegment(raw, surveyMode);
          const localId = makeId();
          const rowModeData = surveyMode === 'Pembangunan Baru'
            ? { ...finalModeData, ...computeRetainingWallSegmentPlanned(rest) }
            : finalModeData;
          await addToQueue({
            localId,
            createdAt: new Date().toISOString(),
            status: 'pending',
            data: { ...baseData, modeData: rowModeData, localId, segmentIndex: i + 1, segmentTotal: total, retainingWall: rest },
          });
          rowsToQueue += 1;
        }
      } else if (isCulvert) {

        const localId = makeId();
        await addToQueue({
          localId,
          createdAt: new Date().toISOString(),
          status: 'pending',
          data: { ...baseData, localId, culvert: normalizeCulvert(culvert, surveyMode) },
        });
        rowsToQueue += 1;
      } else if (isBridge) {
        const localId = makeId();
        await addToQueue({
          localId,
          createdAt: new Date().toISOString(),
          status: 'pending',
          data: { ...baseData, localId, bridge: normalizeBridge(bridge, surveyMode) },
        });
        rowsToQueue += 1;
      } else {
        const localId = makeId();
        const detail = surveyMode === 'Pembangunan Baru'
          ? { ...dynamicDetail, condition: '' }
          : dynamicDetail;
        await addToQueue({
          localId,
          createdAt: new Date().toISOString(),
          status: 'pending',
          data: { ...baseData, localId, dynamicDetail: detail },
        });
        rowsToQueue += 1;
      }

      // Proses lokal ditutup segera agar pengguna tidak menunggu sinkronisasi
      // jaringan yang bisa memakan waktu lama. Data sudah masuk ke queue dan
      // siap dikirim di background saat koneksi kembali tersedia.
      void Promise.allSettled([
        incrementPackageItemCount(packageId),
        location && Number.isFinite(location.latitude) && Number.isFinite(location.longitude)
          ? updatePackageCenterLocation(packageId, location.latitude, location.longitude)
          : Promise.resolve(),
      ]).catch(() => undefined);

      void processQueue().catch(() => undefined);

      Alert.alert(
        'Tersimpan Secara Lokal',
        'Data item pekerjaan berhasil disimpan di perangkat. Proses pengiriman ke server akan dilanjutkan di background saat koneksi internet tersedia.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert('Gagal Menyimpan', err?.message || 'Terjadi kesalahan.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      {(isRoad || isDrainage || isRetainingWall) && profilePreviewVisible && (
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
            segments={
              isRoad
                ? roadSegments.map((s) => ({ staStart: s.staStart, staEnd: s.staEnd, values: s as any }))
                : isDrainage
                ? drainageSegments.map((s) => ({ staStart: s.staStart, staEnd: s.staEnd, values: s as any }))
                : retainingWallSegments.map((s) => ({ staStart: s.staStart, staEnd: s.staEnd, values: s as any }))
            }
          />
        </View>
      )}
      <KeyboardAwareScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={24}
        extraHeight={120}
      >
        <Text style={styles.title}>{infrastructureType}</Text>
        <Text style={styles.subtitle}>Paket: {packageName}</Text>
        <Text style={styles.surveyorLabel}>Surveyor: {surveyorNameValue || surveyorName}</Text>

        <Text style={styles.label}>Nama Surveyor</Text>
        <View style={styles.inlineSearchRow}>
          <TextInput
            style={[styles.input, styles.flexInput, !isAdminUser && styles.inputDisabled]}
            value={surveyorNameValue}
            onChangeText={setSurveyorNameValue}
            placeholder="Ketik / cari nama surveyor"
            autoCapitalize="words"
            editable={isAdminUser}
          />
          {isAdminUser && (
            <TouchableOpacity style={styles.searchButton} onPress={() => setSurveyorModalVisible(true)}>
              <Text style={styles.searchButtonText}>Cari</Text>
            </TouchableOpacity>
          )}
        </View>
        {!isAdminUser && (
          <Text style={styles.surveyorLockedHint}>
            Nama Surveyor otomatis mengikuti akun yang sedang login untuk menjaga akuntabilitas data.
          </Text>
        )}

        <Text style={styles.label}>Mode Survei</Text>
        <ChipGroup options={SURVEY_MODES} value={surveyMode} onChange={(value) => setSurveyMode(value as SurveyMode)} />

        <ModeSummaryFields
          mode={surveyMode}
          value={modeData}
          onChange={(patch) => setModeData((previous) => ({ ...previous, ...patch }))}
          readOnlyKeys={plannedReadOnlyKeys}
        />

        {!isRoad && !isDrainage && !isRetainingWall && !isCulvert && !isBridge && (
          <View style={styles.segmentBox}>
            <Text style={styles.label}>Detail {infrastructureType}</Text>
            <Text style={styles.subLabel}>Dimensi</Text>
            <TextInput
              style={styles.input}
              placeholder="Contoh: 10 x 20 m"
              value={dynamicDetail.dimension}
              onChangeText={(value) => setDynamicDetail((prev) => ({ ...prev, dimension: value }))}
            />
            <Text style={styles.subLabel}>Material</Text>
            <TextInput
              style={styles.input}
              placeholder="Material/konstruksi"
              value={dynamicDetail.material}
              onChangeText={(value) => setDynamicDetail((prev) => ({ ...prev, material: value }))}
            />
            {surveyMode !== 'Pembangunan Baru' && (
              <>
                <Text style={styles.subLabel}>Kondisi</Text>
                <ChipGroup
                  options={CONDITION_OPTIONS}
                  value={dynamicDetail.condition}
                  onChange={(value) => setDynamicDetail((prev) => ({ ...prev, condition: value }))}
                />
              </>
            )}
            <Text style={styles.subLabel}>Catatan Teknis</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Catatan teknis"
              value={dynamicDetail.technicalNotes}
              onChangeText={(value) => setDynamicDetail((prev) => ({ ...prev, technicalNotes: value }))}
              multiline
            />
          </View>
        )}

        {isRoad && (
          <>
            <Text style={styles.label}>Segmen STA Jalan</Text>
            {roadSegments.length > 1 && (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setProfilePreviewVisible((value) => !value)}>
                <Text style={styles.secondaryButtonText}>{profilePreviewVisible ? 'Sembunyikan' : '📈 Tampilkan'} Preview Profil Memanjang</Text>
              </TouchableOpacity>
            )}
            {roadSegments.map((seg, index) => (
              <View key={seg.id} style={styles.segmentBox}>
                <View style={styles.segmentHeader}>
                  <Text style={styles.segmentTitle}>
                    Segmen {index + 1} dari {roadSegments.length}
                  </Text>
                  {roadSegments.length > 1 && (
                    <TouchableOpacity
                      onPress={() => setRoadSegments((prev) => prev.filter((s) => s.id !== seg.id))}
                    >
                      <Text style={styles.removeText}>Hapus</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.staRow}>
                  <TextInput
                    style={[styles.input, styles.staInput]}
                    placeholder="STA Awal (0+000)"
                    value={seg.staStart}
                    onChangeText={(v) => updateRoadSegment(seg.id, { staStart: v })}
                  />
                  <Text style={styles.staSeparator}>s/d</Text>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>STA Akhir (otomatis)</Text>
                    <Text style={styles.computedValue}>{seg.staEnd || 'Isi STA Awal & Panjang'}</Text>
                  </View>
                </View>
                <Text style={styles.subLabel}>Panjang Segmen (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Contoh: 25"
                  keyboardType="numbers-and-punctuation"
                  value={seg.length}
                  onChangeText={(v) => updateRoadSegment(seg.id, { length: v })}
                />
                <View style={styles.staRow}>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Elevasi Jalan di STA Awal (m)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Contoh: 101.20"
                      keyboardType="numbers-and-punctuation"
                      value={seg.roadElevationStart}
                      onChangeText={(v) => updateRoadSegment(seg.id, { roadElevationStart: v })}
                    />
                  </View>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Elevasi Jalan di STA Akhir (m)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Contoh: 101.35"
                      keyboardType="numbers-and-punctuation"
                      value={seg.roadElevationEnd}
                      onChangeText={(v) => updateRoadSegment(seg.id, { roadElevationEnd: v })}
                    />
                  </View>
                </View>
                <Text style={styles.subLabel}>Lebar di STA Awal (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Lebar di STA Awal (m)"
                  keyboardType="numeric"
                  value={seg.widthStart}
                  onChangeText={(v) => updateRoadSegment(seg.id, { widthStart: v })}
                />
                <Text style={styles.subLabel}>Lebar di STA Akhir (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Lebar di STA Akhir (m)"
                  keyboardType="numeric"
                  value={seg.widthEnd}
                  onChangeText={(v) => updateRoadSegment(seg.id, { widthEnd: v })}
                />
                <Text style={styles.subLabel}>Jenis Perkerasan</Text>
                <ChipGroup
                  options={PAVEMENT_TYPES}
                  value={seg.pavementType}
                  onChange={(v) => updateRoadSegment(seg.id, { pavementType: v })}
                />
                {surveyMode !== 'Pembangunan Baru' && (
                  <>
                    <Text style={styles.subLabel}>Kondisi</Text>
                    <ChipGroup
                      options={CONDITION_OPTIONS}
                      value={seg.condition}
                      onChange={(v) => updateRoadSegment(seg.id, { condition: v })}
                    />
                  </>
                )}
                {surveyMode === 'Perbaikan' && <View style={styles.staRow}>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Panjang Kerusakan (m)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Panjang kerusakan (m)"
                      keyboardType="numeric"
                      value={seg.damageLength}
                      onChangeText={(v) => updateRoadSegment(seg.id, { damageLength: v })}
                    />
                  </View>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Lebar Kerusakan (m)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Lebar kerusakan (m)"
                      keyboardType="numeric"
                      value={seg.damageWidth}
                      onChangeText={(v) => updateRoadSegment(seg.id, { damageWidth: v })}
                    />
                  </View>
                </View>}
                {surveyMode === 'Perbaikan' && <>
                  <Text style={styles.subLabel}>Kedalaman Kerusakan (cm)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Kedalaman kerusakan (cm)"
                    keyboardType="numeric"
                    value={seg.damageDepth}
                    onChangeText={(v) => updateRoadSegment(seg.id, { damageDepth: v })}
                  />
                  {(() => {
                    const suggestion = classifyRoadSegmentCondition(seg);
                    if (!suggestion) return null;
                    return (
                      <View style={styles.suggestionBox}>
                        <Text style={styles.suggestionText}>
                          💡 Saran kondisi berdasarkan luas & kedalaman kerusakan: <Text style={styles.suggestionValue}>{suggestion}</Text>
                        </Text>
                        {seg.condition !== suggestion && (
                          <TouchableOpacity onPress={() => updateRoadSegment(seg.id, { condition: suggestion })}>
                            <Text style={styles.suggestionApply}>Terapkan ke Kondisi</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })()}
                </>}
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Catatan segmen ini"
                  value={seg.notes}
                  onChangeText={(v) => updateRoadSegment(seg.id, { notes: v })}
                  multiline
                />
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() =>
                    setSchemaModal({
                      kind: 'road',
                      data: {
                        widthStart: seg.widthStart,
                        widthEnd: seg.widthEnd,
                        damageLength: seg.damageLength,
                        damageWidth: seg.damageWidth,
                        damageDepth: seg.damageDepth,
                        staStart: seg.staStart,
                        staEnd: seg.staEnd,
                        pavementType: seg.pavementType,
                      },
                    })
                  }
                >
                  <Text style={styles.secondaryButtonText}>📐 Lihat Skema Segmen Ini</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() =>
                setRoadSegments((prev) => {
                  const last = prev[prev.length - 1];
                  const next = emptyRoadSegment();
                  if (last?.staEnd?.trim()) next.staStart = last.staEnd.trim();
                  if (last?.widthEnd?.trim()) next.widthStart = last.widthEnd.trim();
                  if (last?.roadElevationEnd?.trim()) next.roadElevationStart = last.roadElevationEnd.trim();
                  return [...prev, next];
                })
              }
            >
              <Text style={styles.secondaryButtonText}>+ Tambah Segmen STA</Text>
            </TouchableOpacity>
          </>
        )}


        {isDrainage && (
          <>
            <Text style={styles.label}>Segmen STA Drainase</Text>
            {drainageSegments.length > 1 && (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setProfilePreviewVisible((value) => !value)}>
                <Text style={styles.secondaryButtonText}>{profilePreviewVisible ? 'Sembunyikan' : '📈 Tampilkan'} Preview Profil Memanjang</Text>
              </TouchableOpacity>
            )}
            {drainageSegments.map((seg, index) => (
              <View key={seg.id} style={styles.segmentBox}>
                <View style={styles.segmentHeader}>
                  <Text style={styles.segmentTitle}>
                    Segmen {index + 1} dari {drainageSegments.length}
                  </Text>
                  {drainageSegments.length > 1 && (
                    <TouchableOpacity
                      onPress={() => setDrainageSegments((prev) => prev.filter((s) => s.id !== seg.id))}
                    >
                      <Text style={styles.removeText}>Hapus</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.staRow}>
                  <TextInput
                    style={[styles.input, styles.staInput]}
                    placeholder="STA Awal (0+000)"
                    value={seg.staStart}
                    onChangeText={(v) => updateDrainageSegment(seg.id, { staStart: v })}
                  />
                  <Text style={styles.staSeparator}>s/d</Text>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>STA Akhir (otomatis)</Text>
                    <Text style={styles.computedValue}>{seg.staEnd || 'Isi STA Awal & Panjang'}</Text>
                  </View>
                </View>
                <Text style={styles.subLabel}>Panjang Segmen (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Contoh: 25"
                  keyboardType="numbers-and-punctuation"
                  value={seg.length}
                  onChangeText={(v) => updateDrainageSegment(seg.id, { length: v })}
                />
                <View style={styles.staRow}>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Elevasi Dasar Saluran di STA Awal (m)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Contoh: 100.10"
                      keyboardType="numbers-and-punctuation"
                      value={seg.invertElevationStart}
                      onChangeText={(v) => updateDrainageSegment(seg.id, { invertElevationStart: v })}
                    />
                  </View>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Elevasi Dasar Saluran di STA Akhir (m)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Contoh: 100.18"
                      keyboardType="numbers-and-punctuation"
                      value={seg.invertElevationEnd}
                      onChangeText={(v) => updateDrainageSegment(seg.id, { invertElevationEnd: v })}
                    />
                  </View>
                </View>
                <Text style={styles.subLabel}>Jenis Saluran</Text>
                <ChipGroup
                  options={CHANNEL_TYPES}
                  value={seg.channelType}
                  onChange={(v) => updateDrainageSegment(seg.id, { channelType: v })}
                />
                <View style={styles.staRow}>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Lebar Saluran (m)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Lebar saluran (m)"
                      keyboardType="numeric"
                      value={seg.width}
                      onChangeText={(v) => updateDrainageSegment(seg.id, { width: v })}
                    />
                  </View>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Kedalaman (m)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Kedalaman (m)"
                      keyboardType="numeric"
                      value={seg.depth}
                      onChangeText={(v) => updateDrainageSegment(seg.id, { depth: v })}
                    />
                  </View>
                </View>
                <Text style={styles.subLabel}>Material</Text>
                <ChipGroup
                  options={DRAINAGE_MATERIALS}
                  value={seg.material}
                  onChange={(v) => updateDrainageSegment(seg.id, { material: v })}
                />
                {surveyMode === 'Perbaikan' && <>
                  <Text style={styles.subLabel}>Kondisi Sedimentasi</Text>
                  <ChipGroup
                    options={SEDIMENT_CONDITIONS}
                    value={seg.sedimentCondition}
                    onChange={(v) => updateDrainageSegment(seg.id, { sedimentCondition: v })}
                  />
                </>}
                {surveyMode !== 'Pembangunan Baru' && <>
                  <Text style={styles.subLabel}>Kondisi</Text>
                  <ChipGroup
                    options={CONDITION_OPTIONS}
                    value={seg.condition}
                    onChange={(v) => updateDrainageSegment(seg.id, { condition: v })}
                  />
                  {surveyMode === 'Perbaikan' && (() => {
                    const suggestion = classifyDrainageCondition(seg.sedimentCondition);
                    if (!suggestion) return null;
                    return (
                      <View style={styles.suggestionBox}>
                        <Text style={styles.suggestionText}>
                          💡 Saran kondisi berdasarkan Kondisi Sedimentasi: <Text style={styles.suggestionValue}>{suggestion}</Text>
                        </Text>
                        {seg.condition !== suggestion && (
                          <TouchableOpacity onPress={() => updateDrainageSegment(seg.id, { condition: suggestion })}>
                            <Text style={styles.suggestionApply}>Terapkan ke Kondisi</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })()}
                </>}
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Catatan segmen ini"
                  value={seg.notes}
                  onChangeText={(v) => updateDrainageSegment(seg.id, { notes: v })}
                  multiline
                />
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() =>
                    setSchemaModal({
                      kind: 'drainage',
                      data: {
                        channelType: seg.channelType,
                        width: seg.width,
                        depth: seg.depth,
                        sedimentCondition: seg.sedimentCondition,
                        staStart: seg.staStart,
                        staEnd: seg.staEnd,
                      },
                    })
                  }
                >
                  <Text style={styles.secondaryButtonText}>📐 Lihat Skema Segmen Ini</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() =>
                setDrainageSegments((prev) => {
                  const last = prev[prev.length - 1];
                  const next = emptyDrainageSegment();
                  if (last?.staEnd?.trim()) next.staStart = last.staEnd.trim();
                  if (last?.invertElevationEnd?.trim()) next.invertElevationStart = last.invertElevationEnd.trim();
                  return [...prev, next];
                })
              }
            >
              <Text style={styles.secondaryButtonText}>+ Tambah Segmen STA</Text>
            </TouchableOpacity>
          </>
        )}

        {isRetainingWall && (
          <>
            <Text style={styles.label}>Segmen STA Dinding Penahan Tanah</Text>
            {retainingWallSegments.length > 1 && (
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setProfilePreviewVisible((value) => !value)}>
                <Text style={styles.secondaryButtonText}>{profilePreviewVisible ? 'Sembunyikan' : '📈 Tampilkan'} Preview Profil Memanjang</Text>
              </TouchableOpacity>
            )}
            {retainingWallSegments.map((seg, index) => (
              <View key={seg.id} style={styles.segmentBox}>
                <View style={styles.segmentHeader}>
                  <Text style={styles.segmentTitle}>
                    Segmen {index + 1} dari {retainingWallSegments.length}
                  </Text>
                  {retainingWallSegments.length > 1 && (
                    <TouchableOpacity
                      onPress={() => setRetainingWallSegments((prev) => prev.filter((s) => s.id !== seg.id))}
                    >
                      <Text style={styles.removeText}>Hapus</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.staRow}>
                  <TextInput
                    style={[styles.input, styles.staInput]}
                    placeholder="STA Awal (0+000)"
                    value={seg.staStart}
                    onChangeText={(v) => updateRetainingWallSegment(seg.id, { staStart: v })}
                  />
                  <Text style={styles.staSeparator}>s/d</Text>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>STA Akhir (otomatis)</Text>
                    <Text style={styles.computedValue}>{seg.staEnd || 'Isi STA Awal & Panjang'}</Text>
                  </View>
                </View>
                <View style={styles.staRow}>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Panjang Segmen (m)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Contoh: 25"
                      keyboardType="numbers-and-punctuation"
                      value={seg.length}
                      onChangeText={(v) => updateRetainingWallSegment(seg.id, { length: v })}
                    />
                  </View>
                </View>
                <View style={styles.staRow}>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Elevasi Dasar Dinding di STA Awal (m, opsional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Contoh: 100.00"
                      keyboardType="numbers-and-punctuation"
                      value={seg.baseElevationStart}
                      onChangeText={(v) => updateRetainingWallSegment(seg.id, { baseElevationStart: v })}
                    />
                  </View>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Elevasi Dasar Dinding di STA Akhir (m, opsional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Contoh: 100.20"
                      keyboardType="numbers-and-punctuation"
                      value={seg.baseElevationEnd}
                      onChangeText={(v) => updateRetainingWallSegment(seg.id, { baseElevationEnd: v })}
                    />
                  </View>
                </View>
                <View style={styles.staRow}>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Tinggi di STA Awal (m, opsional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Tinggi STA Awal (m)"
                      keyboardType="numeric"
                      value={seg.heightStart}
                      onChangeText={(v) => updateRetainingWallSegment(seg.id, { heightStart: v })}
                    />
                    <SlopeHeightHelper onApply={(v) => updateRetainingWallSegment(seg.id, { heightStart: v })} />
                  </View>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Tinggi di STA Akhir (m, opsional)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Tinggi STA Akhir (m)"
                      keyboardType="numeric"
                      value={seg.heightEnd}
                      onChangeText={(v) => updateRetainingWallSegment(seg.id, { heightEnd: v })}
                    />
                    <SlopeHeightHelper onApply={(v) => updateRetainingWallSegment(seg.id, { heightEnd: v })} />
                  </View>
                </View>
                <View style={styles.staRow}>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Elevasi Puncak Otomatis STA Awal (m)</Text>
                    <Text style={styles.computedValue}>
                      {computeTopElevation(seg.baseElevationStart, seg.heightStart) || 'Isi elevasi dasar & tinggi dahulu'}
                    </Text>
                  </View>
                  <View style={styles.staInput}>
                    <Text style={styles.subLabel}>Elevasi Puncak Otomatis STA Akhir (m)</Text>
                    <Text style={styles.computedValue}>
                      {computeTopElevation(seg.baseElevationEnd, seg.heightEnd) || 'Isi elevasi dasar & tinggi dahulu'}
                    </Text>
                  </View>
                </View>
                {surveyMode !== 'Pembangunan Baru' && (
                  <View style={styles.staRow}>
                    <View style={styles.staInput}>
                      <Text style={styles.subLabel}>Lebar Atas (m)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Lebar Atas (m)"
                        keyboardType="numeric"
                        value={seg.topWidth}
                        onChangeText={(v) => updateRetainingWallSegment(seg.id, { topWidth: v })}
                      />
                    </View>
                    <View style={styles.staInput}>
                      <Text style={styles.subLabel}>Lebar Bawah (m)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Lebar Bawah (m)"
                        keyboardType="numeric"
                        value={seg.bottomWidth}
                        onChangeText={(v) => updateRetainingWallSegment(seg.id, { bottomWidth: v })}
                      />
                    </View>
                  </View>
                )}
                <Text style={styles.subLabel}>Jenis Konstruksi</Text>
                <ChipGroup
                  options={RETAINING_WALL_TYPES}
                  value={seg.constructionType}
                  onChange={(v) => updateRetainingWallSegment(seg.id, { constructionType: v })}
                />
                {surveyMode !== 'Pembangunan Baru' && <>
                  <Text style={styles.subLabel}>Kondisi Kemiringan/Pergeseran</Text>
                  <ChipGroup
                    options={TILT_CONDITIONS}
                    value={seg.tiltCondition}
                    onChange={(v) => updateRetainingWallSegment(seg.id, { tiltCondition: v })}
                  />
                  <Text style={styles.subLabel}>Kondisi</Text>
                  <ChipGroup
                    options={CONDITION_OPTIONS}
                    value={seg.condition}
                    onChange={(v) => updateRetainingWallSegment(seg.id, { condition: v })}
                  />
                </>}
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Catatan segmen ini"
                  value={seg.notes}
                  onChangeText={(v) => updateRetainingWallSegment(seg.id, { notes: v })}
                  multiline
                />
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() =>
                    setSchemaModal({
                      kind: 'retainingWall',
                      data: {
                        length: seg.length,
                        heightStart: seg.heightStart,
                        heightEnd: seg.heightEnd,
                        topWidth: seg.topWidth,
                        bottomWidth: seg.bottomWidth,
                        constructionType: seg.constructionType,
                        tiltCondition: seg.tiltCondition,
                        staStart: seg.staStart,
                        staEnd: seg.staEnd,
                      },
                    })
                  }
                >
                  <Text style={styles.secondaryButtonText}>📐 Lihat Skema Segmen Ini</Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() =>
                setRetainingWallSegments((prev) => {
                  const last = prev[prev.length - 1];
                  const next = emptyRetainingWallSegment();
                  if (last?.staEnd?.trim()) next.staStart = last.staEnd.trim();
                  if (last?.heightEnd?.trim()) next.heightStart = last.heightEnd.trim();
                  if (last?.baseElevationEnd?.trim()) next.baseElevationStart = last.baseElevationEnd.trim();
                  return [...prev, next];
                })
              }
            >
              <Text style={styles.secondaryButtonText}>+ Tambah Segmen STA</Text>
            </TouchableOpacity>
          </>
        )}


        {isCulvert && (
          <View style={styles.segmentBox}>
            <Text style={styles.label}>Detail Gorong-gorong</Text>
            <Text style={styles.subLabel}>Jenis Gorong-gorong</Text>
            <ChipGroup
              options={CULVERT_TYPES}
              value={culvert.culvertType}
              onChange={(v) => setCulvert((p) => ({ ...p, culvertType: v }))}
            />
            <View style={styles.staRow}>
              <View style={styles.staInput}>
                <Text style={styles.subLabel}>Dimensi (diameter/lebar x tinggi)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Dimensi (diameter/lebar x tinggi)"
                  value={culvert.dimension}
                  onChangeText={(v) => setCulvert((p) => ({ ...p, dimension: v }))}
                />
              </View>
              <View style={styles.staInput}>
                <Text style={styles.subLabel}>Panjang (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Panjang (m)"
                  keyboardType="numeric"
                  value={culvert.length}
                  onChangeText={(v) => setCulvert((p) => ({ ...p, length: v }))}
                />
              </View>
            </View>
            {surveyMode !== 'Pembangunan Baru' && <>
              <Text style={styles.subLabel}>Kondisi Saluran Masuk</Text>
              <ChipGroup
                options={CONDITION_OPTIONS}
                value={culvert.inletCondition}
                onChange={(v) => setCulvert((p) => ({ ...p, inletCondition: v }))}
              />
              <Text style={styles.subLabel}>Kondisi Saluran Keluar</Text>
              <ChipGroup
                options={CONDITION_OPTIONS}
                value={culvert.outletCondition}
                onChange={(v) => setCulvert((p) => ({ ...p, outletCondition: v }))}
              />
              <Text style={styles.subLabel}>Kondisi</Text>
              <ChipGroup
                options={CONDITION_OPTIONS}
                value={culvert.condition}
                onChange={(v) => setCulvert((p) => ({ ...p, condition: v }))}
              />
            </>}
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Catatan"
              value={culvert.notes}
              onChangeText={(v) => setCulvert((p) => ({ ...p, notes: v }))}
              multiline
            />
          </View>
        )}

        {isBridge && (
          <View style={styles.segmentBox}>
            <Text style={styles.label}>Detail Jembatan</Text>
            <View style={styles.staRow}>
              <View style={styles.staInput}>
                <Text style={styles.subLabel}>Panjang Bentang (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Panjang bentang (m)"
                  keyboardType="numeric"
                  value={bridge.spanLength}
                  onChangeText={(v) => setBridge((p) => ({ ...p, spanLength: v }))}
                />
              </View>
              <View style={styles.staInput}>
                <Text style={styles.subLabel}>Lebar (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Lebar (m)"
                  keyboardType="numeric"
                  value={bridge.width}
                  onChangeText={(v) => setBridge((p) => ({ ...p, width: v }))}
                />
              </View>
            </View>
            <Text style={styles.subLabel}>Jenis Konstruksi</Text>
            <ChipGroup
              options={BRIDGE_CONSTRUCTION_TYPES}
              value={bridge.constructionType}
              onChange={(v) => setBridge((p) => ({ ...p, constructionType: v }))}
            />
            {surveyMode !== 'Pembangunan Baru' && <>
              <Text style={styles.subLabel}>Kondisi Struktur Atas</Text>
              <ChipGroup
                options={CONDITION_OPTIONS}
                value={bridge.upperStructureCondition}
                onChange={(v) => setBridge((p) => ({ ...p, upperStructureCondition: v }))}
              />
              <Text style={styles.subLabel}>Kondisi Struktur Bawah/Pondasi</Text>
              <ChipGroup
                options={CONDITION_OPTIONS}
                value={bridge.lowerStructureCondition}
                onChange={(v) => setBridge((p) => ({ ...p, lowerStructureCondition: v }))}
              />
              <Text style={styles.subLabel}>Kondisi</Text>
              <ChipGroup
                options={CONDITION_OPTIONS}
                value={bridge.condition}
                onChange={(v) => setBridge((p) => ({ ...p, condition: v }))}
              />
            </>}
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Catatan"
              value={bridge.notes}
              onChangeText={(v) => setBridge((p) => ({ ...p, notes: v }))}
              multiline
            />
          </View>
        )}

        <Text style={styles.label}>Lokasi GPS (Opsional)</Text>
        <Text style={styles.locationHint}>
          Koordinat GPS memerlukan akses internet/sinyal GPS. Jika tidak tersedia (mis. sedang
          offline), Anda tetap bisa menyimpan data tanpa koordinat.
        </Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleGetLocation} disabled={gettingLocation}>
          {gettingLocation ? (
            <ActivityIndicator color="#2563eb" />
          ) : (
            <Text style={styles.secondaryButtonText}>
              {location ? 'Perbarui Lokasi' : 'Ambil Lokasi Sekarang'}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryButton, styles.mapPickerButton]} onPress={() => setMapPickerVisible(true)}>
          <Text style={styles.secondaryButtonText}>🗺️ Pilih di Peta</Text>
        </TouchableOpacity>
        {location && (
          <Text style={styles.locationText}>
            Lat: {location.latitude.toFixed(6)}, Lng: {location.longitude.toFixed(6)}
            {location.accuracy ? ` (± ${location.accuracy.toFixed(1)}m)` : ''}
          </Text>
        )}

        <Text style={styles.label}>Keterangan Lokasi *</Text>
        <TextInput
          style={styles.input}
          placeholder="Contoh: Jl. Merdeka No. 10 (wajib diisi)"
          value={locationNote}
          onChangeText={setLocationNote}
        />

        <Text style={styles.label}>
          Foto ({photos.length}/{CONFIG.MAX_PHOTOS})
        </Text>
        <View style={styles.photoRow}>
          {photos.map((photo, index) => (
            <View key={index} style={styles.photoWrapper}>
              <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => handleRemovePhoto(index)}>
                <Text style={styles.photoRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < CONFIG.MAX_PHOTOS && (
            <TouchableOpacity style={styles.photoAdd} onPress={handleTakePhoto} disabled={takingPhoto}>
              {takingPhoto ? <ActivityIndicator color="#2563eb" /> : <Text style={styles.photoAddText}>+ Foto</Text>}
            </TouchableOpacity>
          )}
          {photos.length < CONFIG.MAX_PHOTOS && (
            <TouchableOpacity style={styles.photoAdd} onPress={handlePickFromGallery} disabled={pickingFromGallery}>
              {pickingFromGallery ? <ActivityIndicator color="#2563eb" /> : <Text style={styles.photoAddText}>+ Galeri</Text>}
            </TouchableOpacity>
          )}
          {photos.length < CONFIG.MAX_PHOTOS && (
            <TouchableOpacity style={styles.photoAdd} onPress={handleOpenSketch}>
              <Text style={styles.photoAddText}>+ Sketsa</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.locationHint}>
          Gunakan "+ Sketsa" untuk menggambar sketsa lokasi/kerusakan lengkap dengan label ukuran
          langsung di atas gambar (tanpa perlu mencatat ukuran terpisah).
        </Text>

        <SketchPad
          visible={sketchVisible}
          onClose={() => setSketchVisible(false)}
          onSave={handleSaveSketch}
        />

        {(isRoad || isDrainage || isRetainingWall) && (
          <LongitudinalProfileModal
            visible={profileModalVisible}
            infrastructureType={infrastructureType}
            segments={
              isRoad
                ? roadSegments.map((s) => ({ staStart: s.staStart, staEnd: s.staEnd, values: s as any }))
                : isDrainage
                ? drainageSegments.map((s) => ({ staStart: s.staStart, staEnd: s.staEnd, values: s as any }))
                : retainingWallSegments.map((s) => ({ staStart: s.staStart, staEnd: s.staEnd, values: s as any }))
            }
            onClose={() => setProfileModalVisible(false)}
            onSave={handleSaveSchemaPhoto}
          />
        )}

        <SearchableSelectModal
          visible={surveyorModalVisible}
          title="Pilih Nama Surveyor"
          options={surveyorOptions}
          onSelect={(value) => {
            setSurveyorNameValue(value);
            setSurveyorModalVisible(false);
          }}
          onClose={() => setSurveyorModalVisible(false)}
          emptyText="Belum ada nama surveyor yang bisa dipilih. Ketik nama manual."
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

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Simpan Item Pekerjaan</Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
      <CoordinatePickerModal
        visible={mapPickerVisible}
        initialLatitude={location?.latitude}
        initialLongitude={location?.longitude}
        packageId={packageId}
        onClose={() => setMapPickerVisible(false)}
        onConfirm={(lat, lng) => {
          setLocation({ latitude: lat, longitude: lng, accuracy: null });
          setMapPickerVisible(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
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
  subtitle: {
    fontSize: 13,
    color: '#334155',
    marginTop: 2,
  },
  surveyorLabel: {
    color: '#666',
    marginBottom: 12,
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
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 8,
  },
  segmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  segmentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  removeText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 13,
  },
  staRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  staInput: {
    flex: 1,
  },
  staSeparator: {
    color: '#64748b',
    fontWeight: '600',
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
  inputDisabled: {
    backgroundColor: '#f1f5f9',
    color: '#64748b',
  },
  surveyorLockedHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: -2,
    marginBottom: 8,
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
  textArea: {
    height: 80,
    textAlignVertical: 'top',
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
  mapPickerButton: {
    borderColor: '#0f766e',
  },
  locationText: {
    marginTop: 8,
    color: '#334155',
    fontSize: 13,
  },
  locationHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 6,
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
  submitButton: {
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    backgroundColor: '#86efac',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});


