import type { Context } from '../http/context.js';
import { Validator, type ValidationRules } from './index.js';

export class AuthorizationError extends Error {
  public status: number = 403;
  constructor(message: string = 'This action is unauthorized.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export abstract class FormRequest<T = Record<string, any>> {
  protected _validatedData: T = {} as T;

  constructor(public readonly ctx: Context) {}

  /**
   * Determine if the user is authorized to make this request.
   * Defaults to true.
   */
  public async authorize(): Promise<boolean> {
    return true;
  }

  /**
   * Define the validation rules that apply to the request.
   */
  public abstract rules(): ValidationRules;

  /**
   * Prepare data before validation (e.g. trimming or computing fields).
   */
  public async prepareForValidation(): Promise<void> {}

  /**
   * Return the validated data from the request.
   */
  public validated(): T {
    return this._validatedData;
  }

  /**
   * Execute authorization and validation against the request context.
   */
  public async validate(): Promise<T> {
    const isAuthorized = await this.authorize();
    if (!isAuthorized) {
      throw new AuthorizationError('This action is unauthorized.');
    }

    await this.prepareForValidation();

    const body = (await this.ctx.body()) || {};
    const input = { ...this.ctx.query, ...body, ...this.ctx.params };

    this._validatedData = await Validator.validate<T>(input, this.rules());
    return this._validatedData;
  }
}
