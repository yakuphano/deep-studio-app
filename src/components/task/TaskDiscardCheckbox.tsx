import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';
import { setTaskDiscardInDb } from '@/lib/taskDiscard';

export type TaskDiscardCheckboxProps = {
  taskId: string;
  discarded: boolean;
  disabled?: boolean;
  userId: string | undefined;
  /** Varsayılan: Supabase güncellemesi. Verilirse kayıt burada yapılır (örn. hook ile tek kaynak). */
  onPersist?: (discarded: boolean) => Promise<{ error: string | null }>;
  /** Başarılı kayıttan sonra (isteğe bağlı) */
  onApplied?: (discarded: boolean) => void;
};

export default function TaskDiscardCheckbox({
  taskId,
  discarded,
  disabled,
  userId,
  onPersist,
  onApplied,
}: TaskDiscardCheckboxProps) {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const { t } = useTranslation();
  const [local, setLocal] = useState(discarded);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setLocal(discarded);
  }, [discarded, taskId]);

  const onToggle = async () => {
    if (disabled || pending) return;
    const next = !local;
    const persist =
      onPersist ??
      (async (d: boolean) => {
        if (!userId) {
          const msg = t('tasks.discardNeedLogin', { defaultValue: 'Sign in to update this flag.' });
          return { error: msg };
        }
        return setTaskDiscardInDb(taskId, d, userId);
      });

    if (!onPersist && !userId) {
      const msg = t('tasks.discardNeedLogin', { defaultValue: 'Sign in to update this flag.' });
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert(t('login.errorTitle'), msg);
      return;
    }

    setPending(true);
    const { error } = await persist(next);
    setPending(false);
    if (error) {
      if (Platform.OS === 'web') window.alert(error);
      else Alert.alert(t('login.errorTitle'), error);
      return;
    }
    setLocal(next);
    onApplied?.(next);
  };

  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled || pending}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, (disabled || pending) && styles.rowDisabled]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: local, disabled: !!(disabled || pending) }}
      accessibilityLabel={t('tasks.discardLabel')}
    >
      <View style={[styles.box, local && styles.boxOn]}>
        {local ? <Ionicons name="checkmark" size={14} color={themeColors.onAccent} /> : null}
      </View>
      <Text style={styles.label}>{t('tasks.discardLabel')}</Text>
      {pending ? <ActivityIndicator size="small" color={themeColors.accent} style={styles.spinner} /> : null}
    </Pressable>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-end',
      paddingVertical: 2,
      paddingHorizontal: 2,
    },
    rowPressed: { opacity: 0.85 },
    rowDisabled: { opacity: 0.5 },
    box: {
      width: 18,
      height: 18,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: themeColors.border,
      backgroundColor: themeColors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxOn: {
      backgroundColor: themeColors.accent,
      borderColor: themeColors.accent,
    },
    label: {
      fontSize: 12,
      fontWeight: '500',
      color: themeColors.textSecondary,
    },
    spinner: { marginLeft: 2 },
  });
}
