import { GoogleGenerativeAI } from '@google/generative-ai';
const ai = new GoogleGenerativeAI('AIzaSyBJZzK4yI6ZhMuLyOEuYbFOsJwEl2qaFUs');

async function run() {
  const fetch = globalThis.fetch;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyBJZzK4yI6ZhMuLyOEuYbFOsJwEl2qaFUs';
  const res = await fetch(url);
  const data = await res.json();
  console.log(data);
}
run();
