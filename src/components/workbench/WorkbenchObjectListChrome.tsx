import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { CustomLabelDefinition } from '@/constants/annotationLabels';

const PRESET_SWATCHES = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#d946ef',
  '#64748b',
];

type Props = {
  extraLabelDefinitions: CustomLabelDefinition[];
  onAddExtraLabelOption: (label: string, color: string) => void;
  onRemoveExtraLabelOption: (label: string) => void;
};

export function WorkbenchObjectListChrome({
  extraLabelDefinitions,
  onAddExtraLabelOption,
  onRemoveExtraLabelOption,
}: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [pickedColor, setPickedColor] = useState(PRESET_SWATCHES[6]);

  const commit = () => {
    const s = draft.trim();
    if (!s) return;
    onAddExtraLabelOption(s, pickedColor);
    setDraft('');
  };

  return (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={1}>
          {t('annotation.objects').toUpperCase()}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={t('annotation.customClassPlaceholder')}
          placeholderTextColor="#64748b"
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={commit}
          returnKeyType="done"
          autoCorrect={false}
          autoCapitalize="none"
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={commit}
          accessibilityRole="button"
          accessibilityLabel={t('annotation.addObject')}
        >
          <Ionicons name="add-outline" size={22} color="#e2e8f0" />
        </TouchableOpacity>
      </View>

      <View style={styles.swatchesRow}>
        {PRESET_SWATCHES.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => setPickedColor(c)}
            accessibilityRole="button"
            style={[
              styles.swatch,
              { backgroundColor: c },
              pickedColor === c && styles.swatchSelected,
            ]}
          />
        ))}
      </View>

      {extraLabelDefinitions.length > 0 ? (
        <View style={styles.strip}>
          <Text style={styles.stripTitle}>{t('annotation.customLabelsSection')}</Text>
          <View style={styles.pillsRow}>
            {extraLabelDefinitions.map(({ label: lbl, color }) => (
              <View key={lbl} style={styles.pill}>
                <View style={[styles.pillDot, { backgroundColor: color }]} />
                <Text style={styles.pillText} numberOfLines={1}>
                  {lbl}
                </Text>
                <TouchableOpacity
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  onPress={() => onRemoveExtraLabelOption(lbl)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('annotation.deleteObject')}: ${lbl}`}
                >
                  <Ionicons name="close-circle" size={16} color="#94a3b8" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    color: '#f1f5f9',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    maxWidth: 72,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 32,
    maxHeight: 32,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: '#f1f5f9',
    fontSize: 11,
  },
  addBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  swatchesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
    alignItems: 'center',
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  swatchSelected: {
    borderColor: '#f8fafc',
    borderWidth: 2,
  },
  strip: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    gap: 4,
  },
  stripTitle: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '100%',
    backgroundColor: '#334155',
    paddingLeft: 6,
    paddingRight: 4,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  pillDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pillText: {
    fontSize: 11,
    color: '#e2e8f0',
    maxWidth: 120,
    flexShrink: 1,
  },
});
