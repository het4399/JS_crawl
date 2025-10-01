#!/usr/bin/env node

import 'dotenv/config';
import { AuditIntegration } from './AuditIntegration.js';
import { Logger } from '../logging/Logger.js';

const logger = Logger.getInstance();

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const auditIntegration = new AuditIntegration();

    try {
        switch (command) {
            case 'start':
                console.log('Starting audit scheduler...');
                auditIntegration.start();
                console.log('Audit scheduler started. Press Ctrl+C to stop.');
                
                // Keep the process running
                process.on('SIGINT', () => {
                    console.log('\nStopping audit scheduler...');
                    auditIntegration.stop();
                    process.exit(0);
                });
                
                // Keep alive
                setInterval(() => {}, 1000);
                break;

            case 'list':
                console.log('Audit Schedules:');
                const schedules = auditIntegration.getAllSchedules();
                if (schedules.length === 0) {
                    console.log('No audit schedules found.');
                } else {
                    schedules.forEach(schedule => {
                        console.log(`\nID: ${schedule.id}`);
                        console.log(`Name: ${schedule.name}`);
                        console.log(`Description: ${schedule.description}`);
                        console.log(`Device: ${schedule.device}`);
                        console.log(`Cron: ${schedule.cronExpression}`);
                        console.log(`Enabled: ${schedule.enabled}`);
                        console.log(`URLs: ${schedule.urls.length}`);
                        console.log(`Total Runs: ${schedule.totalRuns}`);
                        console.log(`Successful: ${schedule.successfulRuns}`);
                        console.log(`Failed: ${schedule.failedRuns}`);
                        if (schedule.lastRun) {
                            console.log(`Last Run: ${new Date(schedule.lastRun).toLocaleString()}`);
                        }
                        if (schedule.nextRun) {
                            console.log(`Next Run: ${new Date(schedule.nextRun).toLocaleString()}`);
                        }
                        console.log('---');
                    });
                }
                break;

            case 'create':
                const name = args[1];
                const urls = args[2]?.split(',').map(url => url.trim()) || [];
                const device = (args[3] as 'mobile' | 'desktop') || 'desktop';
                const cron = args[4] || '0 2 * * *';

                if (!name || urls.length === 0) {
                    console.error('Usage: npm run audits:cli create <name> <url1,url2,url3> [device] [cron]');
                    console.error('Example: npm run audits:cli create "My Site" "https://example.com,https://example.com/page1" desktop "0 2 * * *"');
                    process.exit(1);
                }

                console.log(`Creating audit schedule: ${name}`);
                console.log(`URLs: ${urls.join(', ')}`);
                console.log(`Device: ${device}`);
                console.log(`Cron: ${cron}`);

                const scheduleId = await auditIntegration.createAuditScheduleForUrls(urls, {
                    name,
                    device,
                    cronExpression: cron
                });

                console.log(`Audit schedule created with ID: ${scheduleId}`);
                break;

            case 'trigger':
                const scheduleId = parseInt(args[1]);
                if (!scheduleId) {
                    console.error('Usage: npm run audits:cli trigger <schedule-id>');
                    process.exit(1);
                }

                console.log(`Triggering audit schedule ${scheduleId}...`);
                await auditIntegration.triggerSchedule(scheduleId);
                console.log('Audit schedule triggered successfully');
                break;

            case 'toggle':
                const toggleId = parseInt(args[1]);
                if (!toggleId) {
                    console.error('Usage: npm run audits:cli toggle <schedule-id>');
                    process.exit(1);
                }

                console.log(`Toggling audit schedule ${toggleId}...`);
                auditIntegration.toggleSchedule(toggleId);
                console.log('Audit schedule toggled successfully');
                break;

            case 'delete':
                const deleteId = parseInt(args[1]);
                if (!deleteId) {
                    console.error('Usage: npm run audits:cli delete <schedule-id>');
                    process.exit(1);
                }

                console.log(`Deleting audit schedule ${deleteId}...`);
                auditIntegration.deleteSchedule(deleteId);
                console.log('Audit schedule deleted successfully');
                break;

            case 'status':
                const status = auditIntegration.getStatus();
                console.log('Audit Scheduler Status:');
                console.log(`Running: ${status.isRunning}`);
                console.log(`Active Runs: ${status.activeRuns}`);
                console.log(`Max Concurrent: ${status.maxConcurrentRuns}`);
                console.log(`Check Interval: ${status.checkIntervalMs}ms`);
                break;

            case 'executions':
                const limit = parseInt(args[1]) || 20;
                const executions = auditIntegration.getExecutions(limit);
                
                console.log(`Recent Executions (${executions.length}):`);
                if (executions.length === 0) {
                    console.log('No executions found.');
                } else {
                    executions.forEach(execution => {
                        console.log(`\nID: ${execution.id}`);
                        console.log(`Schedule ID: ${execution.scheduleId}`);
                        console.log(`Started: ${new Date(execution.startedAt).toLocaleString()}`);
                        console.log(`Status: ${execution.status}`);
                        console.log(`URLs Processed: ${execution.urlsProcessed}`);
                        console.log(`URLs Successful: ${execution.urlsSuccessful}`);
                        console.log(`URLs Failed: ${execution.urlsFailed}`);
                        console.log(`Duration: ${Math.round(execution.duration / 1000)}s`);
                        if (execution.errorMessage) {
                            console.log(`Error: ${execution.errorMessage}`);
                        }
                        console.log('---');
                    });
                }
                break;

            default:
                console.log('Audit CLI - Manage audit schedules');
                console.log('');
                console.log('Commands:');
                console.log('  start                    - Start the audit scheduler');
                console.log('  list                     - List all audit schedules');
                console.log('  create <name> <urls> [device] [cron] - Create new audit schedule');
                console.log('  trigger <id>             - Manually trigger a schedule');
                console.log('  toggle <id>              - Toggle schedule enabled/disabled');
                console.log('  delete <id>              - Delete a schedule');
                console.log('  status                   - Show scheduler status');
                console.log('  executions [limit]      - Show recent executions');
                console.log('');
                console.log('Examples:');
                console.log('  npm run audits:cli create "My Site" "https://example.com,https://example.com/page1"');
                console.log('  npm run audits:cli create "Mobile Tests" "https://example.com" mobile "0 */6 * * *"');
                console.log('  npm run audits:cli trigger 1');
                console.log('  npm run audits:cli list');
                break;
        }
    } catch (error) {
        logger.error('CLI error', error as Error);
        console.error('Error:', (error as Error).message);
        process.exit(1);
    }
}

main().catch(error => {
    logger.error('CLI fatal error', error as Error);
    console.error('Fatal error:', error);
    process.exit(1);
});
