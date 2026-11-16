import assert from 'node:assert/strict';
import test from 'node:test';
import { historicalExams } from '../shared/exam-history.ts';
import { itemNumbers, overview } from '../shared/overview.ts';

test('counts every objective item exactly once in each historical edition', () => {
  for (const exam of historicalExams) {
    const numbers = Object.values(exam.groups).flatMap(itemNumbers).sort((a, b) => a - b);
    assert.deepEqual(numbers, Array.from({ length: exam.total }, (_, i) => i + 1), exam.id);
  }
});

test('filters by trail, edition and block without counting alternative cadernos again', () => {
  const pr = overview('pr', '', 'all');
  assert.deepEqual(pr.exams.map(exam => exam.year), [2024, 2017]);
  assert.equal(pr.total, 170);
  const latest = overview('pr', 'pr-2024', 'specific');
  assert.equal(latest.total, 40);
  assert.equal(latest.rows.find(row => row.subject === 'evidence')?.count, 5);
  const pf = overview('pf', '', 'specific');
  assert.equal(pf.total, 140);
  assert.equal(pf.rows[0]?.subject, 'programming');
  assert.equal(pf.rows[0]?.count, 24);
  assert.equal(pf.rows[0]?.appearances, 2);
  assert.equal(pf.rows.reduce((sum, row) => sum + row.count, 0), pf.total);
});
