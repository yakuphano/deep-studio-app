import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

type TaskType = 'transcription' | 'image' | 'video' | 'medical' | 'lidar';

function TaskSelectionCards({
  onSelect,
  t,
}: {
  onSelect: (type: TaskType) => void;
  t: (k: string) => string;
}) {
  return (
    <View style={styles.dashboard}>
      <Text style={styles.dashboardTitle}>{t('tasks.selectTaskType')}</Text>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.cardsContainer}>
          <TouchableOpacity
            style={styles.selectionCard}
            onPress={() => onSelect('transcription')}
            activeOpacity={0.9}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="mic" size={48} color="#3b82f6" />
            </View>
            <View style={styles.cardTitleArea}>
              <Text style={styles.cardLabel} numberOfLines={2}>
                {t('tasks.cardAudioTranscription')}
              </Text>
              <Text style={styles.cardHint}>
                {t('tasks.listenToAudio')} • {t('tasks.transcribeHere')}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.selectionCard}
            onPress={() => onSelect('image')}
            activeOpacity={0.9}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="image" size={48} color="#f472b6" />
            </View>
            <View style={styles.cardTitleArea}>
              <Text style={styles.cardLabel} numberOfLines={2}>
                {t('tasks.cardImageAnnotation')}
              </Text>
              <Text style={styles.cardHint}>{t('tasks.hintImageAnnotation')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.selectionCard}
            onPress={() => onSelect('video')}
            activeOpacity={0.9}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="videocam" size={48} color="#8b5cf6" />
            </View>
            <View style={styles.cardTitleArea}>
              <Text style={styles.cardLabel} numberOfLines={2}>
                {t('tasks.cardVideoAnnotation')}
              </Text>
              <Text style={styles.cardHint}>{t('tasks.hintVideoAnnotation')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.selectionCard}
            onPress={() => onSelect('medical')}
            activeOpacity={0.9}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="medkit" size={48} color="#14b8a6" />
            </View>
            <View style={styles.cardTitleArea}>
              <Text style={styles.cardLabel} numberOfLines={2}>
                {t('tasks.cardMedicalData')}
              </Text>
              <Text style={styles.cardHint}>{t('tasks.hintMedicalData')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.selectionCard}
            onPress={() => onSelect('lidar')}
            activeOpacity={0.9}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="scan" size={48} color="#f97316" />
            </View>
            <View style={styles.cardTitleArea}>
              <Text style={styles.cardLabel} numberOfLines={2}>
                {t('tasks.cardLidarAnnotation')}
              </Text>
              <Text style={styles.cardHint}>{t('tasks.hintLidarAnnotation')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

export default function DashboardHubScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, session } = useAuth();

  if (!user || !session) return <View><Text>Yükleniyor...</Text></View>;

  const setTypeAndNavigate = (type: TaskType) => {
    if (type === 'transcription') {
      router.push('/dashboard/audio');
    } else if (type === 'image') {
      router.push('/dashboard/image');
    } else if (type === 'video') {
      router.push('/(tabs)/video-tasks');
    } else if (type === 'medical') {
      router.push('/dashboard/medical');
    } else if (type === 'lidar') {
      router.push('/dashboard/lidar');
    }
  };

  return (
    <View style={styles.container}>
      <TaskSelectionCards onSelect={setTypeAndNavigate} t={t} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  dashboard: {
    flex: 1,
    padding: 40,
    paddingTop: 40,
  },
  dashboardTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 32,
    textAlign: 'left',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  cardsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    flexWrap: 'wrap',
    gap: 20,
  },
  selectionCard: {
    flexBasis: '18%',
    flexGrow: 1,
    minWidth: 160,
    maxWidth: 280,
    height: 228,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
    marginBottom: 20,
  },
  cardIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    flexShrink: 0,
  },
  cardTitleArea: {
    minHeight: 72,
    width: '100%',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#f1f5f9',
    textAlign: 'center',
    lineHeight: 22,
  },
  cardHint: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    fontWeight: '500',
    marginTop: 8,
    lineHeight: 18,
  },
});
