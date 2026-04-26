import React, { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  mergeAnnotationChipLabels,
  resolveAnnotationLabelColor,
  customLabelDefinitionsToMap,
  type CustomLabelDefinition,
} from '@/constants/annotationLabels';
import type { Annotation } from '@/types/annotations';
import type { VideoAnnotation } from '@/types/video';
import { WorkbenchObjectListChrome } from '@/components/workbench/WorkbenchObjectListChrome';

type Props = {
  videoAnnotations: VideoAnnotation[];
  currentFrameNumber: number;
  selectedAnnotationId: string | null;
  extraLabelDefinitions: CustomLabelDefinition[];
  onAddExtraLabelOption: (label: string, color: string) => void;
  onRemoveExtraLabelOption: (label: string) => void;
  onJumpToFrame: (frameNumber: number, timestamp: number) => void;
  onSelectObject: (frameNumber: number, annotationId: string, timestamp: number) => void;
  onUpdateAnnotationLabel: (frameNumber: number, annotationId: string, label: string) => void;
  onDeleteAnnotation: (frameNumber: number, annotationId: string) => void;
  /** Oturum içi önizleme; bloktaki snapshotUrl silinse bile gösterilir */
  thumbnailCache?: Record<string, string>;
};

function formatFrameTime(ts: number): string {
  if (!Number.isFinite(ts) || ts < 0) return '—';
  const s = Math.floor(ts % 60);
  const m = Math.floor((ts % 3600) / 60);
  const h = Math.floor(ts / 3600);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function labelStrOf(a: unknown): string {
  const x = a as { label?: unknown };
  if (typeof x?.label === 'object' && x.label !== null) {
    return String((x.label as { name?: string }).name ?? (x.label as { label?: string }).label ?? '');
  }
  return String(x?.label ?? '');
}

function uniqueLabelsSummary(anns: unknown[]): string {
  const s = new Set<string>();
  for (const a of anns) {
    const v = labelStrOf(a).trim();
    if (v) s.add(v);
  }
  return [...s].join(', ');
}

type WebNoFocusClickProps = {
  style?: StyleProp<ViewStyle>;
  onTrigger: () => void;
  accessibilityLabel?: string;
  children: React.ReactNode;
};

/** Web: farede odak taşınmasını azaltır; işlem onClick ile (touch bankası bozulmaz) */
function WebNoFocusClick({ style, onTrigger, accessibilityLabel, children }: WebNoFocusClickProps) {
  if (Platform.OS === 'web') {
    return (
      <View
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[style, { cursor: 'pointer' } as ViewStyle]}
        {...({
          tabIndex: -1,
          onPointerDown: (e: { pointerType?: string; button?: number; preventDefault?: () => void }) => {
            if (e.pointerType === 'mouse' && (e.button === undefined || e.button === 0)) {
              e.preventDefault?.();
            }
          },
          onClick: () => {
            onTrigger();
          },
        } as Record<string, unknown>)}
      >
        {children}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onTrigger}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      focusable={false}
    >
      {children}
    </Pressable>
  );
}

const getObjectTitle = (a: Annotation, idx: number) => {
  const t = (a as any).type;
  const n = idx + 1;
  if (t === 'bbox') return `BBox #${n}`;
  if (t === 'polygon') return `Polygon #${n}`;
  if (t === 'point' || t === 'points') return `Point #${n}`;
  if (t === 'polyline') return `Polyline #${n}`;
  if (t === 'brush') return `Brush #${n}`;
  if (t === 'semantic') return `Semantic #${n}`;
  if (t === 'magic_wand') return `Wand #${n}`;
  return `Object #${n}`;
};

