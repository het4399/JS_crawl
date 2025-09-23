export interface CronExpression {
    minute: string;
    hour: string;
    dayOfMonth: string;
    month: string;
    dayOfWeek: string;
}

export interface CronValidation {
    isValid: boolean;
    error?: string;
    nextRun?: Date;
}

export class CronParser {
    /**
     * Parse a cron expression into its components
     */
    static parseCronExpression(cronExpr: string): CronExpression | null {
        const parts = cronExpr.trim().split(/\s+/);
        
        if (parts.length !== 5) {
            return null;
        }
        
        return {
            minute: parts[0],
            hour: parts[1],
            dayOfMonth: parts[2],
            month: parts[3],
            dayOfWeek: parts[4]
        };
    }
    
    /**
     * Validate a cron expression
     */
    static validateCronExpression(cronExpr: string): CronValidation {
        try {
            const parsed = this.parseCronExpression(cronExpr);
            if (!parsed) {
                return {
                    isValid: false,
                    error: 'Invalid cron expression format. Expected: "minute hour day month dayOfWeek"'
                };
            }
            
            // Validate each component
            const validations = [
                this.validateField(parsed.minute, 0, 59, 'minute'),
                this.validateField(parsed.hour, 0, 23, 'hour'),
                this.validateField(parsed.dayOfMonth, 1, 31, 'day of month'),
                this.validateField(parsed.month, 1, 12, 'month'),
                this.validateField(parsed.dayOfWeek, 0, 6, 'day of week')
            ];
            
            const firstError = validations.find(v => !v.isValid);
            if (firstError) {
                return firstError;
            }
            
            // Calculate next run time
            const nextRun = this.calculateNextRun(parsed);
            
            return {
                isValid: true,
                nextRun
            };
        } catch (error) {
            return {
                isValid: false,
                error: `Invalid cron expression: ${error}`
            };
        }
    }
    
    /**
     * Validate a single cron field
     */
    private static validateField(field: string, min: number, max: number, fieldName: string): CronValidation {
        // Handle wildcard
        if (field === '*') {
            return { isValid: true };
        }
        
        // Handle ranges (e.g., 1-5)
        if (field.includes('-')) {
            const [start, end] = field.split('-').map(Number);
            if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
                return {
                    isValid: false,
                    error: `Invalid range in ${fieldName}: ${field}`
                };
            }
            return { isValid: true };
        }
        
        // Handle lists (e.g., 1,3,5)
        if (field.includes(',')) {
            const values = field.split(',').map(Number);
            for (const value of values) {
                if (isNaN(value) || value < min || value > max) {
                    return {
                        isValid: false,
                        error: `Invalid value in ${fieldName}: ${value}`
                    };
                }
            }
            return { isValid: true };
        }
        
        // Handle step values (e.g., */5)
        if (field.includes('/')) {
            const [base, step] = field.split('/');
            const stepValue = Number(step);
            if (isNaN(stepValue) || stepValue <= 0) {
                return {
                    isValid: false,
                    error: `Invalid step value in ${fieldName}: ${field}`
                };
            }
            return { isValid: true };
        }
        
        // Handle single number
        const value = Number(field);
        if (isNaN(value) || value < min || value > max) {
            return {
                isValid: false,
                error: `Invalid value in ${fieldName}: ${value}`
            };
        }
        
