function buildMeta(source, details = {}) {
  return {
    source,
    ...details,
    at: new Date().toISOString(),
  };
}

module.exports = {
  buildMeta,
};
