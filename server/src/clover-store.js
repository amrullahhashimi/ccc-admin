const fs = require("fs");
const path = require("path");

// Tokens live in a JSON file next to the server (single-merchant shop).
// Add ".clover-tokens.json" to .gitignore — it holds live credentials.
const STORE = path.join(__dirname, "..", ".clover-tokens.json");

function read() {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    return null;
  }
}

function write(tokens) {
  fs.writeFileSync(STORE, JSON.stringify(tokens, null, 2));
}

module.exports = { read, write };