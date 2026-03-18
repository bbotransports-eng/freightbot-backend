const CryptoJS = require("crypto-js");

const KEY = process.env.ENCRYPTION_KEY;
if (!KEY || KEY.length < 32) {
  throw new Error("ENCRYPTION_KEY manquante ou trop courte (min 32 caractères)");
}

// Stockage en mémoire (remplacer par DB en production)
const vault = new Map();

/**
 * Chiffre et stocke les credentials d'un utilisateur pour une bourse
 * @param {string} userId - ID unique de l'utilisateur
 * @param {string} bourseId - ID de la bourse (ex: "transeu")
 * @param {string} username
 * @param {string} password
 */
function storeCredentials(userId, bourseId, username, password) {
  const key = `${userId}:${bourseId}`;
  const encrypted = {
    username: CryptoJS.AES.encrypt(username, KEY).toString(),
    password: CryptoJS.AES.encrypt(password, KEY).toString(),
    storedAt: new Date().toISOString(),
  };
  vault.set(key, encrypted);
}

/**
 * Récupère et déchiffre les credentials
 * @returns {{ username: string, password: string } | null}
 */
function getCredentials(userId, bourseId) {
  const key = `${userId}:${bourseId}`;
  const encrypted = vault.get(key);
  if (!encrypted) return null;

  return {
    username: CryptoJS.AES.decrypt(encrypted.username, KEY).toString(CryptoJS.enc.Utf8),
    password: CryptoJS.AES.decrypt(encrypted.password, KEY).toString(CryptoJS.enc.Utf8),
  };
}

/**
 * Supprime les credentials d'une bourse
 */
function removeCredentials(userId, bourseId) {
  vault.delete(`${userId}:${bourseId}`);
}

/**
 * Vérifie si des credentials existent pour une bourse
 */
function hasCredentials(userId, bourseId) {
  return vault.has(`${userId}:${bourseId}`);
}

module.exports = { storeCredentials, getCredentials, removeCredentials, hasCredentials };
