import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import Swal from 'sweetalert2';
import { Client, Credit, CreditPaiement } from '../../core/models/models';

@Component({
  selector: 'app-clients',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clients.component.html',
  styleUrl: './clients.component.css'
})
export class ClientsComponent implements OnInit {
  private allClients: Client[] = [];
  clients$ = new BehaviorSubject<Client[]>([]);
  loading$ = new BehaviorSubject<boolean>(true);
  toastMessage$ = new BehaviorSubject<{ message: string; type: string } | null>(null);
  
  showModal = false;
  showCreditsModal = false;
  editMode = false;
  
  form = { id: '', nom: '', telephone: '', adresse: '' };
  
  selectedClient: Client | null = null;
  clientCredits: Credit[] = [];
  loadingCredits$ = new BehaviorSubject<boolean>(false);
  
  private currentUserId: string | null = null;
  userRole: string = 'employee';
  private allCredits: any[] = [];

  constructor(private supabase: SupabaseService, private auth: AuthService) {}

  ngOnInit() { 
    this.auth.user$.subscribe(user => {
      this.currentUserId = user ? user.id : null;
    });
    this.auth.userRole$.subscribe(role => {
      this.userRole = role;
      this.loadData(); 
    });
  }

  async loadData() {
    try {
      this.loading$.next(true);
      const [clients, credits] = await Promise.all([
        this.supabase.getClients(),
        this.supabase.getCredits()
      ]);
      this.allClients = clients;
      this.clients$.next(clients);
      this.allCredits = credits;
    } catch (error) {
      this.showToast('خطأ فالتحميل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  async loadClientCredits(client: Client) {
    try {
      this.loadingCredits$.next(true);
      this.selectedClient = client;
      this.clientCredits = await this.supabase.getClientCredits(client.id);
      this.showCreditsModal = true;
    } catch (error) {
      this.showToast('خطأ فالتحميل ديال الديون', 'error');
    } finally {
      this.loadingCredits$.next(false);
    }
  }

  openAdd() {
    this.editMode = false;
    this.form = { id: '', nom: '', telephone: '', adresse: '' };
    this.showModal = true;
  }

  openEdit(c: Client) {
    this.editMode = true;
    this.form = { id: c.id, nom: c.nom, telephone: c.telephone || '', adresse: c.adresse || '' };
    this.showModal = true;
  }

  closeModal() { this.showModal = false; }
  closeCreditsModal() { this.showCreditsModal = false; }

  async save() {
    if (!this.form.nom) {
      this.showToast('خاصك تدخل الإسم', 'error');
      return;
    }
    try {
      if (this.editMode) {
        await this.supabase.updateClient(this.form.id, {
          nom: this.form.nom,
          telephone: this.form.telephone || null,
          adresse: this.form.adresse || null
        });
        this.showToast('تعدل بنجاح ✅', 'success');
      } else {
        await this.supabase.addClient({
          nom: this.form.nom,
          telephone: this.form.telephone || null,
          adresse: this.form.adresse || null
        });
        this.showToast('تزاد بنجاح ✅', 'success');
      }
      this.closeModal();
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  async delete(c: Client) {
    const result = await Swal.fire({
      title: 'واش بصح؟',
      text: `بغيتي تمسح الزبون "${c.nom}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '🗑️ أيه، مسح',
      cancelButtonText: 'لا، خليه'
    });
    if (!result.isConfirmed) return;
    try {
      await this.supabase.deleteClient(c.id);
      this.showToast('تمسح ✅', 'success');
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  getClientStats(clientId: string): { totalCredits: number; totalNonPaye: number; creditsCount: number } {
    const credits = this.allCredits.filter((c: any) => c.client_id === clientId);
    const totalCredits = credits.reduce((s: number, c: any) => s + Number(c.montant), 0);
    const totalNonPaye = credits.reduce((s: number, c: any) => s + (Number(c.montant) - Number(c.montant_paye)), 0);
    return { totalCredits, totalNonPaye, creditsCount: credits.length };
  }

  getReste(c: Credit): number { return Number(c.montant) - Number(c.montant_paye); }

  formatMAD(a: number): string { return Number(a).toLocaleString('ar-MA') + ' د.م'; }
  
  showToast(msg: string, type: string) {
    this.toastMessage$.next({ message: msg, type });
    setTimeout(() => this.toastMessage$.next(null), 3000);
  }
}
