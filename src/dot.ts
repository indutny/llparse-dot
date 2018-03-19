import * as assert from 'assert';
import { Buffer } from 'buffer';
import { Edge, node as apiNode } from 'llparse-builder';

import Node = apiNode.Node;

type EdgeMap = ReadonlyMap<Node, ReadonlyArray<Edge> >;

type EdgeKind = 'noAdvance' | 'advance' | 'otherwise' | 'invoke';

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
  public build(root: Node): string {
    let res = '';

    res += 'digraph {\n';
    res += 'rankdir="LR"\n';
    res += 'ranksep="1.0 equally"\n';
    res += 'overlap="false"\n';
    res += 'splines="true"\n';
    res += 'concentrate="true"\n';

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
    const name = this.escape(node.name);

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
      res += this.buildEdge(node, otherwise, 'otherwise');
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
        res += this.buildRange(node, range, kind);
      }

      // Emit the rest of the edges
      for (const edge of sequence) {
        res += this.buildEdge(node, edge, kind);
      }
      for (const edge of code) {
        res += this.buildEdge(node, edge, 'invoke');
      }
    });

    return res;
  }

  private buildRange(node: Node, range: IRange, kind: EdgeKind): string {
    const start = this.buildChar(range.start);
    const end = this.buildChar(range.end);
    const color = kind === 'noAdvance' ? COLOR_NO_ADVANCE : COLOR_ADVANCE;
    return `  "${this.escape(node.name)}" -> ` +
      `"${this.escape(range.node.name)}" ` +
      `[label="${start}:${end}" color="${color}"];\n`;
  }

  private buildEdge(node: Node, edge: Edge, kind: EdgeKind): string {
    let res =  `  "${this.escape(node.name)}" -> ` +
      `"${this.escape(edge.node.name)}"`;

    let label: string;
    let color: string;
    if (kind === 'invoke') {
      label = `code: ${edge.key as number}`;
      color = COLOR_INVOKE;
    } else if (kind === 'otherwise') {
      label = edge.noAdvance ? 'otherwise' : 'skipTo';
      color = edge.noAdvance ? COLOR_NO_ADVANCE : COLOR_ADVANCE;
    } else {
      label = `${this.buildBuffer(edge.key as Buffer)}`;
      color = kind === 'noAdvance' ? COLOR_NO_ADVANCE : COLOR_ADVANCE;
    }

    res += ` [label="${label}" color="${color}"];\n`;
    return res;
  }

  private buildChar(code: number): string {
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

  private escape(value: string): string {
    return `${value.replace(/([\\"])/g, '\\$1')}`;
  }
}
