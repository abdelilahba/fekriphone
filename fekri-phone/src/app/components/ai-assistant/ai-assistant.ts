import { Component, ElementRef, ViewChild, ChangeDetectorRef, Injectable } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SupabaseService } from '../../core/services/supabase.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AIService {
  // API Key is now securely fetched from environment configuration that is not tracked by Git
  private API_KEY = environment.geminiKey;
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(private supabase: SupabaseService) {
    this.genAI = new GoogleGenerativeAI(this.API_KEY);
    this.model = this.genAI.getGenerativeModel({
      model: "gemini-flash-latest",
      systemInstruction: "You are an expert Moroccan AI assistant for a mobile phone store called 'Fekri Phone'. " +
        "You always answer in Moroccan Darija (Arabic script). " +
        "You help the store owner improve sales, manage inventory, understand profit, and give tips on customer satisfaction. " +
        "When the user asks about their data (like products, sales, stock), formulate your answer using the data block provided in their prompt. " +
        "Respond clearly and keep answers practical, and business-oriented.",
    });
  }

  async *askQuestionStream(question: string): AsyncGenerator<string, void, unknown> {
    if (!this.API_KEY || this.API_KEY === 'REPLACE_WITH_YOUR_GEMINI_API_KEY') {
      yield "عفواً، خاصك تحط API Key ديال Gemini فـ الكود باش نقد نجاوبك! (AIService)";
      return;
    }
    
    try {
      // Fetch live data as "Tools" / context for the LLM
      const [produits, ventes, credits, depenses] = await Promise.all([
        this.supabase.getProduits(),
        this.supabase.getVentes(),
        this.supabase.getCredits(),
        this.supabase.getDepenses()
      ]);

      const totalSales = ventes.reduce((sum, v) => sum + Number(v.montant_total || 0), 0);
      const lowStockProducts = produits.filter(p => p.quantite <= 3);

       const systemData = `
--- LIVE STORE DATA (DO NOT EXPOSE RAW JSON TO USER) ---
Total Products in System: ${produits.length}
Total Sales Count: ${ventes.length}
Total Revenue So Far: ${totalSales} MAD
Items with Low Stock (<=3): ${lowStockProducts.map(p => p.nom + ' (' + p.quantite + ' left)').join(', ')}
Total Credits (Unpaid debts count): ${credits.filter(c => c.montant_restant > 0).length}
Total Expense Records: ${depenses.length}
------------------------------------------------------
USER QUESTION: ${question}
`;

      const result = await this.model.generateContentStream(systemData);
      for await (const chunk of result.stream) {
        yield chunk.text();
      }
    } catch (e: any) {
      console.error(e);
      yield "عفواً، وقع شي مشكل فالإتصال بـ الذكاء الاصطناعي. جرب مرة أخرى.";
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

    try {
      // Call AI with stream
      const stream = this.aiService.askQuestionStream(text);
      
      let firstChunkReceived = false;
      let aiMessageIndex = -1;

      for await (const chunk of stream) {
        if (!firstChunkReceived) {
          this.isThinking = false;
          firstChunkReceived = true;
          this.messages.push({ text: chunk, sender: 'ai' });
          aiMessageIndex = this.messages.length - 1;
        } else {
          this.messages[aiMessageIndex].text += chunk;
        }
        this.scrollToBottom();
        this.cdr.detectChanges();
      }
      
      if (!firstChunkReceived) {
        this.isThinking = false;
      }
    } catch(err) {
      this.isThinking = false;
      this.messages.push({ text: "عفواً، وقع شي مشكل فالإتصال بـ الذكاء الاصطناعي. جرب مرة أخرى.", sender: 'ai' });
      this.cdr.detectChanges();
    }
  }

  private scrollToBottom() {
    try {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop = this.scrollContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }
}
