import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

async function run() {
  try {
    const result = await model.generateContent("Test message, reply with OK");
    console.log("Success:", result.response.text());
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
