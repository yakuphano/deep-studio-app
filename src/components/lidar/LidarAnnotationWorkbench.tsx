import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { resolveTaskImageUrl } from '@/lib/audioUrl';
import { bevImageUrlToPointCloud, syntheticUrbanStrip } from '@/lib/lidar/bevImageToPointCloud';
import LidarThreeView from '@/components/lidar/LidarThreeView';
import type { LidarThreeTool } from '@/components/lidar/types';
import { createEmptyLidarCuboid, type LidarCuboidAnnotation } from '@/types/lidarAnnotation';

const LABELS = ['Car', 'Truck', 'Pedestrian', 'Cyclist', 'Sign', 'Other'] as const;

const RAIL_TOOLS: { id: LidarThreeTool; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { id: 'orbit', label: 'Rotate', icon: 'sync-outline' },
  { id: 'select', label: 'Select', icon: 'hand-left-outline' },
  { id: 'add', label: 'Add box', icon: 'cube-outline' },
  { id: 'move', label: 'Move', icon: 'move-outline' },
  { id: 'scale', label: 'Resize', icon: 'options-outline' },
];

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

export default function LidarAnnotationWorkbench() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState(0);
  const [status, setStatus] = useState<string>('pending');
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [positions, setPositions] = useState<Float32Array>(() => syntheticUrbanStrip().positions);
  const [colors, setColors] = useState<Float32Array>(() => syntheticUrbanStrip().colors);
  const [cuboids, setCuboids] = useState<LidarCuboidAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<LidarThreeTool>('orbit');
  const [activeLabel, setActiveLabel] = useState<string>('Car');

  const selected = useMemo(
    () => cuboids.find((c) => c.id === selectedId) ?? null,
    [cuboids, selectedId]
  );

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
      setPrice(Number(data.price) || 0);
      setStatus(String(data.status ?? 'pending'));
      const raw = data.image_url ?? data.imageUrl ?? null;
      setImageUrl(raw ? String(raw) : null);
      const ad = data.annotation_data;
      if (isCuboidList(ad)) {
        setCuboids(ad);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!imageUrl || Platform.OS !== 'web') return;
    let cancelled = false;
    const resolved = resolveTaskImageUrl(imageUrl.trim()) ?? imageUrl.trim();
    (async () => {
      try {
        const { positions: p, colors: c } = await bevImageUrlToPointCloud(resolved);
        if (!cancelled) {
          setPositions(p);
          setColors(c);
        }
      } catch {
        if (!cancelled) {
          const s = syntheticUrbanStrip();
          setPositions(s.positions);
          setColors(s.colors);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const updateSelected = useCallback(
    (patch: Partial<LidarCuboidAnnotation>) => {
      if (!selectedId) return;
      setCuboids((prev) => prev.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)));
    },
    [selectedId]
  );

  const updateCuboidById = useCallback((cuboidId: string, patch: Partial<LidarCuboidAnnotation>) => {
    setCuboids((prev) => prev.map((c) => (c.id === cuboidId ? { ...c, ...patch } : c)));
  }, []);

  const handleCuboidTransform = useCallback((cuboidId: string, patch: Partial<LidarCuboidAnnotation>) => {
    updateCuboidById(cuboidId, patch);
  }, [updateCuboidById]);

  const handleAddCuboid = useCallback(
    (x: number, z: number) => {
      const base = createEmptyLidarCuboid(activeLabel);
      base.cx = x;
      base.cz = z;
      base.cy = base.height / 2;
      setCuboids((prev) => [...prev, base]);
      setSelectedId(base.id);
    },
    [activeLabel]
  );

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    setCuboids((prev) => prev.filter((c) => c.id !== selectedId));
    setSelectedId(null);
  }, [selectedId]);

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

  /** Submit annotation and stay on this screen. */
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

  /** Submit and return to the LiDAR task list. */
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.muted}>Loading LiDAR task…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.replace('/dashboard/lidar')}>
          <Ionicons name="arrow-back" size={20} color="#fdba74" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          LiDAR — {title || 'Task'}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {price} TRY
          </Text>
        </View>
      </View>

      <View style={styles.bodyLayout}>
        <View style={styles.leftRail}>
          <ScrollView
            style={styles.leftRailScroll}
            contentContainerStyle={styles.leftRailContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {RAIL_TOOLS.map(({ id: tid, label, icon }) => (
              <TouchableOpacity
                key={tid}
                style={[styles.railToolBtn, tool === tid && styles.railToolBtnOn]}
                onPress={() => setTool(tid)}
                activeOpacity={0.85}
              >
                <Ionicons name={icon} size={18} color={tool === tid ? '#fdba74' : '#e2e8f0'} />
                <Text style={[styles.railToolTxt, tool === tid && styles.railToolTxtOn]} numberOfLines={2}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
            <View style={styles.railDivider} />
            <Text style={styles.railSectionLabel}>Class</Text>
            {LABELS.map((lb) => (
              <TouchableOpacity
                key={lb}
                style={[styles.railChip, activeLabel === lb && styles.railChipOn]}
                onPress={() => setActiveLabel(lb)}
                activeOpacity={0.85}
              >
                <Text style={[styles.railChipTxt, activeLabel === lb && styles.railChipTxtOn]} numberOfLines={1}>
                  {lb}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.viewport}>
          <LidarThreeView
            positions={positions}
            colors={colors}
            cuboids={cuboids}
            selectedId={selectedId}
            tool={tool}
            onSelectCuboid={setSelectedId}
            onAddCuboid={handleAddCuboid}
            onCuboidTransform={handleCuboidTransform}
          />
        </View>

        <ScrollView style={styles.side} keyboardShouldPersistTaps="handled">
          <Text style={styles.sideTitle}>3D boxes</Text>
          <Text style={styles.sideHint}>Set a display name per object (optional).</Text>
          {cuboids.length === 0 ? (
            <Text style={styles.muted}>
              No cuboids yet. Choose &quot;Add box&quot; and click on the ground plane.
            </Text>
          ) : (
            cuboids.map((c, index) => (
              <View
                key={c.id}
                style={[styles.rowItem, selectedId === c.id && styles.rowItemOn]}
              >
                <View style={styles.rowItemTop}>
                  <Text style={styles.rowItemClassTag}>{c.label}</Text>
                  <TouchableOpacity onPress={() => setSelectedId(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.rowSelectLink}>{selectedId === c.id ? 'Selected' : 'Select'}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.rowNameInput}
                  value={c.name ?? ''}
                  onChangeText={(txt) => updateCuboidById(c.id, { name: txt })}
                  onFocus={() => setSelectedId(c.id)}
                  placeholder={c.name?.trim() ? '' : `${c.label} #${index + 1}`}
                  placeholderTextColor="#64748b"
                />
              </View>
            ))
          )}

          {selected ? (
            <View style={styles.form}>
              <Text style={styles.formTitle}>Selected cuboid</Text>
              <View style={styles.field}>
                <Text style={styles.fieldL}>Name (optional)</Text>
                <TextInput
                  style={styles.inp}
                  placeholder="e.g. Lead vehicle"
                  placeholderTextColor="#64748b"
                  value={selected.name ?? ''}
                  onChangeText={(txt) => updateCuboidById(selected.id, { name: txt })}
                />
              </View>
              {(
                [
                  ['cx', 'Center X'],
                  ['cy', 'Center Y'],
                  ['cz', 'Center Z'],
                  ['width', 'Width (X)'],
                  ['height', 'Height (Y)'],
                  ['depth', 'Depth (Z)'],
                ] as const
              ).map(([key, lab]) => (
                <View key={key} style={styles.field}>
                  <Text style={styles.fieldL}>{lab}</Text>
                  <TextInput
                    style={styles.inp}
                    keyboardType="decimal-pad"
                    value={String(selected[key as keyof LidarCuboidAnnotation] ?? '')}
                    onChangeText={(txt) => {
                      const v = parseFloat(txt.replace(',', '.'));
                      if (!Number.isFinite(v)) return;
                      updateSelected({ [key]: v } as Partial<LidarCuboidAnnotation>);
                    }}
                  />
                </View>
              ))}
              <View style={styles.field}>
                <Text style={styles.fieldL}>Yaw (degrees)</Text>
                <TextInput
                  style={styles.inp}
                  keyboardType="decimal-pad"
                  value={String(((selected.yaw * 180) / Math.PI).toFixed(1))}
                  onChangeText={(txt) => {
                    const deg = parseFloat(txt.replace(',', '.'));
                    if (!Number.isFinite(deg)) return;
                    updateSelected({ yaw: (deg * Math.PI) / 180 });
                  }}
                />
              </View>
              <TouchableOpacity style={styles.delBtn} onPress={handleDelete}>
                <Text style={styles.delTxt}>Delete cuboid</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </View>

      {status !== 'submitted' ? (
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            <TouchableOpacity style={styles.exitButton} onPress={() => router.replace('/dashboard/lidar')}>
              <Text style={styles.exitButtonText}>Exit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnBlue}
              onPress={() => void handleSubmitAndExit()}
              disabled={saving}
            >
              <Text style={styles.btnBlueTxt}>{saving ? '…' : 'Submit and exit'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.btnOk} onPress={() => void handleSubmit()} disabled={saving}>
            <Text style={styles.btnOkTxt}>{saving ? '…' : 'Submit'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.submitted}>
          <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
          <Text style={styles.submittedTxt}>Submitted</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  muted: { color: '#94a3b8', fontSize: 13 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { color: '#fdba74', fontWeight: '600' },
  headerTitle: { flex: 1, color: '#f8fafc', fontWeight: '700', fontSize: 16 },
  badge: { backgroundColor: 'rgba(34,197,94,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { color: '#22c55e', fontWeight: '700', fontSize: 12 },
  bodyLayout: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
  },
  leftRail: {
    width: 96,
    flexShrink: 0,
    backgroundColor: '#0f172a',
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  leftRailScroll: { flex: 1 },
  leftRailContent: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'stretch',
    gap: 6,
    paddingBottom: 16,
  },
  railToolBtn: {
    minHeight: 52,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 2,
  },
  railToolBtnOn: {
    borderColor: '#f97316',
    backgroundColor: 'rgba(249,115,22,0.15)',
  },
  railToolTxt: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 9,
    textAlign: 'center',
  },
  railToolTxtOn: { color: '#fdba74' },
  railDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 6,
    alignSelf: 'stretch',
  },
  railSectionLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  railChip: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  railChipOn: {
    borderColor: '#f97316',
    backgroundColor: 'rgba(249,115,22,0.12)',
  },
  railChipTxt: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  railChipTxtOn: { color: '#fdba74' },
  viewport: { flex: 1, minWidth: 0, minHeight: 400 },
  side: { width: 216, flexShrink: 0, borderLeftWidth: 1, borderLeftColor: '#334155', padding: 10 },
  sideTitle: { color: '#f8fafc', fontWeight: '700', marginBottom: 4 },
  sideHint: { color: '#64748b', fontSize: 11, marginBottom: 10 },
  rowItem: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  rowItemOn: { borderColor: '#f97316' },
  rowItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rowItemClassTag: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  rowSelectLink: { color: '#38bdf8', fontSize: 11, fontWeight: '600' },
  rowNameInput: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    color: '#f8fafc',
    fontSize: 13,
  },
  form: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155' },
  formTitle: { color: '#f8fafc', fontWeight: '700', marginBottom: 10 },
  field: { marginBottom: 10 },
  fieldL: { color: '#94a3b8', fontSize: 11, marginBottom: 4 },
  inp: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 10,
    color: '#f8fafc',
    fontSize: 14,
  },
  delBtn: { marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.15)' },
  delTxt: { color: '#f87171', textAlign: 'center', fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  footerLeft: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, flex: 1 },
  exitButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  exitButtonText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },
  btnBlue: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  btnBlueTxt: { color: '#fff', fontWeight: '700' },
  btnOk: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#22c55e',
    flexShrink: 0,
  },
  btnOkTxt: { color: '#fff', fontWeight: '700' },
  submitted: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  submittedTxt: { color: '#22c55e', fontWeight: '700' },
});
