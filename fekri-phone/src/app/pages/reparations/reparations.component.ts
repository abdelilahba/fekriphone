import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import Swal from 'sweetalert2';
import { RevenuReparation } from '../../core/models/models';

@Component({
  selector: 'app-reparations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reparations.component.html',
  styleUrl: './reparations.component.css'
})
export class ReparationsComponent implements OnInit {
  revenus$ = new BehaviorSubject<RevenuReparation[]>([]);
  loading$ = new BehaviorSubject<boolean>(true);
  totalMois$ = new BehaviorSubject<number>(0);
  toastMessage$ = new BehaviorSubject<{ message: string; type: string } | null>(null);
  showModal = false;
  editMode = false;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  paginatedRevenus$ = new BehaviorSubject<RevenuReparation[]>([]);
  userRole = 'admin';
  selectedDate: string = new Date().toISOString().split('T')[0];
  allRevenusData: RevenuReparation[] = [];
  clients: any[] = [];
  filteredClients: any[] = [];
  showClientsList = false;
  searchQuery = '';

  form = { id: '', description: '', montant: 0, date: '', nomClient: '', montantPaye: 0 };

  constructor(private supabase: SupabaseService, private auth: AuthService) {}

  ngOnInit() { 
    this.auth.userRole$.subscribe(role => {
      this.userRole = role;
    });
    this.loadData(); 
  }

  async loadData() {
    try {
      this.loading$.next(true);
      const revenus = await this.supabase.getRevenus();
      
      let finalRevenus = revenus;
      if (this.userRole !== 'admin') {
        const uid = this.auth.currentUser?.id;
        finalRevenus = revenus.filter((r: any) => r.user_id === uid);
      }

      this.allRevenusData = finalRevenus;
      this.filterByDate();
      
      this.clients = await this.supabase.getClients();
    } catch (error) {
      this.showToast('خطأ فالتحميل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  filterByDate() {
    let filtered = this.allRevenusData;
    if (this.selectedDate) {
      filtered = filtered.filter(r => (r.date.split(' ')[0] || r.date) === this.selectedDate);
    }
    
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(r => 
        (r.description && r.description.toLowerCase().includes(q)) ||
        (r.nom_client && r.nom_client.toLowerCase().includes(q))
      );
    }

    this.revenus$.next(filtered);

    const total = filtered.reduce((s: number, r: any) => s + Number(r.montant), 0);
    this.totalMois$.next(total);
    this.currentPage = 1;
    this.paginate();
  }

  paginate() {
    const all = this.revenus$.value;
    this.totalPages = Math.max(1, Math.ceil(all.length / this.pageSize));
    const start = (this.currentPage - 1) * this.pageSize;
    this.paginatedRevenus$.next(all.slice(start, start + this.pageSize));
  }
  goToPage(p: number) { this.currentPage = p; this.paginate(); }
  getPages(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  openAdd() {
    this.editMode = false;
    this.form = { 
      id: '', 
      description: '', 
      montant: 0, 
      date: new Date().toISOString().split('T')[0],
      nomClient: '',
      montantPaye: 0 
    };
    this.showModal = true;
  }

  openEdit(r: any) {
    this.editMode = true;
    this.form = { 
      id: r.id, 
      description: r.description, 
      montant: r.montant, 
      date: r.date,
      nomClient: r.nom_client || '',
      montantPaye: r.montant // On assumption that old records were paid in full
    };
    this.showModal = true;
  }

  closeModal() { this.showModal = false; }

  async save() {
    if (!this.form.description || !this.form.montant) {
      this.showToast('خصك تدخل الوصف والمبلغ', 'error');
      return;
    }
    try {
      let clientId = null;
      if (this.form.nomClient.trim()) {
        let client = this.clients.find(c => c.nom.toLowerCase() === this.form.nomClient.trim().toLowerCase());
        if (client) {
          clientId = client.id;
        } else {
          const newClient = await this.supabase.addClient({ nom: this.form.nomClient.trim() });
          clientId = newClient.id;
          // Update local list
          this.clients.push(newClient);
        }
      }

      const data = { 
        description: this.form.description, 
        montant: this.form.montant, 
        date: this.form.date,
        nom_client: this.form.nomClient.trim(),
        client_id: clientId
      };
      const uid = this.auth.currentUser?.id;
      
      if (this.editMode) {
        await this.supabase.updateRevenu(this.form.id, data);
        this.showToast('تعدل بنجاح ✅', 'success');
      } else {
        // Handle Credit only if client name is provided AND there's a remainder
        const reste = this.form.montant - this.form.montantPaye;
        if (this.form.nomClient.trim() && reste > 0) {
          if (!clientId) {
            this.showToast('وقع مشكل فربط الكليان بالكريدي', 'error');
            return;
          }

          await this.supabase.addCredit({
            client_id: clientId,
            nom_client: this.form.nomClient.trim(),
            description: 'باقي ديال إصلاح: ' + this.form.description,
            montant: reste,
            montant_paye: 0,
            date: this.form.date
          }, uid);
        }

        await this.supabase.addRevenu(data, uid);
        this.showToast('تزاد بنجاح ✅', 'success');
      }
      this.closeModal();
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  // Custom methods for client auto-complete
  onClientSearch() {
    const term = this.form.nomClient.toLowerCase().trim();
    if (!term) {
      this.filteredClients = [];
      this.showClientsList = false;
      return;
    }
    this.filteredClients = this.clients.filter(c => c.nom.toLowerCase().includes(term)).slice(0, 5);
    this.showClientsList = this.filteredClients.length > 0;
  }

  selectClient(name: string) {
    this.form.nomClient = name;
    this.showClientsList = false;
  }

  // Auto-fill paid amount if it's the same as total
  onMontantChange() {
    // If montantPaye was 0 or never edited, and montant is set, we could auto-suggest it
    // But for now, the save() logic handles "no name = no credit" which is safer.
  }

  async delete(r: RevenuReparation) {
    const result = await Swal.fire({
      title: 'واش بصح؟',
      text: 'بغيتي تمسح هاد الإصلاح?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '🗑️ أيه، مسح',
      cancelButtonText: 'لا، خليه'
    });
    if (!result.isConfirmed) return;
    try {
      const uid = this.auth.currentUser?.id;
      await this.supabase.deleteRevenu(r.id, uid);
      this.showToast('تمسح ✅', 'success');
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  formatMAD(a: number): string { return Number(a).toLocaleString('ar-MA') + ' د.م'; }
  showToast(msg: string, type: string) {
    this.toastMessage$.next({ message: msg, type });
    setTimeout(() => this.toastMessage$.next(null), 3000);
  }
}
