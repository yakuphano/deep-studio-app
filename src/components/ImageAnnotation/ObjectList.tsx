import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ANNOTATION_LABELS, LABEL_COLORS } from '@/constants/annotationLabels';
import type { Annotation } from '@/components/AnnotationCanvas';

interface ObjectListProps {
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  onSelectAnnotation: (id: string | null) => void;
  onUpdateAnnotationLabel: (annotationId: string, label: string) => void;
  onDeleteAnnotation: (annotationId: string) => void;
}

const getObjectDisplayName = (a: Annotation, idx: number) => {
  const n = idx + 1;
  if ((a as any).type === 'bbox') return `Bounding Box #${n}`;
  if ((a as any).type === 'polygon') return `Polygon #${n}`;
  if ((a as any).type === 'point') return `Point #${n}`;
  return `Object #${n}`;
};

export default function ObjectList({ 
  annotations, 
  selectedAnnotationId, 
  onSelectAnnotation, 
  onUpdateAnnotationLabel, 
  onDeleteAnnotation 
}: ObjectListProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.objectListSidebar}>
      <Text style={styles.objectListTitle}>{t('annotation.objects').toUpperCase()}</Text>
      <ScrollView style={styles.objectListScroll} showsVerticalScrollIndicator={false}>
        {annotations.length === 0 ? (
          <Text style={styles.objectListEmpty}>{t('annotation.noObjects')}</Text>
        ) : (
          annotations.map((annotation, idx) => {
            const labelStr = typeof annotation.label === 'object' 
              ? (annotation.label as any).name || (annotation.label as any).label 
              : annotation.label;
            const labelColor = labelStr ? LABEL_COLORS[labelStr] || LABEL_COLORS['Other'] : '#3b82f6';
            const isSelected = selectedAnnotationId === annotation.id;
            
            return (
              <TouchableOpacity
                key={annotation.id}
                style={[styles.objectListItem, isSelected && styles.objectListItemSelected]}
                onPress={() => onSelectAnnotation(annotation.id)}
                activeOpacity={0.8}
              >
                <View style={styles.objectListItemHeader}>
                  <View style={styles.objectListItemInfo}>
                    <Text style={[styles.objectListItemTitle, { color: labelColor }]}>
                      {(annotation as any).type === 'bbox' && `BBox #${idx + 1} - ${labelStr || 'Other'}`}
                      {(annotation as any).type === 'polygon' && `Polygon #${idx + 1}`}
                      {(annotation as any).type === 'point' && `Point #${idx + 1}`}
                      {(annotation as any).type !== 'bbox' && (annotation as any).type !== 'polygon' && (annotation as any).type !== 'point' && getObjectDisplayName(annotation, idx)}
                    </Text>
                    {/* Label Selection Chips */}
                    <View style={styles.labelChipsContainer}>
                      {ANNOTATION_LABELS.map((labelItem) => (
                        <TouchableOpacity
                          key={labelItem}
                          style={[
                            styles.labelChip,
                            labelStr === labelItem && styles.labelChipSelected,
                            { backgroundColor: labelStr === labelItem ? LABEL_COLORS[labelItem] : '#374151' }
                          ]}
                          onPress={() => onUpdateAnnotationLabel(annotation.id, labelItem)}
                          activeOpacity={0.8}
                        >
                          <Text style={[
                            styles.labelChipText,
                            { color: labelStr === labelItem ? 'white' : '#9ca3af' }
                          ]}>
                            {labelItem}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={[styles.objectListItemColor, { backgroundColor: labelColor }]} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  objectListSidebar: {
    width: 240,
    backgroundColor: '#1e293b',
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
  },
  objectListTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  objectListScroll: {
    flex: 1,
  },
  objectListEmpty: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 12,
    paddingVertical: 20,
  },
  objectListItem: {
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  objectListItemSelected: {
    backgroundColor: '#1e293b',
  },
  objectListItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  objectListItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  objectListItemTitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#e2e8f0',
  },
  objectListItemColor: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  labelChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  labelChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#374151',
  },
  labelChipSelected: {
    borderWidth: 0,
  },
  labelChipText: {
    fontSize: 10,
    fontWeight: '500',
  },
});
