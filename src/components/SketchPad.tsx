import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  Platform, TextInput, PanResponder, Dimensions,
} from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import ViewShot from 'react-native-view-shot';

interface Props {
  visible: boolean;
  onSave: (base64: string) => void;
  onClose: () => void;
}

type Point = { x: number; y: number };
type Stroke = { color: string; width: number; points: Point[] };

const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 360;
const COLORS = ['#ef4444', '#2563eb', '#16a34a', '#000000'];

function pointsToPath(points: Point[]) {
  if (!points.length) return '';
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`;
}

// ─── Web: pakai Canvas HTML seperti mode desktop ─────────────────────────────

function SketchPadWeb({ visible, onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [annotation, setAnnotation] = useState('');
  const [annotationX, setAnnotationX] = useState(28);
  const [annotationY, setAnnotationY] = useState(28);
  const [annotations, setAnnotations] = useState<Array<{ value: string; x: number; y: number }>>([]);
  const [mode, setMode] = useState<'draw' | 'text'>('draw');
  const [color, setColor] = useState('#ef4444');
  const [pendingTextPoint, setPendingTextPoint] = useState<Point | null>(null);

  if (!visible) return null;

  const getCtx = () => canvasRef.current?.getContext('2d') ?? null;

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // Ukuran tampilan (CSS) kanvas bisa berbeda dari resolusi internalnya
    // (width/height attribute). Skalakan koordinat klik/sentuh agar tetap
    // berhimpitan dengan piksel gambar internal, bukan piksel layar.
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number;
    let clientY: number;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (mode === 'text') {
      setPendingTextPoint(getPos(e));
      return;
    }
    drawing.current = true;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current || mode !== 'draw') return;
    const ctx = getCtx();
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const stopDraw = () => { drawing.current = false; };

  const handleClear = () => {
    const ctx = getCtx();
    if (!ctx || !canvasRef.current) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setAnnotations([]);
    setAnnotation('');
    setPendingTextPoint(null);
  };

  const handleAddAnnotation = () => {
    const value = annotation.trim();
    if (!value) return;
    setAnnotations((prev) => [...prev, { value, x: annotationX, y: annotationY }]);
    setAnnotation('');
  };

  const handleConfirmTextAtPoint = () => {
    if (!pendingTextPoint || !annotation.trim()) return;
    setAnnotations((prev) => [...prev, { value: annotation.trim(), x: pendingTextPoint.x, y: pendingTextPoint.y }]);
    setPendingTextPoint(null);
    setAnnotation('');
  };

  const handleSave = () => {
    if (!canvasRef.current) return;
    const ctx = getCtx();
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.font = '700 18px sans-serif';
      annotations.forEach((item) => {
        ctx.fillText(item.value, item.x, item.y);
      });
    }
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.title}>Buat Sketsa &amp; Ukuran</Text>
          <Text style={styles.hint}>
            Gunakan mode "Gambar" untuk mensketsa, lalu mode "Teks" untuk mengetuk titik dan
            menuliskan ukuran (mis. "2.5 m") langsung di atas sketsa.
          </Text>

          <View style={[styles.canvasWrapper, { flex: 1 }]}>
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              style={{ border: '1px solid #cbd5e1', borderRadius: 8, touchAction: 'none', cursor: 'crosshair', width: '100%', height: '100%', maxWidth: 560, display: 'block' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
          </View>

          {pendingTextPoint && (
            <View style={styles.textInputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Contoh: 2.5 m"
                value={annotation}
                onChangeText={setAnnotation}
                autoFocus
              />
              <TouchableOpacity style={styles.smallBtn} onPress={handleConfirmTextAtPoint}>
                <Text style={styles.smallBtnText}>Tambah</Text>
              </TouchableOpacity>
            </View>
          )}

          {!pendingTextPoint && (
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
          )}

          {!pendingTextPoint && (
            <View style={styles.colorRow}>
              {COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }, color === c && styles.colorDotActive]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>
          )}

          {!pendingTextPoint && (
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
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Native: kanvas SVG custom agar gambar + teks ukuran masuk ke satu file PNG ──

function SketchPadNative({ visible, onSave, onClose }: Props) {
  const [mode, setMode] = useState<'draw' | 'text'>('draw');
  const [color, setColor] = useState('#ef4444');
  const [annotation, setAnnotation] = useState('');
  const [annotations, setAnnotations] = useState<Array<{ value: string; x: number; y: number }>>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [pendingTextPoint, setPendingTextPoint] = useState<Point | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  const viewShotRef = useRef<any>(null);
  const activeStrokeRef = useRef<Stroke | null>(null);
  // PanResponder dibuat sekali (lihat useRef di bawah), jadi handler-nya bisa
  // meng-capture nilai `mode`/`color` versi lama (stale closure). Simpan nilai
  // terbaru di ref dan baca dari ref di dalam handler agar selalu up to date.
  const modeRef = useRef(mode);
  const colorRef = useRef(color);
  modeRef.current = mode;
  colorRef.current = color;

  const resetState = () => {
    setMode('draw');
    setColor('#ef4444');
    setAnnotation('');
    setPendingTextPoint(null);
    setAnnotations([]);
    setStrokes([]);
    activeStrokeRef.current = null;
  };

  const handleSave = async () => {
    try {
  // Minta ViewShot render pada ukuran kanvas asli (bukan device pixel ratio
      // penuh 2x/3x), dan format 'jpg' yang jauh lebih cepat di-encode
      // dibanding 'png' untuk kanvas ini (latar sudah putih solid, tidak
      // butuh transparansi) -- keduanya mempercepat proses simpan secara
      // signifikan.
      const capture = viewShotRef.current ? await viewShotRef.current.capture({
        format: 'jpg',
        quality: 0.8,
        result: 'data-uri',
        width: canvasSize.width,
        height: canvasSize.height,
      }) : null;
      if (capture && typeof capture === 'string' && capture.startsWith('data:image')) {
        onSave(capture);
        onClose();
        resetState();
        return;
      }
    } catch {
      // fallback
    }

    onClose();
    resetState();
  };

  const handleClear = () => {
    setStrokes([]);
    setAnnotations([]);
    setAnnotation('');
    setPendingTextPoint(null);
  };

  const handleConfirmTextAtPoint = () => {
    if (!pendingTextPoint || !annotation.trim()) return;
    setAnnotations((prev) => [...prev, { value: annotation.trim(), x: pendingTextPoint.x, y: pendingTextPoint.y }]);
    setPendingTextPoint(null);
    setAnnotation('');
  };

  const handlePointFromEvent = (event: any): Point => {
    const width = canvasSize.width || CANVAS_WIDTH;
    const height = canvasSize.height || CANVAS_HEIGHT;
    const x = Math.min(Math.max(event.nativeEvent.locationX || 0, 0), width);
    const y = Math.min(Math.max(event.nativeEvent.locationY || 0, 0), height);
    return { x, y };
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const point = handlePointFromEvent(evt);
        if (modeRef.current === 'text') {
          setPendingTextPoint(point);
          return;
        }

        const stroke: Stroke = { color: colorRef.current, width: 3, points: [point] };
        activeStrokeRef.current = stroke;
        setStrokes((prev) => [...prev, stroke]);
      },
      onPanResponderMove: (evt) => {
        if (modeRef.current !== 'draw' || !activeStrokeRef.current) return;
        const point = handlePointFromEvent(evt);
        setStrokes((prev) => {
          if (!prev.length) return prev;
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, points: [...last.points, point] };
          return next;
        });
      },
      onPanResponderRelease: () => {
        activeStrokeRef.current = null;
      },
    })
  ).current;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <View style={styles.scrollContent}>
          <Text style={styles.title}>Buat Sketsa &amp; Ukuran</Text>
          <Text style={styles.hint}>
            Gunakan mode "Gambar" untuk mensketsa, lalu mode "Teks" untuk mengetuk titik dan
            menuliskan ukuran (mis. "2.5 m") langsung di atas sketsa.
          </Text>

          <View
            style={styles.canvasWrapper}
            onLayout={(event) => {
              // Pakai ukuran render AKTUAL (lebar & tinggi) dari View ini, bukan
              // dihitung dari rasio tetap. PanResponder & viewBox harus memakai
              // dimensi yang sama persis agar sentuhan berhimpit dengan gambar
              // (viewBox berbeda aspek rasio dari kotak render menyebabkan SVG
              // di-letterbox/scaling non-1:1 oleh preserveAspectRatio default).
              const { width, height } = event.nativeEvent.layout;
              if (width > 0 && height > 0) {
                setCanvasSize({ width, height });
              }
            }}
            {...panResponder.panHandlers}
          >
            <ViewShot
              ref={viewShotRef}
              options={{ format: 'jpg', quality: 0.8, result: 'data-uri', width: canvasSize.width, height: canvasSize.height }}
              style={styles.canvasShot}
            >
              <Svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                preserveAspectRatio="none"
              >
                <Rect x={0} y={0} width={canvasSize.width} height={canvasSize.height} fill="#ffffff" rx={8} />
                {strokes.map((stroke, idx) => (
                  <Path
                    key={`stroke-${idx}`}
                    d={pointsToPath(stroke.points)}
                    stroke={stroke.color}
                    strokeWidth={stroke.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ))}
                {annotations.map((item, idx) => (
                  <SvgText
                    key={`annotation-${idx}`}
                    x={item.x}
                    y={item.y}
                    fill="#0f172a"
                    fontSize={18}
                    fontWeight="700"
                  >
                    {item.value}
                  </SvgText>
                ))}
              </Svg>
            </ViewShot>
          </View>

          </View>

          <View style={styles.footer}>
            {pendingTextPoint && (
              <View style={styles.textInputRow}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Contoh: 2.5 m"
                  value={annotation}
                  onChangeText={setAnnotation}
                  autoFocus
                />
                <TouchableOpacity style={styles.smallBtn} onPress={handleConfirmTextAtPoint}>
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
              {COLORS.map((c) => (
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
      </View>
    </Modal>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function SketchPad(props: Props) {
  if (Platform.OS === 'web') return <SketchPadWeb {...props} />;
  return <SketchPadNative {...props} />;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center' },
  panel: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: 360,
    maxWidth: '95%',
    height: Dimensions.get('window').height * 0.94,
    maxHeight: Dimensions.get('window').height * 0.94,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  scrollContent: { paddingBottom: 4, flex: 1 },
  footer: { flexShrink: 0, paddingTop: 8 },
  title: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  hint: { fontSize: 11, color: '#64748b', marginBottom: 10 },
  canvasWrapper: {
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    minHeight: 220,
    flex: 1,
  },
  canvasShot: {
    width: '100%',
    height: '100%',
    minHeight: 220,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
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
