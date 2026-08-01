// AsyncStorage is a native module with no implementation under Jest; use the
// in-memory mock the package ships for exactly this purpose.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
