import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThermalPrintService {
  private device: any = null;
  private interfaceNumber = 0;
  private endpointNumber = 1;

  /** Check if Web USB is supported */
  get isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as any).usb;
  }

  /** Check if a printer is currently connected */
  get isConnected(): boolean {
    return this.device !== null && this.device.opened;
  }

  /** Get connected printer name */
  get printerName(): string {
    return this.device?.productName || '';
  }

  /**
   * Connect to a USB thermal printer.
   * Shows a browser device picker so the user selects their printer.
   */
  async connect(): Promise<boolean> {
    if (!this.isSupported) {
      throw new Error('Web USB غير مدعوم فـ هاد المتصفح. استعمل Chrome.');
    }

    try {
      // Request any USB printer (class 7 = printer)
      this.device = await (navigator as any).usb.requestDevice({
        filters: [{ classCode: 7 }] // USB Printer class
      });

      await this.device.open();

      // Select the first configuration
      if (this.device.configuration === null) {
        await this.device.selectConfiguration(1);
      }

      // Find the printer interface and endpoint
      const iface = this.device.configuration?.interfaces?.find((i: any) =>
        i.alternates?.some((a: any) => a.interfaceClass === 7)
      );

      if (!iface) {
        this.interfaceNumber = 0;
      } else {
        this.interfaceNumber = iface.interfaceNumber;
      }

      await this.device.claimInterface(this.interfaceNumber);

      // Find OUT endpoint
      const alt = this.device.configuration?.interfaces?.[this.interfaceNumber]?.alternates?.[0];
      if (alt) {
        const outEndpoint = alt.endpoints?.find((e: any) => e.direction === 'out');
        if (outEndpoint) {
          this.endpointNumber = outEndpoint.endpointNumber;
        }
      }

      console.log(`✅ Printer connected: ${this.device!.productName} (endpoint ${this.endpointNumber})`);
      return true;
    } catch (err: any) {
      console.error('USB connection error:', err);
      this.device = null;
      if (err.name === 'NotFoundError') {
        throw new Error('ما اختاريتي حتى طابعة. عاود جرب.');
      }
      throw new Error('ما قدرتش نتوصل بالطابعة: ' + err.message);
    }
  }

  /** Disconnect the printer */
  async disconnect(): Promise<void> {
    if (this.device) {
      try {
        await this.device.releaseInterface(this.interfaceNumber);
        await this.device.close();
      } catch (_) {}
      this.device = null;
    }
  }

  /**
   * Print a barcode/QR image on a label (35mm x 20mm).
   * Takes a canvas or image data URL and sends raw ESC/POS bitmap commands.
   */
  async printLabel(imageDataUrl: string, copies: number = 1): Promise<void> {
    if (!this.device || !this.device.opened) {
      throw new Error('الطابعة ماشي متوصلة. وصلها أولا.');
    }

    // Convert image to monochrome bitmap data
    const { width, height, pixels } = await this.imageToMonochrome(imageDataUrl, 280, 160);
    
    for (let c = 0; c < copies; c++) {
      const commands = this.buildEscPosRaster(width, height, pixels);
      await this.sendData(commands);
      // Small delay between copies
      if (c < copies - 1) {
        await this.sleep(200);
      }
    }
  }

  /**
   * Convert an image data URL to monochrome bitmap pixels.
   * Resizes to target dimensions suitable for 203 DPI thermal printer.
   */
  private imageToMonochrome(
    dataUrl: string,
    targetWidth: number,
    targetHeight: number
  ): Promise<{ width: number; height: number; pixels: Uint8Array }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d')!;
        
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Draw image centered and fitting
        const scale = Math.min(targetWidth / img.width, targetHeight / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const offsetX = (targetWidth - drawW) / 2;
        const offsetY = (targetHeight - drawH) / 2;
        ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

        // Get pixel data
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const data = imageData.data;

        // Convert to monochrome (1 bit per pixel, packed into bytes)
        // Width must be multiple of 8
        const byteWidth = Math.ceil(targetWidth / 8);
        const pixels = new Uint8Array(byteWidth * targetHeight);

        for (let y = 0; y < targetHeight; y++) {
          for (let x = 0; x < targetWidth; x++) {
            const idx = (y * targetWidth + x) * 4;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
            // Grayscale with threshold — dark pixels = 1 (print), light = 0 (no print)
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            if (gray < 128) {
              const byteIndex = y * byteWidth + Math.floor(x / 8);
              const bitIndex = 7 - (x % 8);
              pixels[byteIndex] |= (1 << bitIndex);
            }
          }
        }

        resolve({ width: targetWidth, height: targetHeight, pixels });
      };
      img.onerror = () => reject(new Error('فشل تحميل الصورة'));
      img.src = dataUrl;
    });
  }

  /**
   * Build ESC/POS raster print commands for the bitmap.
   * Uses GS v 0 (Print raster bit image) command.
   */
  private buildEscPosRaster(width: number, height: number, pixels: Uint8Array): Uint8Array {
    const byteWidth = Math.ceil(width / 8);
    const imageDataLength = byteWidth * height;

    // Commands:
    // 1. ESC @ — Initialize printer
    // 2. GS v 0 — Print raster bit image
    //    Format: 0x1D 0x76 0x30 m xL xH yL yH d1...dk
    //    m=0 (normal), xL/xH = byte width, yL/yH = height
    // 3. Feed + partial cut (for label gap)

    const header = new Uint8Array([
      0x1B, 0x40,           // ESC @ — Initialize
      0x1D, 0x76, 0x30,     // GS v 0 — Print raster image
      0x00,                  // m = 0 (normal mode)
      byteWidth & 0xFF,     // xL — byte width low
      (byteWidth >> 8) & 0xFF, // xH — byte width high
      height & 0xFF,        // yL — height low
      (height >> 8) & 0xFF, // yH — height high
    ]);

    // Feed after image to eject the label
    const footer = new Uint8Array([
      0x1B, 0x64, 0x03,     // ESC d 3 — Feed 3 lines
      0x1B, 0x69,           // ESC i — partial cut (if supported)
    ]);

    // Combine: header + image data + footer
    const result = new Uint8Array(header.length + imageDataLength + footer.length);
    result.set(header, 0);
    result.set(pixels, header.length);
    result.set(footer, header.length + imageDataLength);

    return result;
  }

  /** Send raw data to the USB printer */
  private async sendData(data: Uint8Array): Promise<void> {
    const chunkSize = 4096; // Send in chunks to avoid buffer overflow
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      const chunk = data.slice(offset, Math.min(offset + chunkSize, data.length));
      const result = await this.device!.transferOut(this.endpointNumber, chunk);
      if (result.status !== 'ok') {
        throw new Error('فشل الإرسال للطابعة');
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
