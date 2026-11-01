import React from 'react';
import { Tabs } from 'expo-router';
import { Briefcase, Activity, CheckSquare, ShieldCheck } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#07090E',
          borderTopColor: 'rgba(255, 255, 255, 0.08)',
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#06B6D4',
        tabBarInactiveTintColor: '#64748B',
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="deals"
        options={{
          title: 'Pipeline',
          tabBarIcon: ({ color, size }) => <Briefcase size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="telemetry"
        options={{
          title: 'Telemetry',
          tabBarIcon: ({ color, size }) => <Activity size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="action-center"
        options={{
          title: 'Action Center',
          tabBarIcon: ({ color, size }) => <CheckSquare size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Security',
          tabBarIcon: ({ color, size }) => <ShieldCheck size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
