/**
 * Architecture guardrail scope: detects literal static and dynamic imports,
 * require() calls, and createRequire loaders bound to an identifier spelled
 * `require`. It does not resolve loader factories through arbitrary aliases or
 * symbol identity. This guards against accidental reverse imports, not
 * deliberate dynamic evasion.
 */
import { readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

const supportedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
])

function isDeclarationFile(filePath: string): boolean {
  return /\.d\.(?:ts|mts|cts)$/.test(filePath)
}

interface SourceScan {
  modules: string[]
  errors: string[]
}

function isWithinRoot(filePath: string, root: string): boolean {
  const pathFromRoot = relative(root, filePath)
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot))
}

function sourceModules(
  directory: string,
  sourceRoot: string,
  ancestors = new Set<string>(),
): SourceScan {
  const result: SourceScan = { modules: [], errors: [] }
  let realDirectory: string

  try {
    realDirectory = realpathSync.native(directory)
  } catch (error) {
    result.errors.push(`cannot resolve ${displayPath(directory)}: ${String(error)}`)
    return result
  }

  if (!isWithinRoot(realDirectory, sourceRoot)) {
    result.errors.push(`symlinked directory escapes src/: ${displayPath(directory)}`)
    return result
  }

  if (ancestors.has(realDirectory)) return result
  const nextAncestors = new Set(ancestors).add(realDirectory)

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = sourceModules(entryPath, sourceRoot, nextAncestors)
      result.modules.push(...nested.modules)
      result.errors.push(...nested.errors)
    } else if (
      entry.isFile() &&
      supportedExtensions.has(extname(entry.name)) &&
      !isDeclarationFile(entry.name)
    ) {
      result.modules.push(entryPath)
    } else if (entry.isSymbolicLink()) {
      try {
        const target = realpathSync.native(entryPath)
        if (!isWithinRoot(target, sourceRoot)) {
          result.errors.push(`symlink escapes src/: ${displayPath(entryPath)}`)
          continue
        }

        const targetStats = statSync(entryPath)
        if (targetStats.isDirectory()) {
          const nested = sourceModules(entryPath, sourceRoot, nextAncestors)
          result.modules.push(...nested.modules)
          result.errors.push(...nested.errors)
        } else if (
          targetStats.isFile() &&
          supportedExtensions.has(extname(entry.name)) &&
          !isDeclarationFile(entry.name)
        ) {
          result.modules.push(entryPath)
        }
      } catch (error) {
        result.errors.push(`cannot inspect symlink ${displayPath(entryPath)}: ${String(error)}`)
      }
    }
  }

  return result
}

function isLocallyBoundRequire(
  identifier: ts.Identifier,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): boolean {
  const symbol = checker.getSymbolAtLocation(identifier)
  const localDeclarations = symbol?.declarations?.filter(
    (declaration) => declaration.getSourceFile() === sourceFile,
  )
  if (localDeclarations === undefined || localDeclarations.length === 0) return false

  return !localDeclarations.some(
    (declaration) =>
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      ts.isCallExpression(declaration.initializer) &&
      isCreateRequireReference(declaration.initializer.expression, sourceFile),
  )
}

function isCreateRequireModule(specifier: ts.Expression): boolean {
  return ts.isStringLiteralLike(specifier) &&
    (specifier.text === 'node:module' || specifier.text === 'module')
}

function isCreateRequireReference(expression: ts.Expression, sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !isCreateRequireModule(statement.moduleSpecifier)) {
      continue
    }

    const bindings = statement.importClause?.namedBindings
    if (bindings === undefined) continue

    if (
      ts.isNamedImports(bindings) &&
      ts.isIdentifier(expression) &&
      bindings.elements.some(
        (element) =>
          element.name.text === expression.text &&
          (element.propertyName?.text ?? element.name.text) === 'createRequire',
      )
    ) {
      return true
    }

    if (
      ts.isNamespaceImport(bindings) &&
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === bindings.name.text &&
      expression.name.text === 'createRequire'
    ) {
      return true
    }
  }

  return false
}

