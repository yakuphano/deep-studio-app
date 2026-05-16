import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import GuidelineOpenButton from '@/components/task/GuidelineOpenButton';

interface TaskHeaderProps {
  title: string;
  price: number | null;
  taskTypeLabel: string;
  onBack: () => void;
  guidelineUrl?: string | null;
  guidelineFileName?: string | null;
}

export default function TaskHeader({
  title,
  price,
  taskTypeLabel,
  onBack,
  guidelineUrl,
  guidelineFileName,
}: TaskHeaderProps) {
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
        <GuidelineOpenButton
          variant="header"
          guidelineUrl={guidelineUrl ?? null}
          guidelineFileName={guidelineFileName ?? null}
          style={styles.guidelineHeaderBtn}
        />
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
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
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  taskInfoType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
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
