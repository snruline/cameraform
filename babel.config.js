module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        alias: {
          '@components': './src/components',
          '@screens': './src/screens',
          '@services': './src/services',
          '@database': './src/database',
          '@security': './src/security',
          '@config': './src/config',
          '@navigation': './src/navigation',
          '@types': './src/types',
          '@utils': './src/utils',
          '@hooks': './src/hooks',
        },
      },
    ],
    'react-native-reanimated/plugin', // ต้องอยู่ท้ายสุดเสมอ
  ],
};
