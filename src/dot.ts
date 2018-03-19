import * as assert from 'assert';
import { Buffer } from 'buffer';
import { Edge, node as apiNode } from 'llparse-builder';

import Node = apiNode.Node;

type EdgeMap = ReadonlyMap<Node, ReadonlyArray<Edge> >;

type EdgeKind = 'noAdvance' | 'advance';

const COLOR_ADVANCE = 'black';
const COLOR_NO_ADVANCE = 'blue';
const COLOR_INVOKE = 'green';
const COLOR_OTHERWISE = 'red';

interface IRange {
  readonly end: number;
  readonly node: Node;
  readonly start: number;
}

export class Dot {
  private readonly idCache: Map<Node, string> = new Map();
  private readonly ns: Set<string> = new Set();

  public build(root: Node): string {
    let res = '';

    res += 'digraph {\n';
    res += '  overlap="false"\n';
    res += '  splines="true"\n';
    res += '  concentrate="true"\n';

    for (const node of this.enumerateNodes(root)) {
      res += this.buildNode(node);
    }

    res += '}\n';

    return res;
  }

  private enumerateNodes(root: Node): ReadonlyArray<Node> {
    const queue = [ root ];
    const seen: Set<Node> = new Set();

    while (queue.length !== 0) {
      const node = queue.pop()!;

      if (seen.has(node)) {
        continue;
      }
      seen.add(node);

      for (const edge of node) {
        queue.push(edge.node);
      }

      const otherwise = node.getOtherwiseEdge();
      if (otherwise !== undefined) {
        queue.push(otherwise.node);
      }
    }

    return Array.from(seen);
  }

  private buildNode(node: Node): string {
    let res = '';
    const name = this.escape(this.id(node));

    const advance: Map<Node, Edge[]> = new Map();
    const noAdvance: Map<Node, Edge[]> = new Map();
    for (const edge of node) {
      const targets = edge.noAdvance ? noAdvance : advance;
      if (targets.has(edge.node)) {
        targets.get(edge.node)!.push(edge);
      } else {
        targets.set(edge.node, [ edge ]);
      }
    }

    res += this.buildEdgeMap(node, advance, 'advance');
    res += this.buildEdgeMap(node, noAdvance, 'noAdvance');

    const otherwise = node.getOtherwiseEdge();
    if (otherwise !== undefined) {
      const label = this.buildOtherwiseLabel(node, otherwise);
      const color = otherwise.noAdvance ? COLOR_NO_ADVANCE : COLOR_ADVANCE;
      res += `  "${this.id(node)}" -> "${this.id(otherwise.node)}" ` +
        `[label="${label}" color="${color}"];\n`;
    }

    return res;
  }

  private buildEdgeMap(node: Node, map: EdgeMap, kind: EdgeKind): string {
    let res = '';

    map.forEach((edges, target) => {
      const single: Edge[] = [];
      const sequence: Edge[] = [];
      const code: Edge[] = [];
      for (const edge of edges) {
        if (edge.key === undefined) {
          assert(false, 'Unexpected otherwise edge');
        } else if (typeof edge.key === 'number') {
          code.push(edge);
        } else if (edge.key.length === 1) {
          single.push(edge);
        } else {
          sequence.push(edge);
        }
      }

      const labels: string[] = [];

      // Build ranges
      const ranges: IRange[] = [];
      let firstKey: number | undefined;
      let lastKey: number | undefined;
      for (const edge of single) {
        const key = (edge.key as Buffer)[0]!;

        // Merge
        if (lastKey === key - 1) {
          lastKey = key;
          continue;
        }

        // Emit
        if (lastKey !== undefined) {
          ranges.push({ start: firstKey!, end: lastKey, node: target });
        }

        firstKey = key;
        lastKey = key;
      }

      // Emit trailing range
      if (lastKey !== undefined) {
        ranges.push({ start: firstKey!, end: lastKey, node: target });
      }

      for (const range of ranges) {
        labels.push(this.buildRangeLabel(node, range));
      }

      // Emit the rest of the edges
      for (const edge of sequence) {
        labels.push(this.buildEdgeLabel(node, edge));
      }

      for (const edge of code) {
        labels.push(this.buildInvokeLabel(node, edge));
      }

      const color = kind === 'noAdvance' ? COLOR_NO_ADVANCE : COLOR_ADVANCE;
      res += `  "${this.id(node)}" -> "${this.id(target)}" ` +
        `[label="${labels.join('|')}" color="${color}"];\n`;
    });

    return res;
  }

  private buildRangeLabel(node: Node, range: IRange): string {
    const start = this.buildChar(range.start);
    const end = this.buildChar(range.end);
    return range.start === range.end ? start : `${start}:${end}`;
  }

  private buildEdgeLabel(node: Node, edge: Edge): string {
    return `${this.buildBuffer(edge.key as Buffer)}`;
  }

  private buildInvokeLabel(node: Node, edge: Edge): string {
    return `code=${edge.key as number}`;
  }

  private buildOtherwiseLabel(node: Node, edge: Edge): string {
    return edge.noAdvance ? 'otherwise' : 'skipTo';
  }

  private buildChar(code: number): string {
    if (code === 0x0a) {
      return this.escape('\'\\n\'');
    }
    if (code === 0x0d) {
      return this.escape('\'\\r\'');
    }
    if (code === 0x09) {
      return this.escape('\'\\t\'');
    }

    if (0x20 <= code && code <= 0x7e) {
      return this.escape(`'${String.fromCharCode(code)}'`);
    }

    let res = code.toString(16);
    if (res.length < 2) {
      res = '0' + res;
    }
    return `0x${res}`;
  }

  private buildBuffer(buffer: Buffer): string {
    return `'${this.escape(buffer.toString())}'`;
  }

  private id(node: Node): string {
    if (this.idCache.has(node)) {
      return this.idCache.get(node)!;
    }

    let res = node.name;
    if (this.ns.has(res)) {
      let i = 0;
      for (; i < this.ns.size; i++) {
        if (!this.ns.has(res + '_' + i)) {
          break;
        }
      }

      res += '_' + i;
    }
    this.ns.add(res);

    res = this.escape(res);
    this.idCache.set(node, res);
    return res;
  }

  private escape(value: string): string {
    return `${value.replace(/([\\"])/g, '\\$1')}`;
  }
}
