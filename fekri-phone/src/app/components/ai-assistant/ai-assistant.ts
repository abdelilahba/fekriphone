import { Component, ElementRef, ViewChild, ChangeDetectorRef, Injectable } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable({ providedIn: 'root' })
export class AIService {
  // --- IMPORTANT: IN A REAL APP, DO NOT HARDCODE API KEYS ON THE FRONTEND ---
  // For the sake of this prototype for your friend, we use a key here.
  // We'll leave the string empty, you will need to replace it with a real Gemini API Key.
  private API_KEY = 'REPLACE_WITH_YOUR_GEMINI_API_KEY';
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    this.genAI = new GoogleGenerativeAI(this.API_KEY);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: "You are an expert Moroccan AI assistant for a mobile phone store called 'Fekri Phone'. " +
        "You always answer in Moroccan Darija (Arabic script). " +
        "You help the store owner improve sales, manage inventory, understand profit, and give tips on customer satisfaction. " +
        "Respond clearly and keep answers somewhat concise, practical, and business-oriented.",
    });
  }

  async askQuestion(question: string): Promise<string> {
    if (this.API_KEY === 'REPLACE_WITH_YOUR_GEMINI_API_KEY') {
      return "عفواً، خاصك تحط API Key ديال Gemini فـ الكود باش نقد نجاوبك! (AIService)";
    }
    try {
      const result = await this.model.generateContent(question);
      return result.response.text();
    } catch (e: any) {
      console.error(e);
      return "عفواً، وقع شي مشكل فالإتصال بـ الذكاء الاصطناعي. جرب مرة أخرى.";
    }
  }
}

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-assistant.html',
  styleUrl: './ai-assistant.css'
})
export class AiAssistant {
  @ViewChild('chatScroll') private scrollContainer!: ElementRef;

  isOpen = false;
  userInput = '';
  isThinking = false;

  messages: { text: string; sender: 'user' | 'ai' }[] = [
    { text: 'السلام عليكم صديقي! أنا المساعد الذكي ديال "فكري فون". كيفاش نقدر نعاونك باش نطوروا المحل اليوم؟', sender: 'ai' }
  ];

  constructor(private aiService: AIService, private cdr: ChangeDetectorRef) {}

  toggleChat() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }

  async sendMessage() {
    const text = this.userInput.trim();
    if (!text) return;

    // Add user msg
    this.messages.push({ text, sender: 'user' });
    this.userInput = '';
    this.isThinking = true;
    this.scrollToBottom();

    // Call AI
    const response = await this.aiService.askQuestion(text);

    this.isThinking = false;
    this.messages.push({ text: response, sender: 'ai' });
    this.scrollToBottom();
    this.cdr.detectChanges();
  }

  private scrollToBottom() {
    try {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }
}
