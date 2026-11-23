import type { Application } from './application.js';

/**
 * ServiceProvider is the central place to configure, modularize, and extend
 * BirFramework applications, components, and third-party plugins.
 */
export abstract class ServiceProvider {
  /**
   * The BirFramework Application instance.
   */
  public readonly app: Application;

  constructor(app: Application) {
    this.app = app;
  }

  /**
   * Register bindings, singletons, or configurations into the IoC container.
   * Runs immediately when the provider is registered.
   */
  public register(): void | Promise<void> {}

  /**
   * Bootstrap any application services.
   * Runs when the application is booted (before the HTTP server listens or dispatches).
   */
  public boot(): void | Promise<void> {}
}

export type ServiceProviderClass = new (app: Application) => ServiceProvider;

export type PluginFunction = (app: Application, options?: any) => void | Promise<void>;

export type Plugin = ServiceProvider | ServiceProviderClass | PluginFunction;
