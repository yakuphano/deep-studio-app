import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

interface TaskFiltersProps {
  onFilterChange?: (filters: TaskFiltersState) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  totalCount?: number;
}

export interface TaskFiltersState {
  status: string;
  type: string;
  client: string;
  sortBy: 'created_at' | 'updated_at' | 'title' | 'price';
  sortOrder: 'asc' | 'desc';
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'image', label: 'Image' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'text', label: 'Text' },
];

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Created Date' },
  { value: 'updated_at', label: 'Updated Date' },
  { value: 'title', label: 'Title' },
  { value: 'price', label: 'Price' },
];

export default function TaskFilters({ 
  onFilterChange, 
  onRefresh, 
  refreshing = false,
  totalCount = 0 
}: TaskFiltersProps) {
  const [filters, setFilters] = useState<TaskFiltersState>({
    status: 'all',
    type: 'all',
    client: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
  });

  const [showFilters, setShowFilters] = useState(false);

  const updateFilter = (key: keyof TaskFiltersState, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange?.(newFilters);
  };

  const toggleSortOrder = () => {
    const newOrder = filters.sortOrder === 'asc' ? 'desc' : 'asc';
    updateFilter('sortOrder', newOrder);
  };

  const clearFilters = () => {
    const defaultFilters: TaskFiltersState = {
      status: 'all',
      type: 'all',
      client: '',
      sortBy: 'created_at',
      sortOrder: 'desc',
    };
    setFilters(defaultFilters);
    onFilterChange?.(defaultFilters);
  };

  const hasActiveFilters = filters.status !== 'all' || 
                          filters.type !== 'all' || 
                          filters.client !== '';

  return (
    <View style={styles.container}>
      {/* Header with toggle */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Tasks</Text>
          <Text style={styles.count}>{totalCount} tasks</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={onRefresh}
            disabled={refreshing}
          >
            <Ionicons 
              name={refreshing ? "refresh" : "refresh-outline"} 
              size={20} 
              color={colors.accentPurple} 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.filterToggle}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons 
              name={showFilters ? "filter" : "filter-outline"} 
              size={20} 
              color={hasActiveFilters ? colors.accentPurple : colors.textMuted} 
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters Panel */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersScroll}
          >
            {/* Status Filter */}
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Status</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.optionsScroll}
              >
                {STATUS_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionChip,
                      filters.status === option.value && styles.optionChipActive
                    ]}
                    onPress={() => updateFilter('status', option.value)}
                  >
                    <Text style={[
                      styles.optionText,
                      filters.status === option.value && styles.optionTextActive
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Type Filter */}
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Type</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.optionsScroll}
              >
                {TYPE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionChip,
                      filters.type === option.value && styles.optionChipActive
                    ]}
                    onPress={() => updateFilter('type', option.value)}
                  >
                    <Text style={[
                      styles.optionText,
                      filters.type === option.value && styles.optionTextActive
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Sort Options */}
            <View style={styles.filterGroup}>
              <Text style={styles.filterLabel}>Sort</Text>
              <View style={styles.sortContainer}>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.optionsScroll}
                >
                  {SORT_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.optionChip,
                        filters.sortBy === option.value && styles.optionChipActive
                      ]}
                      onPress={() => updateFilter('sortBy', option.value)}
                    >
                      <Text style={[
                        styles.optionText,
                        filters.sortBy === option.value && styles.optionTextActive
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={styles.sortOrderButton}
                  onPress={toggleSortOrder}
                >
                  <Ionicons 
                    name={filters.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'} 
                    size={16} 
                    color={colors.accentPurple} 
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={clearFilters}
              >
                <Ionicons name="close-circle" size={16} color={colors.accentPurple} />
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'column',
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  count: {
    fontSize: 12,
    color: colors.textMuted,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  filtersPanel: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  filtersScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  filterGroup: {
    gap: 8,
    minWidth: 200,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionsScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionChipActive: {
    backgroundColor: colors.accentPurple,
    borderColor: colors.accentPurple,
  },
  optionText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
  },
  optionTextActive: {
    color: colors.text,
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sortOrderButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.accentPurple,
  },
});
