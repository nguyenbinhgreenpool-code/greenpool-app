const fs = require('fs');
try {
  const code = fs.readFileSync('app.js', 'utf8');
  require('vm').Script(code);
  console.log('App.js Syntax OK');
} catch (e) {
  console.error("Syntax Error:", e);
}
