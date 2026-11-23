import type { Context } from '../http/context.js';
import { dbConnection } from '../database/connection.js';

export type ValidationRule = string | ((value: any, data: Record<string, any>) => Promise<boolean | string> | boolean | string);

export interface ValidationRules {
  [field: string]: string | string[] | ValidationRule[];
}

export class ValidationError extends Error {
  public errors: Record<string, string[]>;
  public status: number = 422;

  constructor(errors: Record<string, string[]>) {
    super('The given data was invalid.');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class Validator {
  public static async validate<T = any>(
    data: Record<string, any>,
    rules: ValidationRules
  ): Promise<T> {
    const errors: Record<string, string[]> = {};
    const sanitized: Record<string, any> = {};

    for (const [field, fieldRules] of Object.entries(rules)) {
      const ruleList = Array.isArray(fieldRules)
        ? fieldRules
        : typeof fieldRules === 'string'
        ? fieldRules.split('|')
        : [fieldRules];

      const value = data[field];
      sanitized[field] = value;

      for (const rule of ruleList) {
        if (typeof rule === 'function') {
          const result = await rule(value, data);
          if (result !== true) {
            const msg = typeof result === 'string' ? result : `The ${field} field is invalid.`;
            this.addError(errors, field, msg);
          }
          continue;
        }

        const [ruleName, ...ruleArgs] = rule.split(':');
        const argStr = ruleArgs.join(':');

        // Required check
        if (ruleName === 'required') {
          if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
            this.addError(errors, field, `The ${field} field is required.`);
            break; // Stop evaluating further rules for missing field
          }
        }

        // Skip subsequent rules if field is optional and not provided
        if (value === undefined || value === null || value === '') {
          continue;
        }

        // Email check
        if (ruleName === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (typeof value !== 'string' || !emailRegex.test(value)) {
            this.addError(errors, field, `The ${field} must be a valid email address.`);
          }
        }

        // Min length/value
        if (ruleName === 'min') {
          const minVal = Number(argStr);
          if (typeof value === 'string' && value.length < minVal) {
            this.addError(errors, field, `The ${field} must be at least ${minVal} characters.`);
          } else if (typeof value === 'number' && value < minVal) {
            this.addError(errors, field, `The ${field} must be at least ${minVal}.`);
          }
        }

        // Max length/value
        if (ruleName === 'max') {
          const maxVal = Number(argStr);
          if (typeof value === 'string' && value.length > maxVal) {
            this.addError(errors, field, `The ${field} may not be greater than ${maxVal} characters.`);
          } else if (typeof value === 'number' && value > maxVal) {
            this.addError(errors, field, `The ${field} may not be greater than ${maxVal}.`);
          }
        }

        // String check
        if (ruleName === 'string') {
          if (typeof value !== 'string') {
            this.addError(errors, field, `The ${field} must be a string.`);
          }
        }

        // Numeric / Integer
        if (ruleName === 'numeric' || ruleName === 'number' || ruleName === 'integer') {
          if (isNaN(Number(value))) {
            this.addError(errors, field, `The ${field} must be a number.`);
          }
        }

        // Boolean
        if (ruleName === 'boolean') {
          const isBool = typeof value === 'boolean' || value === 'true' || value === 'false' || value === 1 || value === 0 || value === '1' || value === '0';
          if (!isBool) {
            this.addError(errors, field, `The ${field} field must be true or false.`);
          }
        }

        // In array
        if (ruleName === 'in') {
          const allowed = argStr.split(',');
          if (!allowed.includes(String(value))) {
            this.addError(errors, field, `The selected ${field} is invalid.`);
          }
        }

        // Confirmed (e.g. password_confirmation)
        if (ruleName === 'confirmed') {
          const confirmationField = `${field}_confirmation`;
          if (data[confirmationField] !== value) {
            this.addError(errors, field, `The ${field} confirmation does not match.`);
          }
        }

        // Unique:table,column
        if (ruleName === 'unique') {
          const [tableName, columnName = field] = argStr.split(',');
          if (tableName) {
            const q = dbConnection.dialect === 'postgres' ? '"' : '`';
            const row = await dbConnection.queryOne(
              `SELECT ${q}${columnName}${q} FROM ${q}${tableName}${q} WHERE ${q}${columnName}${q} = ? LIMIT 1;`,
              [value]
            );
            if (row) {
              this.addError(errors, field, `The ${field} has already been taken.`);
            }
          }
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError(errors);
    }

    return sanitized as T;
  }

  private static addError(errors: Record<string, string[]>, field: string, message: string): void {
    if (!errors[field]) {
      errors[field] = [];
    }
    errors[field]!.push(message);
  }
}

export * from './form-request.js';
