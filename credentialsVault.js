const CryptoJS = require("crypto-js");

const KEY = process.env.ENCRYPTION_KEY || "default_key_32_characters_minimum";
const vault = new Map();

function storeCredentials(userId, bourseId, username, password) {
  const key = `${userId}:${bourseId}`;
  vault.set(key, {
    username: CryptoJS.AES.encrypt(username, KEY).toString(),
    password: CryptoJS.AES.encrypt(password, KEY).toString(),
  });
}

function getCredentials(userId, bourseId) {
  const key = `${userId}:${bourseId}`;
  const enc = vault.get(key);
  if (!enc) return null;
  return {
    username: CryptoJS.AES.decrypt(enc.username, KEY).toString(CryptoJS.enc.Utf8),
    password: CryptoJS.AES.decrypt(enc.password, KEY).toString(CryptoJS.enc.Utf8),
  };
}

function removeCredentials(userId, bourseId) {
  vault.delete(`${userId}:${bourseId}`);
}

function hasCredentials(userId, bourseId) {
  return vault.has(`${userId}:${bourseId}`);
}

module.exports = { storeCredentials, getCredentials, removeCredentials, hasCredentials };
