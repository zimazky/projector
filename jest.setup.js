// Jest setup file - adds Jasmine-compatible APIs for migrated tests

// Create a jasmine-compatible spy with .and.returnValue() API
function createJasmineSpy(name) {
  const mockFn = jest.fn();
  mockFn.and = {
    returnValue: (value) => {
      mockFn.mockReturnValue(value);
      return mockFn;
    },
    resolveTo: (value) => {
      mockFn.mockResolvedValue(value);
      return mockFn;
    }
  };
  return mockFn;
}

// Add jasmine global for tests that use jasmine.createSpy
global.jasmine = {
  createSpy: createJasmineSpy
};

// Add Jasmine-style matchers that map to Jest equivalents
expect.extend({
  toBeFalse(received) {
    const pass = received === false;
    return {
      pass,
      message: () => `expected ${received} to be false`
    };
  },
  toBeTrue(received) {
    const pass = received === true;
    return {
      pass,
      message: () => `expected ${received} to be true`
    };
  }
});

// Mock localStorage for jsdom environment
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value.toString();
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true
});
