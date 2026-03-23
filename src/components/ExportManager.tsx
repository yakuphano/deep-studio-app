import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import type { Annotation } from '@/components/AnnotationCanvas';
import { toYOLO, toCOCO, toPascalVOC, type ExportContext } from '@/lib/exportFormats';

interface ExportManagerProps {
  visible: boolean;
  onClose: () => void;
  annotations: Annotation[];
  imageWidth: number;
  imageHeight: number;
  imageFileName: string;
}

function triggerDownload(blob: Blob, filename: string) {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportManager({
  visible,
  onClose,
  annotations,
  imageWidth,
  imageHeight,
  imageFileName,
}: ExportManagerProps) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);

  const baseName = imageFileName.replace(/\.[^/.]+$/, '') || 'image';
  const ctx: ExportContext = {
    annotations,
    imageWidth,
    imageHeight,
    imageFileName: imageFileName || baseName + '.jpg',
  };

  const handleExport = async (
    format: 'yolo' | 'coco' | 'pascal' | 'zip'
  ) => {
    if (imageWidth <= 0 || imageHeight <= 0) {
      if (typeof window !== 'undefined') {
        window.alert(t('tasks.exportNoImage'));
      }
      return;
    }
    setExporting(true);
    try {
      if (format === 'yolo') {
        const txt = toYOLO(ctx);
        const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
        triggerDownload(blob, `${baseName}.txt`);
      } else if (format === 'coco') {
        const obj = toCOCO(ctx);
        const json = JSON.stringify(obj, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        triggerDownload(blob, 'instances.json');
      } else if (format === 'pascal') {
        const xml = toPascalVOC(ctx);
        const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
        triggerDownload(blob, `${baseName}.xml`);
      } else if (format === 'zip') {
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        zip.file(`${baseName}.txt`, toYOLO(ctx));
        zip.file('instances.json', JSON.stringify(toCOCO(ctx), null, 2));
        zip.file(`${baseName}.xml`, toPascalVOC(ctx));
        const blob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(blob, `${baseName}_annotations.zip`);
      }
      if (typeof window !== 'undefined') {
        window.alert(t('tasks.exportSuccess'));
      }
    } catch (err) {
      console.error('[ExportManager]', err);
      if (typeof window !== 'undefined') {
        window.alert('Export error: ' + (err instanceof Error ? err.message : String(err)));
      }
    } finally {
      setExporting(false);
    }
  };

  if (Platform.OS !== 'web' || !visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.modal} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('tasks.export')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>
          <View style={styles.body}>
            <TouchableOpacity
              style={[styles.option, exporting && styles.optionDisabled]}
              onPress={() => handleExport('yolo')}
              disabled={exporting}
            >
              <Ionicons name="document-text-outline" size={22} color="#3b82f6" />
              <Text style={styles.optionText}>{t('tasks.exportYOLO')}</Text>
              <Text style={styles.optionHint}>{t('tasks.exportHintYOLO')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.option, exporting && styles.optionDisabled]}
              onPress={() => handleExport('coco')}
              disabled={exporting}
            >
              <Ionicons name="code-slash-outline" size={22} color="#22c55e" />
              <Text style={styles.optionText}>{t('tasks.exportCOCO')}</Text>
              <Text style={styles.optionHint}>{t('tasks.exportHintCOCO')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.option, exporting && styles.optionDisabled]}
              onPress={() => handleExport('pascal')}
              disabled={exporting}
            >
              <Ionicons name="logo-xml" size={22} color="#f97316" />
              <Text style={styles.optionText}>{t('tasks.exportPascalVOC')}</Text>
              <Text style={styles.optionHint}>{t('tasks.exportHintPascal')}</Text>
            </TouchableOpacity>
            <View style={styles.separator} />
            <TouchableOpacity
              style={[styles.zipOption, exporting && styles.optionDisabled]}
              onPress={() => handleExport('zip')}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="archive-outline" size={22} color="#fff" />
              )}
              <Text style={styles.zipOptionText}>{t('tasks.exportZip')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    width: '90%',
    maxWidth: 420,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#f1f5f9' },
  closeBtn: { padding: 4 },
  body: { padding: 16 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(51, 65, 85, 0.5)',
    marginBottom: 8,
  },
  optionDisabled: { opacity: 0.6 },
  optionText: { fontSize: 15, fontWeight: '600', color: '#f1f5f9', flex: 1 },
  optionHint: { fontSize: 11, color: '#94a3b8', maxWidth: 140 },
  separator: { height: 12 },
  zipOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
  },
  zipOptionText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
