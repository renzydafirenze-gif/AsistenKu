#!/usr/bin/env node
/**
 * OpenAPI structural lint (no new dependency: js-yaml ships with Prisma).
 *
 * Catches mistakes that break codegen silently — dangling $refs, duplicate
 * operationIds, undeclared path params, duplicate params, and schemas that are
 * missing a `type`. Semantic linting is out of scope.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { load as loadYaml } from 'js-yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] ?? resolve(root, 'openapi.yaml');
const doc = loadYaml(readFileSync(file, 'utf8'));
const errors = [];
const seenOperationIds = new Set();
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

if (typeof doc?.openapi !== 'string' || !/^3\.0\./.test(doc.openapi)) {
  errors.push(`openapi must be a 3.0.x string, got ${JSON.stringify(doc?.openapi)}`);
}
for (const key of ['info', 'paths', 'components']) {
  if (!doc?.[key]) errors.push(`missing top-level "${key}"`);
}

/** Walks every object/array so $refs are found wherever they hide. */
function walk(node, at = '$') {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((child, i) => walk(child, `${at}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    const here = `${at}.${key}`;
    if (key === '$ref' && typeof value === 'string') {
      if (!value.startsWith('#/')) {
        errors.push(`${here}: only local refs are supported, got ${value}`);
      } else if (lookup(value.slice(2)) === undefined) {
        errors.push(`${here}: dangling ref ${value}`);
      }
    }
    walk(value, here);
  }
}

function lookup(pointer) {
  let node = doc;
  for (const rawPart of pointer.split('/')) {
    const part = rawPart.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node == null || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}

function checkParameters(params, where, pathTemplate) {
  if (!Array.isArray(params)) return;
  const seen = new Set();
  for (const param of params) {
    const target = param?.$ref ? lookup(param.$ref.slice(2)) : param;
    if (!target) continue;
    const id = `${target.in}:${target.name}`;
    if (seen.has(id)) errors.push(`${where}: duplicate parameter ${id}`);
    seen.add(id);
    if (target.in === 'path' && pathTemplate && !pathTemplate.includes(`{${target.name}}`)) {
      errors.push(`${where}: path parameter "${target.name}" is not in the path template`);
    }
  }
  for (const match of pathTemplate?.matchAll(/\{([^}]+)\}/g) ?? []) {
    if (![...seen].includes(`path:${match[1]}`)) {
      errors.push(`${where}: path template placeholder "${match[1]}" has no parameter`);
    }
  }
}

for (const [path, item] of Object.entries(doc?.paths ?? {})) {
  if (!path.startsWith('/')) errors.push(`path "${path}" must start with "/"`);
  if (!item || typeof item !== 'object') continue;

  for (const [method, operation] of Object.entries(item)) {
    if (!METHODS.includes(method)) continue;
    const where = `${method.toUpperCase()} ${path}`;
    if (!operation?.responses || Object.keys(operation.responses).length === 0) {
      errors.push(`${where}: no responses declared`);
    }
    const operationId = operation?.operationId;
    if (operationId) {
      if (seenOperationIds.has(operationId)) errors.push(`${where}: duplicate operationId ${operationId}`);
      seenOperationIds.add(operationId);
    }
    checkParameters(operation?.parameters, where, path);
  }
}

for (const [name, schema] of Object.entries(doc?.components?.schemas ?? {})) {
  const isObject = schema && typeof schema === 'object';
  const hasShape = isObject && (schema.type || schema.allOf || schema.oneOf || schema.anyOf || schema.$ref);
  if (!hasShape) errors.push(`components.schemas.${name}: missing type/ref`);
}

walk(doc);

if (errors.length > 0) {
  console.error(`openapi lint failed (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const operations = Object.values(doc.paths).reduce(
  (sum, item) => sum + Object.keys(item).filter((key) => METHODS.includes(key)).length,
  0,
);
console.log(
  `openapi ok: ${Object.keys(doc.paths).length} paths, ${operations} operations, ` +
    `${Object.keys(doc.components.schemas).length} schemas`,
);