        return { isValid: true };
    }
    
    /**
     * Calculate the next run time for a cron expression
     */
    private static calculateNextRun(parsed: CronExpression): Date {
        try {
            const now = new Date();
            const nextRun = new Date(now);
            
            // Handle step values (e.g., */15)
            if (parsed.minute.includes('/')) {
                const [base, step] = parsed.minute.split('/');
                const stepValue = parseInt(step);
                
                if (isNaN(stepValue) || stepValue <= 0) {
                    throw new Error(`Invalid step value: ${step}`);
                }
                
                if (base === '*') {
                    // Find next minute that matches the step
                    const currentMinute = now.getMinutes();
                    const nextMinute = Math.ceil((currentMinute + 1) / stepValue) * stepValue;
                    
                    if (nextMinute >= 60) {
                        nextRun.setHours(nextRun.getHours() + 1);
                        nextRun.setMinutes(0);
                    } else {
                        nextRun.setMinutes(nextMinute);
                    }
                }
            } else if (parsed.minute !== '*' && parsed.hour !== '*') {
                const minute = parsed.minute === '*' ? 0 : parseInt(parsed.minute);
                const hour = parsed.hour === '*' ? now.getHours() : parseInt(parsed.hour);
                
                if (isNaN(minute) || isNaN(hour)) {
                    throw new Error(`Invalid minute or hour values: minute=${parsed.minute}, hour=${parsed.hour}`);
                }
                
                nextRun.setMinutes(minute);
                nextRun.setHours(hour);
                nextRun.setSeconds(0);
                nextRun.setMilliseconds(0);
                
                // If the time has passed today, schedule for tomorrow
                if (nextRun <= now) {
                    nextRun.setDate(nextRun.getDate() + 1);
                }
            } else {
                // Default to next hour for complex expressions
                nextRun.setHours(nextRun.getHours() + 1);
                nextRun.setMinutes(0);
                nextRun.setSeconds(0);
                nextRun.setMilliseconds(0);
            }
            
            nextRun.setSeconds(0);
            nextRun.setMilliseconds(0);
            
            // Validate the resulting date
            if (isNaN(nextRun.getTime())) {
                throw new Error('Calculated next run date is invalid');
            }
            
            return nextRun;
        } catch (error) {
            // Return a fallback date (1 hour from now) if calculation fails
            const fallback = new Date();
            fallback.setHours(fallback.getHours() + 1);
            fallback.setMinutes(0);
            fallback.setSeconds(0);
            fallback.setMilliseconds(0);
            return fallback;
        }
    }
    
    /**
     * Check if a cron expression should run at the given time
     */
    static shouldRun(cronExpr: string, date: Date): boolean {
        const parsed = this.parseCronExpression(cronExpr);
        if (!parsed) return false;
        
        const minute = date.getMinutes();
        const hour = date.getHours();
        const dayOfMonth = date.getDate();
        const month = date.getMonth() + 1; // JavaScript months are 0-based
        const dayOfWeek = date.getDay();
        
        return (
            this.matchesField(parsed.minute, minute) &&
            this.matchesField(parsed.hour, hour) &&
            this.matchesField(parsed.dayOfMonth, dayOfMonth) &&
            this.matchesField(parsed.month, month) &&
            this.matchesField(parsed.dayOfWeek, dayOfWeek)
        );
    }
    
    /**
     * Check if a field matches a value
     */
    private static matchesField(field: string, value: number): boolean {
        if (field === '*') return true;
        
        // Handle ranges
        if (field.includes('-')) {
            const [start, end] = field.split('-').map(Number);
            return value >= start && value <= end;
        }
        
        // Handle lists
        if (field.includes(',')) {
            const values = field.split(',').map(Number);
            return values.includes(value);
        }
        
        // Handle step values
        if (field.includes('/')) {
            const [base, step] = field.split('/');
            const stepValue = Number(step);
            if (base === '*') {
                return value % stepValue === 0;
            } else {
                const baseValue = Number(base);
                return value >= baseValue && (value - baseValue) % stepValue === 0;
            }
        }
        
        // Handle single number
        return Number(field) === value;
    }
    
    /**
     * Get human-readable description of a cron expression
     */
    static getDescription(cronExpr: string): string {
        const parsed = this.parseCronExpression(cronExpr);
        if (!parsed) return 'Invalid cron expression';
        
        // Simple descriptions for common patterns
        if (cronExpr === '0 0 * * *') return 'Daily at midnight';
        if (cronExpr === '0 9 * * *') return 'Daily at 9:00 AM';
        if (cronExpr === '0 0 * * 0') return 'Weekly on Sunday at midnight';
        if (cronExpr === '0 0 1 * *') return 'Monthly on the 1st at midnight';
        if (cronExpr === '*/15 * * * *') return 'Every 15 minutes';
        if (cronExpr === '0 */6 * * *') return 'Every 6 hours';
        
        return `Custom schedule: ${cronExpr}`;
    }
}
