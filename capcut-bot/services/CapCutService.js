/**
 * CapCut Service for handling account creation workflow
 */

import { CONFIG } from '../config/config.js';
import { BrowserService } from './BrowserService.js';
import { EmailService } from './EmailService.js';
import { FileService } from './FileService.js';
import { generateRandomBirthday, sleep, formatAccountData } from '../utils/helpers.js';
import chalk from 'chalk';
import ora from 'ora';

export class CapCutService {
  /**
   * Fill in email on signup page
   * @param {Page} page - Puppeteer page instance
   * @param {string} email - Email address
   * @returns {Promise<void>}
   */
  static async fillEmail(page, email) {
    const spinner = ora(chalk.blue('Mengisi email...')).start();
    
    try {
      const { EMAIL_INPUT, CONTINUE_BUTTON } = CONFIG.CAPCUT.SELECTORS;
      
      await BrowserService.typeIntoField(page, EMAIL_INPUT, email);
      await BrowserService.clickElement(page, CONTINUE_BUTTON);
      
      spinner.succeed(chalk.green('Berhasil mengisi email!'));
    } catch (error) {
      spinner.fail(chalk.red('Gagal mengisi email!'));
      throw error;
    }
  }

  /**
   * Fill in password on signup page
   * @param {Page} page - Puppeteer page instance
   * @param {string} password - Password
   * @returns {Promise<void>}
   */
  static async fillPassword(page, password) {
    try {
      const { PASSWORD_INPUT, SIGNUP_BUTTON } = CONFIG.CAPCUT.SELECTORS;
      
      await BrowserService.typeIntoField(page, PASSWORD_INPUT, password);
      await BrowserService.clickElement(page, SIGNUP_BUTTON);
    } catch (error) {
      console.error(chalk.red('Gagal mengisi password!'));
      throw error;
    }
  }

