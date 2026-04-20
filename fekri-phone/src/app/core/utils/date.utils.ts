export class DateUtils {
  static getWorkingDate(): string {
    if (typeof localStorage === 'undefined') {
      return this.getTodayStr(); // fallback for SSR, though this app is CSR
    }
    const todayStr = this.getTodayStr();
    if (localStorage.getItem(`cloture_${todayStr}`) === 'true') {
      const d = new Date();
      const tzDate = new Date(d.toLocaleString("en-US", {timeZone: "Africa/Casablanca"}));
      tzDate.setDate(tzDate.getDate() + 1);
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${tzDate.getFullYear()}-${pad(tzDate.getMonth() + 1)}-${pad(tzDate.getDate())}`;
    }
    return todayStr;
  }

  static getTodayStr(): string {
    const d = new Date();
    const tzDate = new Date(d.toLocaleString("en-US", {timeZone: "Africa/Casablanca"}));
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${tzDate.getFullYear()}-${pad(tzDate.getMonth() + 1)}-${pad(tzDate.getDate())}`;
  }
  
  static setClosed() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`cloture_${this.getTodayStr()}`, 'true');
    }
  }
}
