import assert from 'node:assert/strict';
import { it, describe as suite } from 'node:test';
import { describe, type KitModule, optionalImport, registerKits } from '../src/registry.js';

// Fake kits, not fake kit *internals*. What is under test is the server's
// decision about what to mount and what to say — a real kit here would test the
// kit instead, and would require installing one to run the suite at all.
const kit = (name: string, behaviour: () => Promise<string[]>): KitModule =>
  ({ name, register: behaviour }) as unknown as KitModule;

suite('optionalImport', () => {
  it('returns null for a package that is not installed', async () => {
    // The ordinary state here: a family server run by someone who has two of
    // the kits is not misconfigured.
    assert.equal(await optionalImport('@quxkit/definitely-not-installed'), null);
  });

  it('imports a package that is', async () => {
    const mod = await optionalImport<{ format: unknown }>('node:util');
    assert.ok(mod);
    assert.equal(typeof mod.format, 'function');
  });

  it('does not disguise a broken module as an absent one', async () => {
    // A module that throws on evaluation is a real problem. Swallowing it as
    // "not installed" would hide a bad build behind a silently smaller server —
    // which is the failure mode this whole file exists to avoid.
    await assert.rejects(() => optionalImport('data:text/javascript,throw new Error("boom")'), /boom/);
  });
});

suite('registerKits', () => {
  it('mounts what it finds and reports the tools', async () => {
    const statuses = await registerKits({}, [kit('a', async () => ['tool one', 'tool two'])]);

    assert.equal(statuses.length, 1);
    assert.equal(statuses[0]!.state, 'registered');
    assert.deepEqual(statuses[0]!.tools, ['tool one', 'tool two']);
  });

  it('treats an empty result as absent, not as success', async () => {
    // A kit module returns [] when its package is not installed. Calling that
    // "registered" would produce a startup line claiming a kit that is not
    // there.
    const statuses = await registerKits({}, [kit('a', async () => [])]);
    assert.equal(statuses[0]!.state, 'absent');
  });

  it('lets the other kits register when one throws', async () => {
    // The point of catching per kit: a broken ui-kit must not cost an operator
    // billing's tools too.
    const statuses = await registerKits({}, [
      kit('broken', async () => {
        throw new Error('bad build');
      }),
      kit('fine', async () => ['still here']),
    ]);

    assert.equal(statuses[0]!.state, 'failed');
    assert.match(statuses[0]!.detail!, /bad build/);
    assert.equal(statuses[1]!.state, 'registered');
    assert.deepEqual(statuses[1]!.tools, ['still here']);
  });

  it('names the failing kit rather than just the error', async () => {
    const statuses = await registerKits({}, [
      kit('ui-kit', async () => {
        throw new Error('missing peer');
      }),
    ]);
    assert.equal(statuses[0]!.kit, 'ui-kit');
  });

  it('passes the environment through, so a kit can decide for itself', async () => {
    let seen: string | undefined;
    await registerKits(
      {},
      [
        kit('a', async () => {
          return [];
        }),
      ],
      { EXAMPLE: 'yes' } as NodeJS.ProcessEnv,
    );
    // The signature is what matters here; a kit reading env is exercised by the
    // real modules. This asserts the argument is threaded at all.
    const withEnv = await registerKits(
      {},
      [
        {
          name: 'b',
          register: async (_s: unknown, env: NodeJS.ProcessEnv) => {
            seen = env.EXAMPLE;
            return [];
          },
        } as unknown as KitModule,
      ],
      { EXAMPLE: 'yes' } as NodeJS.ProcessEnv,
    );
    assert.equal(seen, 'yes');
    assert.equal(withEnv[0]!.state, 'absent');
  });
});

suite('the startup line', () => {
  it('says plainly when nothing was found', async () => {
    // An operator whose config is wrong should not see a cheerful "ready".
    const statuses = await registerKits({}, [kit('a', async () => [])]);
    assert.match(describe(statuses), /no kits found/);
  });

  it('counts tools across kits', async () => {
    const statuses = await registerKits({}, [
      kit('billing-kit', async () => ['one', 'two']),
      kit('ui-kit', async () => ['three']),
    ]);
    const line = describe(statuses);
    assert.match(line, /billing-kit, ui-kit/);
    assert.match(line, /3 tools/);
  });

  it('surfaces a failure in the line itself', async () => {
    // Not only in a log nobody reads: this is the one line an operator is
    // guaranteed to see.
    const statuses = await registerKits({}, [
      kit('ok', async () => ['a']),
      kit('ui-kit', async () => {
        throw new Error('missing peer');
      }),
    ]);
    assert.match(describe(statuses), /ui-kit FAILED: missing peer/);
  });
});
