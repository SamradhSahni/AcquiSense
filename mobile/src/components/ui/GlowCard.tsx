import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { GoNoGoDecision } from '../../types';

interface Props {
  children: React.ReactNode;
  decision?: GoNoGoDecision | null;
  style?: ViewStyle;
  active?: boolean;
}

const DECISION_GLOW: Record<GoNoGoDecision, { border: string; glow: string }> = {
  GO: {
    border: 'rgba(16, 185, 129, 0.4)',
    glow: 'rgba(16, 185, 129, 0.12)',
  },
  CAUTION: {
    border: 'rgba(245, 158, 11, 0.4)',
    glow: 'rgba(245, 158, 11, 0.12)',
  },
  'NO-GO': {
    border: 'rgba(244, 63, 94, 0.45)',
    glow: 'rgba(244, 63, 94, 0.15)',
  },
};

export const GlowCard: React.FC<Props> = ({ children, decision, style, active }) => {
  let borderColor = 'rgba(255, 255, 255, 0.08)';
  let backgroundColor = '#0E131F';

  if (decision && DECISION_GLOW[decision]) {
    borderColor = DECISION_GLOW[decision].border;
    backgroundColor = '#0F1626';
  } else if (active) {
    borderColor = 'rgba(6, 182, 212, 0.45)';
    backgroundColor = '#0F1826';
  }

  return (
    <View
      style={[
        styles.card,
        {
          borderColor,
          backgroundColor,
        },
        decision && {
          shadowColor: DECISION_GLOW[decision].border,
          shadowOpacity: 0.25,
          shadowRadius: 10,
          elevation: 4,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
});

