import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { theme } from '../theme';

/**
 * Baris "chip" ringkasan statistik yang dipakai bersama di seluruh
 * dashboard (Admin, Surveyor, Viewer) agar tampilan & standar visual
 * konsisten di ketiga role. Setiap chip menampilkan satu angka kunci
 * (mis. total paket, total item, antrian pending) dengan label di
 * bawahnya. Chip bisa ditekan (opsional, mis. untuk lompat ke layar lain)
 * atau hanya bersifat informatif.
 */

export interface DashboardStatChipItem {
  key: string;
  value: number | string;
  label: string;
  variant?: 'default' | 'warning';
  onPress?: () => void;
}

export function DashboardStatChips({
  items,
  style,
}: {
  items: DashboardStatChipItem[];
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.row, style]}>
      {items.map((item) => {
        const isWarning = item.variant === 'warning';
        const Wrapper = item.onPress ? TouchableOpacity : View;
        return (
          <Wrapper
            key={item.key}
            style={[styles.chip, isWarning && styles.chipWarning]}
            onPress={item.onPress}
          >
            <Text style={[styles.chipValue, isWarning && styles.chipValueWarning]}>{item.value}</Text>
            <Text style={[styles.chipLabel, isWarning && styles.chipLabelWarning]}>{item.label}</Text>
          </Wrapper>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  chip: {
    flexGrow: 1,
    minWidth: 90,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  chipValue: {
    fontSize: 16,
    fontWeight: theme.font.semiBold,
    color: theme.colors.textPrimary,
  },
  chipLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  chipWarning: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warning,
  },
  chipValueWarning: {
    color: theme.colors.warning,
  },
  chipLabelWarning: {
    color: theme.colors.warning,
  },
});

export default DashboardStatChips;
