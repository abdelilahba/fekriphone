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
      model: "gemini-1.5-flash",
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

  async parseInvoiceImage(base64Image: string, mimeType: string): Promise<any[]> {
    if (!this.API_KEY || this.API_KEY === 'REPLACE_WITH_YOUR_GEMINI_API_KEY') {
      throw new Error("API Key is missing.");
    }

    try {
      const prompt = `
        أنت محاسب وخبير في إدارة المخزون لمتجر هواتف وإكسسوارات في المغرب (فكري فون).
        مرفق صورة لفاتورة شراء من مورد.
        الرجاء استخراج المنتجات الموجودة في الفاتورة مع الكمية وسعر الشراء.
        قُم بتقدير سعر البيع (prix_vente) بناءً على سعر الشراء (prix_achat) مع هامش ربح معقول لمتجر هواتف (مثلاً 20% أو 30% زيادة).
        
        أريد الإجابة فقط بتنسيق JSON صارم عبارة عن مصفوفة (Array) من العناصر (Objects).
        كل عنصر يجب أن يحتوي على الحقول التالية فقط:
        - nom (اسم المنتج، String)
        - categorie_id (يمكنك تركه null، String)
        - code_barre (إذا كان موجوداً في الفاتورة وإلا اتركه فارغاً، String)
        - quantite (الكمية، Number)
        - prix_achat (سعر الشراء، Number)
        - prix_vente (سعر البيع المقترح، Number)
        
        لا تضف أي نص آخر، فقط مصفوفة الـ JSON.
      `;

      const imageParts = [
        {
          inlineData: {
            data: base64Image,
            mimeType
          }
        }
      ];

      const result = await this.model.generateContent([prompt, ...imageParts]);
      const response = await result.response;
      let text = response.text();
      
      // Clean the response if it contains markdown formatting
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      return JSON.parse(text);
    } catch (error: any) {
      console.error('Error parsing invoice image:', error);
      if (error?.message?.includes('503') || error?.message?.includes('high demand')) {
        throw new Error('السيرفور ديال جوجل عامر دابا (503)، جرب مرة أخرى من بعد شوية!');
      }
      throw error;
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
