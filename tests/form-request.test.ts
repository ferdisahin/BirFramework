import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { Application, FormRequest, createTestClient, type ValidationRules, type TestClient } from '../src/index.js';

class StorePostRequest extends FormRequest<{ title: string; body: string; slug: string }> {
  public override async authorize(): Promise<boolean> {
    // Authorized if X-Role header is 'admin' or session permits
    return this.ctx.headers['x-role'] === 'admin';
  }

  public override async prepareForValidation(): Promise<void> {
    const b = (await this.ctx.body()) || {};
    if (b.title && !b.slug) {
      b.slug = b.title.toLowerCase().replace(/\s+/g, '-');
    }
  }

  public override rules(): ValidationRules {
    return {
      title: 'required|min:3',
      body: 'required',
      slug: 'required',
    };
  }
}

describe('BirFramework FormRequest Tests', () => {
  let client: TestClient;

  after(async () => {
    await client?.close();
  });

  test('FormRequest executes authorization, prepareForValidation and validation', async () => {
    const app = new Application();

    app.router.post('/posts', async (ctx) => {
      const validated = await ctx.validateWith(StorePostRequest);
      return ctx.json({ success: true, post: validated }, 201);
    });

    client = createTestClient(app);

    // 1. Unauthorized request (x-role !== 'admin')
    const resUnauthorized = await client.post('/posts', { title: 'Hello World', body: 'Content' });
    resUnauthorized.assertForbidden()
      .assertJson({ error: 'Forbidden', message: 'This action is unauthorized.' });

    // 2. Authorized but invalid data (title too short)
    const resInvalid = await client.post(
      '/posts',
      { title: 'Hi', body: 'Content' },
      { headers: { 'x-role': 'admin' } }
    );
    resInvalid.assertUnprocessable();

    // 3. Authorized and valid data with prepareForValidation (slug generated)
    const resValid = await client.post(
      '/posts',
      { title: 'My Awesome Post', body: 'Great body text here.' },
      { headers: { 'x-role': 'admin' } }
    );
    resValid.assertCreated()
      .assertJson({
        success: true,
        post: {
          title: 'My Awesome Post',
          body: 'Great body text here.',
          slug: 'my-awesome-post',
        },
      });
  });
});
