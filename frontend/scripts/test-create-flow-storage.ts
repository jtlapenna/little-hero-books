import assert from 'node:assert/strict';
import { addBook, load, removeBook, save, saveBook, switchBook } from '../src/lib/createFlow/createFlowStorage';
const items = new Map<string, string>();
Object.assign(globalThis, {
  window: {},
  sessionStorage: { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key) },
});
const first = { name: 'Alex', age: 4, favoriteAnimal: 'dog' };
const second = { pronouns: 'they-them' };
items.set('lhb:create-flow:v1', JSON.stringify({ character: first, books: [{ id: '1', character: first }, { id: '2', character: second }], currentBookIndex: 0 }));
switchBook(1);
assert.deepEqual(load()?.character, second, 'switching must not copy another child into missing fields');
saveBook(1, { character: { age: 8 } });
assert.deepEqual(load()?.character, { ...second, age: 8 });
addBook();
assert.deepEqual(load()?.character, { pronouns: 'they-them' }, 'new book starts empty');
removeBook(2);
assert.deepEqual(load()?.character, { ...second, age: 8 }, 'removal switches without inherited fields');
save({ character: { name: 'Rae' } });
assert.equal(load()?.character.age, 8, 'partial character updates keep existing values');
items.set('lhb:create-flow:v1', JSON.stringify({ character: { name: 'Rae' }, books: [{ id: '1', character: first }, { id: '2', character: { name: 'Rae' } }, { id: '3', character: { name: 'Kai' } }], currentBookIndex: 1 }));
removeBook(0);
assert.equal(load()?.character.name, 'Rae', 'removing an earlier book retains the selected child');
assert.equal(load()?.currentBookIndex, 0);
console.log('create flow storage tests passed');
