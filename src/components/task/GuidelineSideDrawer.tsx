import React, { useMemo, useEffect, useState, createElement } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  ScrollView,
  Image,
  ActivityIndicator,
  Linking,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { detectGuidelineKind, getGuidelineEmbedUrl } from '@/lib/guidelineViewer';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
type Props = {
  visible: boolean;
  url: string;
  fileName: string | null;
  onClose: () => void;
};

export default function GuidelineSideDrawer({ visible, url, fileName, onClose }: Props) {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(520, Math.max(320, width * 0.42));
  const kind = detectGuidelineKind(url, fileName);
  const title = fileName?.trim() || t('taskDetail.guidelineDefaultName');
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || kind !== 'text') {
      setTextContent(null);
      setTextError(null);
      return;
    }
    let cancelled = false;
    setTextLoading(true);
    setTextError(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then((body) => {
        if (!cancelled) setTextContent(body);
      })
      .catch((e) => {
        if (!cancelled) setTextError(e instanceof Error ? e.message : 'load failed');
      })
      .finally(() => {
        if (!cancelled) setTextLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, url, kind]);

  if (!visible) return null;

  const hasUrl = url.trim().length > 0;
  const embedUrl = hasUrl ? getGuidelineEmbedUrl(url, fileName) : '';

  const body = (
    <View style={[styles.panel, { width: panelWidth }]}>
      <View style={styles.panelHeader}>
        <View style={styles.panelTitleRow}>
          <Ionicons name="book-outline" size={20} color="#c4b5fd" />
          <Text style={styles.panelTitle} numberOfLines={2}>
            {hasUrl ? title : t('tasks.guidelineButton', { defaultValue: 'Guideline' })}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={t('taskDetail.guidelineClose')}
        >
          <Ionicons name="close" size={22} color="#e2e8f0" />
        </TouchableOpacity>
      </View>

      <View style={styles.viewer}>
        {!hasUrl ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={48} color="#7dd3fc" />
            <Text style={styles.emptyText}>
              {t('tasks.guidelineEmpty', {
                defaultValue: 'No guideline has been uploaded for this task yet.',
              })}
            </Text>
          </View>
        ) : null}

        {hasUrl && kind === 'image' ? (
          <ScrollView contentContainerStyle={styles.imageScroll}>
            <Image source={{ uri: url }} style={styles.image} resizeMode="contain" />
          </ScrollView>
        ) : null}

        {hasUrl && kind === 'text' ? (
          <ScrollView style={styles.textScroll} contentContainerStyle={styles.textScrollContent}>
            {textLoading ? (
              <ActivityIndicator size="large" color="#a78bfa" style={{ marginTop: 40 }} />
            ) : textError ? (
              <Text style={styles.fallbackText}>{textError}</Text>
            ) : (
              <Text style={styles.textBody}>{textContent ?? ''}</Text>
            )}
          </ScrollView>
        ) : null}

        {hasUrl && (kind === 'pdf' || kind === 'office' || kind === 'other') && Platform.OS === 'web' ? (
          createElement('iframe', {
            src: embedUrl,
            title,
            style: {
              flex: 1,
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: themeColors.background,
            },
          })
        ) : null}

        {hasUrl && (kind === 'pdf' || kind === 'office' || kind === 'other') && Platform.OS !== 'web' ? (
          <View style={styles.nativeFallback}>
            <Ionicons name="document-outline" size={48} color="#a78bfa" />
            <Text style={styles.fallbackText}>{t('taskDetail.guidelineNativeHint')}</Text>
            <TouchableOpacity
              style={styles.externalBtn}
              onPress={() => void Linking.openURL(url)}
            >
              <Text style={styles.externalBtnText}>{t('taskDetail.guidelineOpenExternal')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webRoot} pointerEvents="box-none">
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        {body}
      </View>
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.nativeRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        {body}
      </View>
    </Modal>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  webRoot: {
    ...(Platform.OS === 'web'
      ? ({
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20000,
          flexDirection: 'row',
          justifyContent: 'flex-end',
        } as object)
      : {}),
  },
  nativeRoot: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...(Platform.OS === 'web'
      ? ({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as object)
      : { flex: 1 }),
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  panel: {
    height: '100%',
    backgroundColor: '#1e1b4b',
    borderLeftWidth: 1,
    borderLeftColor: '#4c1d95',
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: '-8px 0 32px rgba(0,0,0,0.45)',
        } as object)
      : {}),
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#4c1d95',
    gap: 12,
  },
  panelTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  panelTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#f5f3ff',
  },
  closeBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
  },
  viewer: {
    flex: 1,
    minHeight: 0,
    backgroundColor: themeColors.background,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 16,
  },
  emptyText: {
    color: themeColors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  imageScroll: {
    flexGrow: 1,
    padding: 12,
    alignItems: 'center',
  },
  image: {
    width: '100%',
    minHeight: 200,
    ...(Platform.OS === 'web' ? ({ maxHeight: 'calc(100vh - 80px)' } as object) : { height: 400 }),
  },
  textScroll: {
    flex: 1,
  },
  textScrollContent: {
    padding: 16,
  },
  textBody: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 22,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  nativeFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  fallbackText: {
    color: themeColors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  externalBtn: {
    backgroundColor: '#6d28d9',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  externalBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
}
