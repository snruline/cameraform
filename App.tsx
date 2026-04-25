import React, {useEffect} from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {StatusBar, Alert, View} from 'react-native';
import {AppNavigator} from './src/navigation/AppNavigator';
import {getDb} from './src/database/db';
import {getOrCreateMasterKey} from './src/security/keyManager';
import {saveFormConfig, getActiveFormConfig} from './src/database/formConfigs';
import {DEFAULT_FORM} from './src/config/defaultForm';
import {theme} from './src/theme';

const App: React.FC = () => {
  useEffect(() => {
    (async () => {
      try {
        // 1. Open DB + run migrations
        getDb();

        // 2. Prepare master key in Keychain/Keystore
        await getOrCreateMasterKey();

        // 3. Seed default form if none exists
        const active = await getActiveFormConfig();
        if (!active) {
          await saveFormConfig(DEFAULT_FORM);
        }
      } catch (e: any) {
        Alert.alert('Startup failed', e.message);
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{flex: 1, backgroundColor: theme.bg}}>
      <SafeAreaProvider>
        <View style={{flex: 1, backgroundColor: theme.bg}}>
          <StatusBar barStyle="light-content" backgroundColor={theme.bg} />
          <AppNavigator />
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;
