import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Platform, Animated, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { addEarningsRefreshListener } from '@/lib/earningsRefresh';
import { useAuth } from '@/contexts/AuthContext';
import { useCountUp } from '@/hooks/useCountUp';

interface TaskItem {
  id: string;
  title: string;
  price: number | null;
  status: string;
  updated_at: string;
}

export default function DailyEarningsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const { user } = useAuth();

  const navigatorReady = rootNavigationState?.key != null;
  const [loading, setLoading] = useState(true);
  const [dailyEarned, setDailyEarned] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [lastTasks, setLastTasks] = useState<TaskItem[]>([]);
  const [paymentRequested, setPaymentRequested] = useState(false);

  const displayedDaily = useCountUp(dailyEarned, !loading);
  const displayedTotal = useCountUp(totalEarned, !loading);

  const flashDaily = useRef(new Animated.Value(0)).current;
  const flashTotal = useRef(new Animated.Value(0)).current;
  const prevDaily = useRef(0);
  const prevTotal = useRef(0);

  useEffect(() => {
    if (!navigatorReady || user) return;
    router.replace('/');
  }, [navigatorReady, user]);

  const fetchData = useCallback(async () => {
    if (!user?.id) {
      console.log('No user ID, returning');
      return;
    }
    
    try {
      setLoading(true);
      console.log('Fetching earnings data for user:', user.id);
      const todayStr = new Date().toDateString();

      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, price, status, updated_at')
        .eq('assigned_to', user.id)
        .eq('status', 'submitted')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Database error fetching earnings:', error);
        Alert.alert('Error', 'Failed to fetch earnings data');
        setDailyEarned(0);
        setTotalEarned(0);
        setLastTasks([]);
        return;
      }

      const submittedTasks = data ?? [];
      const total = submittedTasks.reduce((acc, task) => acc + (task.price ?? 0), 0);
      const todayTasks = submittedTasks.filter(
        (task) =>
          task.updated_at &&
          new Date(task.updated_at).toDateString() === todayStr
      );
      const daily = todayTasks.reduce((acc, task) => acc + (task.price ?? 0), 0);

      console.log('Earnings data fetched:', { total, daily, tasksCount: submittedTasks.length });
      setDailyEarned(daily);
      setTotalEarned(total);
      setLastTasks(submittedTasks.slice(0, 5));
    } catch (error) {
      console.error('Error in fetchData:', error);
      Alert.alert('Error', `Failed to fetch earnings: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) fetchData();
    }, [user?.id, fetchData])
  );

  useEffect(() => {
    const unsubscribe = addEarningsRefreshListener(fetchData);
    return unsubscribe;
  }, [fetchData]);

  const hasInitialized = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!hasInitialized.current) {
      prevDaily.current = dailyEarned;
      prevTotal.current = totalEarned;
      hasInitialized.current = true;
      return;
    }
    const runFlash = (anim: Animated.Value) => {
      anim.setValue(0);
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 750,
          useNativeDriver: true,
        }),
      ]).start();
    };
    if (dailyEarned > prevDaily.current) {
      runFlash(flashDaily);
      prevDaily.current = dailyEarned;
    }
    if (totalEarned > prevTotal.current) {
      runFlash(flashTotal);
      prevTotal.current = totalEarned;
    }
  }, [loading, dailyEarned, totalEarned]);

  const handleRequestPayment = () => {
    setPaymentRequested(true);
  };

  const formatPrice = (n: number) =>
    new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
    }).format(n);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#8b5cf6" />
      </View>
    );
  }

  const flashOpacityDaily = flashDaily.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });
  const flashOpacityTotal = flashTotal.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.cardsRow}>
        <View style={styles.summaryCard}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.flashOverlay,
              { backgroundColor: 'rgba(34, 197, 94, 0.6)' },
              { opacity: flashOpacityDaily },
            ]}
          />
          <Text style={styles.cardLabel}>{t('earnings.daily.todayEarned')}</Text>
          <Text style={[styles.cardValue, styles.accentGreen]}>
            {formatPrice(Math.round(displayedDaily * 100) / 100)}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.flashOverlay,
              { backgroundColor: 'rgba(234, 179, 8, 0.5)' },
              { opacity: flashOpacityTotal },
            ]}
          />
          <Text style={styles.cardLabel}>{t('earnings.total.totalEarned')}</Text>
          <Text style={[styles.cardValue, styles.accentPurple]}>
            {formatPrice(Math.round(displayedTotal * 100) / 100)}
          </Text>
        </View>
      </View>

      {!paymentRequested ? (
        <TouchableOpacity style={styles.requestBtn} onPress={handleRequestPayment}>
          <Ionicons name="card" size={20} color="#fff" />
          <Text style={styles.requestBtnText}>{t('earnings.requestPayment')}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.requestedBadge}>
          <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
          <Text style={styles.requestedText}>{t('earnings.paymentRequested')}</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>{t('earnings.total.history')}</Text>
      {lastTasks.length === 0 ? (
        <Text style={styles.empty}>{t('earnings.empty.subtitle')}</Text>
      ) : (
        <View style={styles.taskList}>
          {lastTasks.map((task) => (
            <TouchableOpacity
              key={task.id}
              style={styles.taskRow}
              onPress={() => router.push(`/task/${task.id}` as any)}
              activeOpacity={0.7}
            >
              <Text style={styles.taskTitle} numberOfLines={1}>
                {task.title || t('tasks.taskDefault')}
              </Text>
              <Text style={styles.taskPrice}>{formatPrice(task.price ?? 0)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  flashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
  },
  summaryCard: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }
      : {}),
  },
  cardLabel: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 8,
    fontWeight: '500',
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  accentGreen: { color: '#22c55e' },
  accentPurple: { color: '#8b5cf6' },
  requestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    marginBottom: 24,
    backgroundColor: 'rgba(139, 92, 246, 0.3)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
  },
  requestBtnText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  requestedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    marginBottom: 24,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  requestedText: { fontSize: 15, color: '#22c55e', fontWeight: '600' },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 12,
  },
  taskList: { gap: 8 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  taskTitle: { flex: 1, fontSize: 14, color: '#f1f5f9', marginRight: 12 },
  taskPrice: { fontSize: 14, fontWeight: '600', color: '#22c55e' },
  empty: { color: '#64748b', textAlign: 'center', paddingVertical: 24 },
});
