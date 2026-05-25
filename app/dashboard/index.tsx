import React, { useMemo } from 'react';
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
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/lib/supabase';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
type TaskType = 'transcription' | 'image' | 'video' | 'medical' | 'lidar';

function RevisionBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const themeColors = useThemeColors();
  const { user } = useAuth();
  const { appRole } = useProfile();
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    if (!user?.id || appRole === 'admin') return;
    let cancelled = false;
    (async () => {
      const { count: c } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .eq('status', 'rejected');
      if (!cancelled) setCount(c ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, appRole]);

  if (appRole === 'admin' || count === 0) return null;

  return (
    <TouchableOpacity
      style={{
        marginHorizontal: 24,
        marginTop: 16,
        marginBottom: 8,
        padding: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(251, 191, 36, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(217, 119, 6, 0.35)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
      onPress={() => router.push('/revisions' as any)}
      activeOpacity={0.85}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#92400e', fontWeight: '800', fontSize: 15 }}>{t('annotatorHome.revisionBannerTitle')}</Text>
        <Text style={{ color: themeColors.textMuted, fontSize: 13, marginTop: 4 }}>{t('annotatorHome.revisionBannerBody', { count })}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color="#fbbf24" />
    </TouchableOpacity>
  );
}

function TaskSelectionCards({
  onSelect,
  t,
  styles,
  themeColors,
}: {
  onSelect: (type: TaskType) => void;
  t: (k: string) => string;
  styles: ReturnType<typeof createStyles>;
  themeColors: AppColors;
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
              <Ionicons name="mic" size={48} color={themeColors.accent} />
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
              <Ionicons name="image" size={48} color={themeColors.accentPurple} />
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
              <Ionicons name="videocam" size={48} color="#0b6bcb" />
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
              <Ionicons name="medkit" size={48} color={themeColors.success} />
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
              <Ionicons name="scan" size={48} color={themeColors.textSecondary} />
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
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

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
      router.push('/dashboard/video');
    } else if (type === 'medical') {
      router.push('/dashboard/medical');
    } else if (type === 'lidar') {
      router.push('/dashboard/lidar');
    }
  };

  return (
    <View style={styles.container}>
      <RevisionBanner />
      <TaskSelectionCards onSelect={setTypeAndNavigate} t={t} styles={styles} themeColors={themeColors} />
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: themeColors.background,
  },
  dashboard: {
    flex: 1,
    padding: 40,
    paddingTop: 40,
  },
  dashboardTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: themeColors.text,
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
    backgroundColor: themeColors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: themeColors.border,
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f2744',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 6,
    marginBottom: 20,
  },
  cardIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: themeColors.accentMuted,
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
    color: themeColors.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  cardHint: {
    fontSize: 13,
    color: themeColors.textMuted,
    textAlign: 'center',
    fontWeight: '500',
    marginTop: 8,
    lineHeight: 18,
  },
});
}
