import { realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { h, type ComponentType, type VNode } from 'preact';
import { renderToStringAsync } from 'preact-render-to-string';

export type PreactView<Props = Record<string, any>> = string | ComponentType<Props> | VNode<any>;

export async function loadPreactView(name: string, directory = resolve('views')): Promise<ComponentType<any> | null> {
  const normalized = name.replace(/\.(?:tsx|jsx)$/i, '').replace(/\./g, '/');
  if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(normalized)) return null;

  let root: string;
  try {
    root = realpathSync(directory);
  } catch {
    return null;
  }

  for (const extension of ['.tsx', '.jsx']) {
    let path: string;
    try {
      path = realpathSync(resolve(root, normalized + extension));
    } catch {
      continue;
    }
    if (!path.startsWith(root + sep)) continue;

    const module = await import(pathToFileURL(path).href);
    const component = module.default ?? Object.values(module).find((value) => typeof value === 'function');
    if (typeof component !== 'function') {
      throw new Error(`[BirView] Preact view "${name}" must export a component.`);
    }
    return component;
  }

  return null;
}

export async function renderPreactView<Props extends Record<string, any>>(
  view: PreactView<Props>,
  props: Props
): Promise<string> {
  let component = view;
  if (typeof view === 'string') {
    const named = await loadPreactView(view);
    if (!named) throw new Error(`[BirView] Preact view "${view}" was not found under views/.`);
    component = named;
  }
  const vnode = typeof component === 'function' ? h(component, props) : component;
  if (typeof vnode === 'string') throw new Error('[BirView] Expected a Preact component or element.');
  const html = await renderToStringAsync(vnode);
  return /^<html(?:\s|>)/i.test(html) ? '<!DOCTYPE html>\n' + html : html;
}