export default function VideoMultiFrameObjectList({
  videoAnnotations,
  currentFrameNumber,
  selectedAnnotationId,
  extraLabelDefinitions,
  onAddExtraLabelOption,
  onRemoveExtraLabelOption,
  onJumpToFrame,
  onSelectObject,
  onUpdateAnnotationLabel,
  onDeleteAnnotation,
  thumbnailCache = {},
}: Props) {
  const { t } = useTranslation();

  const labelColorOverrides = useMemo(
    () => customLabelDefinitionsToMap(extraLabelDefinitions),
    [extraLabelDefinitions]
  );

  const chipLabels = useMemo(
    () => mergeAnnotationChipLabels(extraLabelDefinitions.map((d) => d.label)),
    [extraLabelDefinitions]
  );

  const sorted = useMemo(() => {
    return [...videoAnnotations].sort((a, b) => a.frameNumber - b.frameNumber);
  }, [videoAnnotations]);

  const blocksWithObjects = useMemo(
    () => sorted.filter((b) => (b.annotations?.length ?? 0) > 0),
    [sorted]
  );

  return (
    <View style={styles.root}>
      <View style={styles.chromeWrap}>
        <WorkbenchObjectListChrome
          extraLabelDefinitions={extraLabelDefinitions}
          onAddExtraLabelOption={onAddExtraLabelOption}
          onRemoveExtraLabelOption={onRemoveExtraLabelOption}
        />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {blocksWithObjects.length === 0 ? (
          <Text style={styles.empty}>{t('annotation.noObjects')}</Text>
        ) : (
          blocksWithObjects.map((block) => {
            const isCurrent = block.frameNumber === currentFrameNumber;
            const list = block.annotations ?? [];
            const blockKey = String(block.id ?? `frame_${block.frameNumber}`);
            const cached = thumbnailCache[blockKey];
            const snapshotUri =
              typeof cached === 'string' && cached.trim().length >= 200
                ? cached
                : typeof block.snapshotUrl === 'string' && block.snapshotUrl.trim().length >= 200
                  ? block.snapshotUrl
                  : '';
            const labelSummary = uniqueLabelsSummary(list);
            const usedOnBlock = new Set<string>();
            for (const a of list) {
              const v = labelStrOf(a).trim();
              if (v) usedOnBlock.add(v);
            }
            return (
              <View
                key={block.id || `frame_${block.frameNumber}`}
                style={[styles.frameBlock, isCurrent && styles.frameBlockCurrent]}
              >
                <WebNoFocusClick
                  style={styles.previewPress}
                  accessibilityLabel={`Kare ${block.frameNumber}`}
                  onTrigger={() => onJumpToFrame(block.frameNumber, block.timestamp)}
                >
                  {snapshotUri ? (
                    Platform.OS === 'web' ? (
                      <View style={styles.frameThumb}>
                        {React.createElement('img', {
                          alt: '',
                          src: snapshotUri,
                          draggable: false,
                          style: {
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain' as const,
                            display: 'block',
                            pointerEvents: 'none',
                          },
                        })}
                      </View>
                    ) : (
                      <Image
                        key={blockKey}
                        source={{ uri: snapshotUri }}
                        style={styles.frameThumb}
                        resizeMode="contain"
                      />
                    )
                  ) : (
                    <View style={[styles.frameThumb, styles.frameThumbPlaceholder]}>
                      <Text style={styles.frameThumbHint}>—</Text>
                    </View>
                  )}
                </WebNoFocusClick>
                {labelSummary ? (
                  <Text style={styles.labelSummary} numberOfLines={2}>
                    {labelSummary}
                  </Text>
                ) : null}

                <WebNoFocusClick
                  style={styles.frameHeader}
                  accessibilityLabel={`Kare ${block.frameNumber} zaman`}
                  onTrigger={() => onJumpToFrame(block.frameNumber, block.timestamp)}
                >
                  <Text style={styles.frameHeaderText}>
                    Kare {block.frameNumber} · {formatFrameTime(block.timestamp)}
                  </Text>
                  {isCurrent ? <Text style={styles.frameBadge}>current</Text> : null}
                </WebNoFocusClick>

                {list.map((annotation, idx) => {
                  const labelStr = labelStrOf(annotation);
                  const labelColor = resolveAnnotationLabelColor(labelStr, labelColorOverrides);
                  const isSelected =
                    isCurrent && selectedAnnotationId === annotation.id;
                  const primaryChips = chipLabels.filter(
                    (c) => usedOnBlock.has(c) || c === labelStr
                  );
                  const extraChips = chipLabels
                    .filter((c) => !primaryChips.includes(c))
                    .slice(0, 8);
                  const rowChipList = [...new Set([...primaryChips, ...extraChips])];

                  return (
                    <View
                      key={annotation.id}
                      style={[styles.row, isSelected && styles.rowSelected]}
                    >
                      <View style={styles.rowMain}>
                        <WebNoFocusClick
                          onTrigger={() =>
                            onSelectObject(block.frameNumber, annotation.id, block.timestamp)
                          }
                          accessibilityLabel={getObjectTitle(annotation as Annotation, idx)}
                        >
                          <Text style={[styles.rowTitle, { color: labelColor }]}>
                            {getObjectTitle(annotation as Annotation, idx)} —{' '}
                            {String(labelStr || '—')}
                          </Text>
                        </WebNoFocusClick>
                        <View style={styles.chips}>
                          {rowChipList.map((labelItem) => {
                            const chipColor = resolveAnnotationLabelColor(
                              labelItem,
                              labelColorOverrides
                            );
                            const isChipOn = labelStr === labelItem;
                            return (
                              <TouchableOpacity
                                key={`${annotation.id}-${labelItem}`}
                                style={[
                                  styles.chip,
                                  isChipOn && styles.chipOn,
                                  {
                                    backgroundColor: isChipOn ? chipColor : '#374151',
                                    borderColor: isChipOn ? chipColor : '#374151',
                                  },
                                ]}
                                onPress={(e) => {
                                  const ne = e?.nativeEvent as unknown as { stopPropagation?: () => void };
                                  ne?.stopPropagation?.();
                                  onUpdateAnnotationLabel(
                                    block.frameNumber,
                                    annotation.id,
                                    labelItem
                                  );
                                }}
                                activeOpacity={0.8}
                              >
                                <Text
                                  style={[
                                    styles.chipText,
                                    { color: isChipOn ? '#fff' : '#9ca3af' },
                                  ]}
                                >
                                  {labelItem}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                      <View style={styles.rowActions}>
                        <TouchableOpacity
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={() => onDeleteAnnotation(block.frameNumber, annotation.id)}
                          style={styles.trash}
                        >
                          <Ionicons name="trash-outline" size={18} color="#94a3b8" />
                        </TouchableOpacity>
                        <View style={[styles.dot, { backgroundColor: labelColor }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignSelf: 'stretch',
    backgroundColor: '#1e293b',
    minHeight: 0,
  },
  chromeWrap: {
    paddingHorizontal: 8,
    paddingTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  scroll: { flex: 1 },
  empty: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 12,
    paddingVertical: 20,
  },
  frameBlock: {
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 6,
  },
  frameBlockCurrent: {
    backgroundColor: 'rgba(59, 130, 246, 0.06)',
  },
  previewPress: {
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  frameThumb: {
    width: '100%' as const,
    height: 88,
    borderRadius: 6,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  frameThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameThumbHint: {
    color: '#64748b',
    fontSize: 20,
  },
  labelSummary: {
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: 12,
    fontSize: 11,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  frameHeader: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  frameHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  frameBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3b82f6',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  rowSelected: { backgroundColor: '#1e293b' },
  rowMain: { flex: 1, marginRight: 8 },
  rowTitle: { fontSize: 11, fontWeight: '500', color: '#e2e8f0' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  chipOn: { borderWidth: 0 },
  chipText: { fontSize: 10, fontWeight: '500' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trash: { padding: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
