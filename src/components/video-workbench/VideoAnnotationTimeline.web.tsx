import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import type { VideoAnnotation } from '@/types/video';
import type { ProThemeColors } from '@/theme/videoProWorkbenchTheme';
import { resolveAnnotationLabelColor } from '@/constants/annotationLabels';

type Props = {
  colors: ProThemeColors;
  totalFrames: number;
  currentFrameNumber: number;
  videoAnnotations: VideoAnnotation[];
  onSeekFrame: (frame: number) => void;
};

function labelOfAnn(a: unknown): string {
  const x = a as { label?: unknown };
  if (typeof x?.label === 'object' && x.label !== null) {
    return String((x.label as { name?: string }).name ?? (x.label as { label?: string }).label ?? '');
  }
  return String(x?.label ?? 'object');
}

function trackDisplayName(a: unknown): string {
  const m = (a as { meta?: { objectName?: unknown } })?.meta;
  if (m && typeof m === 'object') {
    const on = (m as { objectName?: unknown }).objectName;
    if (on != null) {
      const s = String(on).trim();
      if (s) return s;
    }
  }
  return labelOfAnn(a).trim() || 'Object';
}

type TrackRow = { id: string; display: string; minF: number; maxF: number; color: string };

function buildTracks(blocks: VideoAnnotation[]): TrackRow[] {
  type Ent = { frames: number[]; displayName: string; classLabel: string };
  const byId = new Map<string, Ent>();
  const sortedBlocks = [...blocks].sort(
    (a, b) => Number(a.frameNumber ?? 0) - Number(b.frameNumber ?? 0)
  );
  for (const b of sortedBlocks) {
    const fn = Number(b.frameNumber ?? 0);
    for (const a of b.annotations ?? []) {
      const ann = a as { id?: string };
      const id = String(ann.id ?? '');
      if (!id) continue;
      const classLabel = labelOfAnn(a).trim() || 'Object';
      const displayName = trackDisplayName(a);
      if (!byId.has(id)) {
        byId.set(id, { frames: [], displayName, classLabel });
      }
      const ent = byId.get(id)!;
      ent.frames.push(fn);
      ent.displayName = displayName;
      ent.classLabel = classLabel;
    }
  }
  const rows: TrackRow[] = [];
  for (const [id, { displayName, classLabel, frames }] of byId) {
    if (frames.length === 0) continue;
    const sorted = [...new Set(frames)].sort((a, b) => a - b);
    const minF = sorted[0]!;
    const maxF = sorted[sorted.length - 1]!;
    const short = id.length > 8 ? `${id.slice(0, 6)}…` : id;
    rows.push({
      id,
      display: `${displayName} · ${short}`,
      minF,
      maxF,
      color: resolveAnnotationLabelColor(classLabel),
    });
  }
  rows.sort((a, b) => a.display.localeCompare(b.display));
  return rows;
}

export default function VideoAnnotationTimeline({
  colors,
  totalFrames,
  currentFrameNumber,
  videoAnnotations,
  onSeekFrame,
}: Props) {
  const [rulerW, setRulerW] = useState(1);
  const tracks = useMemo(() => buildTracks(videoAnnotations), [videoAnnotations]);
  const maxF = Math.max(1, totalFrames - 1);

  const frameToPct = useCallback(
    (f: number) => (Math.max(0, Math.min(maxF, f)) / maxF) * 100,
    [maxF]
  );

  const seekFromX = useCallback(
    (locationX: number, width: number) => {
      if (width <= 1) return;
      const ratio = Math.max(0, Math.min(1, locationX / width));
      onSeekFrame(Math.round(ratio * maxF));
    },
    [maxF, onSeekFrame]
  );

  const rulerPress = useCallback(
    (locationX: number) => seekFromX(locationX, rulerW),
    [rulerW, seekFromX]
  );

  return (
    <View style={[localStyles.host, { backgroundColor: colors.panel, borderTopColor: colors.border }]}>
      <View style={localStyles.headerRow}>
        <Text style={[localStyles.title, { color: colors.textMuted }]}>Timeline</Text>
        <Text style={[localStyles.frameReadout, { color: colors.text }]}>
          Frame {currentFrameNumber} / {Math.max(0, totalFrames - 1)}
        </Text>
      </View>
      <View
        style={[localStyles.rulerTrack, { backgroundColor: colors.bg, borderColor: colors.border }]}
        onLayout={(e) => setRulerW(Math.max(1, e.nativeEvent.layout.width))}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={(e) => rulerPress(e.nativeEvent.locationX)}
        >
          <View style={[localStyles.rulerFill, { width: `${frameToPct(currentFrameNumber)}%`, backgroundColor: colors.accentMuted }]} />
          <View
            style={[
              localStyles.playhead,
              { left: `${frameToPct(currentFrameNumber)}%`, backgroundColor: colors.accent },
            ]}
          />
        </Pressable>
      </View>
      <Text style={[localStyles.tickLabel, { color: colors.textSoft }]}>
        0 ————————————————————————— {Math.max(0, totalFrames - 1)}
      </Text>
      <ScrollView style={localStyles.trackScroll} showsVerticalScrollIndicator>
        {tracks.length === 0 ? (
          <Text style={[localStyles.empty, { color: colors.textSoft }]}>No object tracks yet</Text>
        ) : (
          tracks.map((tr) => (
            <TrackRowView key={tr.id} row={tr} colors={colors} maxF={maxF} onSeekFrame={onSeekFrame} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function TrackRowView({
  row,
  colors,
  maxF,
  onSeekFrame,
}: {
  row: TrackRow;
  colors: ProThemeColors;
  maxF: number;
  onSeekFrame: (frame: number) => void;
}) {
  const [w, setW] = useState(1);
  const span = Math.max(1, row.maxF - row.minF);
  const leftPct = (row.minF / maxF) * 100;
  const widthPct = (span / maxF) * 100;

  const onPressRow = useCallback(
    (lx: number) => {
      if (w <= 1) return;
      const ratio = Math.max(0, Math.min(1, lx / w));
      onSeekFrame(Math.round(ratio * maxF));
    },
    [w, maxF, onSeekFrame]
  );

  return (
    <View style={localStyles.trackRow}>
      <Text style={[localStyles.trackLabel, { color: colors.textMuted }]} numberOfLines={1}>
        {row.display}
      </Text>
      <View
        style={[localStyles.trackLane, { backgroundColor: colors.bg, borderColor: colors.border }]}
        onLayout={(e) => setW(Math.max(1, e.nativeEvent.layout.width))}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={(e) => onPressRow(e.nativeEvent.locationX)}>
          <View
            style={[
              localStyles.trackBar,
              {
                left: `${leftPct}%`,
                width: `${Math.max(0.8, widthPct)}%`,
                backgroundColor: row.color,
              },
            ]}
          />
        </Pressable>
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  host: {
    height: 140,
    minHeight: 140,
    maxHeight: 140,
    borderTopWidth: 1,
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 4,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  frameReadout: {
    fontSize: 12,
    fontWeight: '600',
  },
  rulerTrack: {
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  rulerFill: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    zIndex: 2,
  },
  tickLabel: {
    fontSize: 9,
    marginTop: 2,
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  trackScroll: {
    flex: 1,
    minHeight: 0,
  },
  empty: {
    fontSize: 12,
    paddingVertical: 8,
    fontStyle: 'italic',
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  trackLabel: {
    width: 108,
    fontSize: 10,
  },
  trackLane: {
    flex: 1,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  trackBar: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 3,
    opacity: 0.92,
  },
});
