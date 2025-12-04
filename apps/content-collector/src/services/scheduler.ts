/**
 * Scheduler Service
 *
 * Runs periodic tidy and maintenance jobs
 */

import cron from 'node-cron';
import { TidyService } from './tidy.js';

const tidyService = new TidyService();

/**
 * Start the tidy scheduler
 */
export function startTidyScheduler(): void {
  // Daily tidy at 3 AM
  cron.schedule('0 3 * * *', async () => {
    console.log('🧹 Starting daily tidy job...');
    try {
      await tidyService.startTidyJob('daily');
    } catch (error) {
      console.error('Daily tidy failed:', error);
    }
  });

  // Weekly tidy on Sunday at 4 AM
  cron.schedule('0 4 * * 0', async () => {
    console.log('🧹 Starting weekly tidy job...');
    try {
      await tidyService.startTidyJob('weekly');
    } catch (error) {
      console.error('Weekly tidy failed:', error);
    }
  });

  // Monthly tidy on the 1st at 5 AM
  cron.schedule('0 5 1 * *', async () => {
    console.log('🧹 Starting monthly tidy job...');
    try {
      await tidyService.startTidyJob('monthly');
    } catch (error) {
      console.error('Monthly tidy failed:', error);
    }
  });

  console.log('📅 Tidy scheduler initialized');
}

/**
 * Run a manual tidy
 */
export async function runManualTidy(): Promise<void> {
  console.log('🧹 Starting manual tidy job...');
  await tidyService.startTidyJob('manual');
}
