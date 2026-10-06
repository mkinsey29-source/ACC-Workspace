// Two independent browser clients, a local test transport and stub CLI processes.
// No personal conversations, paid requests or Tailscale configuration are touched.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { cp, copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createService } from '../server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
await mkdir(path.join(root, '.cache'), { recursive: true });
const repo = await mkdtemp(path.join(root, '.cache/mobile-ui-'));
await mkdir(path.join(repo, 'workspace/report'), { recursive: true });
await mkdir(path.join(repo, 'workspace/_shared'), { recursive: true });
await cp(path.join(root, 'dist'), path.join(repo, 'ui'), { recursive: true });
for (const name of ['mak-nose.svg', 'mak-nose-chats.svg', 'mak-mobile-192.png', 'mak-mobile-512.png']) await copyFile(path.join(root, 'public/assets', name), path.join(repo, 'ui/assets', name));
for (const name of ['report.css', 'report.js']) await copyFile(path.join(root, 'workspace/_shared', name), path.join(repo, 'workspace/_shared', name));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQ42mP8/x8AAwMCAO+jvWQAAAAASUVORK5CYII='.replace('EQ42', 'EQVR42'), 'base64');
// Use a supplied SVG as a visible report image; the PNG is only an upload fixture.
await copyFile(path.join(root, 'public/assets/mak-nose.svg'), path.join(repo, 'workspace/report/nose.svg'));
await writeFile(path.join(repo, 'workspace/report/index.html'), '<!doctype html><html lang="en" data-mak-report="document"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="../_shared/report.css"><script defer src="../_shared/report.js"></script></head><body><main class="container"><h1>Report ready</h1><p>A readable result on your phone.</p><img src="nose.svg" alt="Report image" width="160"><p><a target="_blank" rel="noreferrer" href="https://example.com/source">Source link</a></p></main></body></html>');
await writeFile(path.join(repo, 'workspace/report/plan.md'), '# Mobile plan\n\n**Keep the useful parts in view.**\n\n- Read results\n- Send a follow-up\n');
await writeFile(path.join(repo, 'workspace/workspace.json'), JSON.stringify({ entities: [{ id: 'mobile-report', title: 'A useful report', folder: 'report', category: 'dev', created: '2026-10-06', steps: [{ name: 'Report', path: 'index.html' }, { name: 'Plan', path: 'plan.md' }] }] }));
const transport = { probe: async () => ({ ready: true, installed: true }), enable: async origin => ({ origin }), disable: async () => {} };
const service = await createService({ repo, uiDir: path.join(repo, 'ui'), mobileOptions: { transport }, mcpOptions: { home: repo, env: {} } });
service.sessions.beginDiscovery = () => {};
const writes = [], ids = [randomUUID(), randomUUID()];
for (const [index, id] of ids.entries()) {
  const session = service.sessions.make({ id, name: index ? 'Research ideas' : 'Game animations', agent: index ? 'claude' : 'codex', status: 'running', open: true, pinned: !index, cols: 100, rows: 28, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), cwd: repo });
  session.process = { write: data => writes.push({ id, data }), resize: () => {} };
  service.sessions.items.set(id, session); await service.sessions.hydrate(session);
  await new Promise(resolve => session.terminal.write(Array.from({ length: 90 }, (_, line) => `Line ${line + 1}: live agent output\r\n`).join(''), resolve));
}
service.mobile.transcripts.read = async session => ({ supported: true, messages: [
  { id: 'user', role: 'user', text: 'Can we make the next iteration easier to review?', at: new Date().toISOString() },
  { id: 'assistant', role: 'assistant', text: '## Ready for review\n\nThe latest results are in your Workspace.\n\n- **Character:** proportions updated\n- **Motion:** timing checked\n- **Next step:** choose the version you prefer\n\n[Open the source](https://example.com/source)\n\n' + (session.id === ids[0] ? 'Your agent is still working on the computer.' : 'Send a follow-up whenever an idea comes to mind.'), at: new Date().toISOString() },
] });
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.MRMAK_TEST_BROWSER || 'msedge' });
  const desktop = await browser.newPage({ viewport: { width: 640, height: 860 } }); desktop.setDefaultTimeout(12000);
  const errors = []; desktop.on('pageerror', error => errors.push(error.message));
  await desktop.goto(service.urls.chats); await desktop.getByRole('button', { name: 'Mobile access', exact: true }).click();
  const pairingResponse = desktop.waitForResponse(response => response.url().endsWith('/api/mobile/pair') && response.request().method() === 'POST');
  await desktop.getByRole('button', { name: 'Enable & show QR code' }).click();
  const pairing = await (await pairingResponse).json();
  const manifest = await (await fetch(`${service.mobile.origin}/mobile/manifest.webmanifest`)).json();
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(item => item.sizes === `${size}x${size}`);
    const response = await fetch(`${service.mobile.origin}${icon.src}`);
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/png/);
  }
  await desktop.getByAltText('Scan to connect this phone to Mr. Mak').waitFor();
  await desktop.screenshot({ path: path.join(repo, 'desktop-pairing.png') });
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const phone = await mobileContext.newPage(); phone.setDefaultTimeout(12000); phone.on('pageerror', error => errors.push(error.message));
  await phone.goto(pairing.url); await phone.getByRole('button', { name: 'Request connection' }).click();
  await phone.getByRole('heading', { name: 'Confirm on your computer' }).waitFor();
  await desktop.getByRole('button', { name: 'Connect phone', exact: true }).click();
  await phone.getByRole('heading', { name: 'Your chats', exact: true }).waitFor();
  await desktop.getByText('Connected now', { exact: true }).waitFor();
  await phone.screenshot({ path: path.join(repo, 'phone-chats.png') });
  const dimensions = ids.map(id => ({ cols: service.sessions.get(id).cols, rows: service.sessions.get(id).rows }));
  const desktopSelected = (await (await fetch(`${service.origin}/api/bootstrap`, { headers: { Authorization: `Bearer ${service.token}` } })).json()).selectedId;
  await phone.getByRole('button', { name: /Research ideas/ }).click();
  await phone.getByRole('heading', { name: 'Ready for review' }).waitFor();
  assert.deepEqual(ids.map(id => ({ cols: service.sessions.get(id).cols, rows: service.sessions.get(id).rows })), dimensions);
  assert.equal((await (await fetch(`${service.origin}/api/bootstrap`, { headers: { Authorization: `Bearer ${service.token}` } })).json()).selectedId, desktopSelected);
  const input = phone.getByRole('textbox', { name: 'Message this chat' });
  await input.fill('A thought from my phone'); await input.press('Shift+Enter'); await input.pressSequentially('Please keep the same chat.');
  assert.equal(await input.inputValue(), 'A thought from my phone\nPlease keep the same chat.');
  // The server receives the request, but its first reply is lost on the network.
  const sendRoute = `**/mobile/api/sessions/${ids[1]}/send`;
  await phone.route(sendRoute, async route => { await route.fetch(); await route.abort('failed'); });
  const before = writes.length;
  await phone.getByRole('button', { name: 'Send', exact: true }).click();
  await phone.getByRole('button', { name: 'Retry', exact: true }).waitFor();
  await phone.unroute(sendRoute);
  await phone.getByRole('button', { name: 'Retry', exact: true }).click();
  await phone.getByText('Delivered to terminal', { exact: true }).waitFor();
  assert.equal(writes.length - before, 2); assert.ok(writes[before].data.includes('A thought from my phone\nPlease keep the same chat.'));
  assert.equal(await input.inputValue(), '');
  await input.fill('Keep this draft while I switch chats.');
  await phone.getByRole('button', { name: 'Back to chats' }).click(); await phone.getByRole('button', { name: /Game animations/ }).click();
  assert.equal(await phone.getByRole('textbox', { name: 'Message this chat' }).inputValue(), '');
  await phone.getByRole('button', { name: 'Back to chats' }).click(); await phone.getByRole('button', { name: /Research ideas/ }).click();
  assert.equal(await phone.getByRole('textbox', { name: 'Message this chat' }).inputValue(), 'Keep this draft while I switch chats.');
  await phone.screenshot({ path: path.join(repo, 'phone-conversation.png') });
  await mobileContext.setOffline(true); await phone.getByText('Offline · draft saved', { exact: true }).waitFor();
  await mobileContext.setOffline(false); await phone.getByText('Connected to your computer', { exact: true }).waitFor();
  assert.equal(await input.inputValue(), 'Keep this draft while I switch chats.');
  await phone.getByRole('button', { name: 'Terminal', exact: true }).click(); await phone.locator('.mobile-terminal .xterm-screen').waitFor();
  await phone.screenshot({ path: path.join(repo, 'phone-terminal.png') });
  assert.deepEqual(ids.map(id => ({ cols: service.sessions.get(id).cols, rows: service.sessions.get(id).rows })), dimensions);
  await phone.getByRole('button', { name: 'Conversation', exact: true }).click();
  await phone.locator('input[type=file]').setInputFiles({ name: 'phone.png', mimeType: 'image/png', buffer: png });
  await phone.getByText('Images ready to send', { exact: true }).waitFor();
  const imageBefore = writes.length; await phone.getByRole('button', { name: 'Send', exact: true }).click(); await phone.getByText('Delivered to terminal', { exact: true }).waitFor();
  assert.ok(writes[imageBefore].data.includes('inbox')); assert.ok(writes[imageBefore].data.includes('phone-'));
  await phone.getByRole('button', { name: 'Back to chats' }).click(); await phone.getByRole('button', { name: 'Results', exact: true }).click();
  await phone.getByRole('button', { name: /A useful report/ }).click();
  const frame = phone.frameLocator('iframe'); await frame.getByRole('heading', { name: 'Report ready' }).waitFor();
  await frame.getByAltText('Report image', { exact: true }).click();
  await frame.getByRole('dialog', { name: 'Image preview' }).waitFor();
  const downloadEvent = phone.waitForEvent('download'); await frame.getByRole('link', { name: 'Download', exact: true }).click();
  const download = await downloadEvent; assert.ok(download.suggestedFilename().includes('nose'));
  await frame.getByRole('button', { name: 'Close', exact: true }).click();
  assert.equal(await frame.locator('dialog[open]').count(), 0);
  await phone.screenshot({ path: path.join(repo, 'phone-report.png') });
  await phone.getByRole('button', { name: 'Plan', exact: true }).click(); await phone.getByRole('heading', { name: 'Mobile plan' }).waitFor();
  for (const width of [360, 390, 768]) {
    await phone.setViewportSize({ width, height: 844 });
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `No page overflow at ${width}px`);
  }
  await desktop.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await phone.getByRole('heading', { name: 'Start in Mr. Mak Chats' }).waitFor();
  assert.equal(service.sessions.get(ids[0]).status, 'running'); assert.equal(service.sessions.get(ids[1]).status, 'running');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, fixture: repo, checks: ['QR + desktop approval', 'independent views and PTY sizes', 'lost reply / retry once', 'drafts per chat', 'offline recovery', 'image attachment', 'sandboxed report + image download', 'Markdown preview', '360/390/768px layout', 'device revocation'] }));
} finally {
  await browser?.close(); for (const session of service.sessions.items.values()) session.process = null;
  await service.close();
}
