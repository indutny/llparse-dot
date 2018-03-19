import * as assert from 'assert';
import { Builder } from 'llparse-builder';

import { Dot } from '../src/dot';

describe('llparse/dot', () => {
  it('should build a graph', () => {
    const p = new Builder();
    const dot = new Dot();

    const root = p.node('root');
    const b = p.node('b');

    root
      .match([ '0', '1', '2', '3', '4', '5' ], root)
      .match('hello', b)
      .peek('b', b)
      .skipTo(root);

    b
      .match('b', p.invoke(p.code.match('hello'), {
        0: b,
      }, p.error(42, 'code')))
      .otherwise(root);

    const out = dot.build(root);

    require('fs').writeFileSync('/tmp/1.dot', out);
  });
});
