// O app builda sem este arquivo porque o Metro injeta `babel-preset-expo`, mas o
// `babel-jest` do `jest-expo` lê a config do projeto: sem ele os transforms de
// Flow/TSX/React-Compiler não rodam e todo `import 'react-native'` quebra sob Jest.
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
