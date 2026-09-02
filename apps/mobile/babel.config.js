module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Worklets must be last. Reanimated 4 and Gesture Handler both compile
    // their callbacks through it; the camera and every gesture in this app run
    // on the UI thread, so this plugin is not optional here.
    plugins: ['react-native-worklets/plugin'],
  };
};