   /**
 * Fill in birthday information (robust version)
 * - Handles slow rendering, hidden elements, iframe, and custom pickers
 * - Works for Puppeteer Page
 */
static async fillBirthday(page) {
  const timeout = CONFIG.TIMING.SELECTOR_TIMEOUT ?? 15000;

  // Kandidat selector yang biasanya lebih stabil dibanding class random
  // Kamu bisa tambah/kurangi setelah inspect DOM terbaru.
  const birthdayInputCandidates = [
    'input[name*="birth" i]',
    'input[id*="birth" i]',
    'input[aria-label*="birth" i]',
    'input[placeholder*="birth" i]',
    'input[aria-label*="tanggal" i]',
    'input[placeholder*="tanggal" i]',
    'input[type="date"]',
    '[data-testid*="birth" i] input',
    '[data-e2e*="birth" i] input',
    // fallback terakhir: apapun yg ada "birth" di class
    '[class*="birth" i] input'
  ];

  const monthTriggerCandidates = [
    '[data-testid*="month" i]',
    '[aria-label*="month" i]',
    '[aria-label*="bulan" i]',
    '[class*="month" i]'
  ];

  const dayTriggerCandidates = [
    '[data-testid*="day" i]',
    '[aria-label*="day" i]',
    '[aria-label*="hari" i]',
    '[class*="day" i]'
  ];

  const nextBtnCandidates = [
    'button[type="submit"]',
    'button:has-text("Next")',
    'button:has-text("Lanjut")',
    '[data-testid*="next" i]',
    '[class*="next" i] button, button[class*="next" i]'
  ];

  const dropdownItemCandidates = [
    '.lv-select-popup li',
    '[role="option"]',
    'li[role="option"]',
    'ul li'
  ];

  const birthday = generateRandomBirthday();

  try {
    await page.waitForTimeout(800);

    // 1) Cari birthday input (page atau iframe)
    const { ctx, selector: birthdaySel } =
      await findSelectorInPageOrFrames(page, birthdayInputCandidates, timeout);

    // Pastikan terlihat
    await ctx.waitForSelector(birthdaySel, { visible: true, timeout });
    await ctx.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "center" }), birthdaySel);

    // Klik untuk membuka picker
    await ctx.click(birthdaySel, { delay: 80 });
    await page.waitForTimeout(300);

    // Helper pilih item berdasarkan text dari dropdown umum
    async function pickByText(text) {
      // tunggu ada item muncul
      let itemsSel = null;
      for (const cand of dropdownItemCandidates) {
        const h = await ctx.$(cand);
        if (h) { itemsSel = cand; break; }
      }
      if (!itemsSel) {
        // tunggu sebentar dan coba lagi
        await page.waitForTimeout(400);
        for (const cand of dropdownItemCandidates) {
          const h = await ctx.$(cand);
          if (h) { itemsSel = cand; break; }
        }
      }
      if (!itemsSel) throw new Error("Dropdown items tidak ditemukan");

      const ok = await ctx.evaluate((sel, t) => {
        const wanted = String(t).trim().toLowerCase();
        const items = [...document.querySelectorAll(sel)];
        const target =
          items.find(el => (el.textContent || "").trim().toLowerCase() === wanted) ||
          items.find(el => (el.textContent || "").trim().toLowerCase().includes(wanted));
        if (target) { target.click(); return true; }
        return false;
      }, itemsSel, text);

      if (!ok) throw new Error(`Item dropdown tidak ditemukan untuk: ${text}`);
    }

    // 2) Pilih tahun (banyak picker langsung buka tahun dulu)
    await pickByText(birthday.year);
    await page.waitForTimeout(CONFIG.TIMING.PAGE_WAIT ?? 400);

    // 3) Pilih bulan (klik trigger bulan kalau ada)
    try {
      const { selector: monthSel } =
        await findSelectorInPageOrFrames(page, monthTriggerCandidates, 2500);
      await ctx.click(monthSel, { delay: 50 });
      await page.waitForTimeout(200);
    } catch (_) {
      // kalau tidak ada trigger bulan, abaikan
    }
    await pickByText(birthday.month);
    await page.waitForTimeout(CONFIG.TIMING.PAGE_WAIT ?? 400);

    // 4) Pilih hari
    try {
      const { selector: daySel } =
        await findSelectorInPageOrFrames(page, dayTriggerCandidates, 2500);
      await ctx.click(daySel, { delay: 50 });
      await page.waitForTimeout(200);
    } catch (_) {}
    await pickByText(birthday.day);

    console.log(`📆 Birthday dipilih: ${birthday.day} ${birthday.month} ${birthday.year}`);

    // 5) Klik Next
    const { ctx: nextCtx, selector: nextSel } =
      await findSelectorInPageOrFrames(page, nextBtnCandidates, timeout);
    await nextCtx.waitForSelector(nextSel, { visible: true, timeout });
    await nextCtx.click(nextSel, { delay: 80 });

    return birthday;
  } catch (err) {
    console.error("❌ Gagal mengisi tanggal lahir:", err.message);
    throw err;
  }
}



  /**
   * Enter OTP code
   * @param {Page} page - Puppeteer page instance
   * @param {string} otpCode - OTP code
   * @returns {Promise<void>}
   */
  static async enterOTP(page, otpCode) {
    try {
      await BrowserService.typeIntoField(
        page, 
        CONFIG.CAPCUT.SELECTORS.OTP_INPUT, 
        otpCode
      );
      console.log(chalk.green('✅ Kode OTP dimasukkan dan verifikasi berhasil!'));
    } catch (error) {
      console.error(chalk.red('Gagal memasukkan kode OTP!'));
      throw error;
    }
  }

  /**
   * Create a CapCut account
   * @param {number} accountNumber - Account number being created
   * @param {number} totalAccounts - Total accounts to create
   * @returns {Promise<Object|null>} Account data or null if failed
   */
  static async createAccount(accountNumber, totalAccounts) {
    let browser = null;

    try {
      console.log(chalk.magenta(`\n🚀 Memproses akun ${accountNumber} dari ${totalAccounts}`));

      // Initialize browser
      const browserData = await BrowserService.initializeBrowser();
      browser = browserData.browser;
      const page = browserData.page;

      // Get email
      const email = await EmailService.getNewEmail();

      // Get password
      const password = FileService.getPassword();

      // Navigate to signup page
      const signupSpinner = ora(chalk.blue('Membuka halaman signup CapCut...')).start();
      await BrowserService.navigateToURL(
        page,
        CONFIG.CAPCUT.SIGNUP_URL,
        'Gagal membuka halaman signup!'
      );
      signupSpinner.succeed(chalk.green('Halaman signup dibuka!'));

      // Fill email
      await this.fillEmail(page, email);

      // Fill password
      await this.fillPassword(page, password);

      // Fill birthday
      const birthday = await this.fillBirthday(page);

      // Wait for and enter OTP
      const otpCode = await EmailService.waitForOTP(email);
      await this.enterOTP(page, otpCode);

      // Save account data
      const accountData = formatAccountData(accountNumber, email, password, birthday);
      FileService.saveAccount(accountData);

      // Wait before closing
      await sleep(CONFIG.TIMING.FINAL_WAIT);
      await BrowserService.closeBrowser(browser);

      return { email, password, birthDate: `${birthday.day} ${birthday.month} ${birthday.year}` };

    } catch (error) {
      console.error(chalk.red(`❌ Gagal membuat akun #${accountNumber}:`), error.message);
      await BrowserService.closeBrowser(browser);
      return null;
    }
  }
}

