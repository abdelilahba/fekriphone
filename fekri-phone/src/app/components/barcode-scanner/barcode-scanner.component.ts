import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './barcode-scanner.component.html',
  styleUrl: './barcode-scanner.component.css'
})
export class BarcodeScannerComponent implements OnInit, OnDestroy {
  @Input() title: string = 'مسح الكودبار / QR Code';
  @Input() continuous: boolean = false;
  @Output() scanned = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('scannerRegion') scannerRegionRef!: ElementRef;

  scanner: Html5Qrcode | null = null;
  isStarting = true;
  errorMessage = '';
  hasCameras = true;
  availableCameras: { id: string; label: string }[] = [];
  selectedCameraId = '';
  isTorchOn = false;
  hasTorch = false;
  private scannerContainerId = 'qr-reader-' + Math.random().toString(36).substring(2, 9);
  private audioCtx: AudioContext | null = null;
  private lastScannedCode = '';
  private lastScanTime = 0;

  get containerId(): string {
    return this.scannerContainerId;
  }

  ngOnInit() {
    // Delay initialization slightly to let DOM render the container
    setTimeout(() => {
      this.initScanner();
    }, 150);
  }

  ngOnDestroy() {
    this.stopScanner();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch (_) {}
    }
  }

  async initScanner() {
    this.isStarting = true;
    this.errorMessage = '';

    try {
      // Formats to detect: 1D retail barcodes + 2D QR codes
      const formatsToSupport = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.QR_CODE
      ];

      this.scanner = new Html5Qrcode(this.scannerContainerId, {
        formatsToSupport,
        verbose: false
      });

      // Get cameras
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        this.hasCameras = false;
        this.errorMessage = 'لم يتم العثور على أي كاميرا في الجهاز.';
        this.isStarting = false;
        return;
      }

      this.availableCameras = devices;
      // Prefer rear / back camera (environment) on tablet
      const backCamera = devices.find(d =>
        d.label.toLowerCase().includes('back') ||
        d.label.toLowerCase().includes('rear') ||
        d.label.toLowerCase().includes('خلف') ||
        d.label.toLowerCase().includes('environment')
      );
      this.selectedCameraId = backCamera ? backCamera.id : devices[devices.length - 1].id;

      await this.startReading(this.selectedCameraId);
    } catch (err: any) {
      console.error('Camera init error:', err);
      this.errorMessage =
        err?.message || 'تعذر الوصول إلى الكاميرا. يرجى السماح بالوصول إليها من المتصفح.';
      this.isStarting = false;
    }
  }

  private async startReading(cameraId: string) {
    if (!this.scanner) return;
    this.isStarting = true;

    const config = {
      fps: 15,
      qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
        // Wide rectangle optimized for 1D barcodes and QR codes
        const boxWidth = Math.floor(Math.min(viewfinderWidth * 0.85, 340));
        const boxHeight = Math.floor(Math.min(viewfinderHeight * 0.55, 200));
        return { width: boxWidth, height: boxHeight };
      },
      aspectRatio: 1.333333
    };

    try {
      await this.scanner.start(
        cameraId,
        config,
        (decodedText: string) => {
          this.handleDecodedText(decodedText);
        },
        () => {
          // ignore scan frame misses
        }
      );

      this.isStarting = false;
      this.checkTorchCapability();
    } catch (err: any) {
      console.warn('Failed to start selected camera, falling back to facingMode:', err);
      // Fallback: try environment facingMode directly
      try {
        await this.scanner.start(
          { facingMode: 'environment' },
          config,
          (decodedText: string) => this.handleDecodedText(decodedText),
          () => {}
        );
        this.isStarting = false;
        this.checkTorchCapability();
      } catch (fallbackErr: any) {
        this.errorMessage = 'تعذر تشغيل كاميرا الطابليط. تأكد من تفعيل صلاحية الكاميرا.';
        this.isStarting = false;
      }
    }
  }

  private handleDecodedText(decodedText: string) {
    const trimmed = decodedText.trim();
    if (!trimmed) return;

    const now = Date.now();
    // Debounce duplicate scans within 1.5 seconds if continuous
    if (trimmed === this.lastScannedCode && now - this.lastScanTime < 1500) {
      return;
    }

    this.lastScannedCode = trimmed;
    this.lastScanTime = now;

    // Play instant POS confirmation beep
    this.playSuccessBeep();

    this.scanned.emit(trimmed);

    if (!this.continuous) {
      this.close();
    }
  }

  onCameraSelectChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    if (target && target.value) {
      this.switchCamera(target.value);
    }
  }

  async switchCamera(newCameraId: string) {
    if (newCameraId === this.selectedCameraId) return;
    this.selectedCameraId = newCameraId;
    if (this.scanner && this.scanner.isScanning) {
      await this.scanner.stop();
      await this.startReading(newCameraId);
    }
  }

  async toggleTorch() {
    if (!this.scanner || !this.hasTorch) return;
    try {
      await (this.scanner as any).applyVideoConstraints({
        advanced: [{ torch: !this.isTorchOn }]
      });
      this.isTorchOn = !this.isTorchOn;
    } catch (e) {
      console.warn('Torch toggle not supported:', e);
    }
  }

  private checkTorchCapability() {
    try {
      const capabilities = (this.scanner as any)?.getRunningTrackCameraCapabilities?.();
      this.hasTorch = !!capabilities?.torch;
    } catch (_) {
      this.hasTorch = false;
    }
  }

  /**
   * Generates a crisp, instant POS scanner beep using Web Audio API
   * without needing external mp3 files.
   */
  private playSuccessBeep() {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      // Crisp 1760Hz POS tone (A6)
      osc.frequency.setValueAtTime(1760, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.12);
    } catch (e) {
      // Audio might fail if user hasn't interacted, ignore silently
    }
  }

  async stopScanner() {
    if (this.scanner) {
      try {
        if (this.scanner.isScanning) {
          await this.scanner.stop();
        }
        await this.scanner.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
      this.scanner = null;
    }
  }

  close() {
    this.stopScanner();
    this.closed.emit();
  }
}
