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
  await testModel('gemini-1.5-pro-latest');
  await testModel('gemini-pro');
  await testModel('gemini-flash');
}

run();