function literalDependency(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): ts.StringLiteralLike | undefined {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier
  }

  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression !== undefined &&
    ts.isStringLiteralLike(node.moduleReference.expression)
  ) {
    return node.moduleReference.expression
  }

  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteralLike(node.argument.literal)
  ) {
    return node.argument.literal
  }

  if (ts.isCallExpression(node)) {
    const argument = node.arguments[0]
    if (
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require' &&
          !isLocallyBoundRequire(node.expression, sourceFile, checker))) &&
      argument !== undefined &&
      ts.isStringLiteralLike(argument)
    ) {
      return argument
    }
  }

  return undefined
}

function dependencies(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): ts.StringLiteralLike[] {
  const found: ts.StringLiteralLike[] = []

  function visit(node: ts.Node): void {
    const dependency = literalDependency(node, sourceFile, checker)
    if (dependency !== undefined) found.push(dependency)
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return found
}

function canonicalPath(filePath: string): string {
  const absolutePath = resolve(filePath)
  const normalizedPath = realpathSync.native(absolutePath)
  return ts.sys.useCaseSensitiveFileNames ? normalizedPath : normalizedPath.toLowerCase()
}

function normalizedPath(filePath: string): string {
  const absolutePath = resolve(filePath)
  return ts.sys.useCaseSensitiveFileNames ? absolutePath : absolutePath.toLowerCase()
}

function specifierForTypeScript(specifier: string, importer: string): string {
  const pathOnly = specifier.replace(/[?#].*$/, '')
  if (!pathOnly.startsWith('/')) return pathOnly

  const projectAbsolute = resolve(process.cwd(), `.${pathOnly}`)
  const fromImporter = relative(dirname(importer), projectAbsolute).split(sep).join('/')
  return fromImporter.startsWith('.') ? fromImporter : `./${fromImporter}`
}

function displayPath(filePath: string): string {
  return relative(process.cwd(), filePath).split(sep).join('/')
}

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json')
if (configPath === undefined) {
  console.error('Architecture check failed: tsconfig.json was not found')
  process.exit(1)
}

const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
if (configFile.error !== undefined) {
  console.error(ts.formatDiagnostic(configFile.error, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  }))
  process.exit(1)
}

const parsedConfig = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  dirname(configPath),
  undefined,
  configPath,
)
if (parsedConfig.errors.length > 0) {
  console.error(ts.formatDiagnostics(parsedConfig.errors, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  }))
  process.exit(1)
}

const srcRoot = resolve(process.cwd(), 'src')
const canonicalSourceRoot = canonicalPath(srcRoot)
const applicationRoot = canonicalPath(resolve(srcRoot, 'App.tsx'))
const allowedImporter = normalizedPath(resolve(srcRoot, 'main.tsx'))
const violations: Array<{ importer: string; specifier: string }> = []
const sourceScan = sourceModules(srcRoot, canonicalSourceRoot)

if (sourceScan.errors.length > 0) {
  for (const error of sourceScan.errors) console.error(`Architecture check failed: ${error}`)
  process.exit(1)
}

const program = ts.createProgram({
  rootNames: [...new Set([...parsedConfig.fileNames, ...sourceScan.modules])],
  options: parsedConfig.options,
})
const checker = program.getTypeChecker()

for (const importer of sourceScan.modules) {
  if (normalizedPath(importer) === allowedImporter) continue

  const sourceFile = program.getSourceFile(importer)
  if (sourceFile === undefined) {
    console.error(`Architecture check failed: TypeScript could not parse ${displayPath(importer)}`)
    process.exit(1)
  }

  for (const dependency of dependencies(sourceFile, checker)) {
    const resolution = ts.resolveModuleName(
      specifierForTypeScript(dependency.text, importer),
      importer,
      parsedConfig.options,
      ts.sys,
    ).resolvedModule

    if (
      resolution !== undefined &&
      canonicalPath(resolution.resolvedFileName) === applicationRoot
    ) {
      violations.push({ importer: displayPath(importer), specifier: dependency.text })
    }
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(
      `Architecture violation: ${violation.importer} must not depend on ${violation.specifier} (src/App.tsx)`,
    )
  }
  process.exit(1)
}

console.log('Architecture check passed: only src/main.tsx depends on src/App.tsx')
