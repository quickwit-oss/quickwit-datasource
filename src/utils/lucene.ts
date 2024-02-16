import { isEqual } from 'lodash';
import lucene, { AST, BinaryAST, LeftOnlyAST, NodeTerm } from 'lucene';
export type { AST, BinaryAST, LeftOnlyAST, NodeTerm } from 'lucene';

export type ModifierType = '' | '-';

export type ParseError = {
  name: string,
  message: string,
  location: {
    start: {line: number, column: number, offset: number},
    end: {line: number, column: number, offset: number},
  }
}

// Type predicates

export function isLeftOnlyAST(ast: unknown): ast is LeftOnlyAST {
  if (!ast || typeof ast !== 'object') {
    return false;
  }

  if ('left' in ast && !('right' in ast)) {
    return true;
  }

  return false;
}
export function isBinaryAST(ast: unknown): ast is BinaryAST {
  if (!ast || typeof ast !== 'object') {
    return false;
  }

  if ('left' in ast && 'right' in ast) {
    return true;
  }
  return false;
}

export function isAST(ast: unknown): ast is AST {
  return isLeftOnlyAST(ast) || isBinaryAST(ast);
}

export function isNodeTerm(ast: unknown): ast is NodeTerm {
  if (ast && typeof ast === 'object' && 'term' in ast) {
    return true;
  }

  return false;
}


/**
 * Normalizes the query by removing whitespace around colons, which breaks parsing.
 */
function normalizeQuery(query: string) {
  return query.replace(/(\w+)\s(:)/gi, '$1$2');
}

/**
 * Filters can possibly reserved characters such as colons which are part of the Lucene syntax.
 * Use this function to escape filter keys.
 */

export function escapeFilter(value: string) {
  return lucene.term.escape(value);
}
/**
 * Values can possibly reserved special characters such as quotes.
 * Use this function to escape filter values.
 */

export function escapeFilterValue(value: string) {
  value = value.replace(/\\/g, '\\\\');
  return lucene.phrase.escape(value);
}


function findNodeInTree(ast: AST, field: string, value: string): NodeTerm | null {
  // {}
  if (Object.keys(ast).length === 0) {
    return null;
  }
  // { left: {}, right: {} } or { left: {} }
  if (isAST(ast.left)) {
    return findNodeInTree(ast.left, field, value);
  }
  if (isNodeTerm(ast.left) && ast.left.field === field && ast.left.term === value) {
    return ast.left;
  }
  if (isLeftOnlyAST(ast)) {
    return null;
  }
  if (isNodeTerm(ast.right) && ast.right.field === field && ast.right.term === value) {
    return ast.right;
  }
  if (isBinaryAST(ast.right)) {
    return findNodeInTree(ast.right, field, value);
  }
  return null;
}

function removeNodeFromTree(ast: AST, node: NodeTerm): AST {
  // {}
  if (Object.keys(ast).length === 0) {
    return ast;
  }
  // { left: {}, right: {} } or { left: {} }
  if (isAST(ast.left)) {
    ast.left = removeNodeFromTree(ast.left, node);
    return ast;
  }
  if (isNodeTerm(ast.left) && isEqual(ast.left, node)) {
    Object.assign(
      ast,
      {
        left: undefined,
        operator: undefined,
        right: undefined,
      },
      'right' in ast ? ast.right : {}
    );
    return ast;
  }
  if (isLeftOnlyAST(ast)) {
    return ast;
  }
  if (isNodeTerm(ast.right) && isEqual(ast.right, node)) {
    Object.assign(ast, {
      right: undefined,
      operator: undefined,
    });
    return ast;
  }
  if (isBinaryAST(ast.right)) {
    ast.right = removeNodeFromTree(ast.right, node);
    return ast;
  }
  return ast;
}

/**
 * Merge a query with a filter.
 */
export function concatenate(query: string, filter: string, operator?: 'AND'|'OR'): string {
  if (!filter) {
    return query;
  }
  if (query.trim() === '' ) {
    return filter;
  }

  return operator ? `${query} ${operator} ${filter}` : `${query} ${filter}`
}

export class LuceneQuery {
  ast: AST | null;
  source: string | null;
  parseError: any

  constructor(ast: AST|null, source?: string, error?: ParseError){
    this.ast = ast;
    this.source = source || null;
    this.parseError = error || null;
  }

  static parse(query: string){
    let parsedQuery, parseError;
    try {
      parsedQuery = lucene.parse(normalizeQuery(query));
    } catch (e: any) {
      parsedQuery = null;
      parseError = e
    }
    return new LuceneQuery(parsedQuery, query, parseError)
  }

  findFilter( key: string, value: string, modifier: ModifierType = ''){
    const field = `${modifier}${lucene.term.escape(key)}`;
    value = lucene.phrase.escape(value);
    if (!this.ast) {
      return null;
    }

    return findNodeInTree(this.ast, field, value);
  }

  hasFilter(key: string, value: string, modifier: ModifierType = ''){
    return this.findFilter(key, value, modifier) !== null;
  }

  addFilter(key: string, value: string, modifier: ModifierType = ''){
    if (this.hasFilter(key, value, modifier)) {
      return this;
    }

    key = escapeFilter(key);
    value = escapeFilterValue(value);
    const filter = `${modifier}${key}:"${value}"`;

    return LuceneQuery.parse(concatenate(this.toString(), filter));
  }

  removeFilter(key: string, value: string, modifier: ModifierType = ''){
    const node = this.findFilter(key, value, modifier);
    if (!node || !this.ast) {
      return this;
    }

    return new LuceneQuery(removeNodeFromTree(this.ast, node));
  }

  toString() {
    return this.source ? this.source : this.ast ? lucene.toString(this.ast) : "";
  }
}
