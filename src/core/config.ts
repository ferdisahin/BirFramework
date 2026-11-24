class ConfigStore {
  private values: Record<string, any> = {};

  public set(key: string, value: any): void {
    const parts = key.split('.');
    let curr = this.values;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (typeof curr[part] !== 'object' || curr[part] === null) {
        curr[part] = {};
      }
      curr = curr[part];
    }
    curr[parts[parts.length - 1]!] = value;
  }

  public get<T = any>(key: string, defaultValue?: T): T {
    const parts = key.split('.');
    let curr: any = this.values;
    for (const part of parts) {
      if (curr === null || typeof curr !== 'object' || !(part in curr)) {
        return defaultValue as T;
      }
      curr = curr[part];
    }
    return (curr === undefined ? defaultValue : curr) as T;
  }

  public has(key: string): boolean {
    return this.get(key, undefined) !== undefined;
  }

  public all(): Record<string, any> {
    return { ...this.values };
  }

  public clear(): void {
    this.values = {};
  }
}

export const Config = new ConfigStore();

export function config<T = any>(key: string, defaultValue?: T): T {
  return Config.get<T>(key, defaultValue);
}
