import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HostRouter } from '../src/router.mjs';
import { BodyCache } from '../src/projection.mjs';
test('project artwork is resolved only for a known visible project', async () => {
  const seen = [];
  const router = new HostRouter({ owner: 'phone', cache: new BodyCache(), allProjects: true, hiddenProjects: ['/private'],
    client: { async request() { return { projects: ['/work', '/private'] }; } },
    projectPresentation: async project => { seen.push(project); return { project, name: 'Work', icon: 'small-png' }; }
  });
  assert.equal((await router.dispatch('catalog.project', { project: '/work' })).name, 'Work');
  await assert.rejects(router.dispatch('catalog.project', { project: '/private' }));
  await assert.rejects(router.dispatch('catalog.project', { project: '/arbitrary-folder' }));
  assert.deepEqual(seen, ['/work']);
});
