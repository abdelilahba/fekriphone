// test-gemini.mjs
import { GoogleGenerativeAI } from '@google/generative-ai';
const ai = new GoogleGenerativeAI('AIzaSyBJZzK4yI6ZhMuLyOEuYbFOsJwEl2qaFUs');

async function testModel(modelName) {
  try {
    const model = ai.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("hello");
    console.log(modelName, 'SUCCESS:', result.response.text().slice(0, 10));
  } catch (err) {
    console.error(modelName, 'ERROR:', err.message);
  }
}

async function run() {
  await testModel('gemini-1.5-flash');
  await testModel('gemini-1.5-flash-latest');
  await testModel('gemini-2.0-flash');
  await testModel('gemini-flash-latest');
}

run();
