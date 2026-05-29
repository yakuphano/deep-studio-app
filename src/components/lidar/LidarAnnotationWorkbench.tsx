import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
  StyleSheet,
  LayoutChangeEvent,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import GuidelineOpenButton from '@/components/task/GuidelineOpenButton';
import TaskDiscardCheckbox from '@/components/task/TaskDiscardCheckbox';
import { useAuth } from '@/contexts/AuthContext';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { resolveTaskImageUrl } from '@/lib/audioUrl';
import {
  bevImageUrlToPointCloud,
  syntheticUrbanStrip,
  type BevPointCloudMeta,
} from '@/lib/lidar/bevImageToPointCloud';
import LidarThreeView from '@/components/lidar/LidarThreeView';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
import type { LidarBoxFootprint, LidarGizmoMode, LidarThreeTool } from '@/components/lidar/types';
import { estimateFootprintFromPoints, snapCuboidCenterXZ } from '@/lib/lidar/lidarBoxFromCloud';
import {
  createEmptyLidarCuboid,
  defaultCuboidDimensionsForLabel,
  type LidarCuboidAnnotation,
} from '@/types/lidarAnnotation';
import { createVideoProWorkbenchStyles, workbenchChromeFromAppColors } from '@/theme/videoProWorkbenchTheme';
import { createLidarAnnotationLayoutStyles } from '@/theme/lidarAnnotationLayout';
import { WorkbenchObjectListChrome } from '@/components/workbench/WorkbenchObjectListChrome';
import {
  resolveAnnotationLabelColor,
  customLabelDefinitionsToMap,
  type CustomLabelDefinition,
} from '@/constants/annotationLabels';

const LABELS = ['Car', 'Truck', 'Pedestrian', 'Cyclist', 'Sign', 'Other'] as const;

/** LiDAR rail: two tool cells + gap + strip padding (fixed width, no flex stretch). */
const LIDAR_TOOL_CELL = 54;
const LIDAR_TOOL_GAP = 8;
const RAIL_INNER = LIDAR_TOOL_CELL * 2 + LIDAR_TOOL_GAP;
const LEFT_RAIL_W = RAIL_INNER + 24;
/** Same width as `app/dashboard/image/[id].tsx` right sidebar. */
const LIDAR_RIGHT_SIDEBAR_W = 280;

/** Fits a near-square box (max aspect ratio `r`) inside maxW × maxH. */
function nearSquareSize(maxW: number, maxH: number, r = 1.12): { bw: number; bh: number } {
  const w = Math.max(0, maxW);
  const h = Math.max(0, maxH);
  if (w < 8 || h < 8) return { bw: 0, bh: 0 };
  if (w >= h) {
    const bh = h;
    const bw = Math.min(w, bh * r);
    return { bw: Math.floor(bw), bh: Math.floor(bh) };
  }
  const bw = w;
  const bh = Math.min(h, bw * r);
  return { bw: Math.floor(bw), bh: Math.floor(bh) };
}

function cloneCuboids(c: LidarCuboidAnnotation[]): LidarCuboidAnnotation[] {
  return JSON.parse(JSON.stringify(c)) as LidarCuboidAnnotation[];
}

function isCuboidList(v: unknown): v is LidarCuboidAnnotation[] {
  if (!Array.isArray(v)) return false;
  return v.every(
    (x) =>
      x &&
      typeof x === 'object' &&
      typeof (x as LidarCuboidAnnotation).id === 'string' &&
      typeof (x as LidarCuboidAnnotation).cx === 'number'
  );
}

function isGeometryPatch(patch: Partial<LidarCuboidAnnotation>): boolean {
  return ['width', 'height', 'depth', 'cx', 'cy', 'cz', 'yaw'].some((k) => k in patch);
}

type LidarRailCell =
  | { kind: 'three'; id: LidarThreeTool; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; key: string }
  | { kind: 'gizmo'; mode: LidarGizmoMode; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; key: string };

