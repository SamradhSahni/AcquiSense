import React from 'react';
import { Tabs } from 'expo-router';
import { Briefcase, PlusCircle, CheckSquare, FileBarChart2, ShieldCheck } from 'lucide-react-native';

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
          tabBarIcon: ({ color }) => <Briefcase size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="new-deal"
        options={{
          title: 'New Deal',
          tabBarIcon: ({ color }) => <PlusCircle size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="action-center"
        options={{
          title: 'Action Center',
          tabBarIcon: ({ color }) => <CheckSquare size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color }) => <FileBarChart2 size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Team & Vault',
          tabBarIcon: ({ color }) => <ShieldCheck size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="telemetry"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
