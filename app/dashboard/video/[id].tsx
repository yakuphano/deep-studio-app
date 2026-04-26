import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, TextInput, Pressable, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { triggerEarningsRefresh } from '@/lib/earningsRefresh';
import { useAuth } from '@/contexts/AuthContext';
import AnnotationCanvas, { type Annotation, type Tool } from '@/components/AnnotationCanvas';
import {
  ANNOTATION_LABELS,
  mergeAnnotationChipLabels,
  resolveAnnotationLabelColor,
  customLabelDefinitionsToMap,
  type CustomLabelDefinition,
} from '@/constants/annotationLabels';
import { WorkbenchObjectListChrome } from '@/components/workbench/WorkbenchObjectListChrome';
import VideoProWorkbench from '@/components/video-workbench/VideoProWorkbench';

interface TaskData {
  id: string;
  title: string;
  status?: string;
  price?: number | null;
  type?: 'audio' | 'image' | 'video' | string | null;
  category?: string | null;
  audio_url?: string;
  image_url?: string | null;
  video_url?: string | null;
  file_url?: string | null;
  transcription?: string;
  annotation_data?: unknown;
  language?: string | null;
}

export default function VideoTaskDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user, session, signOut, isAdmin } = useAuth();
  const [task, setTask] = useState<TaskData | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeTool, setActiveTool] = useState<'pan' | 'select' | 'bbox' | 'polygon' | 'points' | 'ellipse' | 'cuboid' | 'polyline' | 'semantic' | 'brush' | 'magic_wand'>('pan');
  const canvasTool: Tool = activeTool as Tool;
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [isBrushActive, setIsBrushActive] = useState(false);
  const [extraLabelDefinitions, setExtraLabelDefinitions] = useState<CustomLabelDefinition[]>([]);
  const canvasRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  const audioUrl = task?.audio_url;
  const imageUrl = task?.image_url;
  const videoUrl = task?.video_url;

  const isSubmitted = task?.status === 'submitted';

  /** Must match the branch that shows the video editor (includes tasks with video_url but non-video type). */
  const taskType: 'audio' | 'image' | 'video' = (() => {
    const hasVideoUrl = !!task?.video_url;
    const hasImageUrl = !!task?.image_url;
    const typeIsVideo = task?.type === 'video';
    const typeIsImage = task?.type === 'image';
    const categoryIsVideo = (task?.category ?? '').toLowerCase() === 'video';
    const categoryIsImage = (task?.category ?? '').toLowerCase() === 'image';

    if (hasVideoUrl || typeIsVideo || categoryIsVideo) return 'video';
    if (hasImageUrl || typeIsImage || categoryIsImage) return 'image';
    return 'audio';
  })();

  const isVideoTask = taskType === 'video';

  useEffect(() => {
    if (!id) return;
    const fetchTask = async () => {
      const taskId = String(id);
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .maybeSingle();
      if (error) {
        console.log('Detay Hatası:', error);
        if (typeof window !== 'undefined') {
          window.alert('Supabase Detay Hatası: ' + error.message);
        } else {
          Alert.alert('Hata', 'Supabase Detay Hatası: ' + error.message);
        }
        setLoading(false);
        return;
      }
      if (!data) {
        const msg =
          'Görev bulunamadı. Silinmiş olabilir, ID yanlış veya bu hesabın görmeye yetkisi olmayabilir.';
        if (typeof window !== 'undefined') {
          window.alert(msg);
        } else {
          Alert.alert('Hata', msg);
        }
        setLoading(false);
        return;
      }
      const cat = (data.category ?? '').toString().toLowerCase();
      const taskData: TaskData = {
        id: String(data.id),
        title: String(data.title ?? '') || 'İsimsiz Görev',
        status: data.status ?? 'pending',
        price: data.price != null ? Number(data.price) : 0,
        type: (data.type ?? (cat === 'video' ? 'video' : 'audio')) as 'audio' | 'image' | 'video',
        category: data.category ?? null,
        audio_url: data.audio_url ?? data.audioUrl,
        image_url: data.image_url ?? data.imageUrl ?? null,
        video_url: data.video_url ?? data.videoUrl ?? null,
        file_url: data.file_url ?? null,
        transcription: data.transcription ?? '',
        annotation_data: data.annotation_data ?? null,
        language: data.language ?? null,
      };

      setTask(taskData);
      if (Array.isArray(taskData.annotation_data)) {
        setAnnotations(taskData.annotation_data as Annotation[]);
      }
      setLoading(false);
    };
    fetchTask();
  }, [id]);

  useEffect(() => {
    if (!isWeb || loading || !task?.id || !isVideoTask) return;
    router.replace(`/(tabs)/video-annotation?id=${encodeURIComponent(String(task.id))}` as any);
  }, [isWeb, loading, task?.id, isVideoTask, router, task]);

  const handleSaveDraft = useCallback(async () => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          annotation_data: annotations,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      if (typeof window !== 'undefined') {
        window.alert(t('taskDetail.saveSuccess') || 'Kaydedildi');
      } else {
        Alert.alert(t('taskDetail.successTitle') || 'Başarılı', t('taskDetail.saveSuccess') || 'Kaydedildi');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (typeof window !== 'undefined') {
        window.alert(t('login.errorTitle') + ': ' + errorMessage);
      } else {
        Alert.alert(t('login.errorTitle'), errorMessage);
      }
    } finally {
      setSaving(false);
    }
  }, [id, user?.id, annotations, t]);

  const handleSubmit = useCallback(async (navigateToNext: boolean = false) => {
    if (!id || !user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'submitted',
          annotation_data: annotations,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      setTask((prev) => (prev ? { ...prev, status: 'submitted' } : null));
      triggerEarningsRefresh();

      if (navigateToNext) {
        const { data: claimedTask, error: claimError } = await supabase
          .from('tasks')
          .update({ 
            assigned_to: user.id, 
            is_pool_task: false 
          })
          .is('assigned_to', null)
          .is('is_pool_task', true)
          .neq('status', 'submitted')
          .neq('status', 'completed')
          .neq('id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .select('id')
          .maybeSingle();

        if (claimError) throw claimError;

        if (claimedTask) {
          router.replace(`/task/${claimedTask.id}`);
        } else {
          router.replace('/dashboard');
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (typeof window !== 'undefined') {
        window.alert(t('login.errorTitle') + ': ' + errorMessage);
      } else {
        Alert.alert(t('login.errorTitle'), errorMessage);
      }
    } finally {
      setSaving(false);
    }
  }, [id, user?.id, annotations, t, router]);

  const handleSubmitAndExit = () => handleSubmit(false);
  const handleSubmitNext = () => handleSubmit(true);
  const handleExit = () => {
    try {
      router.back();
    } catch (_) {}
  };

  const handleDeleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
  }, [selectedAnnotationId]);

  const handleUpdateAnnotationLabel = useCallback((id: string, label: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, label } : a));
  }, []);

  const builtInLabelSet = useMemo(
    () => new Set<string>(ANNOTATION_LABELS as unknown as string[]),
    []
  );

  const handleAddExtraLabelOption = useCallback(
    (raw: string, color: string) => {
      const label = raw.trim();
      if (!label || builtInLabelSet.has(label)) return;
      const c = String(color ?? '').trim();
      setExtraLabelDefinitions((prev) => {
        const i = prev.findIndex((d) => d.label === label);
        if (i >= 0) {
          const next = [...prev];
          next[i] = { label, color: c };
          return next;
        }
        return [...prev, { label, color: c }];
      });
    },
    [builtInLabelSet]
  );

  const handleRemoveExtraLabelOption = useCallback((label: string) => {
    setExtraLabelDefinitions((prev) => prev.filter((d) => d.label !== label));
    setAnnotations((prev) =>
      prev.map((a) => {
        const cur =
          typeof a.label === 'object' && a.label !== null
            ? String((a.label as any).name ?? (a.label as any).label ?? '')
            : String(a.label ?? '');
        return cur === label ? { ...a, label: 'Other' } : a;
      })
    );
  }, []);

  const chipLabels = useMemo(
    () => mergeAnnotationChipLabels(extraLabelDefinitions.map((d) => d.label)),
    [extraLabelDefinitions]
  );

  const labelColorOverrides = useMemo(
    () => customLabelDefinitionsToMap(extraLabelDefinitions),
    [extraLabelDefinitions]
  );

  const getObjectDisplayName = (a: Annotation, idx: number) => {
    const labelStr = typeof a.label === 'object' ? (a.label as any).name || (a.label as any).label : a.label;
    return labelStr || `${a.type} ${idx + 1}`;
  };

  const getAnnotationTypeName = (type: string) => {
    const names = {
      bbox: 'Bounding Box',
      polygon: 'Polygon',
      points: 'Points',
      ellipse: 'Ellipse',
      cuboid: 'Cuboid',
      polyline: 'Polyline',
      semantic: 'Semantic',
      brush: 'Brush'
    };
    return names[type] || type;
  };

  const taskTypeLabel = (() => {
    const cat = (task?.category ?? '').toString().toLowerCase();
    const typ = (task?.type ?? '').toString().toLowerCase();
    if (cat.includes('polygon') || typ.includes('polygon')) return t('annotation.polygonAnnotation');
    if (cat.includes('bbox') || cat.includes('box') || typ.includes('bbox') || typ.includes('box')) return t('annotation.boundingBox');
    return task?.type === 'video' ? t('annotation.videoAnnotation') : t('annotation.annotation');
  })();

  // Loading guard
  if (loading || !task) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Görev yükleniyor...</Text>
      </View>
    );
  }

  if (isWeb && isVideoTask && id) {
    return <VideoProWorkbench taskId={id} />;
  }

  if (taskType === 'video') {
    return (
      <View style={[styles.container, isWeb && styles.containerFullWidth]}>
        {/* Task Info Overlay */}
        <View style={styles.taskInfoBar}>
          <Text style={styles.taskInfoType}>{taskTypeLabel}</Text>
          <View style={styles.taskInfoPriceBadge}>
            <Text style={styles.taskInfoPriceText}>{task?.price ?? 0} TL</Text>
          </View>
        </View>
        <View style={styles.annotationLayout}>
          {/* Left Toolbar */}
          <View style={styles.leftToolbarCol}>
            {/* Pan Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'pan' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { 
                try {
                  setActiveTool('pan'); 
                  setIsBrushActive(false); 
                } catch (e) {
                  console.error('Pan tool error:', e);
                }
              }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Pan (G)', title: 'Pan (G)' } as any : {})}
            >
              <Ionicons name="hand-right-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Pan</Text>
            </TouchableOpacity>
            
            {/* Undo Button */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, styles.toolBtnLarge]}
              onPress={() => {
                try {
                  if (canvasRef.current?.handleUndo) {
                    canvasRef.current.handleUndo();
                  } else {
                    if (annotations && annotations.length > 0) {
                      setAnnotations(prev => prev.slice(0, -1));
                    }
                  }
                } catch (e) {
                  console.error('Undo tool error:', e);
                }
              }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Undo (V)', title: 'Undo (V)' } as any : {})}
            >
              <Ionicons name="arrow-undo-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Undo (V)</Text>
            </TouchableOpacity>
            
            {/* Bounding Box Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'bbox' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { 
                try {
                  setActiveTool('bbox'); 
                  setIsBrushActive(false); 
                } catch (e) {
                  console.error('Bounding Box tool error:', e);
                }
              }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Bounding Box (R)', title: 'Bounding Box (R)' } as any : {})}
            >
              <Ionicons name="square-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Bounding Box (R)</Text>
            </TouchableOpacity>
            
            {/* Polygon Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'polygon' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { 
                try {
                  setActiveTool('polygon'); 
                  setIsBrushActive(false); 
                } catch (e) {
                  console.error('Polygon tool error:', e);
                }
              }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Polygon (P)', title: 'Polygon (P)' } as any : {})}
            >
              <Ionicons name="git-merge-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Polygon (P)</Text>
            </TouchableOpacity>
            
            {/* Points Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'points' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { 
                try {
                  setActiveTool('points'); 
                  setIsBrushActive(false); 
                } catch (e) {
                  console.error('Points tool error:', e);
                }
              }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Points (N)', title: 'Points (N)' } as any : {})}
            >
              <Ionicons name="radio-button-off-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Points (N)</Text>
            </TouchableOpacity>
            
            {/* Ellipse Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'ellipse' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('ellipse'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Ellipse', title: 'Ellipse' } as any : {})}
            >
              <Ionicons name="ellipse-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Ellipse</Text>
            </TouchableOpacity>
            
            {/* Cuboid Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'cuboid' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('cuboid'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Cuboid', title: 'Cuboid' } as any : {})}
            >
              <Ionicons name="cube-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Cuboid</Text>
            </TouchableOpacity>
            
            {/* Polyline Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'polyline' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('polyline'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Polyline', title: 'Polyline' } as any : {})}
            >
              <Ionicons name="create-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Polyline</Text>
            </TouchableOpacity>
            
            {/* Semantic Segmentation Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'semantic' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('semantic'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Semantic Segmentation', title: 'Semantic Segmentation' } as any : {})}
            >
              <Ionicons name="color-filter-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Semantic</Text>
            </TouchableOpacity>
            
            {/* Brush Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'brush' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('brush'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Brush', title: 'Brush' } as any : {})}
            >
              <Ionicons name="brush-outline" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Brush</Text>
            </TouchableOpacity>
            
            {/* Magic Wand Tool */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, activeTool === 'magic_wand' && !isBrushActive && styles.toolBtnActivePurple]}
              onPress={() => { setActiveTool('magic_wand'); setIsBrushActive(false); }}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Magic Wand', title: 'Magic Wand' } as any : {})}
            >
              <Ionicons name="sparkles" size={20} color="#f1f5f9" />
              <Text style={styles.toolBtnLargeText}>Magic Wand</Text>
            </TouchableOpacity>
            
            {/* Delete Button */}
            <TouchableOpacity
              style={[styles.toolBtnLarge, styles.deleteToolBtn]}
              onPress={() => selectedAnnotationId && handleDeleteAnnotation(selectedAnnotationId)}
              activeOpacity={0.8}
              {...(isWeb ? { accessibilityLabel: 'Delete Selected', title: 'Delete Selected' } as any : {})}
            >
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
              <Text style={[styles.toolBtnLargeText, styles.deleteToolBtnText]}>Delete</Text>
            </TouchableOpacity>
          </View>
          
          {/* Center Canvas */}
          <View style={styles.annotationMain}>
            <View style={[styles.annotationCanvasWrapFullWidth, styles.canvasWorkspace, styles.canvasWorkspaceWithGrid]}>
              {isWeb && (
                <View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFillObject, styles.canvasGridOverlay]}
                />
              )}
              <AnnotationCanvas
                ref={canvasRef}
                imageUrl={videoUrl ?? undefined}
                initialAnnotations={task.annotation_data}
                taskId={task.id}
                annotations={annotations}
                onAnnotationsChange={setAnnotations}
                activeTool={canvasTool}
                selectedId={selectedAnnotationId}
                onSelect={setSelectedAnnotationId}
                selectedLabel={selectedLabel}
                isBrushActive={isBrushActive}
                onUndo={() => {
                  if (canvasRef.current?.handleUndo) {
                    canvasRef.current.handleUndo();
                  } else {
                    if (annotations.length > 0) {
                      setAnnotations(prev => prev.slice(0, -1));
                    }
                  }
                }}
                labelColorOverrides={labelColorOverrides}
              />
            </View>
          </View>
          
          {/* Right Sidebar */}
          <View style={styles.rightSidebar}>
            <WorkbenchObjectListChrome
              extraLabelDefinitions={extraLabelDefinitions}
              onAddExtraLabelOption={handleAddExtraLabelOption}
              onRemoveExtraLabelOption={handleRemoveExtraLabelOption}
            />
            <ScrollView style={styles.objectList} showsVerticalScrollIndicator={false}>
              {annotations.length === 0 ? (
                <Text style={styles.objectListEmpty}>No objects yet</Text>
              ) : (
                annotations.map((a, idx) => {
                  const labelStr = typeof a.label === 'object' ? (a.label as any).name || (a.label as any).label : a.label;
                  const labelColor = labelStr
                    ? resolveAnnotationLabelColor(labelStr, labelColorOverrides)
                    : null;
                  return (
                    <View key={a.id} style={styles.objectCardWrap}>
                      <View style={[styles.objectCard, labelColor && { borderLeftColor: labelColor, borderLeftWidth: 4 }]}>
                        <View style={styles.objectCardHeader}>
                          <Text style={styles.objectCardTitle}>{getObjectDisplayName(a, idx)}</Text>
                          <TouchableOpacity
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => handleDeleteAnnotation(a.id)}
                          >
                            <Ionicons name="trash-outline" size={16} color="#94a3b8" />
                          </TouchableOpacity>
                        </View>
                       
                          <View style={styles.labelOptionsGrid}>
                            {chipLabels.map((label) => {
                              const isSelected = a.label === label;
                              const chipColor = resolveAnnotationLabelColor(
                                label,
                                labelColorOverrides
                              );
                              return (
                                <TouchableOpacity
                                  key={label}
                                  style={[
                                    styles.labelOptionChip,
                                    {
                                      borderColor: chipColor,
                                      backgroundColor: isSelected ? chipColor : 'transparent',
                                    }
                                  ]}
                                  onPress={() => {
                                    handleUpdateAnnotationLabel(a.id, label);
                                    setSelectedLabel(label);
                                  }}
                                >
                                  <Text style={[styles.labelOptionText, { color: isSelected ? '#fff' : chipColor }]}>
                                    {label}
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
            </ScrollView>
            {isSubmitted && (
              <View style={styles.submittedBadgeCompact}>
                <Ionicons name="checkmark-circle" size={14} color="#fff" />
                <Text style={styles.submittedText}>{t('tasks.submitted')}</Text>
              </View>
            )}
          </View>
        </View>
        
        {/* Bottom Button Bar */}
        {!isSubmitted && (
          <View style={styles.bottomButtonBar}>
            <View style={styles.bottomLeftActions}>
              <TouchableOpacity
                style={styles.exitButton}
                onPress={handleExit}
                activeOpacity={0.8}
              >
                <Text style={styles.exitButtonText}>Exit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitExitButton, saving && styles.submitButtonDisabled]}
                onPress={handleSubmitAndExit}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.submitExitButtonText}>
                  {saving ? t('taskDetail.saving') : 'Submit & Exit'}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.bottomRightActions}>
              <TouchableOpacity
                style={[styles.submitButtonGreen, saving && styles.submitButtonDisabled]}
                onPress={handleSubmitNext}
                disabled={saving}
                activeOpacity={0.8}
              >
                <Text style={styles.submitButtonGreenText}>
                  {saving ? t('taskDetail.saving') : 'Submit'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  // Fallback for non-video tasks
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            try {
              router.back();
            } catch (_) {}
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={20} color="#f1f5f9" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('common.taskDetail')}</Text>
      </View>

      <ScrollView style={styles.content}>
        {task.title ? (
          <Text style={styles.taskTitle} numberOfLines={2}>
            {task.title}
          </Text>
        ) : null}
        <View style={styles.priceBadge}>
          <Text style={styles.priceBadgeText}>{t('tasks.fee')}: {task.price ?? 0} TL</Text>
        </View>

        <View style={styles.audioSection}>
          <Text style={styles.sectionLabel}>{t('taskDetail.audioLabel')}</Text>
          <View style={styles.audioCard}>
            <Text style={styles.noAudioText}>Bu görev video annotation içermiyor</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.bottomButtonBar}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={styles.exitButton} onPress={handleExit}>
              <Text style={styles.exitButtonText}>Exit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0f172a',
  },
  containerFullWidth: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    marginHorizontal: 0,
    paddingHorizontal: 0,
    marginLeft: 0,
    marginRight: 0,
  },
  loadingText: { 
    color: '#94a3b8', 
    fontSize: 14, 
    textAlign: 'center', 
    marginTop: 24 
  },
  
  // Content styles
  content: {
    flex: 1,
    padding: 16,
  },
  
  // Footer styles
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  
  // Task info bar
  taskInfoBar: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskInfoType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  taskInfoPriceBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  taskInfoPriceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22c55e',
  },
  
  // Annotation layout
  annotationLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  leftToolbarCol: {
    width: 60,
    minWidth: 60,
    maxWidth: 60,
    padding: 4,
    backgroundColor: '#0f172a',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    flexDirection: 'column',
    gap: 4,
  },
  toolBtnLarge: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 1,
  },
  toolBtnActivePurple: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },
  toolBtnLargeText: { 
    fontSize: 9, 
    color: '#f1f5f9', 
    marginTop: 1, 
    fontWeight: '500' 
  },
  deleteToolBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: '#ef4444',
  },
  deleteToolBtnText: { 
    color: '#ef4444' 
  },
  
  // Center area
  annotationMain: { 
    flex: 1, 
    minWidth: 0, 
    minHeight: 300 
  },
  annotationCanvasWrapFullWidth: { 
    flex: 1, 
    width: '100%', 
    minHeight: 400, 
    alignSelf: 'stretch' 
  },
  canvasWorkspace: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  canvasWorkspaceWithGrid: {
    position: 'relative',
  },
  canvasGridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
    backgroundSize: '20px 20px',
    pointerEvents: 'none',
  },
  
  // Right sidebar
  rightSidebar: {
    width: 280,
    minWidth: 280,
    maxWidth: 280,
    padding: 8,
    backgroundColor: '#1e293b',
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
    flexDirection: 'column',
  },
  rightSidebarTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  objectList: { 
    flex: 1, 
    minHeight: 60 
  },
  objectListEmpty: { 
    fontSize: 12, 
    color: '#64748b', 
    fontStyle: 'italic' 
  },
  objectCardWrap: { 
    marginBottom: 8 
  },
  objectCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#334155',
  },
  objectCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  objectCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
    flex: 1,
  },
  labelOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  labelOptionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  labelOptionText: {
    fontSize: 10,
    fontWeight: '500',
  },
  
  // Bottom buttons
  bottomButtonBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  bottomLeftActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  bottomRightActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  exitButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  exitButtonText: { 
    fontSize: 14, 
    color: '#ef4444', 
    fontWeight: '600' 
  },
  submitExitButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
  },
  submitExitButtonText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '600' 
  },
  submitButtonGreen: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#22c55e',
  },
  submitButtonGreenText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '600' 
  },
  submitButtonDisabled: { 
    opacity: 0.6 
  },
  submittedBadgeCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#22c55e',
  },
  submittedText: { 
    fontSize: 14, 
    color: '#fff', 
    fontWeight: '600' 
  },
  
  // Header styles
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
    marginLeft: 16,
    flex: 1,
    textAlign: 'center',
  },
  taskTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
    paddingHorizontal: 16,
    marginBottom: 8,
    lineHeight: 28,
  },
  priceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 16,
    marginBottom: 16,
  },
  priceBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22c55e',
  },
  
  // Audio styles
  audioSection: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 12,
  },
  audioCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  noAudioText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 24,
  },
});
