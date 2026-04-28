export class DateUtils {
  /**
   * Returns the active working date.
   * - If the day is NOT closed → today
   * - If the day IS closed AND user chose "previous day" mode → yesterday (the closed day)
   * - If the day IS closed AND user chose "new day" (or no choice yet) → tomorrow (next working day)
   */
  static getWorkingDate(): string {
    if (typeof localStorage === 'undefined') {
      return this.getTodayStr();
    }
    const todayStr = this.getTodayStr();
    if (localStorage.getItem(`cloture_${todayStr}`) === 'true') {
      // User explicitly chose to go back to the previous (closed) day
      if (localStorage.getItem('cloture_day_choice') === 'previous') {
        return todayStr; // the closed day
      }
      // Default: move to next working day
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

  /** Returns yesterday's date string in Morocco timezone (YYYY-MM-DD) */
  static getYesterdayStr(): string {
    const d = new Date();
    const tzDate = new Date(d.toLocaleString("en-US", {timeZone: "Africa/Casablanca"}));
    tzDate.setDate(tzDate.getDate() - 1);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${tzDate.getFullYear()}-${pad(tzDate.getMonth() + 1)}-${pad(tzDate.getDate())}`;
  }

  /** Returns true if today's cash register has been closed */
  static isClosed(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(`cloture_${this.getTodayStr()}`) === 'true';
  }

  /** Returns true if the user has already made a choice (Previous or New day) after closure */
  static hasChoiceBeenMade(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('cloture_day_choice') !== null;
  }

  /** Returns true if the user chose to record in the previous (closed) day */
  static isInPreviousDayMode(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('cloture_day_choice') === 'previous';
  }

  /** Activate "previous day" mode */
  static setPreviousDayMode() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('cloture_day_choice', 'previous');
    }
  }

  /** Activate "new day" mode (stop asking) */
  static setNewDayMode() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('cloture_day_choice', 'new');
    }
  }

  /** Clear choice mode (back to default) */
  static clearPreviousDayMode() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('cloture_day_choice');
    }
  }

  static setClosed() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`cloture_${this.getTodayStr()}`, 'true');
      // Reset choice when a fresh closure happens
      localStorage.removeItem('cloture_day_choice');
    }
  }
}
