import type { NodePath, PluginObj, types as t } from '@babel/core';

export interface SignaliumAsyncTransformOptions {
  transformedImports: [string, string | RegExp][];
}

export function signaliumAsyncTransform(opts?: SignaliumAsyncTransformOptions): (api: any) => PluginObj {
  const transformedImports: Record<string, [string | RegExp]> = {
    callback: ['signalium'],
    reactive: ['signalium'],
    subscription: ['signalium'],
    task: ['signalium'],
  };

  for (const [name, path] of opts?.transformedImports ?? []) {
    const existing = transformedImports[name];

    if (existing) {
      existing.push(path);
    } else {
      transformedImports[name] = [path];
    }
  }

  return api => {
    const t = api.types;

    const isReactiveCall = (path: any) => {
      if (!t.isCallExpression(path.node)) return false;
      const callee = path.node.callee;

      const importPath = transformedImports[callee.name];

      if (!importPath) return false;

      // Check if reactive is imported from signalium
      const binding = path.scope.getBinding(callee.name);
      if (!binding || !t.isImportSpecifier(binding.path.node)) return false;

      const importDecl = binding.path.parent;

      if (!t.isImportDeclaration(importDecl)) return false;

      return importPath.some(p =>
        typeof p === 'string' ? importDecl.source.value === p : p.test(importDecl.source.value),
      );
    };

    function convertReactiveToGenerator(path: NodePath<t.FunctionExpression | t.ArrowFunctionExpression>) {
      // Only transform if parent is a reactive() call
      const parentPath = path.parentPath;
      if (!isReactiveCall(parentPath)) return;
      if (!path.node.async) return;

      // Transform all await expressions to yields
      path.traverse({
        AwaitExpression(awaitPath) {
          const funcParent = awaitPath.getFunctionParent();
          if (funcParent?.node !== path.node) return;

          awaitPath.replaceWith(t.yieldExpression(awaitPath.node.argument));
        },
      });

      // Remove async keyword
      path.node.async = false;

      if (t.isArrowFunctionExpression(path.node)) {
        // Convert arrow function to regular function expression
        let hasThis = false;

        // Scan for this keywords
        path.traverse({
          ThisExpression() {
            hasThis = true;
          },
        });

        const functionBody = t.isBlockStatement(path.node.body)
          ? path.node.body
          : t.blockStatement([t.returnStatement(path.node.body)]);

        const newFunction = t.functionExpression(
          null,
          path.node.params,
          functionBody,
          true, // generator
          false, // async
        );

        // If we found 'this' usage, wrap in bind call
        if (hasThis) {
          path.replaceWith(
            t.callExpression(t.memberExpression(newFunction, t.identifier('bind')), [t.thisExpression()]),
          );
        } else {
          path.replaceWith(newFunction);
        }
      } else {
        // Regular function - just set generator flag
        path.node.generator = true;
      }
    }

    return {
      name: 'transform-reactive-async',
      visitor: {
        FunctionExpression: convertReactiveToGenerator,
        ArrowFunctionExpression: convertReactiveToGenerator,
      },
    };
  };
}
