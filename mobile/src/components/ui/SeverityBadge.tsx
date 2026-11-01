import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Severity } from '../../types';

interface Props {
  severity: Severity;
  size?: 'sm' | 'md';
}

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; bg: string; text: string; border: string }
> = {
  P0: {
    label: 'P0 CRITICAL',
    bg: 'rgba(244, 63, 94, 0.16)',
    text: '#FB7185',
    border: 'rgba(244, 63, 94, 0.4)',
  },
  P1: {
    label: 'P1 HIGH',
    bg: 'rgba(245, 158, 11, 0.16)',
    text: '#FBBF24',
    border: 'rgba(245, 158, 11, 0.4)',
  },
  P2: {
    label: 'P2 MEDIUM',
    bg: 'rgba(59, 130, 246, 0.16)',
    text: '#60A5FA',
    border: 'rgba(59, 130, 246, 0.35)',
  },
  P3: {
    label: 'P3 LOW',
    bg: 'rgba(148, 163, 184, 0.14)',
    text: '#94A3B8',
    border: 'rgba(148, 163, 184, 0.25)',
  },
};

export const SeverityBadge: React.FC<Props> = ({ severity, size = 'sm' }) => {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.P2;
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bg, borderColor: config.border },
        isSmall ? styles.smallBadge : styles.mediumBadge,
      ]}
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: config.text },
          severity === 'P0' && styles.glowDot,
        ]}
      />
      <Text
        style={[
          styles.text,
          { color: config.text },
          isSmall ? styles.smallText : styles.mediumText,
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  smallBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mediumBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  glowDot: {
    shadowColor: '#F43F5E',
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  smallText: {
    fontSize: 10,
  },
  mediumText: {
    fontSize: 12,
  },
});
