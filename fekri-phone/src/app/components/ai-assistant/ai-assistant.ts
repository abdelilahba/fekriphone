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
  private visionModel: any;
  private fallbackVisionModel: any;

  constructor(private supabase: SupabaseService) {
    this.genAI = new GoogleGenerativeAI(this.API_KEY);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction:
        "You are an expert Moroccan AI assistant for a mobile phone store called 'Fekri Phone'. " +
        'You always answer in Moroccan Darija (Arabic script). ' +
        'You help the store owner improve sales, manage inventory, understand profit, and give tips on customer satisfaction. ' +
        'When the user asks about their data (like products, sales, stock), formulate your answer using the data block provided in their prompt. ' +
        'Respond clearly and keep answers practical, and business-oriented.',
    });

    // Create a specific fast model for invoice parsing
    this.visionModel = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    // Fallback model when primary quota is exceeded
    this.fallbackVisionModel = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash-8b',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });
  }

  async *askQuestionStream(question: string): AsyncGenerator<string, void, unknown> {
    if (!this.API_KEY || this.API_KEY === 'REPLACE_WITH_YOUR_GEMINI_API_KEY') {
      yield 'عفواً، خاصك تحط API Key ديال Gemini فـ الكود باش نقد نجاوبك! (AIService)';
      return;
    }

    try {
      // Fetch live data as "Tools" / context for the LLM
      const [produits, ventes, credits, depenses] = await Promise.all([
        this.supabase.getProduits(),
        this.supabase.getVentes(),
        this.supabase.getCredits(),
        this.supabase.getDepenses(),
      ]);

      const totalSales = ventes.reduce((sum, v) => sum + Number(v.montant_total || 0), 0);
      const lowStockProducts = produits.filter((p) => p.quantite <= 3);

      const systemData = `
--- LIVE STORE DATA (DO NOT EXPOSE RAW JSON TO USER) ---
Total Products in System: ${produits.length}
Total Sales Count: ${ventes.length}
Total Revenue So Far: ${totalSales} MAD
Items with Low Stock (<=3): ${lowStockProducts.map((p) => p.nom + ' (' + p.quantite + ' left)').join(', ')}
Total Credits (Unpaid debts count): ${credits.filter((c) => c.montant_restant > 0).length}
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
      yield 'عفواً، وقع شي مشكل فالإتصال بـ الذكاء الاصطناعي. جرب مرة أخرى.';
    }
  }

  async parseInvoiceImage(
    base64Image: string,
    mimeType: string,
    categoriesList: string[] = [],
  ): Promise<any[]> {
    if (!this.API_KEY || this.API_KEY === 'REPLACE_WITH_YOUR_GEMINI_API_KEY') {
      throw new Error('API Key is missing.');
    }

    try {
      const catListStr =
        categoriesList.length > 0
          ? `\nالفئات الموجودة فالمتجر: [${categoriesList.join(', ')}]. خاصك تختار واحدة من هاد الفئات لكل منتج وتديرها ف "categorie_nom".`
          : `\nقدر الفئة ديال كل منتج (مثلا: هواتف، إكسسوارات، سماعات، شواحن، واقيات، باور بانك...) وديرها ف "categorie_nom".`;

      const prompt = `
Vous êtes un système expert d'extraction de données facturables. Voici une image capturée d'une facture marocaine (écrite à la main).
Vous devez extraire la liste des articles avec une PRÉCISION ABSOLUE.
${catListStr}

IMPORTANT : L'image de la facture contient 4 colonnes. Voici leur ordre STRICT de gauche à droite :
[Colonne 1 - Gauche] "Total" (المجموع) : Le prix total de la ligne.
[Colonne 2 - Milieu Gauche] "Prix unitaire" (الثمن) : CELUI-CI EST LE VRAI PRIX D'ACHAT (prix_achat) !
[Colonne 3 - Milieu Droite] "Produit" (نوع البضاعة) : Le nom du produit.
[Colonne 4 - Droite] "Quantité" (العدد) : La quantité achetée.

Instructions d'extraction :
1. Ignorez la somme totale figurant en bas de la facture (ex: 18315). Ne l'incluez jamais comme un produit.
2. Déchiffrez soigneusement les noms des produits (ex: "TC" = Type C, "Ta" = Tête de chargeur, "N3310" = Nokia 3310, "A12" = Samsung A12).
3. "prix_achat" : IL FAUT utiliser exclusivement la Colonne 2 (الثمن / Prix unitaire). JAMAIS la Colonne 1.
   Vérification mathématique : (Colonne 4 "Quantité") x (Colonne 2 "Prix unitaire") = (Colonne 1 "Total").
4. Si un produit est illisible, ignorez-le plutôt que d'inventer des données.

Retournez le résultat UNIQUEMENT sous forme de tableau JSON valide (Array of Objects), selon cette structure exacte :
[
  {
    "nom": "Nom correct du produit",
    "categorie_nom": "Nom_de_la_catégorie",
    "quantite": 2,
    "prix_achat": 1400.0,
    "prix_vente": 0,
    "code_barre": ""
  }
]

Renvoyez *exclusivement* le JSON. Pas de description, pas de bloc de code markdown.
`;

      const imageParts = [
        {
          inlineData: {
            data: base64Image,
            mimeType,
          },
        },
      ];

      // Try primary model first, fallback on quota error
      let result;
      try {
        result = await this.visionModel.generateContent([prompt, ...imageParts]);
      } catch (primaryError: any) {
        if (primaryError?.message?.includes('429') || primaryError?.message?.includes('quota')) {
          console.warn('Primary model quota exceeded, switching to fallback model...');
          result = await this.fallbackVisionModel.generateContent([prompt, ...imageParts]);
        } else {
          throw primaryError;
        }
      }

      const response = await result.response;
      let text = response.text();

      // Clean the response if it contains markdown formatting
      text = text
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      return JSON.parse(text);
    } catch (error: any) {
      console.error('Error parsing invoice image:', error);
      if (error?.message?.includes('503') || error?.message?.includes('high demand')) {
        throw new Error('السيرفور ديال جوجل عامر دابا (503)، جرب مرة أخرى من بعد شوية!');
      }
      if (error?.message?.includes('429') || error?.message?.includes('quota')) {
        throw new Error('وصلتي للحد اليومي ديال الذكاء الاصطناعي (20 مرة/اليوم). جرب غدا!');
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
  styleUrl: './ai-assistant.css',
})
export class AiAssistant {
  @ViewChild('chatScroll') private scrollContainer!: ElementRef;

  isOpen = false;
  userInput = '';
  isThinking = false;

  messages: { text: string; sender: 'user' | 'ai' }[] = [
    {
      text: 'السلام عليكم صديقي! أنا المساعد الذكي ديال "فكري فون". كيفاش نقدر نعاونك باش نطوروا المحل اليوم؟',
      sender: 'ai',
    },
  ];

  constructor(
    private aiService: AIService,
    private cdr: ChangeDetectorRef,
  ) {}

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
    } catch (err) {
      this.isThinking = false;
      this.messages.push({
        text: 'عفواً، وقع شي مشكل فالإتصال بـ الذكاء الاصطناعي. جرب مرة أخرى.',
        sender: 'ai',
      });
      this.cdr.detectChanges();
    }
  }

  private scrollToBottom() {
    try {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.scrollTop =
          this.scrollContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }
}
