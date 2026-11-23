import assert from 'node:assert';

export class TestResponse {
  constructor(
    public readonly status: number,
    public readonly headers: Headers,
    private readonly _bodyText: string
  ) {}

  public text(): string {
    return this._bodyText;
  }

  public json<T = any>(): T {
    try {
      return JSON.parse(this._bodyText) as T;
    } catch {
      throw new Error(`[TestResponse] Expected response body to be valid JSON, got:\n${this._bodyText}`);
    }
  }

  public assertStatus(expected: number): this {
    assert.strictEqual(
      this.status,
      expected,
      `Expected status ${expected}, but received ${this.status}. Body: ${this._bodyText}`
    );
    return this;
  }

  public assertOk(): this {
    return this.assertStatus(200);
  }

  public assertCreated(): this {
    return this.assertStatus(201);
  }

  public assertNotFound(): this {
    return this.assertStatus(404);
  }

  public assertForbidden(): this {
    return this.assertStatus(403);
  }

  public assertUnauthorized(): this {
    return this.assertStatus(401);
  }

  public assertUnprocessable(): this {
    return this.assertStatus(422);
  }

  public assertRedirect(expectedLocation?: string): this {
    const isRedirect = [301, 302, 303, 307, 308].includes(this.status);
    assert.ok(
      isRedirect,
      `Expected response to be a redirect (3xx), but received status ${this.status}. Body: ${this._bodyText}`
    );

    if (expectedLocation) {
      const location = this.headers.get('location');
      assert.strictEqual(
        location,
        expectedLocation,
        `Expected redirect to "${expectedLocation}", but received "${location}".`
      );
    }
    return this;
  }

  public assertJson(subset: Record<string, any>): this {
    const data = this.json();
    for (const [key, val] of Object.entries(subset)) {
      assert.deepStrictEqual(
        data[key],
        val,
        `Expected JSON key "${key}" to equal ${JSON.stringify(val)}, but got ${JSON.stringify(data[key])}`
      );
    }
    return this;
  }

  public assertSee(search: string): this {
    assert.ok(
      this._bodyText.includes(search),
      `Expected response to contain text "${search}", but it was not found in response.`
    );
    return this;
  }

  public assertDontSee(search: string): this {
    assert.ok(
      !this._bodyText.includes(search),
      `Expected response NOT to contain text "${search}", but it was found in response.`
    );
    return this;
  }

  public assertHeader(name: string, expectedValue?: string): this {
    const val = this.headers.get(name.toLowerCase());
    assert.ok(val !== null, `Expected header "${name}" to be present.`);
    if (expectedValue !== undefined) {
      assert.strictEqual(
        val,
        expectedValue,
        `Expected header "${name}" to equal "${expectedValue}", got "${val}".`
      );
    }
    return this;
  }
}
