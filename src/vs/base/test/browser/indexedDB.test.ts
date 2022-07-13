/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { IndexedDB } from 'vs/base/browser/indexedDB';

suite('IndexedDB', () => {

	let indexedDB: IndexedDB;

	setup(async () => {
		indexedDB = await IndexedDB.create('vscode-indexeddb-test', 1, ['test-store']);
		await indexedDB.runInTransaction('test-store', 'readwrite', store => store.clear());
	});

	teardown(() => {
		indexedDB.close();
	});

	test('runInTransaction', async () => {
		await indexedDB.runInTransaction('test-store', 'readwrite', store => store.add('hello1', 'key1'));
		const value = await indexedDB.runInTransaction('test-store', 'readonly', store => store.get('key1'));
		assert.deepStrictEqual(value, 'hello1');
	});

	test('hasPendingTransactions', async () => {
		const promise = indexedDB.runInTransaction('test-store', 'readwrite', store => store.add('hello2', 'key2'));
		assert.deepStrictEqual(indexedDB.hasPendingTransactions(), true);
		await promise;
		assert.deepStrictEqual(indexedDB.hasPendingTransactions(), false);
	});

	test('close', async () => {
		const promise = indexedDB.runInTransaction('test-store', 'readwrite', store => store.add('hello3', 'key3'));
		indexedDB.close();
		assert.deepStrictEqual(indexedDB.hasPendingTransactions(), false);
		try {
			await promise;
			assert.fail('Transaction should be aborted');
		} catch (error) { }
	});

});
