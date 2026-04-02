const crypto = require("crypto");

function generateId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function badRequest(message) {
  return { error: "Bad Request", message };
}

function notFound(message) {
  return { error: "Not Found", message };
}

module.exports = {
  generateId,
  badRequest,
  notFound,
};
