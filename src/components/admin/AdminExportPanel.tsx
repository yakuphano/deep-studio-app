import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  getFormatOptionsForTaskType,
  type ExportFormatKey,
  type ExportTaskType,
} from '@/lib/adminTaskExport';
import { exportCompletedTasks } from '@/lib/completedTaskExport';
import type { AppColors } from '@/theme/palettes';
import { useThemeColors } from '@/contexts/ThemeContext';

const TASK_TYPES: ExportTaskType[] = ['audio', 'image', 'video', 'medical', 'lidar'];

const LANGUAGE_OPTIONS = [
  { key: 'all', label: 'All languages' },
  { key: 'en', label: 'English' },
  { key: 'tr', label: 'Turkish' },
  { key: 'ku', label: 'Kurdish' },
  { key: 'az', label: 'Azerbaijani' },
] as const;

const DATE_OPTIONS = [
  ['all', 'All time'],
  ['last7', 'Last 7 days'],
  ['last30', 'Last 30 days'],
  ['custom', 'Custom'],
] as const;

function Field({
  label,
  children,
  styles,
}: {
  label: string;
  children: React.ReactNode;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.exportLabel}>{label}</Text>
      {children}
    </View>
  );
}

export default function AdminExportPanel() {
  const themeColors = useThemeColors();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  const [exportTaskType, setExportTaskType] = useState<ExportTaskType>('audio');
  const [exportClient, setExportClient] = useState('');
  const [exportCompanyOptions, setExportCompanyOptions] = useState<string[]>([]);
  const [exportFormat, setExportFormat] = useState<string>('json');
  const [exporting, setExporting] = useState(false);
  const [dateRange, setDateRange] = useState<'all' | 'last7' | 'last30' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');

  useEffect(() => {
    const formats = getFormatOptionsForTaskType(exportTaskType);
    setExportFormat(formats[0].key);
  }, [exportTaskType]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('company_name')
        .not('company_name', 'is', null)
        .neq('company_name', '')
        .order('updated_at', { ascending: false })
        .limit(500);
      if (cancelled || error || !data?.length) return;
      const ordered: string[] = [];
      const seen = new Set<string>();
      for (const row of data) {
        const n = String((row as { company_name?: string | null }).company_name ?? '').trim();
        if (!n || seen.has(n)) continue;
        seen.add(n);
        ordered.push(n);
      }
      setExportCompanyOptions(ordered.slice(0, 32));
      const latest = ordered[0];
      if (latest) setExportClient((prev) => (prev.trim() === '' ? latest : prev));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportCompletedTasks({
        taskType: exportTaskType,
        companyClient: exportClient,
        format: exportFormat as ExportFormatKey,
        dateRange,
        customStartDate,
        customEndDate,
        language: selectedLanguage,
      });
      if (!result.ok) {
        if (result.error === 'COMPANY_REQUIRED') {
          Alert.alert('Validation Error', 'Please enter a company or client name.');
        } else if (result.error === 'DATES_REQUIRED') {
          Alert.alert('Validation Error', 'Please enter both start and end dates.');
        } else if (result.error === 'NO_DATA') {
          Alert.alert('No Data', 'No completed tasks found for selected criteria.');
        } else {
          Alert.alert('Export Failed', result.error);
        }
        return;
      }
      Alert.alert('Success', `${result.count} tasks exported.`);
    } catch (error) {
      Alert.alert('Export Failed', (error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.exportSection}>
      <Text style={styles.exportHint}>
        Yalnızca kalite kontrolü onayladığı (tamamlandı) görevler dışa aktarılır.
      </Text>

      <View style={styles.exportForm}>
        <Field label="Task type" styles={styles}>
          <View style={styles.chipRow}>
            {TASK_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.chip, exportTaskType === type && styles.chipActive]}
                onPress={() => setExportTaskType(type)}
              >
                <Text style={[styles.chipText, exportTaskType === type && styles.chipTextActive]}>
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        <Field label="Format" styles={styles}>
          <View style={styles.chipRow}>
            {getFormatOptionsForTaskType(exportTaskType).map((format) => (
              <TouchableOpacity
                key={format.key}
                style={[styles.chip, exportFormat === format.key && styles.chipActive]}
                onPress={() => setExportFormat(format.key)}
              >
                <Text style={[styles.chipText, exportFormat === format.key && styles.chipTextActive]}>
                  {format.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Field>

        <Field label="Company" styles={styles}>
          {exportCompanyOptions.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.companyPickerScroll}
              contentContainerStyle={styles.companyPickerRow}
            >
              {exportCompanyOptions.map((name) => {
                const active = exportClient.trim() === name;
                return (
                  <TouchableOpacity
                    key={name}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setExportClient(name)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                      {name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}
          <TextInput
            style={styles.exportInput}
            value={exportClient}
            onChangeText={setExportClient}
            placeholder="Şirket adı"
            placeholderTextColor={themeColors.textMuted}
          />
        </Field>

        {exportTaskType === 'audio' ? (
          <Field label="Language" styles={styles}>
            <View style={styles.chipRow}>
              {LANGUAGE_OPTIONS.map((lang) => (
                <TouchableOpacity
                  key={lang.key}
                  style={[styles.chip, selectedLanguage === lang.key && styles.chipActive]}
                  onPress={() => setSelectedLanguage(lang.key)}
                >
                  <Text
                    style={[styles.chipText, selectedLanguage === lang.key && styles.chipTextActive]}
                  >
                    {lang.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>
        ) : null}

        <Field label="Date range" styles={styles}>
          <View style={styles.chipRow}>
            {DATE_OPTIONS.map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, dateRange === key && styles.chipActive]}
                onPress={() => setDateRange(key)}
              >
                <Text style={[styles.chipText, dateRange === key && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {dateRange === 'custom' ? (
            <View style={styles.customDateRow}>
              <TextInput
                style={styles.dateInput}
                value={customStartDate}
                onChangeText={setCustomStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={themeColors.textMuted}
              />
              <Text style={styles.dateSep}>–</Text>
              <TextInput
                style={styles.dateInput}
                value={customEndDate}
                onChangeText={setCustomEndDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={themeColors.textMuted}
              />
            </View>
          ) : null}
        </Field>

        <TouchableOpacity
          style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
          onPress={() => void handleExport()}
          disabled={exporting}
        >
          <Text style={styles.exportButtonText}>{exporting ? 'Exporting…' : 'Export'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(themeColors: AppColors) {
  return StyleSheet.create({
    exportSection: {
      backgroundColor: themeColors.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderWidth: 1.5,
      borderColor: themeColors.border,
    },
    exportHint: {
      fontSize: 13,
      color: themeColors.textMuted,
      marginBottom: 12,
      lineHeight: 18,
    },
    exportForm: { gap: 0 },
    field: { marginBottom: 12 },
    exportLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: themeColors.text,
      marginBottom: 6,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      borderWidth: 1.5,
      borderColor: themeColors.border,
      borderRadius: 8,
      paddingVertical: 7,
      paddingHorizontal: 12,
      backgroundColor: themeColors.background,
    },
    chipActive: {
      backgroundColor: themeColors.accentMuted,
      borderColor: themeColors.accent,
    },
    chipText: { color: themeColors.text, fontSize: 13, fontWeight: '500' },
    chipTextActive: { color: themeColors.accent, fontWeight: '700' },
    companyPickerScroll: { marginBottom: 8, maxHeight: 40 },
    companyPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 6 },
    exportInput: {
      backgroundColor: themeColors.background,
      borderWidth: 1.5,
      borderColor: themeColors.border,
      borderRadius: 8,
      paddingVertical: 9,
      paddingHorizontal: 12,
      color: themeColors.text,
      fontSize: 14,
      minHeight: 40,
    },
    customDateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
    },
    dateSep: { color: themeColors.textMuted, fontSize: 14 },
    dateInput: {
      flex: 1,
      backgroundColor: themeColors.background,
      borderWidth: 1.5,
      borderColor: themeColors.border,
      borderRadius: 8,
      paddingVertical: 9,
      paddingHorizontal: 10,
      color: themeColors.text,
      fontSize: 13,
      minHeight: 40,
    },
    exportButton: {
      backgroundColor: themeColors.accent,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 6,
    },
    exportButtonDisabled: { opacity: 0.6 },
    exportButtonText: { color: themeColors.onAccent, fontSize: 15, fontWeight: '600' },
  });
}
