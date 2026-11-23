export type Factory<T = any> = (container: Container) => T | Promise<T>;
export type Token<T = any> = string | symbol | (new (...args: any[]) => T);

interface Binding<T = any> {
  factory: Factory<T>;
  singleton: boolean;
  instance?: T;
}

export class Container {
  private bindings = new Map<Token, Binding>();

  public bind<T>(token: Token<T>, factory: Factory<T>): this {
    this.bindings.set(token, {
      factory,
      singleton: false,
    });
    return this;
  }

  public singleton<T>(token: Token<T>, factoryOrInstance: Factory<T> | T): this {
    if (typeof factoryOrInstance === 'function' && !(factoryOrInstance as any).prototype) {
      this.bindings.set(token, {
        factory: factoryOrInstance as Factory<T>,
        singleton: true,
      });
    } else if (typeof factoryOrInstance === 'function') {
      this.bindings.set(token, {
        factory: (c) => new (factoryOrInstance as new (...args: any[]) => T)(),
        singleton: true,
      });
    } else {
      this.bindings.set(token, {
        factory: () => factoryOrInstance,
        singleton: true,
        instance: factoryOrInstance,
      });
    }
    return this;
  }

  public has(token: Token): boolean {
    return this.bindings.has(token);
  }

  public make<T>(token: Token<T>): T {
    const binding = this.bindings.get(token);

    if (!binding) {
      // If token is a class constructor, try to instantiate it directly
      if (typeof token === 'function') {
        try {
          return new (token as new () => T)();
        } catch (err: any) {
          throw new Error(`[BirContainer] Unable to auto-instantiate: ${token.name}. (${err.message})`);
        }
      }
      throw new Error(`[BirContainer] Target binding [${String(token)}] not found in container.`);
    }

    if (binding.singleton) {
      if (binding.instance === undefined) {
        binding.instance = binding.factory(this);
      }
      return binding.instance as T;
    }

    return binding.factory(this) as T;
  }

  public flush(): void {
    this.bindings.clear();
  }
}

// Global default container instance
export const app = new Container();
