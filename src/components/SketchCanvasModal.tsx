import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import { SurveyPhoto } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave: (photo: SurveyPhoto) => void;
}

/**
 * Editor sketsa sederhana: surveyor bisa menggambar bebas (jari/mouse) di
 * atas kanvas kosong DAN menambahkan label teks ukuran (mis. "2.5 m")
 * langsung di titik yang diketuk pada gambar yang sama, sehingga tidak
 * perlu mencatat ukuran terpisah dari sketsanya. Hasil akhir disimpan
 * sebagai satu foto biasa (dataURL -> base64) sehingga bisa langsung
 * masuk ke alur upload foto yang sudah ada (photos[], queueService, dst)
 * tanpa perlu perubahan skema data/backend.
 *
 * Catatan: kanvas HTML5 hanya tersedia di web (Expo web / react-native-web).
 * Distribusi utama aplikasi ini adalah build web (lihat mobile-app/dist).
 * Di native (APK) tombol sketsa disembunyikan di WorkItemFormScreen.
 */
export default function SketchCanvasModal({ visible, onClose, onSave }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<'draw' | 'text'>('draw');
  const [color, setColor] = useState('#ef4444');
  const [pendingTextPoint, setPendingTextPoint] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState('');

  useEffect(() => {
    if (visible && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    if (!visible) {
      setPendingTextPoint(null);
      setTextValue('');
      setMode('draw');
    }
  }, [visible]);

  const getPos = (e: any) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const clientX = e.nativeEvent?.clientX ?? e.clientX;
    const clientY = e.nativeEvent?.clientY ?? e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handlePointerDown = (e: any) => {
    if (!canvasRef.current) return;
    const pos = getPos(e);
    if (mode === 'text') {
      setPendingTextPoint(pos);
      return;
    }
    drawingRef.current = true;
    lastPointRef.current = pos;
  };

  const handlePointerMove = (e: any) => {
    if (!drawingRef.current || mode !== 'draw' || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    if (ctx && lastPointRef.current) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
    lastPointRef.current = pos;
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleConfirmText = () => {
    if (!canvasRef.current || !pendingTextPoint || !textValue.trim()) {
      setPendingTextPoint(null);
      setTextValue('');
      return;
    }
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.fillStyle = color;
      ctx.font = 'bold 16px Arial';
      ctx.fillText(textValue.trim(), pendingTextPoint.x, pendingTextPoint.y);
    }
    setPendingTextPoint(null);
    setTextValue('');
  };

  const handleClear = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];
    onSave({
      uri: dataUrl,
      base64,
      mimeType: 'image/jpeg',
      fileName: `sketsa_${Date.now()}.jpg`,
    });
    onClose();
  };

  const colors = ['#ef4444', '#2563eb', '#16a34a', '#000000'];

  if (Platform.OS !== 'web') return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.title}>Buat Sketsa &amp; Ukuran</Text>
          <Text style={styles.hint}>
            Gunakan mode "Gambar" untuk mensketsa, lalu mode "Teks" untuk mengetuk titik dan
            menuliskan ukuran (mis. "2.5 m") langsung di atas sketsa.
          </Text>

          <View style={styles.canvasWrapper}>
            {/* @ts-ignore: elemen HTML native hanya valid di react-native-web */}
            <canvas
              ref={canvasRef}
              width={320}
              height={320}
              style={{ border: '1px solid #cbd5e1', borderRadius: 8, touchAction: 'none', cursor: 'crosshair' }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={(e: any) => handlePointerDown({ nativeEvent: e.touches[0] })}
              onTouchMove={(e: any) => handlePointerMove({ nativeEvent: e.touches[0] })}
              onTouchEnd={handlePointerUp}
            />
          </View>

          {pendingTextPoint && (
            <View style={styles.textInputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Contoh: 2.5 m"
                value={textValue}
                onChangeText={setTextValue}
                autoFocus
              />
              <TouchableOpacity style={styles.smallBtn} onPress={handleConfirmText}>
                <Text style={styles.smallBtnText}>Tambah</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.toolRow}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'draw' && styles.modeBtnActive]}
              onPress={() => setMode('draw')}
            >
              <Text style={[styles.modeBtnText, mode === 'draw' && styles.modeBtnTextActive]}>Gambar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'text' && styles.modeBtnActive]}
              onPress={() => setMode('text')}
            >
              <Text style={[styles.modeBtnText, mode === 'text' && styles.modeBtnTextActive]}>Teks Ukuran</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.colorRow}>
            {colors.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleClear}>
              <Text style={styles.secondaryBtnText}>Bersihkan</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onClose}>
              <Text style={styles.secondaryBtnText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleSave}>
              <Text style={styles.primaryBtnText}>Simpan Sketsa</Text>
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
  canvasWrapper: { alignItems: 'center', marginBottom: 10 },
  textInputRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  textInput: {
    flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6,
  },
  smallBtn: { backgroundColor: '#2563eb', borderRadius: 6, paddingHorizontal: 12, justifyContent: 'center' },
  smallBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  toolRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  modeBtn: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 6, paddingVertical: 8, alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  modeBtnText: { color: '#334155', fontWeight: '600', fontSize: 12 },
  modeBtnTextActive: { color: '#1e40af' },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 14, justifyContent: 'center' },
  colorDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  colorDotActive: { borderColor: '#1e293b' },
  actionsRow: { flexDirection: 'row', gap: 8 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  secondaryBtnText: { color: '#334155', fontWeight: '600', fontSize: 12 },
  primaryBtn: { flex: 1, backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});
