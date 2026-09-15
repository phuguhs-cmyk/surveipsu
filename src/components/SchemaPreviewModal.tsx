import React, { useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import RoadSchema from './schemas/RoadSchema';
import DrainageSchema from './schemas/DrainageSchema';
import RetainingWallSchema from './schemas/RetainingWallSchema';
import { captureSchemaAsPhoto } from '../services/schemaCaptureService';
import { SurveyPhoto } from '../types';

type SchemaKind = 'road' | 'drainage' | 'retainingWall';

interface Props {
  visible: boolean;
  kind: SchemaKind;
  data: Record<string, string | undefined>;
  onClose: () => void;
  onSave: (photo: SurveyPhoto) => void;
}

/**
 * Modal pratinjau skema/gambar teknis parametrik: menggambar penampang
 * (jalan/drainase/TPT) secara otomatis dari data ukuran yang sudah diinput
 * surveyor di form (bukan gambar bebas), lalu bisa disimpan sebagai foto
 * biasa (masuk ke photos[] seperti foto kamera). Bekerja di web MAUPUN
 * native (APK) karena berbasis react-native-svg, bukan <canvas> HTML.
 */
export default function SchemaPreviewModal({ visible, kind, data, onClose, onSave }: Props) {
  const svgRef = useRef<any>(null);
  const [saving, setSaving] = useState(false);

  const title =
    kind === 'road' ? 'Skema Penampang Jalan' : kind === 'drainage' ? 'Skema Penampang Drainase' : 'Skema Penampang TPT';

  const handleSave = async () => {
    setSaving(true);
    try {
      const photo = await captureSchemaAsPhoto(svgRef, `skema_${kind}_${Date.now()}.jpg`);
      if (photo) {
        onSave(photo);
        onClose();
      } else {
        alert?.('Gagal menyimpan skema sebagai foto.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>
            Skema digambar otomatis dari ukuran yang sudah Anda isi di form (bukan gambar bebas).
          </Text>
          <View style={styles.schemaWrapper}>
            {kind === 'road' && (
              <RoadSchema
                svgRef={svgRef}
                widthStart={data.widthStart}
                widthEnd={data.widthEnd}
                damageLength={data.damageLength}
                damageWidth={data.damageWidth}
                damageDepth={data.damageDepth}
                staStart={data.staStart}
                staEnd={data.staEnd}
                pavementType={data.pavementType}
              />
            )}
            {kind === 'drainage' && (
              <DrainageSchema
                svgRef={svgRef}
                channelType={data.channelType}
                width={data.width}
                depth={data.depth}
                sedimentCondition={data.sedimentCondition}
                staStart={data.staStart}
                staEnd={data.staEnd}
              />
            )}
            {kind === 'retainingWall' && (
              <RetainingWallSchema
                svgRef={svgRef}
                length={data.length}
                heightStart={data.heightStart}
                heightEnd={data.heightEnd}
                topWidth={data.topWidth}
                bottomWidth={data.bottomWidth}
                constructionType={data.constructionType}
                tiltCondition={data.tiltCondition}
                staStart={data.staStart}
                staEnd={data.staEnd}
              />
            )}
          </View>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.secondaryBtnText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Simpan sebagai Foto</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center' },
  panel: { backgroundColor: '#fff', borderRadius: 12, padding: 16, width: 360, maxWidth: '95%' },
  title: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  hint: { fontSize: 11, color: '#64748b', marginBottom: 10 },
  schemaWrapper: { alignItems: 'center', marginBottom: 14, backgroundColor: '#f8fafc', borderRadius: 8, padding: 8 },
  actionsRow: { flexDirection: 'row', gap: 8 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  secondaryBtnText: { color: '#334155', fontWeight: '600', fontSize: 12 },
  primaryBtn: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
