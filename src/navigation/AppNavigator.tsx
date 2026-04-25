import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { CameraScreen } from '../screens/CameraScreen';
import { GalleryScreen } from '../screens/GalleryScreen';
import { MapScreen } from '../screens/MapScreen';
import { FormBuilderScreen } from '../screens/FormBuilderScreen';
import { ViewerScreen } from '../screens/ViewerScreen';
import { theme } from '../theme';

const Tab = createBottomTabNavigator();

// Monochrome navigation theme — no blue anywhere.
const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: theme.bg,
    card: theme.bg,
    text: theme.text,
    border: theme.border,
    primary: theme.accent,
    notification: theme.accent,
  },
};

// Shared screen options — force-hide the icon slot so labels sit centered.
// (Returning null from tabBarIcon removes the default "unknown icon" box
//  React Navigation renders when no icon is supplied.)
const screenOptions = {
  lazy: true,
  tabBarActiveTintColor: theme.active,
  tabBarInactiveTintColor: theme.inactive,
  tabBarIcon: () => null,
  tabBarShowLabel: true,
  tabBarStyle: {
    backgroundColor: theme.bg,
    borderTopColor: theme.border,
    borderTopWidth: 0.5,
    height: 52,
  },
  tabBarItemStyle: {
    // Center the label vertically now that there's no icon
    justifyContent: 'center' as const,
    paddingVertical: 0,
    paddingBottom: 15, // ลองเพิ่มค่านี้ดูครับ จะช่วยดัน Label ขึ้นมาจากขอบล่าง
  },
  tabBarLabelStyle: {
    fontSize: 13,
    fontWeight: '500' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    marginTop: 0,
    marginBottom: 0,
  },
  headerStyle: {
    backgroundColor: theme.bg,
    borderBottomColor: theme.border,
    borderBottomWidth: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  headerTintColor: theme.text,
  headerTitleStyle: {
    fontWeight: '500' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    fontSize: 14,
  },
};

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator initialRouteName="Camera" screenOptions={screenOptions}>
        <Tab.Screen
          name="Camera"
          component={CameraScreen}
          options={{ title: 'Camera', headerShown: false }}
        />
        <Tab.Screen
          name="Gallery"
          component={GalleryScreen}
          options={{ title: 'Gallery' }}
        />
        <Tab.Screen
          name="Map"
          component={MapScreen}
          options={{ title: 'Map' }}
        />
        <Tab.Screen
          name="Form"
          component={FormBuilderScreen}
          options={{ title: 'Form' }}
        />
        <Tab.Screen
          name="Decrypt"
          component={ViewerScreen}
          options={{ title: 'Decrypt' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
};
