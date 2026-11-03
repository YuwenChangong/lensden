import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = process.cwd();
const output = path.join(root, 'output/playwright/glass-confirm');
const reproduce = process.argv.includes('--reproduce');
const entry = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import GlassConfirmDialog from './src/components/common/GlassConfirmDialog';
import {resolveLocale} from './src/lib/i18n/locale';
function App() {
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const locale=new URLSearchParams(location.search).get('lang')||'en';
 window.fixture??={cancels:0,confirms:0,background:0};
 Object.assign(window.fixture,{setOpen,setLoading,setError});
 return <><main className="community-shell" style={{minHeight:'200vh'}}>
 <h1>OpenGlass Hub</h1><button id="trigger" onClick={()=>setOpen(true)}>Delete QA item</button>
 <button id="background" onClick={()=>window.fixture.background++}>Background action</button>
 <GlassConfirmDialog open={open} loading={loading} error={error} title="Delete QA item?"
 description="This confirmation must isolate the background." detail={'Owned fixture '+ 'long QA description '.repeat(12)}
 confirmationText="DELETE" confirmationLabel="Type DELETE" confirmLabel="Delete item" cancelLabel="Keep item"
 localeContext={resolveLocale({acceptLanguage:locale})}
 onCancel={()=>{window.fixture.cancels++;setOpen(false)}} onConfirm={()=>{window.fixture.confirms++;setLoading(true)}}/>
 </main></>;
}
createRoot(document.getElementById('root')).render(<App/>);`;
const bundle = await build({ stdin: { contents: entry, resolveDir: root, sourcefile: 'confirm-fixture.tsx', loader: 'tsx' },
  bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' } });
const css = await readFile(path.join(root, 'src/styles/community.css'), 'utf8');
const assets = {
  '/fixture.js': ['text/javascript', bundle.outputFiles[0].text],
  '/fixture.css': ['text/css', css],
  '/': ['text/html', '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0;font-family:system-ui"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>'],
};
const server = createServer((req, res) => {
  const asset = assets[new URL(req.url, 'http://localhost').pathname];
  res.writeHead(asset ? 200 : 404, { 'content-type': asset?.[0] ?? 'text/plain' });
  res.end(asset?.[1] ?? 'Not found');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, passed = 0;
const external = [];
try {
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, args: ['--disable-background-networking', '--disable-component-update',
      '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=127.0.0.1;localhost'] });
  for (const width of reproduce ? [390] : [1440, 390, 430]) for (const lang of reproduce ? ['en'] : ['en', 'zh-CN']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) {
        external.push('NON_LOCAL_REQUEST_BLOCKED'); return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(origin + '/?lang=' + lang);
    await page.locator('#trigger').click();
    const dialog = page.getByRole('alertdialog');
    await dialog.waitFor();
    if (reproduce) {
      let outside = false;
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab');
        outside ||= await dialog.evaluate(el => !el.contains(document.activeElement));
      }
      assert.equal(outside, true, 'Baseline should reproduce missing focus isolation');
      console.log('BASELINE_BUG_CONFIRMED=FOCUS_ESCAPES_DESTRUCTIVE_MODAL');
      await context.close(); continue;
    }
    assert.equal(await dialog.evaluate(el => el instanceof HTMLDialogElement && el.matches(':modal')), true);
    assert.equal(await page.getByRole('button', { name: 'Keep item' }).evaluate(el => el === document.activeElement), true); passed++;
    for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
    } passed++;
    await assert.rejects(page.locator('#background').click({ trial: true, timeout: 250 }));
    assert.equal(await page.evaluate(() => window.fixture.background), 0); passed++;
    assert.equal(await dialog.getAttribute('aria-describedby') !== null, true);
    await page.getByRole('textbox', { name: 'Type DELETE' }).fill('wrong');
    assert.equal(await page.getByRole('button', { name: 'Delete item' }).isDisabled(), true);
    await page.getByRole('textbox', { name: 'Type DELETE' }).fill('DELETE');
    assert.equal(await page.getByRole('button', { name: 'Delete item' }).isEnabled(), true); passed++;
    await page.getByRole('button', { name: 'Delete item' }).click();
    assert.equal(await page.evaluate(() => window.fixture.confirms), 1);
    await page.keyboard.press('Tab');
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true); passed++;
    await page.keyboard.press('Escape');
    assert.equal(await dialog.isVisible(), true);
    assert.equal(await page.evaluate(() => window.fixture.cancels), 0); passed++;
    await page.evaluate(() => { window.fixture.setLoading(false); window.fixture.setError('QA operation failed safely'); });
    await page.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    const box = await page.locator('.glass-confirm-dialog').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.height <= 900 - 30);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); passed++;
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, `${width}-${lang}.png`) });
    await page.evaluate(() => window.fixture.setError('Long QA error '.repeat(400)));
    await page.getByRole('alert').filter({ hasText: 'Long QA error' }).waitFor();
    assert.equal(await page.locator('.glass-confirm-dialog').evaluate(el =>
      el.getBoundingClientRect().height <= innerHeight - 30 && el.scrollHeight > el.clientHeight), true); passed++;
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'trigger');
    assert.equal(await page.evaluate(() => document.body.style.overflow), ''); passed++;
    await page.evaluate(() => { document.body.style.overflow='scroll'; window.fixture.setOpen(true); });
    await dialog.waitFor();
    await page.getByRole('button', { name: 'Keep item' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'scroll'); passed++;
    await page.evaluate(() => { document.body.style.overflow=''; });
    await page.locator('#trigger').click();
    assert.equal(await page.getByRole('textbox', { name: 'Type DELETE' }).inputValue(), '');
    await page.getByRole('button', { name: 'Keep item' }).click(); passed++;
    await context.close();
  }
  assert.deepEqual(external, []);
  if (!reproduce) await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed, failed: 0,
    widths: [1440, 390, 430], locales: ['en', 'zh-CN'], productionRequests: 0, externalRequests: 0 }, null, 2));
  console.log(JSON.stringify({ passed, mode: reproduce ? 'BASELINE_REPRODUCTION' : 'REGRESSION', productionRequests: 0 }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
