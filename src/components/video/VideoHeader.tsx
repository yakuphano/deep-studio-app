import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { videoWorkbenchStyles } from '@/theme/videoWorkbenchStyles';
import { TaskData } from '@/types/video';

interface VideoHeaderProps {
  task: TaskData | null;
  isSubmitted: boolean;
  handleExit: () => void;
}

export const VideoHeader: React.FC<VideoHeaderProps> = ({
  task,
  isSubmitted,
  handleExit,
}) => {
  return (
    <View style={videoWorkbenchStyles.taskInfoBar}>
      <Text style={videoWorkbenchStyles.taskInfoType}>Video Annotation</Text>
      <View style={videoWorkbenchStyles.taskInfoPriceBadge}>
        <Text style={videoWorkbenchStyles.taskInfoPriceText}>
          {task?.price ?? 0} TL
        </Text>
      </View>
      {isSubmitted && (
        <View style={videoWorkbenchStyles.submittedBadgeCompact}>
          <Ionicons name="checkmark-circle" size={14} color="#fff" />
          <Text style={videoWorkbenchStyles.submittedText}>Submitted</Text>
        </View>
      )}
    </View>
  );
};
