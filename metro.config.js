const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const os = require('os');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    sourceExts: ['js', 'jsx', 'ts', 'tsx', 'json'],
    assetExts: ['png', 'jpg', 'jpeg', 'gif', 'ttf', 'otf', 'csv'],
  },
  // จำกัด worker ให้เหมาะกับ WSL 9P (มาก worker ไม่ได้เร็วขึ้นถ้า I/O เป็น bottleneck)
  maxWorkers: 4,
  // ย้าย transformer cache ไปที่ /tmp (ext4 native) แทน /mnt/d (9P ช้า)
  cacheVersion: 'cameraform-v1',
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
