import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import GuidelineOpenButton from '@/components/task/GuidelineOpenButton';
import TaskDiscardCheckbox from '@/components/task/TaskDiscardCheckbox';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
interface TaskHeaderProps {
  title: string;
  price: number | null;
  taskTypeLabel: string;
  onBack: () => void;
  guidelineUrl?: string | null;
  guidelineFileName?: string | null;
  taskId?: string;
  discarded?: boolean;
  discardDisabled?: boolean;
  userId?: string | undefined;
  onTaskDiscard?: (discarded: boolean) => Promise<{ error: string | null }>;
}

export default function TaskHeader({
  title,
  price,
  taskTypeLabel,
  onBack,
  guidelineUrl,
  guidelineFileName,
  taskId,
  discarded = false,
  discardDisabled,
  userId,
  onTaskDiscard,
}: TaskHeaderProps) {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      {/* Header with Back Button */}
      <View style={styles.headerRow}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={onBack}
        >
          <Ionicons name="arrow-back" size={20} color="#3b82f6" />
          <Text style={styles.backButtonText}>{t('taskDetail.back')}</Text>
        </TouchableOpacity>
        <View style={styles.headerRightCol}>
          <GuidelineOpenButton
            variant="header"
            guidelineUrl={guidelineUrl ?? null}
            guidelineFileName={guidelineFileName ?? null}
            style={styles.guidelineHeaderBtn}
          />
          {taskId ? (
            <TaskDiscardCheckbox
              taskId={taskId}
              discarded={discarded}
              disabled={discardDisabled}
              userId={userId}
              onPersist={onTaskDiscard}
            />
          ) : null}
        </View>
      </View>
      
      {/* Task Info Overlay */}
      <View style={styles.taskInfoBar}>
        <Text style={styles.taskInfoType}>{taskTypeLabel}</Text>
        <View style={styles.taskInfoPriceBadge}>
          <Text style={styles.taskInfoPriceText}>{price ?? 0} TL</Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: {
    backgroundColor: themeColors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 4,
    minHeight: 40,
    zIndex: 1000,
    gap: 12,
  },
  guidelineHeaderBtn: {
    flexShrink: 0,
  },
  headerRightCol: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 4,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    marginRight: 15,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 8,
  },
  taskInfoBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingRight: 168,
    backgroundColor: themeColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: themeColors.border,
  },
  taskInfoType: {
    fontSize: 14,
    fontWeight: '600',
    color: themeColors.textMuted,
  },
  taskInfoPriceBadge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  taskInfoPriceText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
}