export default function LidarAnnotationWorkbench() {
  const appColors = useThemeColors();
  const rp = useMemo(() => createRpStyles(appColors), [appColors]);

  const { t } = useTranslation();
  const railCells = useMemo(
    (): LidarRailCell[] => [
      { kind: 'three', id: 'select', label: t('annotation.selectTool'), icon: 'hand-left-outline', key: 'V' },
      { kind: 'three', id: 'create', label: t('tasks.lidarToolCreateBox'), icon: 'cube-outline', key: 'B' },
      { kind: 'three', id: 'polygon', label: t('tasks.lidarToolPolygon'), icon: 'shapes-outline', key: 'P' },
      { kind: 'three', id: 'bbox', label: t('tasks.lidarToolBbox'), icon: 'square-outline', key: 'G' },
      { kind: 'gizmo', mode: 'rotate', label: t('tasks.lidarToolRotate'), icon: 'sync-outline', key: 'R' },
      { kind: 'gizmo', mode: 'scale', label: t('tasks.lidarToolScale'), icon: 'expand-outline', key: 'S' },
      { kind: 'three', id: 'delete', label: t('tasks.lidarToolDelete'), icon: 'trash-outline', key: 'Del' },
    ],
    [t]
  );
  const lidarToolRows = useMemo(() => {
    const rows: (LidarRailCell | null)[][] = [];
    for (let i = 0; i < railCells.length; i += 2) {
      const a = railCells[i];
      const b = railCells[i + 1] ?? null;
      rows.push([a, b]);
    }
    return rows;
  }, [railCells]);
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useAuth();

  const wb = useMemo(() => workbenchChromeFromAppColors(appColors, { radius: 10 }), [appColors]);
  const layoutStyles = useMemo(() => createLidarWorkbenchLayoutStyles(appColors), [appColors]);
  const S = useMemo(() => createVideoProWorkbenchStyles(wb), [wb]);
  const L = useMemo(() => createLidarAnnotationLayoutStyles(wb), [wb]);
  const sidebarStyles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          width: LIDAR_RIGHT_SIDEBAR_W,
          minWidth: LIDAR_RIGHT_SIDEBAR_W,
          maxWidth: LIDAR_RIGHT_SIDEBAR_W,
          padding: 8,
          backgroundColor: wb.panel,
          borderLeftWidth: 1,
          borderLeftColor: wb.border,
          flexDirection: 'column',
          minHeight: 0,
        },
        objectList: { flex: 1, minHeight: 60, width: '100%' },
        objectListEmpty: {
          fontSize: 12,
          color: wb.textSoft,
          fontStyle: 'italic' as const,
        },
        submittedBadgeCompact: {
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          gap: 6,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: '#22c55e',
          marginTop: 4,
        },
        submittedText: { fontSize: 14, color: '#fff', fontWeight: '600' as const },
      }),
    [wb]
  );
  const [undoUiEpoch, setUndoUiEpoch] = useState(0);
  const bumpUndoUi = useCallback(() => setUndoUiEpoch((x) => x + 1), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [status, setStatus] = useState<string>('pending');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [guidelineUrl, setGuidelineUrl] = useState<string | null>(null);
  const [guidelineFileName, setGuidelineFileName] = useState<string | null>(null);
  const [discarded, setDiscarded] = useState(false);

  const [positions, setPositions] = useState<Float32Array>(() => syntheticUrbanStrip().positions);
  const [colors, setColors] = useState<Float32Array>(() => syntheticUrbanStrip().colors);
  const [cuboids, setCuboids] = useState<LidarCuboidAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<LidarThreeTool>('select');
  const [gizmoMode, setGizmoMode] = useState<LidarGizmoMode>('translate');
  const [activeLabel, setActiveLabel] = useState<string>('Other');
  const [extraLabelDefinitions, setExtraLabelDefinitions] = useState<CustomLabelDefinition[]>([]);
  const chipLabels = useMemo((): string[] => {
    const out: string[] = LABELS.slice() as string[];
    const seen = new Set<string>(out);
    for (const d of extraLabelDefinitions) {
      const s = String(d.label ?? '').trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }, [extraLabelDefinitions]);

  const labelColorOverrides = useMemo(
    () => customLabelDefinitionsToMap(extraLabelDefinitions),
    [extraLabelDefinitions]
  );

  const handleAddExtraLabelOption = useCallback((label: string, color: string) => {
    const s = label.trim();
    if (!s) return;
    setExtraLabelDefinitions((prev) => {
      if (prev.some((d) => d.label === s)) return prev;
      return [...prev, { label: s, color }];
    });
    setActiveLabel(s);
  }, []);

  const handleRemoveExtraLabelOption = useCallback((label: string) => {
    setExtraLabelDefinitions((prev) => prev.filter((d) => d.label !== label));
    setActiveLabel((cur) => (cur === label ? 'Other' : cur));
  }, []);
  const activeLabelRef = useRef(activeLabel);
  activeLabelRef.current = activeLabel;
  const [resolvedBevUrl, setResolvedBevUrl] = useState<string | null>(null);
  const [bevMeta, setBevMeta] = useState<BevPointCloudMeta | null>(null);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [resetCameraRequestId, setResetCameraRequestId] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [viewerSlot, setViewerSlot] = useState({ w: 0, h: 0 });
  const onViewerSlotLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewerSlot((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);
  const viewerSquare = useMemo(
    () => nearSquareSize(Math.max(0, viewerSlot.w - 10), Math.max(0, viewerSlot.h - 10)),
    [viewerSlot.w, viewerSlot.h]
  );

  const cuboidsLive = useRef(cuboids);
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    cuboidsLive.current = cuboids;
  }, [cuboids]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const undoPast = useRef<LidarCuboidAnnotation[][]>([]);
  const undoFuture = useRef<LidarCuboidAnnotation[][]>([]);
  const canUndo = useMemo(() => undoPast.current.length > 0, [undoUiEpoch, cuboids]);

  const clearUndoStacks = useCallback(() => {
    undoPast.current = [];
    undoFuture.current = [];
    bumpUndoUi();
  }, [bumpUndoUi]);

  const pushUndo = useCallback(() => {
    undoPast.current.push(cloneCuboids(cuboidsLive.current));
    if (undoPast.current.length > 80) undoPast.current.shift();
    undoFuture.current = [];
    bumpUndoUi();
  }, [bumpUndoUi]);

  const doUndo = useCallback(() => {
    const prev = undoPast.current.pop();
    if (!prev) return;
    undoFuture.current.push(cloneCuboids(cuboidsLive.current));
    setCuboids(prev);
    bumpUndoUi();
  }, [bumpUndoUi]);

  const doRedo = useCallback(() => {
    const next = undoFuture.current.pop();
    if (!next) return;
    undoPast.current.push(cloneCuboids(cuboidsLive.current));
    setCuboids(next);
    bumpUndoUi();
  }, [bumpUndoUi]);

  const selected = useMemo(
    () => cuboids.find((c) => c.id === selectedId) ?? null,
    [cuboids, selectedId]
  );

  useEffect(() => {
    if (!selectedId) return;
    const c = cuboids.find((x) => x.id === selectedId);
    if (c) setActiveLabel(c.label);
  }, [selectedId, cuboids]);

  const statusLabel = useMemo(() => {
    const v = (status || 'pending').toLowerCase();
    if (v === 'submitted') return t('tasks.lidarTaskStatusSubmitted');
    if (v === 'pending') return t('tasks.lidarTaskStatusPending');
    return v.replace(/_/g, ' ');
  }, [status, t]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from('tasks').select('*').eq('id', id).single();
      if (cancelled) return;
      if (error || !data) {
        setLoading(false);
        Alert.alert('Error', error?.message ?? 'Could not load task');
        return;
      }
      setTitle(String(data.title ?? ''));
      setPrice(data.price != null ? Number(data.price) : 0);
      setStatus(String(data.status ?? 'pending'));
      setGuidelineUrl(data.guideline_url ? String(data.guideline_url) : null);
      setGuidelineFileName(data.guideline_file_name ? String(data.guideline_file_name) : null);
      setDiscarded(!!data.discarded_at);
      const raw = data.image_url ?? data.imageUrl ?? null;
      setImageUrl(raw ? String(raw) : null);
      const ad = data.annotation_data;
      if (isCuboidList(ad)) {
        setCuboids(ad);
      } else {
        setCuboids([]);
      }
      clearUndoStacks();
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, clearUndoStacks]);

  useEffect(() => {
    if (!imageUrl || Platform.OS !== 'web') {
      setResolvedBevUrl(null);
      setBevMeta(null);
      return;
    }
    let cancelled = false;
    const resolved = resolveTaskImageUrl(imageUrl.trim()) ?? imageUrl.trim();
    setResolvedBevUrl(resolved);
    (async () => {
      try {
        const { positions: p, colors: col, meta } = await bevImageUrlToPointCloud(resolved);
        if (!cancelled) {
          setPositions(p);
          setColors(col);
          setBevMeta(meta);
        }
      } catch {
        if (!cancelled) {
          const s = syntheticUrbanStrip();
          setPositions(s.positions);
          setColors(s.colors);
          setBevMeta(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!id || !user?.id || status === 'submitted' || loading) return;
    const tmr = setTimeout(() => {
      void supabase
        .from('tasks')
        .update({
          annotation_data: cuboidsLive.current,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    }, 2000);
    return () => clearTimeout(tmr);
  }, [cuboids, id, user?.id, status, loading]);

  const updateSelected = useCallback(
    (patch: Partial<LidarCuboidAnnotation>) => {
      if (!selectedId) return;
      if (isGeometryPatch(patch)) pushUndo();
      setCuboids((prev) => prev.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)));
    },
    [selectedId, pushUndo]
  );

  const updateCuboidById = useCallback(
    (cuboidId: string, patch: Partial<LidarCuboidAnnotation>) => {
      if (isGeometryPatch(patch)) pushUndo();
      setCuboids((prev) => prev.map((c) => (c.id === cuboidId ? { ...c, ...patch } : c)));
    },
    [pushUndo]
  );

  const handleCuboidTransform = useCallback(
    (cuboidId: string, patch: Partial<LidarCuboidAnnotation>) => {
      pushUndo();
      setCuboids((prev) => prev.map((c) => (c.id === cuboidId ? { ...c, ...patch } : c)));
    },
    [pushUndo]
  );

  const handleCreateBoxFootprint = useCallback(
    (bounds: LidarBoxFootprint) => {
      pushUndo();
      const label = activeLabelRef.current.trim() || 'Other';
      const def = defaultCuboidDimensionsForLabel(label);
      const isViewCenter = bounds.width <= 0.001 || bounds.depth <= 0.001;
      const fw = isViewCenter ? def.width : bounds.width;
      const fd = isViewCenter ? def.depth : bounds.depth;
      const minX = bounds.cx - fw / 2;
      const maxX = bounds.cx + fw / 2;
      const minZ = bounds.cz - fd / 2;
      const maxZ = bounds.cz + fd / 2;
      const { height, cy } = estimateFootprintFromPoints(positions, minX, maxX, minZ, maxZ);
      const snapped = snapCuboidCenterXZ(
        positions,
        bounds.cx,
        bounds.cz,
        Math.max(fw, fd) * 0.55,
        1.35
      );
      const base = createEmptyLidarCuboid(label);
      base.width = fw;
      base.depth = fd;
      base.height = height;
      base.cx = snapped.cx;
      base.cz = snapped.cz;
      base.cy = cy;
      base.yaw = 0;
      setCuboids((prev) => [...prev, base]);
      setSelectedId(base.id);
      setTool('select');
      setGizmoMode('translate');
    },
    [pushUndo, positions]
  );

  const handleDuplicateSelected = useCallback(() => {
    const sid = selectedIdRef.current;
    if (!sid) return;
    const src = cuboidsLive.current.find((c) => c.id === sid);
    if (!src) return;
    pushUndo();
    const copy: LidarCuboidAnnotation = {
      ...src,
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      cx: src.cx + 0.6,
      cz: src.cz + 0.6,
    };
    setCuboids((prev) => [...prev, copy]);
    setSelectedId(copy.id);
    setTool('select');
    setGizmoMode('translate');
  }, [pushUndo]);

  const handleDeleteCuboid = useCallback(
    (cuboidId: string) => {
      pushUndo();
      setCuboids((prev) => prev.filter((c) => c.id !== cuboidId));
      setSelectedId((sid) => (sid === cuboidId ? null : sid));
    },
    [pushUndo]
  );

  const cycleClass = useCallback(() => {
    const i = chipLabels.indexOf(activeLabel);
    const safe = i >= 0 ? i : 0;
    const next = chipLabels[(safe + 1) % chipLabels.length];
    setActiveLabel(next);
  }, [activeLabel, chipLabels]);

  const handleCenterView = useCallback(() => {
    if (selectedId) setFocusRequestId((n) => n + 1);
    else setResetCameraRequestId((n) => n + 1);
  }, [selectedId]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.closest?.('input, textarea, select')) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) doRedo();
          else doUndo();
        }
        return;
      }

      const k = e.key;
      if (k === 'v' || k === 'V') {
        e.preventDefault();
        setTool('select');
      }
      if (k === 'b' || k === 'B') {
        e.preventDefault();
        setTool('create');
      }
      if (k === 'p' || k === 'P') {
        e.preventDefault();
        setTool('polygon');
      }
      if (k === 'g' || k === 'G') {
        e.preventDefault();
        setTool('bbox');
      }
      if (k === 'Delete') {
        e.preventDefault();
        const sid = selectedIdRef.current;
        if (sid) {
          pushUndo();
          setCuboids((prev) => prev.filter((c) => c.id !== sid));
          setSelectedId(null);
        } else {
          setTool('delete');
        }
      }
      if (k === 'c' || k === 'C') {
        e.preventDefault();
        cycleClass();
      }
      if (k === 'f' || k === 'F') {
        e.preventDefault();
        setFocusRequestId((n) => n + 1);
      }
      if (k === 'w' || k === 'W') {
        e.preventDefault();
        setGizmoMode('translate');
      }
      if (k === 'r' || k === 'R') {
        e.preventDefault();
        setGizmoMode('rotate');
      }
      if (k === 'Home') {
        e.preventDefault();
        setResetCameraRequestId((n) => n + 1);
      }
      if (k === 's' || k === 'S') {
        e.preventDefault();
        setGizmoMode('scale');
      }
      if (k === 'd' || k === 'D') {
        e.preventDefault();
        handleDuplicateSelected();
      }
      const num = parseInt(k, 10);
      if (num >= 1 && num <= 9) {
        e.preventDefault();
        const idx = num - 1;
        if (chipLabels[idx]) setActiveLabel(chipLabels[idx]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chipLabels, cycleClass, doRedo, doUndo, pushUndo, handleDuplicateSelected]);

  const persistSubmitted = useCallback(async () => {
    if (!id || !user?.id) throw new Error('Not signed in');
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'submitted',
        annotation_data: cuboids,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
    setStatus('submitted');
    triggerEarningsRefresh();
  }, [id, user?.id, cuboids]);

  const handleSubmit = useCallback(async () => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      await persistSubmitted();
      if (Platform.OS === 'web') window.alert('Submitted successfully.');
      else Alert.alert('Done', 'Submitted successfully.');
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (Platform.OS === 'web') window.alert(m);
      else Alert.alert('Error', m);
    } finally {
      setSaving(false);
    }
  }, [id, user?.id, persistSubmitted]);

  const handleSubmitAndExit = useCallback(async () => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      await persistSubmitted();
      if (Platform.OS === 'web') window.alert('Submitted. Returning to task list.');
      else Alert.alert('Done', 'Submitted. Returning to task list.');
      router.replace('/dashboard/lidar');
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (Platform.OS === 'web') window.alert(m);
      else Alert.alert('Error', m);
    } finally {
      setSaving(false);
    }
  }, [id, user?.id, persistSubmitted, router]);

  if (loading || !id) {
    return (
      <View style={L.center}>
        <ActivityIndicator size="large" color={wb.accent} />
        <Text style={L.muted}>Loading LiDAR task…</Text>
      </View>
    );
  }

  const hasSquareViewerFrame =
    Platform.OS === 'web' && viewerSquare.bw > 60 && viewerSquare.bh > 60;
  const threePanelStyle = hasSquareViewerFrame ? layoutStyles.threePanelSquareInner : layoutStyles.threePanel;

  const lidarCenterPanels = (
    <View style={threePanelStyle}>
      <LidarThreeView
        positions={positions}
        colors={colors}
        bevTextureUrl={resolvedBevUrl}
        bevWorldWidth={bevMeta?.worldWidth ?? 48}
        bevWorldDepth={bevMeta?.worldDepth ?? 48}
        showPointCloud
        cuboids={cuboids}
        selectedId={selectedId}
        hoveredId={hoveredId}
        tool={tool}
        gizmoMode={gizmoMode}
        pointColorMode="height"
        pointDensity={1}
        focusRequestId={focusRequestId}
        resetCameraRequestId={resetCameraRequestId}
        chromeless={Platform.OS === 'web'}
        onSelectCuboid={setSelectedId}
        onHoverCuboid={setHoveredId}
        onCreateBoxFootprint={handleCreateBoxFootprint}
        onDeleteCuboid={handleDeleteCuboid}
        onCuboidTransform={handleCuboidTransform}
      />
    </View>
  );

  return (
    <View style={S.root}>
      <View style={[S.topNav, layoutStyles.topNavRow]}>
        <TouchableOpacity
          style={S.topNavBack}
          onPress={() => router.replace('/dashboard/lidar')}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={18} color={wb.accent} />
          <Text style={S.topNavBackText}>Back</Text>
        </TouchableOpacity>
        <View style={layoutStyles.topNavMetaCol}>
          <Text style={[S.topNavMetaStrong, layoutStyles.topTitle]} numberOfLines={1}>
            {title || 'LiDAR'}
          </Text>
          <View style={layoutStyles.priceBadge}>
            <Text style={layoutStyles.priceBadgeText}>
              {t('tasks.fee')}: {price} TL
            </Text>
          </View>
          <Text style={[S.topNavMetaLine, layoutStyles.frameLabel]} numberOfLines={1}>
            Frame 1 / 1
          </Text>
          {status === 'submitted' ? (
            <Text style={[S.topNavMetaLine, { color: wb.textMuted }]}>{statusLabel}</Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <GuidelineOpenButton
            variant="header"
            guidelineUrl={guidelineUrl}
            guidelineFileName={guidelineFileName}
            style={layoutStyles.topNavGuideline}
          />
          {id ? (
            <TaskDiscardCheckbox
              taskId={String(id)}
              discarded={discarded}
              disabled={status === 'submitted'}
              userId={user?.id}
              onApplied={(d) => setDiscarded(d)}
            />
          ) : null}
        </View>
      </View>

      <View style={S.mainRow}>
        <View style={layoutStyles.mainWorkspaceRow}>
          <ScrollView
            style={[S.leftToolRail, layoutStyles.lidarToolsStrip]}
            contentContainerStyle={[S.leftToolRailContent, { paddingBottom: 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          <View style={L.lidarRailCol}>
            <Text style={L.railSectionTitle}>TOOLS</Text>

            <View style={L.lidarToolRow}>
              <TouchableOpacity
                style={[L.lidarTool48, L.lidarUndoCell, !canUndo && layoutStyles.railToolDisabled]}
                onPress={() => doUndo()}
                disabled={!canUndo}
                activeOpacity={0.85}
                {...(Platform.OS === 'web' ? ({ title: 'Undo (Ctrl+Z)' } as object) : {})}
              >
                <Ionicons name="arrow-undo-outline" size={18} color={canUndo ? appColors.accent : wb.textSoft} />
                <Text
                  style={[L.lidarTool48Txt, { color: canUndo ? wb.text : wb.textSoft }]}
                  numberOfLines={2}
                >
                  {t('tasks.lidarUndo')}
                </Text>
                <Text style={L.lidarKeyCap}>⌘Z</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[L.lidarTool48, L.lidarCenterCell]}
                onPress={handleCenterView}
                activeOpacity={0.85}
                {...(Platform.OS === 'web'
                  ? ({
                      title: selectedId
                        ? 'Focus camera on selection (F)'
                        : 'Reset camera to default view (Home)',
                    } as object)
                  : {})}
              >
                <Ionicons name="scan-outline" size={18} color={appColors.success} />
                <Text style={[L.lidarTool48Txt, { color: appColors.success }]} numberOfLines={2}>
                  {t('tasks.lidarCenter')}
                </Text>
                <Text style={L.lidarKeyCap}>{selectedId ? 'F' : 'H'}</Text>
              </TouchableOpacity>
            </View>

            {lidarToolRows.map((row, ri) => (
              <View key={ri} style={L.lidarToolRow}>
                {row.map((meta, ci) =>
                  meta ? (
                    <TouchableOpacity
                      key={meta.kind === 'three' ? meta.id : `gizmo-${meta.mode}`}
                      style={[
                        L.lidarTool48,
                        meta.kind === 'three' && tool === meta.id && L.lidarTool48On,
                        meta.kind === 'gizmo' &&
                          tool === 'select' &&
                          gizmoMode === meta.mode &&
                          L.lidarTool48On,
                      ]}
                      onPress={() => {
                        if (meta.kind === 'three') {
                          setTool(meta.id);
                        } else {
                          setTool('select');
                          setGizmoMode(meta.mode);
                        }
                      }}
                      activeOpacity={0.85}
                      {...(Platform.OS === 'web' ? ({ title: `${meta.label} (${meta.key})` } as object) : {})}
                    >
                      <Ionicons
                        name={meta.icon}
                        size={18}
                        color={
                          (meta.kind === 'three' && tool === meta.id) ||
                          (meta.kind === 'gizmo' && tool === 'select' && gizmoMode === meta.mode)
                            ? wb.accent
                            : wb.text
                        }
                      />
                      <Text
                        style={[
                          L.lidarTool48Txt,
                          ((meta.kind === 'three' && tool === meta.id) ||
                            (meta.kind === 'gizmo' && tool === 'select' && gizmoMode === meta.mode)) &&
                            L.lidarTool48TxtOn,
                        ]}
                        numberOfLines={2}
                      >
                        {meta.label}
                      </Text>
                      <Text style={L.lidarKeyCap}>{meta.key}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View key={`sp-${ri}-${ci}`} style={L.lidarToolSpacer} />
                  )
                )}
              </View>
            ))}

            <Text style={L.lidarRailHint}>{t('tasks.lidarVectorToolsHint')}</Text>
          </View>
        </ScrollView>

          {Platform.OS === 'web' ? (
            <View style={layoutStyles.viewerSlotMeasure} onLayout={onViewerSlotLayout}>
              {hasSquareViewerFrame ? (
                <View
                  style={[
                    layoutStyles.squareViewerFrame,
                    { width: viewerSquare.bw, height: viewerSquare.bh },
                  ]}
                >
                  <View style={[L.viewport, layoutStyles.viewportSplit, layoutStyles.viewportSquareFill]}>
                    {lidarCenterPanels}
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    L.viewport,
                    layoutStyles.viewportSplit,
                    layoutStyles.viewportSquareFill,
                    { flex: 1, minWidth: 200, alignSelf: 'stretch' },
                  ]}
                >
                  {lidarCenterPanels}
                </View>
              )}
            </View>
          ) : (
            <View style={[L.viewport, layoutStyles.viewportSplit, { flex: 1, minWidth: 0 }]}>
              {lidarCenterPanels}
            </View>
          )}
        </View>

        <View style={sidebarStyles.root}>
          <WorkbenchObjectListChrome
            extraLabelDefinitions={extraLabelDefinitions}
            onAddExtraLabelOption={handleAddExtraLabelOption}
            onRemoveExtraLabelOption={handleRemoveExtraLabelOption}
          />
          <ScrollView
            style={sidebarStyles.objectList}
            contentContainerStyle={[rp.scrollContentSidebar, rp.scrollContentGrow]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {cuboids.length === 0 ? (
              <Text style={sidebarStyles.objectListEmpty}>{t('annotation.noObjects')}</Text>
            ) : (
              cuboids.map((c, index) => {
                const labelColor = resolveAnnotationLabelColor(c.label, labelColorOverrides);
                const on = selectedId === c.id;
                const nm = (c.name ?? '').trim();
                const titleText = nm ? `${nm} · ${c.label}` : `${c.label} · #${index + 1}`;
                return (
                  <View key={c.id} style={L.objectCardWrap}>
                    <View
                      style={[
                        L.objectCard,
                        labelColor && { borderLeftColor: labelColor, borderLeftWidth: 4 },
                        on && { borderColor: appColors.accent },
                      ]}
                    >
                      <View style={L.objectCardHeader}>
                        <TouchableOpacity
                          style={{ flex: 1, minWidth: 0 }}
                          onPress={() => {
                            setSelectedId(c.id);
                            setFocusRequestId((n) => n + 1);
                          }}
                          activeOpacity={0.88}
                        >
                          <Text style={L.objectCardTitle} numberOfLines={2}>
                            {titleText}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={() => handleDeleteCuboid(c.id)}
                          disabled={status === 'submitted'}
                        >
                          <Ionicons name="trash-outline" size={16} color={appColors.textMuted} />
                        </TouchableOpacity>
                      </View>
                      <View style={rp.labelOptionsGrid}>
                        {chipLabels.map((lb) => {
                          const chipColor = resolveAnnotationLabelColor(lb, labelColorOverrides);
                          const act = c.label === lb;
                          return (
                            <TouchableOpacity
                              key={lb}
                              style={[
                                rp.labelOptionChip,
                                {
                                  borderColor: chipColor,
                                  backgroundColor: act ? chipColor : 'transparent',
                                },
                              ]}
                              onPress={() => {
                                setSelectedId(c.id);
                                updateCuboidById(c.id, { label: lb });
                                setActiveLabel(lb);
                              }}
                              disabled={status === 'submitted'}
                              activeOpacity={0.85}
                            >
                              <Text style={[rp.labelOptionText, { color: act ? '#fff' : appColors.text }]} numberOfLines={1}>
                                {lb}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            {selected ? (
              <View style={[rp.form, { borderTopColor: appColors.border }]}>
                <Text style={[rp.h, { color: appColors.text }]}>Details</Text>
                <View style={L.field}>
                <Text style={L.fieldL}>Object ID</Text>
                <Text
                  style={[L.inp, { fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }]}
                  selectable
                >
                  {selected.id}
                </Text>
              </View>
              <Text style={[L.fieldL, { marginTop: 4 }]}>Dimensions (L × W × H)</Text>
              <View style={layoutStyles.dimRow}>
                <View style={{ flex: 1 }}>
                  <Text style={L.fieldL}>L</Text>
                  <TextInput
                    style={[L.inp, layoutStyles.compactInp]}
                    keyboardType="decimal-pad"
                    placeholderTextColor={appColors.textSecondary}
                    value={String(selected.depth)}
                    onChangeText={(txt) => {
                      const v = parseFloat(txt.replace(',', '.'));
                      if (!Number.isFinite(v)) return;
                      updateCuboidById(selected.id, { depth: v });
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={L.fieldL}>W</Text>
                  <TextInput
                    style={[L.inp, layoutStyles.compactInp]}
                    keyboardType="decimal-pad"
                    placeholderTextColor={appColors.textSecondary}
                    value={String(selected.width)}
                    onChangeText={(txt) => {
                      const v = parseFloat(txt.replace(',', '.'));
                      if (!Number.isFinite(v)) return;
                      updateCuboidById(selected.id, { width: v });
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={L.fieldL}>H</Text>
                  <TextInput
                    style={[L.inp, layoutStyles.compactInp]}
                    keyboardType="decimal-pad"
                    placeholderTextColor={appColors.textSecondary}
                    value={String(selected.height)}
                    onChangeText={(txt) => {
                      const v = parseFloat(txt.replace(',', '.'));
                      if (!Number.isFinite(v)) return;
                      updateCuboidById(selected.id, { height: v });
                    }}
                  />
                </View>
              </View>
              <Text style={[L.fieldL, { marginTop: 8 }]}>Position (X Y Z)</Text>
              <View style={layoutStyles.dimRow}>
                <View style={{ flex: 1 }}>
                  <Text style={L.fieldL}>X</Text>
                  <TextInput
                    style={[L.inp, layoutStyles.compactInp]}
                    keyboardType="decimal-pad"
                    placeholderTextColor={appColors.textSecondary}
                    value={String(selected.cx)}
                    onChangeText={(txt) => {
                      const v = parseFloat(txt.replace(',', '.'));
                      if (!Number.isFinite(v)) return;
                      updateCuboidById(selected.id, { cx: v });
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={L.fieldL}>Y</Text>
                  <TextInput
                    style={[L.inp, layoutStyles.compactInp]}
                    keyboardType="decimal-pad"
                    placeholderTextColor={appColors.textSecondary}
                    value={String(selected.cy)}
                    onChangeText={(txt) => {
                      const v = parseFloat(txt.replace(',', '.'));
                      if (!Number.isFinite(v)) return;
                      updateCuboidById(selected.id, { cy: v });
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={L.fieldL}>Z</Text>
                  <TextInput
                    style={[L.inp, layoutStyles.compactInp]}
                    keyboardType="decimal-pad"
                    placeholderTextColor={appColors.textSecondary}
                    value={String(selected.cz)}
                    onChangeText={(txt) => {
                      const v = parseFloat(txt.replace(',', '.'));
                      if (!Number.isFinite(v)) return;
                      updateCuboidById(selected.id, { cz: v });
                    }}
                  />
                </View>
              </View>
              <View style={L.field}>
                <Text style={L.fieldL}>Yaw (deg)</Text>
                <TextInput
                  style={[L.inp, { paddingVertical: 8, fontSize: 13 }]}
                  keyboardType="decimal-pad"
                  placeholderTextColor={appColors.textSecondary}
                  value={String(((selected.yaw * 180) / Math.PI).toFixed(1))}
                  onChangeText={(txt) => {
                    const deg = parseFloat(txt.replace(',', '.'));
                    if (!Number.isFinite(deg)) return;
                    updateCuboidById(selected.id, { yaw: (deg * Math.PI) / 180 });
                  }}
                />
              </View>
                <View style={rp.rowActions}>
                  <TouchableOpacity
                    style={[rp.btnGhost, { borderColor: appColors.error }]}
                    onPress={() => handleDeleteCuboid(selected.id)}
                    disabled={status === 'submitted'}
                    activeOpacity={0.85}
                  >
                    <Text style={{ color: appColors.error, fontWeight: '600' }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </ScrollView>
          {status === 'submitted' ? (
            <View style={sidebarStyles.submittedBadgeCompact}>
              <Ionicons name="checkmark-circle" size={14} color="#fff" />
              <Text style={sidebarStyles.submittedText}>{t('tasks.submitted')}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {status !== 'submitted' ? (
        <View style={S.bottomButtonBar}>
          <View style={S.bottomLeftActions}>
            <TouchableOpacity style={S.exitButton} onPress={() => router.replace('/dashboard/lidar')} activeOpacity={0.8}>
              <Text style={S.exitButtonText}>Exit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[S.submitExitButton, saving && S.submitButtonDisabled]}
              onPress={() => void handleSubmitAndExit()}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={S.submitExitButtonText}>{saving ? '…' : 'Submit & exit'}</Text>
            </TouchableOpacity>
          </View>
          <View style={S.bottomRightActions}>
            <TouchableOpacity
              style={[S.submitExitButton, saving && S.submitButtonDisabled]}
              onPress={() => void handleSubmit()}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={S.submitExitButtonText}>{saving ? '…' : 'Submit'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Right panel list + form — aligned with `AnnotatorVideoRightPanel.web`. */

function createRpStyles(themeColors: AppColors) {
  return StyleSheet.create({
  scrollContent: { padding: 12, paddingBottom: 24 },
  /** Image / video right `ScrollView` — minimal horizontal padding (sidebar already has padding). */
  scrollContentSidebar: { flexGrow: 1, paddingBottom: 20, paddingTop: 4 },
  scrollContentGrow: { flexGrow: 1 },
  h: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  labelOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  labelOptionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
    maxWidth: '100%',
  },
  labelOptionText: {
    fontSize: 10,
    fontWeight: '500',
    flexShrink: 1,
  },
  colorStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 4,
    marginBottom: 6,
    gap: 10,
  },
  colorStripDot: { width: 12, height: 12, borderRadius: 6 },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 11, marginTop: 2 },
  form: { marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  rowActions: { marginTop: 14, flexDirection: 'row', gap: 8 },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
}
function createLidarWorkbenchLayoutStyles(c: AppColors) {
  return StyleSheet.create({
  topNavMetaCol: {
    flex: 1,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: 10,
    minWidth: 0,
    paddingRight: 8,
  },
  topNavGuideline: {
    flexShrink: 0,
  },
  railToolDisabled: { opacity: 0.42 },
  topNavRow: {
    flexWrap: 'nowrap' as const,
    alignItems: 'center' as const,
    gap: 10,
    minHeight: 48,
    paddingVertical: 2,
    paddingRight: 8,
  },
  topTitle: {
    flexShrink: 1,
    fontSize: 15,
    marginHorizontal: 4,
  },
  priceBadge: {
    backgroundColor: 'rgba(22, 101, 52, 0.12)',
    borderWidth: 1.5,
    borderColor: c.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  priceBadgeText: {
    color: c.success,
    fontSize: 12,
    fontWeight: '700',
  },
  frameLabel: {
    fontSize: 12,
    color: c.textMuted,
    marginRight: 4,
  },
  dimRow: {
    flexDirection: 'row' as const,
    gap: 6,
    marginBottom: 8,
  },
  compactInp: {
    paddingVertical: 6,
    fontSize: 12,
  },
  viewportSplit: {
    flexDirection: 'column' as const,
    flex: 1,
    minHeight: 0,
    alignSelf: 'stretch' as const,
  },
  viewportSquareFill: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%' as const,
    height: '100%' as const,
  },
  viewerSlotMeasure: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    flexDirection: 'row' as const,
    justifyContent: 'flex-end' as const,
    alignItems: 'center' as const,
  },
  mainWorkspaceRow: {
    flex: 1,
    flexDirection: 'row' as const,
    minWidth: 0,
    minHeight: 0,
  },
  lidarToolsStrip: {
    flexGrow: 0,
    flexShrink: 0,
    width: LEFT_RAIL_W,
    minWidth: LEFT_RAIL_W,
    maxWidth: LEFT_RAIL_W,
    alignSelf: 'stretch' as const,
    backgroundColor: c.bg,
    borderRightWidth: 1,
    borderRightColor: c.border,
  },
  squareViewerFrame: {
    borderRadius: 10,
    overflow: 'hidden' as const,
    borderWidth: 1.5,
    borderColor: c.accent,
    backgroundColor: c.bg,
  },
  threePanelSquareInner: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden' as const,
  },
  threePanel: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    borderRadius: 8,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: c.border,
    borderStyle: 'solid' as const,
  },
});
}
