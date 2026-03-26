import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';

type TaskType = 'transcription' | 'image';

function TaskSelectionCards({
  onSelect,
  t,
}: {
  onSelect: (type: TaskType) => void;
  t: (k: string) => string;
}) {
  return (
    <View style={styles.dashboard}>
      <Text style={styles.dashboardTitle}>Görev Seçimi</Text>
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
            <Text style={styles.cardLabel}>Ses Transkripsiyonu</Text>
            <Text style={styles.cardHint}>Sesi Dinle • Metne Dök</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.selectionCard}
            onPress={() => onSelect('image')}
            activeOpacity={0.9}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="image" size={48} color="#f472b6" />
            </View>
            <Text style={styles.cardLabel}>Görsel Etiketleme</Text>
            <Text style={styles.cardHint}>BBox • Polygon • Segmentation</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

export default function TasksScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const { user, session } = useAuth();

  // Debug log
  console.log('Rendering tasks selection:', { user, session, params });

  // Render protection
  if (!user || !session) return <View><Text>Yükleniyor...</Text></View>;

  const setTypeAndNavigate = (type: TaskType) => {
    if (type === 'transcription') {
      router.push('/tasks/audio');
    } else if (type === 'image') {
      router.push('/tasks/image');
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
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 20,
  },
  selectionCard: {
    width: '30%',
    minWidth: 300,
    maxWidth: 350,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 24,
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
    marginBottom: 16,
  },
  cardLabel: { 
    fontSize: 18, 
    fontWeight: '700', 
    color: '#f1f5f9', 
    marginBottom: 6,
    textAlign: 'center',
  },
  cardHint: { 
    fontSize: 13, 
    color: '#94a3b8',
    textAlign: 'center',
    fontWeight: '500',
  },
});
