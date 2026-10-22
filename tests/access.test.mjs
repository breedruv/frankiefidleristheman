import test from 'node:test';
import assert from 'node:assert/strict';
import { memberName, requiresMember } from '../lib/access.mjs';
const env = { ANDREW_EMAIL: 'andrew@example.com', SAM_EMAIL: 'sam@example.com' };
test('only verified configured accounts can own lists', () => {
  assert.equal(memberName({ email: 'ANDREW@example.com', email_confirmed_at: 'today' }, env), 'Andrew');
  assert.equal(memberName({ email: 'andrew@example.com' }, env), null);
  assert.equal(memberName({ email: 'other@example.com', email_confirmed_at: 'today' }, env), null);
});
test('development reads remain open, list data and writes require membership', () => {
  assert.equal(requiresMember('/draft/players', 'GET', false), false);
  assert.equal(requiresMember('/api/shortlists', 'GET', false), true);
  assert.equal(requiresMember('/api/draft-picks', 'POST', false), true);
  assert.equal(requiresMember('/admin/import', 'POST', false), true);
  assert.equal(requiresMember('/admin/weeks', 'POST', true), true);
});
test('sign-in and sign-out endpoints can establish or clear a session', () => {
  assert.equal(requiresMember('/api/auth', 'POST', false), false);
  assert.equal(requiresMember('/api/auth', 'POST', true), false);
  assert.equal(requiresMember('/api/auth', 'DELETE', true), false);
  assert.equal(requiresMember('/auth/confirm', 'GET', true), false);
  assert.equal(requiresMember('/api/auth-other', 'POST', true), true);
});
test('pre-draft mode allows only board and its read endpoints', () => {
  for (const path of ['/draft/players', '/api/player-detail', '/admin/draft', '/']) assert.equal(requiresMember(path, 'GET', true), true);
  for (const path of ['/draft/board', '/api/draft-picks', '/api/draft-config', '/login']) assert.equal(requiresMember(path, 'GET', true), false);
});
