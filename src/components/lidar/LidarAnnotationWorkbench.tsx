import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
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
import {
  createVideoProWorkbenchStyles,
  desktopWorkbenchDark,
  desktopWorkbenchLight,
} from '@/theme/videoProWorkbenchTheme';
import { createLidarAnnotationLayoutStyles } from '@/theme/lidarAnnotationLayout';

const LABELS = ['Car', 'Truck', 'Pedestrian', 'Cyclist', 'Sign', 'Other'] as const;

const RAIL_TOOLS: {
  id: LidarThreeTool;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  key: string;
}[] = [
  { id: 'orbit', label: 'Rotate', icon: 'sync-outline', key: 'R' },
  { id: 'select', label: 'Select', icon: 'hand-left-outline', key: 'V' },
  { id: 'add', label: 'Add box', icon: 'cube-outline', key: 'B' },
  { id: 'move', label: 'Move', icon: 'move-outline', key: 'M' },
  { id: 'scale', label: 'Resize', icon: 'options-outline', key: 'S' },
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

  const [lightMode, setLightMode] = useState(false);
  const themeColors = lightMode ? desktopWorkbenchLight : desktopWorkbenchDark;
  const S = useMemo(() => createVideoProWorkbenchStyles(themeColors), [lightMode]);
  const L = useMemo(() => createLidarAnnotationLayoutStyles(themeColors), [lightMode]);

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

  const shortTaskId = id && id.length > 12 ? `${id.slice(0, 8)}…` : id ?? '—';
  const assignedUser = user?.email?.split('@')[0] ?? user?.id?.slice(0, 8) ?? '—';
  const progressPct = useMemo(
    () => Math.min(100, Math.round(cuboids.length * 8 + (cuboids.length > 0 ? 12 : 0))),
    [cuboids.length]
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
        const { positions: p, colors: col } = await bevImageUrlToPointCloud(resolved);
        if (!cancelled) {
          setPositions(p);
          setColors(col);
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

  const handleCuboidTransform = useCallback(
    (cuboidId: string, patch: Partial<LidarCuboidAnnotation>) => {
      updateCuboidById(cuboidId, patch);
    },
    [updateCuboidById]
  );

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

  const handleSaveDraft = useCallback(async () => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          annotation_data: cuboids,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      if (Platform.OS === 'web') window.alert('Draft saved.');
      else Alert.alert('Saved', 'Draft saved.');
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (Platform.OS === 'web') window.alert(m);
      else Alert.alert('Error', m);
    } finally {
      setSaving(false);
    }
  }, [id, user?.id, cuboids]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el?.closest?.('input, textarea, select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void handleSaveDraft();
        return;
      }
      if (!e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        const map: Record<string, LidarThreeTool> = {
          r: 'orbit',
          v: 'select',
          b: 'add',
          m: 'move',
          s: 'scale',
        };
        const t = map[k];
        if (t) {
          e.preventDefault();
          setTool(t);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSaveDraft]);

  const exportCuboidsJson = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([JSON.stringify(cuboids, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `lidar-cuboids-${id ?? 'task'}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    Alert.alert('Export', 'JSON export is available in the web browser.');
  }, [cuboids, id]);

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
        <ActivityIndicator size="large" color={themeColors.accent} />
        <Text style={L.muted}>Loading LiDAR task…</Text>
      </View>
    );
  }

  return (
    <View style={S.root}>
      <View style={S.topNav}>
        <TouchableOpacity
          style={S.topNavBack}
          onPress={() => router.replace('/dashboard/lidar')}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={18} color={themeColors.accent} />
          <Text style={S.topNavBackText}>Back</Text>
        </TouchableOpacity>
        <View style={S.topNavMeta}>
          <Text style={S.topNavMetaStrong} numberOfLines={1}>
            {title || 'LiDAR task'}
          </Text>
          <Text style={S.topNavMetaLine} numberOfLines={1}>
            LiDAR · BEV point cloud · ID {shortTaskId}
          </Text>
          <Text style={S.topNavMetaLine}>
            Objects: {cuboids.length} · Tool: {tool}
          </Text>
        </View>
        <View style={S.topNavActions}>
          <View style={L.priceBadge}>
            <Text style={L.priceBadgeText}>{price} TRY</Text>
          </View>
          <TouchableOpacity
            style={S.topNavActionBtn}
            onPress={() => void handleSaveDraft()}
            disabled={saving || status === 'submitted'}
            activeOpacity={0.85}
            {...(Platform.OS === 'web' ? ({ title: 'Save draft (Ctrl+S)' } as object) : {})}
          >
            <Ionicons name="save-outline" size={16} color={themeColors.accent} />
            <Text style={S.topNavActionLabel}>Save</Text>
            <Text style={S.topNavActionHint}>⌃S</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={S.topNavActionBtn}
            onPress={exportCuboidsJson}
            activeOpacity={0.85}
            {...(Platform.OS === 'web' ? ({ title: 'Export cuboids JSON' } as object) : {})}
          >
            <Ionicons name="download-outline" size={16} color={themeColors.text} />
            <Text style={S.topNavActionLabel}>Export</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={S.topNavActionBtn}
            onPress={() => setLightMode((v) => !v)}
            activeOpacity={0.85}
            {...(Platform.OS === 'web' ? ({ title: 'Toggle theme' } as object) : {})}
          >
            <Ionicons name={lightMode ? 'moon-outline' : 'sunny-outline'} size={16} color={themeColors.text} />
            <Text style={S.topNavActionLabel}>Theme</Text>
          </TouchableOpacity>
        </View>
        <View style={S.topNavStatus}>
          <Text style={S.topNavStatusLine}>Progress: {progressPct}%</Text>
          <Text style={S.topNavStatusLine}>Assigned: {assignedUser}</Text>
          <Text style={S.topNavStatusLine}>Status: Synced</Text>
        </View>
      </View>

      <View style={S.mainRow}>
        <ScrollView
          style={S.leftToolRail}
          contentContainerStyle={S.leftToolRailContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {RAIL_TOOLS.map(({ id: tid, label, icon, key }) => (
            <TouchableOpacity
              key={tid}
              style={[L.railToolTall, tool === tid && L.railToolTallOn]}
              onPress={() => setTool(tid)}
              activeOpacity={0.85}
              {...(Platform.OS === 'web' ? ({ title: `${label} (${key})` } as object) : {})}
            >
              <Ionicons name={icon} size={18} color={tool === tid ? themeColors.accent : themeColors.text} />
              <Text style={[L.railToolTxt, tool === tid && L.railToolTxtOn]} numberOfLines={2}>
                {label}
              </Text>
              <Text style={S.toolKeyHint}>{key}</Text>
            </TouchableOpacity>
          ))}
          <View style={L.railDivider} />
          <Text style={L.railSectionLabel}>Class</Text>
          {LABELS.map((lb) => (
            <TouchableOpacity
              key={lb}
              style={[L.railChip, activeLabel === lb && L.railChipOn]}
              onPress={() => setActiveLabel(lb)}
              activeOpacity={0.85}
            >
              <Text style={[L.railChipTxt, activeLabel === lb && L.railChipTxtOn]} numberOfLines={1}>
                {lb}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={L.viewport}>
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

        <ScrollView
          style={S.rightPanel}
          contentContainerStyle={L.sideScroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={L.sideTitle}>3D boxes</Text>
          <Text style={L.sideHint}>Optional display name per object.</Text>
          {cuboids.length === 0 ? (
            <Text style={L.muted}>
              No cuboids yet. Choose &quot;Add box&quot; and click on the ground plane.
            </Text>
          ) : (
            cuboids.map((c, index) => (
              <View key={c.id} style={[L.rowItem, selectedId === c.id && L.rowItemOn]}>
                <View style={L.rowItemTop}>
                  <Text style={L.rowItemClassTag}>{c.label}</Text>
                  <TouchableOpacity
                    onPress={() => setSelectedId(c.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={L.rowSelectLink}>{selectedId === c.id ? 'Selected' : 'Select'}</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={L.rowNameInput}
                  value={c.name ?? ''}
                  onChangeText={(txt) => updateCuboidById(c.id, { name: txt })}
                  onFocus={() => setSelectedId(c.id)}
                  placeholder={c.name?.trim() ? '' : `${c.label} #${index + 1}`}
                  placeholderTextColor={themeColors.textSoft}
                />
              </View>
            ))
          )}

          {selected ? (
            <View style={L.form}>
              <Text style={L.formTitle}>Selected cuboid</Text>
              <View style={L.field}>
                <Text style={L.fieldL}>Name (optional)</Text>
                <TextInput
                  style={L.inp}
                  placeholder="e.g. Lead vehicle"
                  placeholderTextColor={themeColors.textSoft}
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
                <View key={key} style={L.field}>
                  <Text style={L.fieldL}>{lab}</Text>
                  <TextInput
                    style={L.inp}
                    keyboardType="decimal-pad"
                    placeholderTextColor={themeColors.textSoft}
                    value={String(selected[key as keyof LidarCuboidAnnotation] ?? '')}
                    onChangeText={(txt) => {
                      const v = parseFloat(txt.replace(',', '.'));
                      if (!Number.isFinite(v)) return;
                      updateSelected({ [key]: v } as Partial<LidarCuboidAnnotation>);
                    }}
                  />
                </View>
              ))}
              <View style={L.field}>
                <Text style={L.fieldL}>Yaw (degrees)</Text>
                <TextInput
                  style={L.inp}
                  keyboardType="decimal-pad"
                  placeholderTextColor={themeColors.textSoft}
                  value={String(((selected.yaw * 180) / Math.PI).toFixed(1))}
                  onChangeText={(txt) => {
                    const deg = parseFloat(txt.replace(',', '.'));
                    if (!Number.isFinite(deg)) return;
                    updateSelected({ yaw: (deg * Math.PI) / 180 });
                  }}
                />
              </View>
              <TouchableOpacity style={L.delBtn} onPress={handleDelete}>
                <Text style={L.delTxt}>Delete cuboid</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
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
              style={[S.submitButtonGreen, saving && S.submitButtonDisabled]}
              onPress={() => void handleSubmit()}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={S.submitButtonGreenText}>{saving ? '…' : 'Submit'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={L.submitted}>
          <Ionicons name="checkmark-circle" size={20} color="#43A047" />
          <Text style={L.submittedTxt}>Submitted</Text>
        </View>
      )}
    </View>
  );
}
