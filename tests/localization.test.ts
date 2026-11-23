import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Lang, __, defaultViewEngine, Context } from '../src/index.js';

describe('BirFramework Localization & i18n Tests', () => {
  beforeEach(() => {
    Lang.setLocale('en');
    Lang.addLines('en', {
      welcome: 'Welcome, {name}!',
      hello: 'Hello World',
      auth: {
        failed: 'These credentials do not match our records.',
        throttle: 'Too many attempts. Please try again in :seconds seconds.',
      },
    });

    Lang.addLines('tr', {
      welcome: 'Hoş geldiniz, {name}!',
      hello: 'Merhaba Dünya',
      auth: {
        failed: 'Girdiğiniz bilgiler kayıtlarımızla eşleşmiyor.',
        throttle: 'Çok fazla giriş denemesi. Lütfen :seconds saniye sonra tekrar deneyin.',
      },
    });
  });

  test('Lang.get and __() retrieve translation with interpolation', () => {
    assert.strictEqual(Lang.get('hello'), 'Hello World');
    assert.strictEqual(__('welcome', { name: 'Ferdi' }), 'Welcome, Ferdi!');
    assert.strictEqual(
      __('auth.throttle', { seconds: 60 }),
      'Too many attempts. Please try again in 60 seconds.'
    );
  });

  test('Lang.setLocale changes default language', () => {
    Lang.setLocale('tr');
    assert.strictEqual(Lang.get('hello'), 'Merhaba Dünya');
    assert.strictEqual(__('welcome', { name: 'Ahmet' }), 'Hoş geldiniz, Ahmet!');
    assert.strictEqual(__('auth.failed'), 'Girdiğiniz bilgiler kayıtlarımızla eşleşmiyor.');
  });

  test('Fallback to default locale when key is missing in target locale', () => {
    Lang.addLines('en', { only_in_english: 'English Only Text' });
    Lang.setLocale('tr');

    // Should fallback to en
    assert.strictEqual(__('only_in_english'), 'English Only Text');
  });

  test('Blade ViewEngine renders __() helper and @lang directive', () => {
    Lang.setLocale('tr');
    const template = '<h1>@lang("hello")</h1><p>{{ __("welcome", { name: "Zeynep" }) }}</p>';
    const compiled = defaultViewEngine.compile(template);

    assert.ok(compiled.includes('<h1>Merhaba Dünya</h1>'));
    assert.ok(compiled.includes('<p>Hoş geldiniz, Zeynep!</p>'));
  });

  test('Context detects locale from query parameter and translates', () => {
    const fakeReq: any = {
      method: 'GET',
      url: '/profile?lang=tr',
      headers: {},
      on: () => {},
    };
    const fakeRes: any = {
      setHeader: () => {},
    };

    const ctx = new Context(fakeReq, fakeRes);
    assert.strictEqual(ctx.locale, 'tr');
    assert.strictEqual(ctx.__('hello'), 'Merhaba Dünya');
  });
});
