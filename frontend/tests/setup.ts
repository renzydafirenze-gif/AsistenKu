// Adds the custom jest matchers (toBeOnTheScreen, toHaveAccessibilityState, …).
import '@testing-library/react-native/extend-expect';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
