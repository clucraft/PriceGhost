import type { Browser, Page } from 'puppeteer';

export interface ScrapeOptions {
  proxyUrl?: string;
  userAgent?: string;
  referrer?: string;
  requestId?: string | number;
  productId?: string | number;
  debug?: boolean;
  forceNewSession?: boolean;
  sessionId?: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  timeout?: number;
  waitForSelector?: string;
  delay?: number;
  captureScreenshot?: boolean;
}

export interface LogContext {
  requestId?: string | number;
  productId?: string | number;
  forceDebug?: boolean;
  metadata?: unknown;
}

export interface BrowserSession {
  id: string;
  browser: Browser | null;
  launchPromise: Promise<Browser> | null;
  activePages: number;
  totalScrapes: number;
  idleTimer: NodeJS.Timeout | null;
  proxyUrl: string | null;
  userAgent: string | null;
  lastActivity: number;
}

export interface ScrapeResult {
  html: string;
  screenshotBase64: string | null;
}

export type ScraperPage = Page;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
