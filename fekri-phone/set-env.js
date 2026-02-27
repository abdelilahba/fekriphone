const fs = require('fs');

const envPath = './src/environments/environment.ts';
const envDevPath = './src/environments/environment.development.ts';

// Get the key from process.env, or fallback to the provided one (for local dev before .env is ignored)
// Since we are running this locally right now, we will inject the key directly for local dev:
// AIzaSyAnjCBmhL4sB98-SoNwF1f9Bba-qzvXYPs
const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyAnjCBmhL4sB98-SoNwF1f9Bba-qzvXYPs';

const envFileContent = `export const environment = {
  production: true,
  geminiKey: '${apiKey}'
};
`;

const envDevFileContent = `export const environment = {
  production: false,
  geminiKey: '${apiKey}'
};
`;

if (!fs.existsSync('./src/environments')) {
  fs.mkdirSync('./src/environments');
}

fs.writeFileSync(envPath, envFileContent);
fs.writeFileSync(envDevPath, envDevFileContent);

console.log('Environment files generated!');
