import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme/colors';
import { taskDetailStyles } from '../../app/(tabs)/task/styles';

interface TaskDetailHeaderProps {
  title: string;
  price: number | null;
  taskTypeLabel: string;
  onBack: () => void;
}

export default function TaskDetailHeader({ 
  title, 
  price, 
  taskTypeLabel, 
  onBack 
}: TaskDetailHeaderProps) {
  const router = useRouter();

  return (
    <View>
      {/* Header with Back Button */}
      <View style={taskDetailStyles.headerRow}>
        <TouchableOpacity 
          style={taskDetailStyles.backButton}
          onPress={onBack}
        >
          <Ionicons name="arrow-back" size={20} color="#3b82f6" />
          <Text style={taskDetailStyles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
      
      {/* Task Info Overlay */}
      <View style={taskDetailStyles.taskInfoBar}>
        <Text style={taskDetailStyles.taskInfoType}>{taskTypeLabel}</Text>
        <View style={taskDetailStyles.taskInfoPriceBadge}>
          <Text style={taskDetailStyles.taskInfoPriceText}>{price ?? 0} TL</Text>
        </View>
      </View>
    </View>
  );
}
