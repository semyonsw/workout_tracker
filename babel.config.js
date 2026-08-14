/**
 * NativeWind compiles Tailwind classes at build time via a Babel preset;
 * `jsxImportSource: 'nativewind'` is what lets `className` exist on RN core
 * components without a wrapper library.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Must stay last — Reanimated's worklet transform rewrites the AST.
      'react-native-reanimated/plugin',
    ],
  };
};
