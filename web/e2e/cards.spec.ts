import { linearIssue, linearIssues } from '../src/test/fixtures';
import { expect, test } from './fixtures';

test('writing the brief shows the halo at work until the job is done', async ({ page, api }) => {
  await page.goto('/');
  const brief = page.getByRole('region', { name: 'Morgonbrief' });
  await brief.getByRole('button', { name: 'Skriv nu' }).click();
  await expect(brief.getByRole('status')).toContainText(/Skriver (briefen|din brief)/);
  await expect(brief.getByRole('button', { name: 'Skriver…' })).toBeDisabled();
  expect(api.requests.some((r) => r.method === 'POST' && r.path === '/routines/morning-brief/run')).toBe(true);
});

test('artifacts spread over more rows when the tile is tall', async ({ page, api }) => {
  test.skip(page.viewportSize()!.width <= 1180, 'Only beside a tall Linear board on wide screens.');
  api.linear = [...linearIssues, ...Array.from({ length: 30 }, (_, i) => linearIssue(100 + i))];
  await page.goto('/');
  const tile = page.getByRole('region', { name: 'Artefakter' });
  await expect(tile.getByRole('button', { name: /^Veloq OS/ })).toBeVisible();
  // The rows follow a ResizeObserver once the Linear board has grown the tile, so wait for them instead of measuring once.
  const rows = () => tile.locator('.acard').evaluateAll((cards) => new Set(cards.map((c) => Math.round(c.getBoundingClientRect().top))).size);
  await expect.poll(rows).toBeGreaterThan(1);
});

test('the portal grows with the voice card instead of leaving a gap below', async ({ page }) => {
  await page.goto('/');
  const voice = page.getByRole('region', { name: 'Röstassistent' });
  const card = (await voice.boundingBox())!;
  const phase = (await voice.locator('.voice-phase').boundingBox())!;
  // The last line sits at the bottom of the card, not halfway up it.
  expect(card.y + card.height - (phase.y + phase.height)).toBeLessThan(40);
});
