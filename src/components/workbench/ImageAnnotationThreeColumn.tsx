import React, { useState, useEffect, useMemo, cloneElement, isValidElement } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import ObjectList from '@/components/ImageAnnotation/ObjectList';
import WorkbenchImageToolRail from '@/components/workbench/WorkbenchImageToolRail';
import type { WorkbenchDrawingToolId } from '@/constants/workbenchImageTools';
import { DEFAULT_BRUSH_COLOR } from '@/types/annotations';
import {
  customLabelDefinitionsToMap,
  type CustomLabelDefinition,
} from '@/constants/annotationLabels';

export type ToolId = WorkbenchDrawingToolId;

export interface ImageAnnotationThreeColumnProps {
  activeTool: string;
  onToolChange: (tool: ToolId) => void;
  onUndo: () => void;
  onResetImageView?: () => void;
  selectedAnnotationId: string | null;
  annotations: unknown[];
  onSelectAnnotation: (id: string | null) => void;
  onUpdateAnnotationLabel: (annotationId: string, label: string) => void;
  onDeleteAnnotation: (id: string) => void;
  /** İşe özel etiket + renk (chip ve tuval) */
  extraLabelDefinitions?: CustomLabelDefinition[];
  onAddExtraLabelOption?: (label: string, color: string) => void;
  onRemoveExtraLabelOption?: (label: string) => void;
  /** Varsayılan sınıf chip’leri (medical preset vb.) */
  builtInChipLabels?: readonly string[];
  children: React.ReactNode;
}

export default function ImageAnnotationThreeColumn({
  activeTool,
  onToolChange,
  onUndo,
  onResetImageView,
  selectedAnnotationId,
  annotations,
  onSelectAnnotation,
  onUpdateAnnotationLabel,
  onDeleteAnnotation,
  extraLabelDefinitions = [],
  onAddExtraLabelOption,
  onRemoveExtraLabelOption,
  builtInChipLabels,
  children,
}: ImageAnnotationThreeColumnProps) {
  const [brushColor, setBrushColor] = useState(DEFAULT_BRUSH_COLOR);
  const [brushPaletteOpen, setBrushPaletteOpen] = useState(false);

  const labelColorOverrides = useMemo(
    () => customLabelDefinitionsToMap(extraLabelDefinitions),
    [extraLabelDefinitions]
  );

  useEffect(() => {
    if (activeTool !== 'brush') setBrushPaletteOpen(false);
  }, [activeTool]);

  const mediaChild = isValidElement(children)
    ? cloneElement(children as React.ReactElement<any>, {
        brushColor,
        onBrushColorChange: setBrushColor,
        brushPaletteOpen,
        onBrushPaletteOpenChange: setBrushPaletteOpen,
        labelColorOverrides,
      })
    : children;

  return (
    <View style={styles.row}>
      <ScrollView
        style={styles.leftScroll}
        contentContainerStyle={styles.leftScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <WorkbenchImageToolRail
          activeTool={activeTool}
          onToolChange={onToolChange}
          onUndo={onUndo}
          onResetImageView={onResetImageView}
          selectedAnnotationId={selectedAnnotationId}
          onDeleteSelected={() => {
            if (selectedAnnotationId) onDeleteAnnotation(selectedAnnotationId);
          }}
          brushColor={brushColor}
          onBrushColorChange={setBrushColor}
          brushPaletteOpen={brushPaletteOpen}
          onBrushPaletteOpenChange={setBrushPaletteOpen}
        />
      </ScrollView>

      <View style={styles.center}>{mediaChild}</View>

      <View style={styles.rightCol}>
        <ObjectList
          annotations={annotations as any}
          selectedAnnotationId={selectedAnnotationId}
          onSelectAnnotation={onSelectAnnotation}
          onUpdateAnnotationLabel={onUpdateAnnotationLabel}
          onDeleteAnnotation={onDeleteAnnotation}
          extraLabelDefinitions={extraLabelDefinitions}
          onAddExtraLabelOption={onAddExtraLabelOption}
          onRemoveExtraLabelOption={onRemoveExtraLabelOption}
          builtInChipLabels={builtInChipLabels}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    backgroundColor: '#0f172a',
  },
  leftScroll: {
    width: 120,
    maxWidth: 120,
    minWidth: 120,
    backgroundColor: '#0f172a',
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  leftScrollContent: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    paddingBottom: 20,
    alignItems: 'center',
  },
  center: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: '#0f172a',
  },
  rightCol: {
    width: 280,
    minWidth: 280,
    maxWidth: 280,
    flexShrink: 0,
    backgroundColor: '#1e293b',
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
  },
});
