import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import { log } from '../utils/logger.js';
import type { Browser } from 'puppeteer';
import type { BrowserSession, ScrapeOptions } from '../types.js';
import { errorMessage } from '../types.js';

interface PuppeteerExtra {
  use(plugin: unknown): void;
  launch(options: Record<string, unknown>): Promise<Browser>;
}

const puppeteer = puppeteerExtra as unknown as PuppeteerExtra;
const createAdblockerPlugin = AdblockerPlugin as unknown as (options: { blockTrackers: boolean }) => unknown;

// Initialize Puppeteer with plugins
puppeteer.use(StealthPlugin());
puppeteer.use(createAdblockerPlugin({ blockTrackers: true }));

// Browser Pool Configuration
export const MAX_BROWSERS = 3;
export const MAX_PAGES_PER_BROWSER = 4;
export const MAX_SCRAPES_PER_BROWSER = 50; // Recycle browser after this many scrapes
export const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export const sessions: BrowserSession[] = [];

/**
 * Forcefully closes a browser session and removes it from the pool
 */
export async function closeSession(session: BrowserSession) {
  const index = sessions.indexOf(session);
  if (index > -1) sessions.splice(index, 1);
  
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = null;
  }
  
  try {
    log(`Closing browser session ${session.id} (Total Scrapes: ${session.totalScrapes})`, 'INFO');
    if (session.browser && session.browser.connected) {
      await session.browser.close();
    }
  } catch (error) {
    log(`Error closing browser ${session.id}: ${errorMessage(error)}`, 'ERROR');
  }
}

/**
 * Watchdog to clean up hung or disconnected browsers
 */
export function startWatchdog() {
  setInterval(() => {
    const now = Date.now();
    for (const session of [...sessions]) {
      if (session.browser && !session.browser.connected) {
        log(`Removing dead session ${session.id}`, 'WARN');
        closeSession(session);
        continue;
      }

      const stuckTimeout = 10 * 60 * 1000;
      if (session.activePages > 0 && (now - session.lastActivity) > stuckTimeout) {
        log(`Forcefully killing stuck session ${session.id} (${session.activePages} pages hung)`, 'ERROR');
        closeSession(session);
      }
    }
  }, 5 * 60 * 1000);
}

/**
 * Launches a new browser instance and initializes the session
 */
export async function createNewSession(proxyUrl: string | null = null, userAgent: string | null = null): Promise<BrowserSession> {
  const id = `session_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
  const session: BrowserSession = {
    id,
    browser: null,
    launchPromise: null,
    activePages: 0,
    totalScrapes: 0,
    idleTimer: null,
    proxyUrl,
    userAgent,
    lastActivity: Date.now()
  };

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1920,1080'
  ];

  if (proxyUrl) {
    args.push(`--proxy-server=${proxyUrl}`);
  }

  if (userAgent) {
    args.push(`--user-agent=${userAgent}`);
  }

  log(`Launching new browser instance for ${id} (Proxy: ${proxyUrl || 'None'}, UA: ${userAgent ? 'Custom' : 'Default'})`, 'INFO');
  
  session.launchPromise = puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: 'new',
    args
  }).then((browser: Browser) => {
    session.browser = browser;
    session.launchPromise = null;
    
    browser.on('disconnected', () => {
      log(`Browser session ${session.id} disconnected`, 'WARN');
      const idx = sessions.indexOf(session);
      if (idx > -1) sessions.splice(idx, 1);
    });

    return browser;
  }).catch((error: unknown) => {
    log(`Failed to launch browser for ${id}: ${errorMessage(error)}`, 'ERROR');
    const idx = sessions.indexOf(session);
    if (idx > -1) sessions.splice(idx, 1);
    throw error;
  });

  sessions.push(session);
  return session;
}

/**
 * Finds or creates an available browser session.
 */
export async function getBrowserSession(options: ScrapeOptions = {}): Promise<BrowserSession | null> {
  const reqProxy = options.proxyUrl || null;
  const reqUA = options.userAgent || null;
  const forceNew = options.forceNewSession === true;
  const targetId = options.sessionId || null;

  log(`Session Acquisition | Proxy: ${reqProxy || 'None'}, UA: ${reqUA ? 'Custom' : 'Default'}, ForceNew: ${forceNew}`, 'DEBUG');

  // 1. Direct Targeting by Session ID (Debug/Control)
  if (targetId) {
    const target = sessions.find(s => s.id === targetId && (!s.browser || s.browser.connected));
    if (target) {
      if (target.idleTimer) {
        clearTimeout(target.idleTimer);
        target.idleTimer = null;
      }
      target.activePages++;
      if (target.launchPromise) {
        try {
          await target.launchPromise;
        } catch (e) {
          target.activePages--;
          return null;
        }
      }
      return target;
    }
    log(`Targeted session ${targetId} not found or disconnected`, 'WARN');
  }

  // 2. Find existing matching session (Group by Proxy + UA)
  if (!forceNew) {
    let session = sessions.find(s => 
      s.proxyUrl === reqProxy && 
      s.userAgent === reqUA &&
      s.activePages < MAX_PAGES_PER_BROWSER &&
      s.totalScrapes < MAX_SCRAPES_PER_BROWSER &&
      (!s.browser || s.browser.connected)
    );

    if (session) {
      if (session.idleTimer) {
        clearTimeout(session.idleTimer);
        session.idleTimer = null;
      }
      session.activePages++;
      
      if (session.launchPromise) {
        try {
          await session.launchPromise;
        } catch (e) {
          session.activePages--;
          return null;
        }
      }
      return session;
    }
  }

  // 3. Handle Pool Capacity & Recycling
  if (sessions.length >= MAX_BROWSERS) {
    // Look for an idle session to recycle
    const idleSession = sessions.find(s => s.activePages === 0);
    if (idleSession) {
      log(`Recycling idle session ${idleSession.id} to accommodate new request (ForceNew: ${forceNew})`, 'INFO');
      await closeSession(idleSession);
    } else {
      // No idle sessions, and pool is full
      log(`Pool capacity reached (${MAX_BROWSERS} browsers) and all instances are busy.`, 'WARN');
      return null;
    }
  }

  // 4. Create New Session
  const newSession = await createNewSession(reqProxy, reqUA);
  newSession.activePages++;
  try {
    await newSession.launchPromise;
    return newSession;
  } catch (e) {
    return null;
  }
}
