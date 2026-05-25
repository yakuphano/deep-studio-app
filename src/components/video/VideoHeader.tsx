import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { videoWorkbenchStyles } from '@/theme/videoWorkbenchStyles';
import { TaskData } from '@/types/video';
import GuidelineOpenButton from '@/components/task/GuidelineOpenButton';
import TaskDiscardCheckbox from '@/components/task/TaskDiscardCheckbox';

interface VideoHeaderProps {
  task: TaskData | null;
  isSubmitted: boolean;
  handleExit: () => void;
  userId?: string | undefined;
  onPersistDiscard?: (discarded: boolean) => Promise<{ error: string | null }>;
}

export const VideoHeader: React.FC<VideoHeaderProps> = ({
  task,
  isSubmitted,
  handleExit: _handleExit,
  userId,
  onPersistDiscard,
}: VideoHeaderProps) => {
  return (
    <View>
      <View style={videoWorkbenchStyles.taskInfoBar}>
        <Text style={videoWorkbenchStyles.taskInfoType}>Video Annotation</Text>
        <View style={videoWorkbenchStyles.taskInfoPriceBadge}>
          <Text style={videoWorkbenchStyles.taskInfoPriceText}>{task?.price ?? 0} TL</Text>
        </View>
        {isSubmitted && (
          <View style={videoWorkbenchStyles.submittedBadgeCompact}>
            <Ionicons name="checkmark-circle" size={14} color="#fff" />
            <Text style={videoWorkbenchStyles.submittedText}>Submitted</Text>
          </View>
        )}
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'flex-end',
          paddingHorizontal: 16,
          paddingBottom: 8,
          gap: 8,
        }}
      >
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <GuidelineOpenButton
            variant="header"
            guidelineUrl={task?.guideline_url ?? null}
            guidelineFileName={task?.guideline_file_name ?? null}
          />
          {task?.id ? (
            <TaskDiscardCheckbox
              taskId={task.id}
              discarded={!!task.discarded_at}
              disabled={isSubmitted}
              userId={userId}
              onPersist={onPersistDiscard}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
};
