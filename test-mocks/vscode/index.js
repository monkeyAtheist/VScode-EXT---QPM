const SymbolKind = {};
[
  'File','Module','Namespace','Package','Class','Method','Property','Field','Constructor','Enum','Interface','Function','Variable','Constant','String','Number','Boolean','Array','Object','Key','Null','EnumMember','Struct','Event','Operator','TypeParameter'
].forEach((name, value) => {
  SymbolKind[name] = value;
  SymbolKind[value] = name;
});

module.exports = {
  Uri: { file: (fsPath) => ({ fsPath }) },
  SymbolKind,
  window: {},
  workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) }
};
