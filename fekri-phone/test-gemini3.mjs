import { GoogleGenerativeAI } from '@google/generative-ai';
const ai = new GoogleGenerativeAI('AIzaSyBJZzK4yI6ZhMuLyOEuYbFOsJwEl2qaFUs');

async function testModel(modelName) {
  try {
    const model = ai.getGenerativeModel({ model: modelName });
    const result = await model.generateContent("hello");
    console.log(modelName, 'SUCCESS:', result.response.text());
  } catch (err) {
    console.error(modelName, 'ERROR:', err.message);
  }
}

async function run() {
  await testModel('gemini-2.5-flash');
  await testModel('gemini-3-flash');
  await testModel('gemini-3-flash-preview');
}

run();
