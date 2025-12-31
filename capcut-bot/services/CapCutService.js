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
  const {
    BIRTHDAY_INPUT,
    BIRTHDAY_MONTH_SELECTOR,
    BIRTHDAY_DAY_SELECTOR,
    BIRTHDAY_NEXT_BUTTON,
    DROPDOWN_ITEMS
  } = CONFIG.CAPCUT.SELECTORS;

  const birthday = generateRandomBirthday();

  try {
    // Pastikan UI sudah stabil
    await page.waitForTimeout(800);

    // ===============================
    // 1. Tunggu & klik birthday input (open picker)
    // ===============================
    await page.waitForSelector(BIRTHDAY_INPUT, {
      visible: true,
      timeout: CONFIG.TIMING.SELECTOR_TIMEOUT
    });

    await page.evaluate((sel) => {
      document.querySelector(sel)?.scrollIntoView({ block: 'center' });
    }, BIRTHDAY_INPUT);

    await page.click(BIRTHDAY_INPUT, { delay: 100 });

    // ===============================
    // 2. Pilih TAHUN (langsung dari popup)
    // ===============================
    await page.waitForSelector(DROPDOWN_ITEMS, { visible: true });

    await page.evaluate((year) => {
      const items = [...document.querySelectorAll('.lv-select-popup li')];
      const target = items.find(el => el.textContent.trim() === String(year));
      if (!target) throw new Error('Year option not found');
      target.click();
    }, birthday.year);

    await page.waitForTimeout(CONFIG.TIMING.PAGE_WAIT);

    // ===============================
    // 3. Pilih BULAN
    // ===============================
    await page.click(BIRTHDAY_MONTH_SELECTOR, { delay: 80 });
    await page.waitForSelector(DROPDOWN_ITEMS, { visible: true });

    await page.evaluate((month) => {
      const items = [...document.querySelectorAll('.lv-select-popup li')];
      const target = items.find(el =>
        el.textContent.trim().toLowerCase() === month.toLowerCase()
      );
      if (!target) throw new Error('Month option not found');
      target.click();
    }, birthday.month);

    await page.waitForTimeout(CONFIG.TIMING.PAGE_WAIT);

    // ===============================
    // 4. Pilih HARI
    // ===============================
    await page.click(BIRTHDAY_DAY_SELECTOR, { delay: 80 });
    await page.waitForSelector(DROPDOWN_ITEMS, { visible: true });

    await page.evaluate((day) => {
      const items = [...document.querySelectorAll('.lv-select-popup li')];
      const target = items.find(el => el.textContent.trim() === String(day));
      if (!target) throw new Error('Day option not found');
      target.click();
    }, birthday.day);

    console.log(
      `📆 Birthday dipilih: ${birthday.day} ${birthday.month} ${birthday.year}`
    );

    // ===============================
    // 5. Klik tombol Next
    // ===============================
    await page.waitForSelector(BIRTHDAY_NEXT_BUTTON, { visible: true });
    await page.click(BIRTHDAY_NEXT_BUTTON, { delay: 100 });

    return birthday;

  } catch (error) {
    console.error('❌ Gagal mengisi birthday:', error.message);
    throw error;
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
