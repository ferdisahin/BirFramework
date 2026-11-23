export type ContainerFactory<T = any> = (container: Container) => T;
export type AsyncContainerFactory<T = any> = (container: Container) => T | Promise<T>;
export type Token<T = any> = string | symbol | (new (...args: any[]) => T);

interface Binding<T = any> {
  factory: (container: Container) => T | Promise<T>;
  singleton: boolean;
  async?: boolean;
  instance?: T | Promise<T>;
}

export class Container {
  private bindings = new Map<Token, Binding>();

  public bind<T>(token: Token<T>, factory: ContainerFactory<T>): this {
    this.bindings.set(token, {
      factory,
      singleton: false,
      async: false,
    });
    return this;
  }

  public bindAsync<T>(token: Token<T>, factory: AsyncContainerFactory<T>): this {
    this.bindings.set(token, {
      factory,
      singleton: false,
      async: true,
    });
    return this;
  }

  public singleton<T>(token: Token<T>, factoryOrInstance: ContainerFactory<T> | T): this {
    if (typeof factoryOrInstance === 'function' && !(factoryOrInstance as any).prototype) {
      this.bindings.set(token, {
        factory: factoryOrInstance as ContainerFactory<T>,
        singleton: true,
        async: false,
      });
    } else if (typeof factoryOrInstance === 'function') {
      this.bindings.set(token, {
        factory: () => new (factoryOrInstance as new (...args: any[]) => T)(),
        singleton: true,
        async: false,
      });
    } else {
      this.bindings.set(token, {
        factory: () => factoryOrInstance,
        singleton: true,
        instance: factoryOrInstance,
        async: false,
      });
    }
    return this;
  }

  public singletonAsync<T>(token: Token<T>, factory: AsyncContainerFactory<T>): this {
    this.bindings.set(token, {
      factory,
      singleton: true,
      async: true,
    });
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

    if (binding.async) {
      throw new Error(`[BirContainer] Cannot synchronously resolve async binding [${String(token)}]. Use makeAsync() instead.`);
    }

    let instance: any;
    if (binding.singleton) {
      if (binding.instance === undefined) {
        binding.instance = binding.factory(this);
      }
      instance = binding.instance;
    } else {
      instance = binding.factory(this);
    }

    // Safety guard: if an unflagged factory returns a Promise at runtime
    if (instance instanceof Promise || (instance && typeof instance.then === 'function')) {
      throw new Error(`[BirContainer] Target binding [${String(token)}] returned a Promise. Use makeAsync() to resolve asynchronous bindings.`);
    }

    return instance as T;
  }

  public async makeAsync<T>(token: Token<T>): Promise<T> {
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
        binding.instance = await binding.factory(this);
      }
      return (await binding.instance) as T;
    }

    return (await binding.factory(this)) as T;
  }

  public flush(): void {
    this.bindings.clear();
  }
}

// Global default container instance
export const app = new Container();
